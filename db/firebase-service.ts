// En: db/firebase-service.ts

// --- ELIMINAMOS ESTA LÍNEA ---
// import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Importamos firestore
import firestore from '@react-native-firebase/firestore';

// Importamos Auth
const auth = require('@react-native-firebase/auth').default;

// Obtenemos la instancia de Auth llamando a la función
const authInstance = auth();

// --- ¡LÍNEA ELIMINADA! ---
// Esta línea causaba el error. El SDK Nativo maneja esto automáticamente.
// ELIMINADO: authInstance.setPersistence(ReactNativeAsyncStorage);

// Obtenemos la instancia de Firestore
// (La persistencia offline ya está habilitada por defecto)
const db = firestore();

// Exportamos las *instancias*
export { authInstance as auth, db };

// Puedes eliminar este console.log si quieres
console.log("VERSIÓN CORREGIDA (sin setPersistence)");