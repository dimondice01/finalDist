// En: db/firebase-service.ts

import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAuth } from 'firebase/auth';
// @ts-ignore - Le decimos a TypeScript que ignore el falso error en la siguiente línea
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";

// Tu configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyA5M0UOCZuDvuq_B4tYV5TcFv9eQVvk074", 
    authDomain: "distribuidora-1de93.firebaseapp.com",
    projectId: "distribuidora-1de93",
    storageBucket: "distribuidora-1de93.appspot.com",
    messagingSenderId: "491149648147",
    appId: "1:491149648147:web:ddcbdc9955405641667ae6"
};

// Inicialización segura de Firebase para evitar errores de recarga en desarrollo
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Inicialización de Auth con persistencia.
// Esta es la forma correcta y funcionará en la app.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

// La inicialización de Firestore no cambia
export const db = getFirestore(app);