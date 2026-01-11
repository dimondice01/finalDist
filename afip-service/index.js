/**
 * afip-service/index.js (Codebase: afip-service)
 * API Externa: Facturación AFIP y Ping
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const soap = require("soap");
const xmlbuilder = require("xmlbuilder");
const forge = require("node-forge");
const https = require("https");
const axios = require("axios");

// Inicializar (con verificación para evitar doble init si se comparten contextos)
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// --- CONFIGURACIÓN HTTP Y SSL ---
const legacyAgent = new https.Agent({
    ciphers: 'DEFAULT@SECLEVEL=1',
    keepAlive: true,
});

const afipAxios = axios.create({
    httpsAgent: legacyAgent,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
});

const URLS = {
    HOMO: { WSAA: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL", WSFE: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL" },
    PROD: { WSAA: "https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL", WSFE: "https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL" }
};

// --- LIMPIADOR DE CLAVES ---
function cleanAndFormatKey(rawString, type) {
    if (!rawString) return "";
    let body = rawString
        .replace(/-----BEGIN.*?-----/g, '')
        .replace(/-----END.*?-----/g, '')
        .replace(/\s+/g, ''); 
    const chunks = body.match(/.{1,64}/g);
    if (!chunks) throw new Error(`El formato del ${type} está corrupto.`);
    const cleanBody = chunks.join('\n');
    return type === 'KEY' 
        ? `-----BEGIN RSA PRIVATE KEY-----\n${cleanBody}\n-----END RSA PRIVATE KEY-----`
        : `-----BEGIN CERTIFICATE-----\n${cleanBody}\n-----END CERTIFICATE-----`;
}

// --- GESTIÓN DE TOKEN ---
async function getAfipContext() {
    const configSnap = await db.doc("config/afip").get();
    if (!configSnap.exists) throw new HttpsError('failed-precondition', "AFIP no configurado.");
    
    const rawConfig = configSnap.data();
    if (!rawConfig.active) throw new HttpsError('failed-precondition', "Módulo AFIP desactivado.");
    
    // Soporte para nombres de campos 'cert'/'key' (frontend) o 'certificate'/'privateKey' (legacy)
    const rawCert = rawConfig.cert || rawConfig.certificate;
    const rawKey = rawConfig.key || rawConfig.privateKey;

    if (!rawCert || !rawKey) throw new HttpsError('failed-precondition', "Faltan certificados.");

    const config = {
        ...rawConfig,
        cuit: rawConfig.cuit.replace(/[^0-9]/g, ''),
        certPem: cleanAndFormatKey(rawCert, 'CERT'),
        keyPem: cleanAndFormatKey(rawKey, 'KEY'),
        urls: rawConfig.isProduction ? URLS.PROD : URLS.HOMO
    };

    const tokenRef = db.collection('afip_tokens').doc(config.cuit);
    const tokenSnap = await tokenRef.get();

    if (tokenSnap.exists) {
        const data = tokenSnap.data();
        const expires = new Date(data.expirationTime);
        if (expires > new Date(Date.now() + 10 * 60000)) { 
            return { ...config, token: data.token, sign: data.sign };
        }
    }
    return await generateNewToken(config, tokenRef);
}

async function generateNewToken(config, tokenRef) {
    console.log(`Generando Token para CUIT ${config.cuit}...`);
    try {
        const privateKey = forge.pki.privateKeyFromPem(config.keyPem);
        const cert = forge.pki.certificateFromPem(config.certPem);

        const TRA = xmlbuilder.create("loginTicketRequest", { encoding: "UTF-8" })
            .att("version", "1.0")
            .ele("header")
                .ele("uniqueId", Math.floor(Date.now() / 1000)).up()
                .ele("generationTime", new Date(Date.now() - 600000).toISOString()).up()
                .ele("expirationTime", new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()).up()
            .up()
            .ele("service", "wsfe")
            .end();

        const p7 = forge.pkcs7.createSignedData();
        p7.content = forge.util.createBuffer(TRA, "utf8");
        p7.addCertificate(cert);
        p7.addSigner({ key: privateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256 });
        p7.sign();
        const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());

        const client = await soap.createClientAsync(config.urls.WSAA, { request: afipAxios, wsdl_options: { httpsAgent: legacyAgent } });
        const [result] = await client.loginCmsAsync({ in0: cms });

        const token = result.loginCmsReturn.match(/<token>(.*?)<\/token>/)[1];
        const sign = result.loginCmsReturn.match(/<sign>(.*?)<\/sign>/)[1];
        
        await tokenRef.set({ token, sign, expirationTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() });
        return { ...config, token, sign };
    } catch (e) {
        console.error("Fallo WSAA:", e);
        throw new HttpsError('internal', `Error AFIP Auth: ${e.message}`);
    }
}

// ==================================================================
// EXPORTACIONES PÚBLICAS (Solo API HTTP)
// ==================================================================

exports.probarConexionAfip = onCall({
    cors: true,
    region: "us-central1",
    timeoutSeconds: 30
}, async (request) => {
    try {
        const ctx = await getAfipContext();
        const client = await soap.createClientAsync(ctx.urls.WSFE, { request: afipAxios, wsdl_options: { httpsAgent: legacyAgent } });
        const [result] = await client.FEDummyAsync({});
        return { 
            status: "OK", 
            server: result.FEDummyResult.AppServer, 
            auth: result.FEDummyResult.AuthServer,
            mod: ctx.isProduction ? "PRODUCCIÓN" : "HOMOLOGACIÓN"
        };
    } catch (e) {
        console.error("Error Ping:", e);
        return { status: "ERROR", message: e.message };
    }
});

exports.emitirFacturasReparto = onCall({
    cors: true,
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB"
}, async (request) => {
    const { ventas } = request.data;
    if (!ventas || !Array.isArray(ventas)) throw new HttpsError('invalid-argument', 'Falta array de ventas');

    const resultados = [];
    let ctx, clientWsfe;

    try {
        ctx = await getAfipContext();
        clientWsfe = await soap.createClientAsync(ctx.urls.WSFE, { request: afipAxios, wsdl_options: { httpsAgent: legacyAgent } });
    } catch (e) {
        return ventas.map(v => ({ ventaId: v.id, status: "Error", detalle: "Fallo Auth: " + e.message }));
    }

    for (const venta of ventas) {
        try {
            if (!venta.facturaAfip) {
                resultados.push({ ventaId: venta.id, status: "Ignorado", detalle: "No requiere factura" });
                continue;
            }

            // --- DATOS Y LÓGICA ---
            const CUIT_EMISOR = ctx.cuit; 
            const PTO_VTA = ctx.ptoVta || 1;
            const ES_MONOTRIBUTO = ctx.taxCondition === 'MONOTRIBUTO'; 
            let CBTE_TIPO = 11; // C
            const clienteCondicion = venta.clienteCondicionIVA || 'CF';

            if (!ES_MONOTRIBUTO) CBTE_TIPO = (clienteCondicion === 'RI') ? 1 : 6; // A o B

            const total = parseFloat(venta.totalVenta);
            let impNeto = total, impIVA = 0, arrayAlicuotas = null;

            if (CBTE_TIPO !== 11) {
                impNeto = (total / 1.21).toFixed(2);
                impIVA = (total - parseFloat(impNeto)).toFixed(2);
                if (Math.abs((parseFloat(impNeto) + parseFloat(impIVA)) - total) > 0.001) {
                    impIVA = (total - parseFloat(impNeto)).toFixed(2);
                }
                arrayAlicuotas = { AlicIva: [{ Id: 5, BaseImp: impNeto, Importe: impIVA }] };
            } else {
                impNeto = total.toFixed(2);
            }

            let docTipo = 99, docNro = "0";
            if (venta.clienteCuit && venta.clienteCuit.length > 5) {
                const limpio = venta.clienteCuit.replace(/\D/g, '');
                docTipo = limpio.length === 11 ? 80 : 96;
                docNro = limpio;
            }

            // --- AFIP ---
            const [resUlt] = await clientWsfe.FECompUltimoAutorizadoAsync({
                Auth: { Token: ctx.token, Sign: ctx.sign, Cuit: CUIT_EMISOR },
                PtoVta: PTO_VTA, CbteTipo: CBTE_TIPO
            });
            const proximo = (resUlt.FECompUltimoAutorizadoResult.CbteNro || 0) + 1;

            const fchServ = new Date(Date.now() - 10800000).toISOString().substring(0, 10).replace(/-/g, '');
            const payload = {
                Auth: { Token: ctx.token, Sign: ctx.sign, Cuit: CUIT_EMISOR },
                FeCAEReq: {
                    FeCabReq: { CantReg: 1, PtoVta: PTO_VTA, CbteTipo: CBTE_TIPO },
                    FeDetReq: {
                        FECAEDetRequest: {
                            Concepto: 1, DocTipo: docTipo, DocNro: docNro,
                            CbteDesde: proximo, CbteHasta: proximo, CbteFch: fchServ,
                            ImpTotal: total.toFixed(2), ImpTotConc: 0, ImpNeto: impNeto, 
                            ImpOpEx: 0, ImpTrib: 0, ImpIVA: (CBTE_TIPO === 11 ? 0 : impIVA),
                            MonId: 'PES', MonCotiz: 1, CondicionIVAReceptorId: 5,
                            ...(CBTE_TIPO !== 11 && { Iva: arrayAlicuotas })
                        }
                    }
                }
            };

            const [resCAE] = await clientWsfe.FECAESolicitarAsync(payload);
            const rCAE = resCAE.FECAESolicitarResult;
            
            if (rCAE.FeCabResp.Resultado === "R") {
                const obs = rCAE.FeDetResp.FECAEDetResponse[0]?.Observaciones?.Obs[0];
                throw new Error(obs ? obs.Msg : 'Rechazo desconocido');
            }

            const detalle = rCAE.FeDetResp.FECAEDetResponse[0];
            
            // --- ACTUALIZAR FIRESTORE ---
            await db.collection("ventas").doc(venta.id).update({
                afipCAE: detalle.CAE,
                afipFechaVtoCAE: detalle.CAEFchVto,
                afipNumeroComprobante: proximo,
                afipLetra: CBTE_TIPO === 11 ? 'C' : (CBTE_TIPO === 1 ? 'A' : 'B'),
                afipEstado: "emitido"
            });

            resultados.push({ ventaId: venta.id, status: "OK", detalle: { cae: detalle.CAE, numero: proximo } });

        } catch (error) {
            console.error(`Error venta ${venta.id}:`, error);
            await db.collection("ventas").doc(venta.id).update({ afipEstado: "error", afipErrorDetalle: error.message }).catch(e=>{});
            resultados.push({ ventaId: venta.id, status: "Error", detalle: error.message });
        }
    }
    return resultados;
});