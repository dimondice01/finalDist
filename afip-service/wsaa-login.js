const fs = require("fs");
const soap = require("soap");
const xmlbuilder = require("xmlbuilder");
const forge = require("node-forge");

(async () => {
  try {
    console.log("🔐 Leyendo certificados originales...");

    // CARGAR CRT + KEY ORIGINALES
  const certPem = fs.readFileSync("certificado-afip.crt", "utf8");
const keyPem = fs.readFileSync("tuClave.key", "utf8");

    // Parse PEM → objetos forge válidos
    const certObj = forge.pki.certificateFromPem(certPem);
    const keyObj = forge.pki.privateKeyFromPem(keyPem);

    console.log("📄 Generando LoginTicketRequest...");

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

    console.log("🔏 Firmando con PKCS#7...");

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(loginTicketRequest, "utf8");

    p7.addCertificate(certObj);
    p7.addSigner({
      key: keyObj,
      certificate: certObj,
      digestAlgorithm: forge.pki.oids.sha256
    });

    p7.sign();

    // Generar CMS Base64 directamente (sin .toPem que rompe todo)
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const cms = Buffer.from(der, "binary").toString("base64");

    console.log("📡 Llamando a WSAA...");

    const WSAA_WSDL =
      "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL";

    const client = await soap.createClientAsync(WSAA_WSDL);

    const [result] = await client.loginCmsAsync({ in0: cms });

    console.log("🎉 TA recibido correctamente:");
    console.log("-------------------------------------");
    console.log(result.loginCmsReturn);
    console.log("-------------------------------------");

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
})();
