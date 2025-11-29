/**
 * afip-service/index.js
 * Servicio AFIP Profesional - Producción / Homologación
 * Soporta: Monotributo (C) y Responsable Inscripto (A/B)
 * Versión: Golden Master (Auto-detect + Array Fix + RG 5616)
 */

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const soap = require("soap");
const xmlbuilder = require("xmlbuilder");
const forge = require("node-forge");
const fs = require("fs");
const path = require("path");

// Inicializa Firebase
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==============================================================================
// ⚙️ CONFIGURACIÓN DEL NEGOCIO (¡TOCA AQUÍ!)
// ==============================================================================

// 1. TU IDENTIDAD FISCAL
const CUIT_EMISOR = "27278612932"; // Tu CUIT sin guiones

// 2. TU CONDICIÓN TRIBUTARIA ACTUAL
// Opciones: 'MONOTRIBUTO' (Solo Factura C) | 'RESPONSABLE_INSCRIPTO' (Facturas A y B)
// ⚠️ ALERTA: Si estás en Monotributo, DEJA ESTO EN 'MONOTRIBUTO'.
// El sistema forzará Factura C automáticamente para evitar rechazos de AFIP.
const CONDICION_EMISOR = "MONOTRIBUTO"; 

// 3. PUNTO DE VENTA (Sácalo de la web de AFIP -> Puntos de Venta)
// Asegúrate de que este número esté dado de alta como "Web Services"
const PTO_VTA = 5; 

// ==============================================================================
// 🔐 CONFIGURACIÓN TÉCNICA (NO TOCAR)
// ==============================================================================
const WSDL_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL"; // Homologación
const WSAA_WSDL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL"; // Homologación

const CERT_PATH = path.join(__dirname, "certificado-afip.crt");
const KEY_PATH = path.join(__dirname, "tuClave.key");
const TA_DOC_REF = db.doc("arca_afip/wsfe_ta");

// ----------------------------------------------------------------------
// 1. GENERACIÓN DE TICKET DE ACCESO (WSAA)
// ----------------------------------------------------------------------
async function _generateTA() {
    console.log("WSAA:: Generando nuevo Ticket de Acceso...");

    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
        throw new Error("FATAL: No se encuentran certificado-afip.crt o tuClave.key");
    }

    const certPem = fs.readFileSync(CERT_PATH, "utf8");
    const keyPem = fs.readFileSync(KEY_PATH, "utf8");
    const certObj = forge.pki.certificateFromPem(certPem);
    const keyObj = forge.pki.privateKeyFromPem(keyPem);

    // Sal aleatoria para evitar error "alreadyAuthenticated" en pruebas rápidas
    const uniqueId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 999999);
    const generationTime = new Date(Date.now() - 600000).toISOString();
    const expirationTime = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const loginTicketRequest = xmlbuilder
        .create("loginTicketRequest", { encoding: "UTF-8" })
        .att("version", "1.0")
        .ele("header")
        .ele("uniqueId", uniqueId).up()
        .ele("generationTime", generationTime).up()
        .ele("expirationTime", expirationTime.toISOString()).up()
        .up()
        .ele("service", "wsfe")
        .end({ pretty: true });

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(loginTicketRequest, "utf8");
    p7.addCertificate(certObj);
    p7.addSigner({ key: keyObj, certificate: certObj, digestAlgorithm: forge.pki.oids.sha256 });
    p7.sign();

    const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
    const client = await soap.createClientAsync(WSAA_WSDL);
    const [result] = await client.loginCmsAsync({ in0: cms });
    const xml = result.loginCmsReturn;

    // Extracción robusta con Regex
    const tokenMatch = xml.match(/<token>(.*?)<\/token>/);
    const signMatch = xml.match(/<sign>(.*?)<\/sign>/);

    if (!tokenMatch || !signMatch) {
        throw new Error("Error parseando respuesta WSAA: " + xml);
    }

    const taData = {
        token: tokenMatch[1],
        sign: signMatch[1],
        xml,
        expirationTime: expirationTime.toISOString(), // Guardamos como string ISO por seguridad
        timestamp: new Date() // Fecha JS nativa (Fix para emulador)
    };

    await TA_DOC_REF.set(taData);
    return taData;
}

// ----------------------------------------------------------------------
// 2. OBTENER TICKET VÁLIDO (Cache vs Nuevo)
// ----------------------------------------------------------------------
async function _getValidTA() {
    const taSnapshot = await TA_DOC_REF.get();
    
    if (taSnapshot.exists) {
        const taData = taSnapshot.data();
        const expirationDate = new Date(taData.expirationTime); 
        
        // Si faltan más de 5 minutos para que expire, lo usamos
        if (expirationDate > new Date(Date.now() + 5 * 60000)) {
            return taData;
        }
    }
    return _generateTA();
}

