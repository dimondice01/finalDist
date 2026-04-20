import { getAuth } from '@react-native-firebase/auth';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';

const auth = getAuth();
const functionsInstance = functions();

export const dbContainer = {
    instance: null as FirebaseFirestoreTypes.Module | null
};

export function setDb(firestoreInstance: FirebaseFirestoreTypes.Module) {
    if (!dbContainer.instance) {
        dbContainer.instance = firestoreInstance;
    }
}

export { auth, functionsInstance as functions };
