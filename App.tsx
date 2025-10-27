// App.tsx (en la raíz del proyecto)
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

// Ajusta estas rutas a tu nueva estructura
import { DataProvider } from './context/DataContext';
import { RouteProvider } from './context/RouteContext';
import RootNavigator from './src/navigation/AppNavigator'; // El navegador que acabamos de crear

// Componente principal
export default function App() {
  return (
    // SafeAreaProvider es necesario para react-native-safe-area-context
    <SafeAreaProvider>
      <DataProvider>
        <RouteProvider>
          {/* NavigationContainer debe envolver tu navegador */}
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          {/* Toast se mantiene fuera del NavigationContainer */}
          <Toast />
        </RouteProvider>
      </DataProvider>
    </SafeAreaProvider>
  );
}