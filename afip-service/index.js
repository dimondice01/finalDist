/**
 * afip-service/index.js
 * Servicio aislado para conexión con AFIP (Homologación) sin SDK externo
 */

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const soap = require("soap");

const { HttpsError } = require("firebase-functions/lib/providers/https");

admin.initializeApp();

// ----------------------------------------------------------------------
// CONFIGURACIÓN AFIP (desde variables de entorno Firebase)
// ----------------------------------------------------------------------
const CUIT_EMISOR = functions.config().arca?.cuit;
const CERT_CONTENT_B64 = functions.config().arca?.cert_content;
const KEY_CONTENT_B64 = functions.config().arca?.key_content;

// URL WSDL de homologación WSFE (dummy test)
const WSDL_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL";

// ----------------------------------------------------------------------
// FUNCIÓN: TEST DE CONEXIÓN (FEDummy) — Sin librería externa
// ----------------------------------------------------------------------
exports.afipTestConnection = functions.https.onCall(async (data, context) => {
  console.log("DEBUG:: afipTestConnection disparada");

  if (!CUIT_EMISOR || !CERT_CONTENT_B64 || !KEY_CONTENT_B64) {
    console.error("ERROR:: Faltan credenciales AFIP en configuración");
    throw new HttpsError(
      "failed-precondition",
      "ERROR: Faltan credenciales de AFIP en la configuración."
    );
  }

  try {
    console.log("DEBUG:: Decodificando certificados Base64");
    const CERT_CONTENT_DECODED = Buffer.from(CERT_CONTENT_B64, "base64").toString("utf8");
    const KEY_CONTENT_DECODED = Buffer.from(KEY_CONTENT_B64, "base64").toString("utf8");

    console.log("DEBUG:: Creando cliente SOAP WSFE");
    const client = await soap.createClientAsync(WSDL_URL);

    console.log("DEBUG:: Ejecutando método FEDummy()");
    const [result] = await client.FEDummyAsync();

    console.log("DEBUG:: Respuesta FEDummy", result.FEDummyResult);

    return {
      status: "success",
      message: "Conexión WSFE (Homologación) OK",
      response: result.FEDummyResult,
    };
  } catch (error) {
    console.error("Error en afipTestConnection (FEDummy):", error);
    throw new HttpsError(
      "internal",
      `Fallo la conexión con AFIP WSFE. Detalle: ${error.message}`
    );
  }
});
