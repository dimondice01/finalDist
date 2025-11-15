// compare-firebase-files.js
const { execSync } = require("child_process");
const fs = require("fs");

try {
  const cfgRaw = execSync("firebase functions:config:get", { encoding: "utf8" });
  const cfg = JSON.parse(cfgRaw);
  const cert_b64 = cfg.arca?.cert_content || "";
  const key_b64 = cfg.arca?.key_content || "";

  const cert_from_cfg = Buffer.from(cert_b64, "base64").toString("utf8").replace(/\r\n/g, "\n").trim();
  const key_from_cfg = Buffer.from(key_b64, "base64").toString("utf8").replace(/\r\n/g, "\n").trim();

  const cert_file = fs.readFileSync("cert-from-firebase.pem", "utf8").replace(/\r\n/g, "\n").trim();
  const key_file = fs.readFileSync("key-from-firebase.key", "utf8").replace(/\r\n/g, "\n").trim();

  console.log("cert match:", cert_from_cfg === cert_file);
  console.log("key match :", key_from_cfg === key_file);

  if (! (cert_from_cfg === cert_file)) {
    console.log("\n-- DIFF: certificado (primera/últimas 120 chars) --");
    console.log("cfg head:", cert_from_cfg.slice(0,120));
    console.log("file head:", cert_file.slice(0,120));
    console.log("cfg tail:", cert_from_cfg.slice(-120));
    console.log("file tail:", cert_file.slice(-120));
  }
  if (! (key_from_cfg === key_file)) {
    console.log("\n-- DIFF: key (primera/últimas 120 chars) --");
    console.log("cfg head:", key_from_cfg.slice(0,120));
    console.log("file head:", key_file.slice(0,120));
  }
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
