/**
 * afip-service/index.js
 * Servicio AFIP Homologación: WSAA + WSFE Dummy
 * INCLUYE: Gestión, extracción y almacenamiento REAL del Token y Sign en Firestore.
 */

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const soap = require("soap");
const xmlbuilder = require("xmlbuilder");
const forge = require("node-forge");
const fs = require("fs"); 
const path = require("path"); 

const { HttpsError } = require("firebase-functions/lib/providers/https");

// Inicializa Firebase
admin.initializeApp();
const db = admin.firestore();

// ----------------------------------------------------------------------
// CONFIGURACIÓN AFIP
// ----------------------------------------------------------------------
// 🚨 ATENCIÓN: REEMPLAZA ESTE VALOR POR TU CUIT REAL
const CUIT_EMISOR = "27278612932"; 

// Rutas de archivos y Endpoints
const CERT_PATH = path.join(__dirname, "certificado-afip.crt");
const KEY_PATH = path.join(__dirname,  "tuClave.key");
const WSDL_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL";
const WSAA_WSDL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL";

// Referencia al documento de Firestore donde guardaremos el TA.
const TA_PATH = "arca_afip/wsfe_ta"; 
const TA_DOC_REF = db.doc(TA_PATH); 

// ----------------------------------------------------------------------
// FUNCIÓN AUXILIAR 1: Genera el TA, EXTRAE TOKEN/SIGN y lo guarda en Firestore
// ----------------------------------------------------------------------
async function _generateTA() {
    console.log("WSAA:: Generando nuevo TA y guardando en Firestore");

    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
        throw new Error("Faltan credenciales AFIP (cert.pem o key.pem)");
    }

    const certPem = fs.readFileSync(CERT_PATH, "utf8");
    const keyPem = fs.readFileSync(KEY_PATH, "utf8");

    const certObj = forge.pki.certificateFromPem(certPem);
    const keyObj = forge.pki.privateKeyFromPem(keyPem);

    // Construir Login Ticket Request (LTR)
    const uniqueId = Math.floor(Date.now() / 1000);
    const generationTime = new Date(Date.now() - 600000).toISOString(); 
    const expirationTime = new Date(Date.now() + 12 * 60 * 60 * 1000); // Objeto Date nativo
    const expirationTimeISO = expirationTime.toISOString();

    const loginTicketRequest = xmlbuilder
        .create("loginTicketRequest", { encoding: "UTF-8" })
        .att("version", "1.0")
        .ele("header")
        .ele("uniqueId", uniqueId).up()
        .ele("generationTime", generationTime).up()
        .ele("expirationTime", expirationTimeISO).up()
        .up()
        .ele("service", "wsfe")
        .end({ pretty: true });

    // Firmar con PKCS#7
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(loginTicketRequest, "utf8");
    p7.addCertificate(certObj);
    p7.addSigner({
        key: keyObj,
        certificate: certObj,
        digestAlgorithm: forge.pki.oids.sha256
    });
    p7.sign();

    // CMS Base64
    const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());

    // Enviar a WSAA
    const client = await soap.createClientAsync(WSAA_WSDL);
    const [result] = await client.loginCmsAsync({ in0: cms });
    
    const xml = result.loginCmsReturn;
    
    // 🛑 LÓGICA DE EXTRACCIÓN DE TOKEN Y SIGN DEL XML 🛑
    const tokenMatch = xml.match(/<token>(.*?)<\/token>/);
    const signMatch = xml.match(/<sign>(.*?)<\/sign>/);

    const token = tokenMatch ? tokenMatch[1] : null;
    const sign = signMatch ? signMatch[1] : null;

    if (!token || !sign) {
        console.error("XML de respuesta de AFIP:", xml);
        throw new Error("Error al parsear Token o Sign del XML de WSAA. El XML puede estar incompleto o malformado.");
    }
    // 🛑 FIN LÓGICA DE EXTRACCIÓN 🛑

    const taData = {
        token: token, // ⬅️ VALOR REAL
        sign: sign,   // ⬅️ VALOR REAL
        expirationTime: expirationTime, // Date object (para guardar en Firestore)
        xml: xml,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    // Guardar en Firestore
    await TA_DOC_REF.set(taData);

    return taData; // Retorna con expirationTime como Date nativo, Token y Sign reales
}


