// En: db/firebase-service.ts
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// --- INICIO DE CAMBIOS (SDK NATIVO) ---
// Importamos firestore (este es simple)
import firestore from '@react-native-firebase/firestore';

// --- ¡NUEVA FORMA DE IMPORTAR AUTH! ---
// Usamos 'require' para evitar el bug de TypeScript (ts(2339))
// que causa el error 'setPersistence does not exist'.
// Esto fuerza la carga del 'default' export (la función).
const auth = require('@react-native-firebase/auth').default;
// --- FIN DE CAMBIOS ---

// Obtenemos la instancia de Auth llamando a la función
const authInstance = auth();

// Configuramos la persistencia en la instancia
// AHORA SÍ debería encontrar la función .setPersistence()
authInstance.setPersistence(ReactNativeAsyncStorage);

// Obtenemos la instancia de Firestore
// (La persistencia offline ya está habilitada por defecto)
const db = firestore();

// Exportamos las *instancias* para que la app las use
// (Usamos 'auth' como nombre de exportación para que coincida
// con lo que el resto de tu app espera)
export { authInstance as auth, db };
console.log("ULTIMA VVVVVVVVVVVVVVVVVVVVVVVVVVVVV");