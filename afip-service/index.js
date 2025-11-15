/**
 * afip-service/index.js
 * Servicio AFIP Homologación: WSAA + WSFE Dummy
 */

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const soap = require("soap");
const xmlbuilder = require("xmlbuilder");
const forge = require("node-forge");

const { HttpsError } = require("firebase-functions/lib/providers/https");

// Inicializa Firebase
admin.initializeApp();

// ----------------------------------------------------------------------
// CONFIGURACIÓN AFIP (desde variables de entorno Firebase)
// ----------------------------------------------------------------------
const CUIT_EMISOR = functions.config().arca?.cuit;
const CERT_CONTENT_B64 = functions.config().arca?.cert_content;
const KEY_CONTENT_B64 = functions.config().arca?.key_content;

const WSDL_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL";

// ----------------------------------------------------------------------
// FUNCIÓN 1 — Test FEDummy
// ----------------------------------------------------------------------
exports.afipTestConnection = functions.https.onCall(async () => {
  console.log("DEBUG:: afipTestConnection disparada");

  if (!CUIT_EMISOR || !CERT_CONTENT_B64 || !KEY_CONTENT_B64) {
    console.error("ERROR:: Faltan credenciales AFIP en configuración");
    throw new HttpsError("failed-precondition", "Faltan credenciales AFIP.");
  }

  try {
    const client = await soap.createClientAsync(WSDL_URL);
    const [result] = await client.FEDummyAsync();

    return {
      status: "success",
      message: "Conexión WSFE OK",
      response: result.FEDummyResult,
    };
  } catch (error) {
    console.error("ERROR FEDummy:", error);
    throw new HttpsError("internal", error.message);
  }
});

// ----------------------------------------------------------------------
// FUNCIÓN 2 — WSAA: Obtener Ticket de Acceso (TA)
// ----------------------------------------------------------------------
exports.afipGetTA = functions.https.onRequest(async (req, res) => {
  try {
    console.log("WSAA:: Iniciando generación de TA");

    if (!CERT_CONTENT_B64 || !KEY_CONTENT_B64) {
      console.error("WSAA:: Credenciales faltantes");
      return res.status(500).json({ error: "Faltan credenciales AFIP" });
    }

    // Convertir Base64 → PEM
    const certPem = Buffer.from(CERT_CONTENT_B64, "base64").toString("utf8");
    const keyPem = Buffer.from(KEY_CONTENT_B64, "base64").toString("utf8");

    // Convertir correctamente PEM → OBJETOS forge
    const certObj = forge.pki.certificateFromPem(certPem);
    const keyObj = forge.pki.privateKeyFromPem(keyPem);

    // Construir Login Ticket Request
    const uniqueId = Math.floor(Date.now() / 1000);

    const loginTicketRequest = xmlbuilder
      .create("loginTicketRequest", { encoding: "UTF-8" })
      .att("version", "1.0")
      .ele("header")
      .ele("uniqueId", uniqueId).up()
      .ele("generationTime", new Date(Date.now() - 600000).toISOString()).up()
      .ele("expirationTime", new Date(Date.now() + 3600000).toISOString()).up()
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

    const cms = forge.util.encode64(p7.toPem());

    // Enviar a WSAA
    const WSAA_WSDL = "https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL";
    const client = await soap.createClientAsync(WSAA_WSDL);

    const [result] = await client.loginCmsAsync({ in0: cms });

    return res.status(200).json({
      status: "ok",
      xml: result.loginCmsReturn,
    });

  } catch (err) {
    console.error("WSAA:: Error:", err);
    return res.status(500).json({ error: err.message });
  }
});
