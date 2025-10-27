// src/navigation/AppNavigator.tsx
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

// --- Importa tus pantallas (Ajusta rutas si moviste carpetas) ---
import AddClientScreen from '../screens/add-client';
import ClientDashboardScreen from '../screens/client-dashboard';
import ClientDebtsScreen from '../screens/client-debts';
import ClientListScreen from '../screens/client-list';
import ClientMapScreen from '../screens/client-map';
import CreateSaleScreen from '../screens/create-sale';
import DriverScreen from '../screens/driver';
import EditClientScreen from '../screens/edit-client';
import HomeScreen from '../screens/home';
import LoginScreen from '../screens/login';
import PromotionsScreen from '../screens/promotions';
import RegisterPaymentScreen from '../screens/register-payment';
import ReportsScreen from '../screens/reports';
import ReviewSaleScreen from '../screens/review-sale';
import RouteDetailScreen from '../screens/route-detail';
import SaleDetailScreen from '../screens/sale-detail';
import SelectClientForSaleScreen from '../screens/select-client-for-sale';

// --- Contextos y Auth (Ajusta rutas) ---
import { useData } from '../../context/DataContext';
import { auth, db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- 1. Define los Parámetros de Ruta ---
export type RootStackParamList = {
  Login: undefined;
  Home: undefined; // <-- Ahora Home y Driver serán la misma entrada lógica
  Driver: undefined; // <-- Mantenemos Driver para el tipo del componente, pero no en el Stack principal
  ClientList: undefined;
  ClientDashboard: { clientId: string };
  AddClient: undefined;
  EditClient: { clientId: string };
  SelectClientForSale: undefined;
  CreateSale: { clientId: string; saleId?: string; isEditing?: string };
  ReviewSale: { clientId: string; clientName?: string; cart: string };
  SaleDetail: { saleId: string };
  Reports: undefined;
  Promotions: undefined;
  ClientMap: undefined;
  ClientDebts: { clientId: string; clientName?: string };
  RegisterPayment: { saleId: string; saldoPendiente: string; saleInfo?: string; clientName?: string; };
  RouteDetail: { routeId: string };
};

// --- 2. Define los Tipos de Props (Omitidos por brevedad) ---
export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;
export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type DriverScreenProps = NativeStackScreenProps<RootStackParamList, 'Driver'>;
export type ClientListScreenProps = NativeStackScreenProps<RootStackParamList, 'ClientList'>;
export type ClientDashboardScreenProps = NativeStackScreenProps<RootStackParamList, 'ClientDashboard'>;
export type AddClientScreenProps = NativeStackScreenProps<RootStackParamList, 'AddClient'>;
export type EditClientScreenProps = NativeStackScreenProps<RootStackParamList, 'EditClient'>;
export type SelectClientForSaleScreenProps = NativeStackScreenProps<RootStackParamList, 'SelectClientForSale'>;
export type CreateSaleScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateSale'>;
export type ReviewSaleScreenProps = NativeStackScreenProps<RootStackParamList, 'ReviewSale'>;
export type SaleDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'SaleDetail'>;
export type ReportsScreenProps = NativeStackScreenProps<RootStackParamList, 'Reports'>;
export type PromotionsScreenProps = NativeStackScreenProps<RootStackParamList, 'Promotions'>;
export type ClientMapScreenProps = NativeStackScreenProps<RootStackParamList, 'ClientMap'>;
export type ClientDebtsScreenProps = NativeStackScreenProps<RootStackParamList, 'ClientDebts'>;
export type RegisterPaymentScreenProps = NativeStackScreenProps<RootStackParamList, 'RegisterPayment'>;
export type RouteDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'RouteDetail'>;


// --- Crea el Navegador ---
const Stack = createNativeStackNavigator<RootStackParamList>();

// --- Componente Navegador Principal con Lógica de Autenticación y Rol ---
function RootNavigator() {
    // 1. Estados de control
    const [isAppReady, setIsAppReady] = useState(false); 
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<'Vendedor' | 'Reparto' | 'Admin' | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('Verificando sesión...');

    // 2. Acceso a DataContext para sincronización
    const { syncData, isLoading: isDataLoading, isInitialDataLoaded } = useData();

    useEffect(() => {
        // Solo comenzamos la suscripción de Firebase una vez que AsyncStorage esté cargado,
        if (!isInitialDataLoaded) {
            setLoadingMessage('Cargando datos locales...');
            return;
        }

        const subscriber = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            setUserRole(null); 

            if (currentUser) {
                setLoadingMessage('Sincronizando datos...');
                try {
                    await syncData(); 

                    const userDocRef = doc(db, 'vendedores', currentUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        setUserRole(userDocSnap.data().rango as 'Vendedor' | 'Reparto' | 'Admin' || null);
                    } else {
                        throw new Error("Datos de vendedor no encontrados en DB.");
                    }
                    
                } catch (error) {
                    console.error("Error al sincronizar datos o obtener rol:", error);
                    await auth.signOut();
                    setUser(null);
                }

            } else {
                 setLoadingMessage('Esperando credenciales...');
            }
            
            setIsAppReady(true);
        });
        
        return subscriber;
    }, [isInitialDataLoaded, syncData]);

    // --- LOADER DE INICIO (Condición Triple) ---
    if (!isAppReady || isDataLoading || !isInitialDataLoaded) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>{loadingMessage}</Text>
            </View>
        );
    }

    // --- Componente que devuelve la pantalla inicial según el rol ---
    const HomeOrDriverScreen = (props: any) => {
        if (userRole === 'Reparto') {
            // Pasamos las props de Stack al componente DriverScreen
            return <DriverScreen {...props} />;
        }
        // Pasamos las props de Stack al componente HomeScreen
        return <HomeScreen {...props} />;
    };

    const screenOptions = {
        headerShown: false,
        animation: 'slide_from_right' as const,
    };

    // Definición de las opciones de desmontaje para evitar el error de tipado
    const unmountOptions = {
        headerShown: false,
        animation: 'slide_from_right' as const,
        unmountOnBlur: true, // <-- La propiedad que soluciona el Memory Leak
    };

    return (
        
        <Stack.Navigator screenOptions={screenOptions}
        // @ts-ignore
        detachInactiveScreens={true}>
            {user && userRole ? (
                // --- USUARIO AUTENTICADO: Definición del Stack Principal ---
                <>
                    {/* Home se mantiene montada para manejar el estado principal/Driver */}
                    <Stack.Screen name="Home" component={HomeOrDriverScreen} />
                    
                    {/* Pantallas con listas y lógica compleja (se desmontan al salir para liberar recursos) */}
                    <Stack.Screen name="ClientList" component={ClientListScreen} options={unmountOptions} />
                    <Stack.Screen name="ClientDashboard" component={ClientDashboardScreen} options={unmountOptions} />
                    
                    {/* Pantallas de formulario simples (mantienen el comportamiento por defecto) */}
                    <Stack.Screen name="AddClient" component={AddClientScreen} />
                    <Stack.Screen name="EditClient" component={EditClientScreen} />

                    {/* Pantallas de proceso y reportes (se desmontan al salir) */}
                    <Stack.Screen name="SelectClientForSale" component={SelectClientForSaleScreen} options={unmountOptions} />
                    <Stack.Screen name="CreateSale" component={CreateSaleScreen} options={unmountOptions} />
                    <Stack.Screen name="ReviewSale" component={ReviewSaleScreen} options={unmountOptions} />
                    <Stack.Screen name="SaleDetail" component={SaleDetailScreen} options={unmountOptions} />
                    <Stack.Screen name="Reports" component={ReportsScreen} options={unmountOptions} />
                    <Stack.Screen name="Promotions" component={PromotionsScreen} options={unmountOptions} />
                    <Stack.Screen name="ClientMap" component={ClientMapScreen} options={unmountOptions} />
                    <Stack.Screen name="ClientDebts" component={ClientDebtsScreen} options={unmountOptions} />
                    <Stack.Screen name="RegisterPayment" component={RegisterPaymentScreen} options={unmountOptions} />
                    <Stack.Screen name="RouteDetail" component={RouteDetailScreen} options={unmountOptions} />
                    
                </>
            ) : (
                // --- Pantalla de Login si el usuario NO está logueado ---
                <Stack.Screen name="Login" component={LoginScreen} />
            )}
        </Stack.Navigator>
    );
}

// Estilos para el loader (sin cambios)
const styles = StyleSheet.create({
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd,
    },
    loaderText: {
        marginTop: 15,
        color: COLORS.textSecondary,
        fontSize: 16
    }
});

export default RootNavigator;