import { getAuth } from '@react-native-firebase/auth';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { firebase } from '@react-native-firebase/functions';

const auth = getAuth();
// Sin especificar región, esta instancia apunta a us-central1 por defecto, pero TODAS
// las Cloud Functions del proyecto (mercadopago.js, etc.) están desplegadas en
// southamerica-west1 — por eso las llamadas devolvían NOT_FOUND.
const functionsInstance = firebase.app().functions('southamerica-west1');

export const dbContainer = {
    instance: null as FirebaseFirestoreTypes.Module | null
};

export function setDb(firestoreInstance: FirebaseFirestoreTypes.Module) {
    if (!dbContainer.instance) {
        dbContainer.instance = firestoreInstance;
    }
}

export { auth, functionsInstance as functions };
