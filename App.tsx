// App.tsx (en la raíz del proyecto)
import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

// --- ¡NUEVAS IMPORTACIONES! ---
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
// ¡¡NUEVA IMPORTACIÓN DE LA APP!!
import app from '@react-native-firebase/app';
// Importamos la instancia 'db' (que ahora es v9)
import { db } from './db/firebase-service';
// Importamos las funciones de inicialización v9
import { enableNetwork, initializeFirestore } from '@react-native-firebase/firestore';
import { COLORS } from './styles/theme';
// --- FIN DE NUEVAS IMPORTACIONES ---

// Tus importaciones originales
import { DataProvider } from './context/DataContext';
import { RouteProvider } from './context/RouteContext';
import RootNavigator from './src/navigation/AppNavigator';

// Componente principal
export default function App() {
  
  // --- ¡NUEVA LÓGICA DE INICIALIZACIÓN v9! ---
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializePersistence = async () => {
      try {
        // --- ¡¡ESTA ES LA CORRECCIÓN v9!! ---
        
        // 1. Obtenemos la instancia de la App por defecto
        // @ts-ignore: El linter de TS se confunde con los tipos nativos, app() es correcto
        const defaultApp = app(); 

        // 2. Inicializamos Firestore CON LA APP y la persistencia activada
        await initializeFirestore(defaultApp, {
          persistence: true,
        });
        
        // 3. Activamos la red PARA LA BASE DE DATOS (db)
        await enableNetwork(db);
        // --- FIN DE LA CORRECCIÓN v9 ---

        console.log("✅ ¡Persistencia v9 de Firestore habilitada exitosamente desde App.tsx!");
        setPersistenceReady(true);

      } catch (err: any) {
        if (err.code === 'failed-precondition') {
            console.warn("Advertencia al habilitar persistencia (ya estaba activa).");
            setPersistenceReady(true);
        } else {
            console.error("Error crítico al habilitar la persistencia v9: ", err);
            setError("Error al iniciar la app. No se pudo activar el modo offline.");
        }
      }
    };

    initializePersistence();
  }, []); // Se ejecuta solo una vez al inicio
  // --- FIN DE LA NUEVA LÓGICA ---


  // Si hay un error crítico
  if (error) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // Si la persistencia no está lista, mostramos un loader
  if (!persistenceReady) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>Preparando modo offline...</Text>
      </View>
    );
  }

  // ¡LISTO! Renderizamos la app principal
  return (
    <SafeAreaProvider>
      <DataProvider>
        <RouteProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <Toast />
        </RouteProvider>
      </DataProvider>
    </SafeAreaProvider>
  );
}

// --- NUEVOS ESTILOS PARA EL LOADER ---
const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundEnd || '#000',
  },
  loaderText: {
    color: '#AAA',
    marginTop: 15,
    fontSize: 16,
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 18,
    textAlign: 'center',
    padding: 20,
  }
});