// ----------------------------------------------------------------------
// 3. OBTENER ÚLTIMO COMPROBANTE AUTORIZADO
// ----------------------------------------------------------------------
async function _getUltimoComprobante(client, token, sign, ptoVta, cbteTipo) {
    const args = {
        Auth: { Token: token, Sign: sign, Cuit: CUIT_EMISOR },
        PtoVta: ptoVta,
        CbteTipo: cbteTipo
    };
    
    try {
        const [result] = await client.FECompUltimoAutorizadoAsync(args);
        if (result.FECompUltimoAutorizadoResult.Errors) {
            throw new Error("Error AFIP Ultimo Comp: " + JSON.stringify(result.FECompUltimoAutorizadoResult.Errors));
        }
        return result.FECompUltimoAutorizadoResult.CbteNro || 0;
    } catch (error) {
        console.error("Error obteniendo último comprobante:", error);
        throw error;
    }
}

// ----------------------------------------------------------------------
// 4. FUNCIÓN CLOUD: EMISIÓN DE LOTE DE FACTURAS
// ----------------------------------------------------------------------
exports.emitirFacturasReparto = functions.https.onCall(async (data) => {
    const ventas = data.ventas;
    if (!ventas || !Array.isArray(ventas)) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere un array de ventas.");
    }

    const resultados = [];
    
    // Obtenemos credenciales UNA sola vez para todo el lote para optimizar
    let authData;
    try {
        authData = await _getValidTA();
    } catch (e) {
        console.error("Error de Autenticación AFIP:", e);
        throw new functions.https.HttpsError("internal", "Error autenticando con AFIP: " + e.message);
    }

    // Procesamos venta por venta
    for (const venta of ventas) {
        try {
            if (venta.facturaAfip) {
                const resultadoAfip = await emitirFacturaAFIP(venta, authData.token, authData.sign);
                
                // Guardamos en Firestore
                await db.collection("ventas").doc(venta.id).update({
                    afipCAE: resultadoAfip.cae,
                    afipFechaVtoCAE: resultadoAfip.vtoCAE,
                    afipNumeroComprobante: resultadoAfip.numero,
                    afipLetra: resultadoAfip.tipoLetra, // 'A', 'B' o 'C'
                    afipEstado: "emitido",
                    afipResultado: "A"
                });

                resultados.push({ ventaId: venta.id, status: "OK", detalle: resultadoAfip });
            } else {
                resultados.push({ ventaId: venta.id, status: "Ignorado", detalle: "No requiere factura" });
            }
        } catch (error) {
            console.error(`Error venta ${venta.id}:`, error);
            // Si falla, guardamos el error en la venta
            await db.collection("ventas").doc(venta.id).update({
                afipEstado: "error",
                afipErrorDetalle: error.message
            }).catch(e => console.log("No se pudo actualizar error en DB (posiblemente venta no existe):", e));

            resultados.push({ ventaId: venta.id, status: "Error", detalle: error.message });
        }
    }

    return resultados;
});