// ----------------------------------------------------------------------
// FUNCIÓN AUXILIAR 2: Verifica y retorna un TA válido (o genera uno nuevo)
// ----------------------------------------------------------------------
async function _getValidTA() {
    const taSnapshot = await TA_DOC_REF.get();
    const now = new Date();
    
    if (taSnapshot.exists) {
        const taData = taSnapshot.data();
        
        // Convertir Timestamp de Firestore a Date nativo
        const expTime = taData.expirationTime.toDate(); 
        
        // 1. Si está expirado (damos un margen de 1 minuto)
        if (expTime.getTime() - now.getTime() < 60000) {
            console.log("WSAA:: TA expirado o no encontrado. Renovando...");
            return _generateTA();
        }
        
        console.log("WSAA:: TA existente y válido. Reutilizando.");
        // Asegurar que el objeto retornado tenga Date nativo (solo por consistencia, no es estrictamente necesario aquí)
        taData.expirationTime = expTime;
        return taData;
    }
    
    // Si no existe, generamos uno nuevo
    console.log("WSAA:: TA no encontrado. Generando por primera vez...");
    return _generateTA();
}


// ----------------------------------------------------------------------
// FUNCIÓN 1 — Test FEDummy
// ----------------------------------------------------------------------
exports.afipTestConnection = functions.https.onCall(async () => {
    // ... (El cuerpo de esta función no cambia) ...
});


// ----------------------------------------------------------------------
// FUNCIÓN 2 — WSAA: Obtener Ticket de Acceso (TA)
// ----------------------------------------------------------------------
exports.afipGetTA = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); 
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET, POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
    }

    try {
        const taData = await _generateTA(); 

        return res.status(200).json({
            status: "ok",
            xml: taData.xml,
            token: taData.token, // ⬅️ Nuevo
            sign: taData.sign,   // ⬅️ Nuevo
            expirationTime: taData.expirationTime.toISOString(), 
        });

    } catch (err) {
        console.error("WSAA:: Error:", err);
        return res.status(500).json({ error: err.message, stack: err.stack });
    }
});


// ----------------------------------------------------------------------
// FUNCIÓN: Emitir facturas de reparto (modo test/homologación)
// ----------------------------------------------------------------------
exports.emitirFacturasReparto = functions.https.onCall(async (data, context) => {
  const ventas = data.ventas; 
  
  if (!ventas || !Array.isArray(ventas)) {
    throw new HttpsError("invalid-argument", "Se esperaba un array de ventas.");
  }

  const resultados = [];

  for (const venta of ventas) {
    try {
      if (venta.facturaAfip) {
        // 🟢 Modo homologación: generar CAE dummy
        const resultadoAfip = await emitirFacturaAFIP(venta, null, null);

        // Guardar en Firestore
        await admin.firestore().collection("ventas").doc(venta.id).update({
          afipCAE: resultadoAfip.cae,
          afipFechaVtoCAE: resultadoAfip.vtoCAE,
          afipNumeroComprobante: resultadoAfip.numero,
          afipEstado: "emitido",
          afipResultado: "ok",
        });

        resultados.push({ ventaId: venta.id, status: "AFIP-HOMO", detalle: resultadoAfip });
      } else {
        // Comprobante interno
        const comprobante = await emitirComprobanteInterno(venta);
        await admin.firestore().collection("ventas").doc(venta.id).update({
          afipEstado: "no_afip",
          afipResultado: "interno",
          afipNumeroComprobante: comprobante.numeroComprobanteInterno,
        });
        resultados.push({ ventaId: venta.id, status: "Interno", detalle: comprobante });
      }
    } catch (error) {
      console.error(`Error al procesar venta ${venta.id}:`, error);
      resultados.push({ ventaId: venta.id, status: "Error", detalle: error.message });
    }
  }

  return resultados;
});

// ----------------------------------------------------------------------
// AUXILIAR: Emitir Factura AFIP (modo test/homologación con CAE dummy)
// ----------------------------------------------------------------------
async function emitirFacturaAFIP(venta, token, sign) {
  console.log(`WSFE:: Modo HOMOLOGACIÓN para venta ${venta.id}, cliente ${venta.clienteNombre}`);

  const PTO_VTA = 5;   
  const CBTE_TIPO = 11; 
  const FchHoy = new Date().toISOString().substring(0,10).replace(/-/g, '');
  
  // --- 1. Forzar CUIT y Condición IVA de prueba
  const DocTipo = 99;         // CUIT de prueba AFIP
  const DocNro = "0";         // CUIT dummy
  const CondicionIVA = 5;     // Consumidor Final

  // --- 2. Generar número de comprobante dummy
  const ProximoCbte = 1;

  // --- 3. Calcular importes
  const ImpTotal = venta.totalVenta || 0;
  const ImpNeto = ImpTotal;
  const ImpIVA = 0;

  // --- 4. Generar CAE dummy (homologación)
  const caeDummy = "12345678901234";
  const vtoDummy = new Date(Date.now() + 10*24*60*60*1000); // 10 días
  const vtoCAE = vtoDummy.toISOString().substring(0,10);

  console.log(`WSFE:: CAE dummy generado: ${caeDummy}, Vto: ${vtoCAE}, Nro: ${ProximoCbte}`);

  return {
    cae: caeDummy,
    vtoCAE,
    numero: ProximoCbte,
    resultado: "A",
  };
}
