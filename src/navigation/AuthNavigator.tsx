// src/navigation/AuthNavigator.tsx (Crea este archivo)
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import LoginScreen from '../screens/login'; // Ajusta la ruta si es necesario

// --- 1. Definición de Parámetros de Ruta ---
// Define el mapa de todas las pantallas en el Stack de Autenticación
export type AuthStackParamList = {
    Login: undefined;
};

// --- 2. Definición del Tipo de Propiedades para la pantalla de Login ---
// Exportamos el tipo de props que la pantalla Login necesita consumir
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;


// --- 3. Creación del Stack Navigator ---
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
  return (
    <AuthStack.Navigator 
        screenOptions={{ 
            headerShown: false,
            animation: 'slide_from_right'
        }}
    >
      {/* La única pantalla en este Stack es el Login */}
      <AuthStack.Screen 
        name="Login" 
        component={LoginScreen} 
      />
    </AuthStack.Navigator>
  );
};

export default AuthNavigator;