// ----------------------------------------------------------------------
// 🧠 CEREBRO DE FACTURACIÓN (Lógica Smart A/B/C + RG 5616)
// ----------------------------------------------------------------------
async function emitirFacturaAFIP(venta, token, sign) {
    const client = await soap.createClientAsync(WSDL_URL);
    
    // --- 1. Determinar Letra y Tipo de Comprobante ---
    let CBTE_TIPO = 11; // Por defecto C (Monotributo)

    // Dato que viene del Frontend (add-client.tsx)
    // Valores posibles: 'CF' (Consumidor Final), 'MT' (Monotributo), 'RI' (Resp. Inscripto), 'EX' (Exento)
    const clienteCondicion = venta.clienteCondicionIVA || 'CF'; 

    if (CONDICION_EMISOR === "MONOTRIBUTO") {
        // 🔒 LÓGICA BLINDADA:
        // Si yo soy Monotributista, el sistema SIEMPRE emitirá 'C' (Tipo 11).
        // No importa si el cliente es Coca Cola (RI). Se le hace Factura C.
        CBTE_TIPO = 11; 
    } else {
        // Si en el futuro cambias a 'RESPONSABLE_INSCRIPTO', se activa esto:
        if (clienteCondicion === 'RI') {
            CBTE_TIPO = 1; // Factura A (Solo a otros RI)
        } else {
            CBTE_TIPO = 6; // Factura B (A Monotributistas, Exentos y Cons. Final)
        }
    }

    // --- 2. Matemática de Importes ---
    const totalCobrado = parseFloat(venta.totalVenta);
    let impNeto = 0;
    let impIVA = 0;
    let impTotal = totalCobrado.toFixed(2);
    let arrayAlicuotas = null;

    if (CBTE_TIPO === 11) {
        // Factura C: Neto es igual al Total (No se discrimina IVA)
        impNeto = totalCobrado.toFixed(2);
        impIVA = 0;
    } else {
        // Facturas A y B (Solo Resp. Inscripto): Despejar IVA (21%)
        impNeto = (totalCobrado / 1.21).toFixed(2);
        impIVA = (totalCobrado - parseFloat(impNeto)).toFixed(2);
        
        // Ajuste fino de centavos para evitar rechazo matemático
        if (Math.abs((parseFloat(impNeto) + parseFloat(impIVA)) - totalCobrado) > 0.001) {
            impIVA = (totalCobrado - parseFloat(impNeto)).toFixed(2);
        }

        arrayAlicuotas = {
            AlicIva: [{ Id: 5, BaseImp: impNeto, Importe: impIVA }] // Id 5 = 21%
        };
    }

    // --- 3. Datos del Receptor (Cliente) ---
    // AFIP requiere: 80=CUIT, 96=DNI, 99=Consumidor Final
    let docTipo = 99;
    let docNro = "0";
    
    // Nueva normativa RG 5616: Condición IVA Receptor obligatorio
    // 1=IVA Resp Inscripto, 5=Consumidor Final, 6=Monotributo
    let condicionIvaReceptorId = 5; 

    if (venta.clienteCuit && venta.clienteCuit.length > 5) {
        const limpio = venta.clienteCuit.replace(/\D/g, '');
        
        // Determinamos Tipo Doc
        if (limpio.length === 11) {
            docTipo = 80; // CUIT
            docNro = limpio;
        } else {
            docTipo = 96; // DNI
            docNro = limpio;
        }

        // Mapeamos la condición de la App a los códigos de AFIP
        if (clienteCondicion === 'RI') condicionIvaReceptorId = 1;
        else if (clienteCondicion === 'MT') condicionIvaReceptorId = 6;
        else condicionIvaReceptorId = 5; // Por defecto CF
    }

    // --- 4. Obtener Número y Fechas ---
    const ultimoNro = await _getUltimoComprobante(client, token, sign, PTO_VTA, CBTE_TIPO);
    const proximoNro = ultimoNro + 1;
    
    const now = new Date();
    now.setHours(now.getHours() - 3); // Ajuste UTC-3 Argentina
    const fchServ = now.toISOString().substring(0, 10).replace(/-/g, '');

    // --- 5. Payload ---
    const payload = {
        Auth: { Token: token, Sign: sign, Cuit: CUIT_EMISOR },
        FeCAEReq: {
            FeCabReq: {
                CantReg: 1,
                PtoVta: PTO_VTA,
                CbteTipo: CBTE_TIPO
            },
            FeDetReq: {
                FECAEDetRequest: {
                    Concepto: 1, // 1 = Productos
                    DocTipo: docTipo,
                    DocNro: docNro,
                    CbteDesde: proximoNro,
                    CbteHasta: proximoNro,
                    CbteFch: fchServ,
                    ImpTotal: impTotal,
                    ImpTotConc: 0,
                    ImpNeto: impNeto,
                    ImpOpEx: 0,
                    ImpTrib: 0,
                    ImpIVA: (CBTE_TIPO === 11) ? 0 : impIVA,
                    MonId: 'PES',
                    MonCotiz: 1,
                    // Si es C, no va IVA. Si es A/B, sí va.
                    ...(CBTE_TIPO !== 11 && { Iva: arrayAlicuotas }),
                    // Campo obligatorio RG 5616
                    CondicionIVAReceptorId: condicionIvaReceptorId
                }
            }
        }
    };

    console.log(`WSFE:: Emitiendo ${CBTE_TIPO === 11 ? 'Factura C' : (CBTE_TIPO === 1 ? 'Factura A' : 'Factura B')} #${proximoNro} a Doc: ${docNro}`);

    // --- 6. Disparo ---
    let response;
    try {
        const res = await client.FECAESolicitarAsync(payload);
        response = res[0];
    } catch (err) {
        throw new Error("Fallo SOAP AFIP: " + err.message);
    }

    // --- 7. Validación y Respuesta (Fix Array/Objeto) ---
    const rootResult = response.FECAESolicitarResult;
    if (rootResult.Errors) {
        const err = Array.isArray(rootResult.Errors.Err) ? rootResult.Errors.Err[0] : rootResult.Errors.Err;
        throw new Error(`AFIP Error Global (${err.Code}): ${err.Msg}`);
    }

    // AFIP a veces devuelve array si mandamos lote, a veces objeto. Normalizamos.
    let detalle = rootResult.FeDetResp.FECAEDetResponse;
    if (Array.isArray(detalle)) detalle = detalle[0];

    if (rootResult.FeCabResp.Resultado === "R") {
        let motivo = "Desconocido";
        if (detalle.Observaciones) {
            const obs = Array.isArray(detalle.Observaciones.Obs) ? detalle.Observaciones.Obs[0] : detalle.Observaciones.Obs;
            motivo = `(${obs.Code}) ${obs.Msg}`;
        }
        throw new Error(`AFIP Rechazó: ${motivo}`);
    }

    console.log(`WSFE:: ✅ ÉXITO! CAE: ${detalle.CAE}`);

    return {
        cae: detalle.CAE,
        vtoCAE: detalle.CAEFchVto,
        numero: proximoNro,
        tipoLetra: CBTE_TIPO === 11 ? 'C' : (CBTE_TIPO === 1 ? 'A' : 'B')
    };
}