import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyD3KA2Ud41g3AGvMI387xG6EIjaZ11KNls",
  authDomain: "distribuidora-1de93",
  projectId: "491149648147",
};

const app = initializeApp(firebaseConfig);

// 🔹 Indicamos el codebase correcto
const functions = getFunctions(app, { codebase: "afip-service" });
const afipTestConnection = httpsCallable(functions, "afipTestConnection");

afipTestConnection()
  .then((res) => console.log("✅ Respuesta de AFIP:", res.data))
  .catch((err) => console.error("❌ Error llamando afipTestConnection:", err));
