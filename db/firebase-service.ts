// En: db/firebase-service.ts

import { getAuth } from '@react-native-firebase/auth';
// Importamos el TIPO
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const auth = getAuth();

// ¡¡ESTE ES EL CAMBIO CLAVE!!
// Creamos un "contenedor" (wrapper object) para la instancia de db.
// Los imports de módulos JS importan una REFERENCIA a este objeto.
export const dbContainer = {
    instance: null as FirebaseFirestoreTypes.Module | null
};

// La función 'setDb' ahora modifica la PROPIEDAD 'instance'
export function setDb(firestoreInstance: FirebaseFirestoreTypes.Module) {
    if (!dbContainer.instance) {
        dbContainer.instance = firestoreInstance;
        console.log("DB_SERVICE: Instancia de Firestore (con persistencia) inyectada en dbContainer.");
    }
}

// Exportamos 'auth' (que no cambia)
export { auth };
