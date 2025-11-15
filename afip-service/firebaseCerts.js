/**
 * export-afip-credentials.js
 * Extrae CERT y KEY desde Firebase Functions Config, decodifica
 * y los guarda en archivos locales PEM sin romper formato.
 */

const fs = require("fs");
const { execSync } = require("child_process");

console.log("📡 Leyendo configuración de Firebase...");

try {
  // Obtener variables de entorno desde Firebase
  const rawConfig = execSync("firebase functions:config:get", { encoding: "utf8" });
  const config = JSON.parse(rawConfig);

  if (!config.arca || !config.arca.cert_content || !config.arca.key_content) {
    console.error("❌ ERROR: No existen arca.cert_content o arca.key_content en Firebase");
    process.exit(1);
  }

  console.log("🔐 Decodificando CERT y KEY de Base64...");

  const certPem = Buffer.from(config.arca.cert_content, "base64").toString("utf8");
  const keyPem = Buffer.from(config.arca.key_content, "base64").toString("utf8");

  console.log("💾 Guardando archivos...");

  fs.writeFileSync("cert-from-firebase.pem", certPem, { encoding: "utf8" });
  fs.writeFileSync("key-from-firebase.key", keyPem, { encoding: "utf8" });

  console.log("");
  console.log("✅ CERT y KEY exportados correctamente:");
  console.log("   → cert-from-firebase.pem");
  console.log("   → key-from-firebase.key");
  console.log("");
  console.log("⚠️ Estos son los mismos archivos que usa FEMDUMMY y funcionan.");
  console.log("   Usalos para WSAA y ya no deberían fallar.");
  console.log("");

} catch (err) {
  console.error("❌ ERROR:", err.message);
}
