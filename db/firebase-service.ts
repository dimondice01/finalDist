// En: db/firebase-service.ts

// --- ¡¡ESTA ES LA CORRECCIÓN CLAVE!! ---
// Importamos las funciones 'get' de la API MODULAR (v9)
// No vienen de '/modular', ¡vienen del paquete principal!
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
// --- FIN DE LA CORRECCIÓN ---

// Obtenemos las instancias de Auth y Firestore usando la sintaxis v9
const auth = getAuth();
const db = getFirestore();

// Exportamos las *instancias v9*
export { auth, db };
