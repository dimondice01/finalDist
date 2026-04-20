import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC0JqOWRdkmFjBoAQN7igM_a2qKysYW2Kk",
  authDomain: "noarerp.firebaseapp.com",
  projectId: "noarerp",
};

const app = initializeApp(firebaseConfig);

// 🔹 Indicamos el codebase correcto
const functions = getFunctions(app, { codebase: "afip-service" });
const afipTestConnection = httpsCallable(functions, "afipTestConnection");

afipTestConnection()
  .then((res) => console.log("✅ Respuesta de AFIP:", res.data))
  .catch((err) => console.error("❌ Error llamando afipTestConnection:", err));
