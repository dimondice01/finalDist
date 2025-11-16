const fs = require("fs");
const soap = require("soap");
const xmlbuilder = require("xmlbuilder");
const forge = require("node-forge");

(async () => {
  try {
    console.log("🔐 Leyendo certificados reales...");

    // Carga directa de tus archivos PEM
    const certPem = fs.readFileSync("certificado-afip.crt", "utf8");
    const keyPem = fs.readFileSync("tuClave.key", "utf8");

    // Parse PEM → objetos forge válidos
    const certObj = forge.pki.certificateFromPem(certPem);
    const keyObj = forge.pki.privateKeyFromPem(keyPem);

    console.log("📄 Generando LoginTicketRequest...");

    const now = Date.now();
    const uniqueId = Math.floor(now / 1000);

    const loginTicketRequest = xmlbuilder
      .create("loginTicketRequest", { encoding: "UTF-8" })
      .att("version", "1.0")
      .ele("header")
      .ele("uniqueId", uniqueId).up()
      .ele("generationTime", new Date(now - 600000).toISOString()).up()
      .ele("expirationTime", new Date(now + 3600000).toISOString()).up()
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
      digestAlgorithm: forge.pki.oids.sha256,
    });

    p7.sign();

    // Convertir firma PKCS#7 a Base64
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const cms = Buffer.from(der, "binary").toString("base64");

    console.log("📡 Llamando a WSAA...");

    const WSDL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL";

    const client = await soap.createClientAsync(WSDL);

    const [result] = await client.loginCmsAsync({ in0: cms });

    console.log("🎉 TA recibido correctamente:");
    console.log("-------------------------------------");
    console.log(result.loginCmsReturn);
    console.log("-------------------------------------");

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
})();
