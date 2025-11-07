// src/navigation/AppNavigator.tsx
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// --- INICIO DE CAMBIOS: SDK NATIVO ---
// ELIMINADAS: import { onAuthStateChanged, User } from 'firebase/auth';
// ELIMINADAS: import { doc, getDoc } from 'firebase/firestore';
// AÑADIDO: el TIPO 'FirebaseAuthTypes'
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
// --- FIN DE CAMBIOS: SDK NATIVO ---

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CartItem, Client } from '../../context/DataContext';

// --- Importa tus pantallas ---
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

// --- Contextos y Auth ---
import { Sale as BaseSale, useData } from '../../context/DataContext';
// Esta 'auth' y 'db' son NATIVAS
import { auth, db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- 1. Define los Parámetros de Ruta (Sin cambios) ---
export type RootStackParamList = {
    Login: undefined;
    Home: undefined; 
    Driver: undefined; 
    ClientList: undefined;
    ClientDashboard: { clientId: string };
    ClientDebts: { clientId: string, clientName: string }; 
    SaleDetail: { saleId: string; clientName: string }; 
    AddClient: undefined;
    EditClient: { client: Client}; 
    SelectClientForSale: undefined;
    CreateSale: {
        clientId: string;
        clientName?: string; 
        saleToEdit?: BaseSale; 
        saleId?: string; 
        isEditing?: string; 
        isReposicion?: boolean;
        isDevolucion?: boolean; 
        cliente?: Client;
    };
    ReviewSale: {
        cliente: Client;
        clientId: string;
        cart: CartItem[]; 
        isReposicion: boolean;
        totalVenta: number;
        totalCosto: number;
        totalComision: number;
        totalDescuento: number; 
        isDevolucion: boolean; 
    };
    Reports: undefined;
    Promotions: undefined;
    ClientMap: undefined;
    RegisterPayment: { saleId: string; saldoPendiente: string; saleInfo?: string; clientName?: string; };
    RouteDetail: { routeId: string };
};

// --- 2. Define los Tipos de Props (Sin cambios) ---
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

// --- Componente Navegador Principal ---
function RootNavigator() {
    // 1. Estados de control
    const [isAppReady, setIsAppReady] = useState(false);
    
    // --- INICIO DE CAMBIOS: SDK NATIVO ---
    // (Arregla el error 'any type')
    const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
    // --- FIN DE CAMBIOS: SDK NATIVO ---
    
    const [userRole, setUserRole] = useState<'Vendedor' | 'Reparto' | 'Admin' | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('Verificando sesión...');

    // 2. Acceso a DataContext
    const { syncData, isLoading: isDataLoading, isInitialDataLoaded } = useData();

    useEffect(() => {
        if (!isInitialDataLoaded) {
            setLoadingMessage('Cargando datos locales...');
            return;
        }

        // --- INICIO DE CAMBIOS: SDK NATIVO ---
        // Usamos el método 'onAuthStateChanged' de la INSTANCIA NATIVA 'auth'
        // y tipamos 'currentUser' para arreglar el error de TypeScript
        const subscriber = auth.onAuthStateChanged(async (currentUser: FirebaseAuthTypes.User | null) => {
        // --- FIN DE CAMBIOS: SDK NATIVO ---
            setUser(currentUser);
            setUserRole(null);

            if (currentUser) {
                setLoadingMessage('Sincronizando datos...');
                try {
                    await syncData();

                    // --- INICIO DE CAMBIOS: SDK NATIVO ---
                    // Usamos la sintaxis NATIVA para leer un documento
                    const userDocRef = db.collection('vendedores').doc(currentUser.uid);
                    const userDocSnap = await userDocRef.get();
                    // --- FIN DE CAMBIOS: SDK NATIVO ---

                    // --- ¡¡AQUÍ ESTÁ LA CORRECCIÓN!! ---
                    // En el SDK Nativo, '.exists' es una PROPIEDAD booleana, NO una función.
                    if (userDocSnap.exists) { 
                    // --- FIN DE LA CORRECCIÓN ---
                        setUserRole(userDocSnap.data()?.rango as 'Vendedor' | 'Reparto' | 'Admin' || null);
                    } else {
                        console.warn("Datos de vendedor no encontrados por UID directo, intentando fallback...");
                        // --- INICIO DE CAMBIOS: SDK NATIVO (Fallback) ---
                        const vendorsQuery = await db.collection('vendedores').where('firebaseAuthUid', '==', currentUser.uid).get();
                        if (!vendorsQuery.empty) {
                            setUserRole(vendorsQuery.docs[0].data().rango as 'Vendedor' | 'Reparto' | 'Admin' || null);
                        } else {
                            throw new Error("Datos de vendedor no encontrados en DB (ni por UID ni por firebaseAuthUid).");
                        }
                        // --- FIN DE CAMBIOS: SDK NATIVO (Fallback) ---
                    }
                } catch (error) {
                    console.error("Error al sincronizar datos o obtener rol:", error);
                    alert("Error de Sincronización. La sesión se cerrará.");
                    auth.signOut(); 
                    setUser(null);
                    setUserRole(null);
                }
            } else {
                setLoadingMessage('Esperando credenciales...');
            }
            setIsAppReady(true); 
        });

        return subscriber; 
    }, [isInitialDataLoaded, syncData]); 

    // --- LOADER DE INICIO ---
    if (!isAppReady || isDataLoading || (user && !userRole)) {
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
            return <DriverScreen {...props} />;
        }
        return <HomeScreen {...props} />;
    };

    const screenOptions = {
        headerShown: false,
        animation: 'slide_from_right' as const, 
    };

    const unmountOptions = {
        ...screenOptions, 
        unmountOnBlur: true, 
    };

    return (
        <Stack.Navigator screenOptions={screenOptions}>
            {user && userRole ? ( 
                // --- USUARIO AUTENTICADO: Stack Principal ---
                <>
                    <Stack.Screen name="Home" component={HomeOrDriverScreen} />
                    <Stack.Screen name="ClientList" component={ClientListScreen} options={unmountOptions} />
                    <Stack.Screen name="ClientDashboard" component={ClientDashboardScreen} options={unmountOptions} />
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
                    <Stack.Screen name="AddClient" component={AddClientScreen} />
                    <Stack.Screen name="EditClient" component={EditClientScreen} />
                </>
            ) : (
                // --- Pantalla de Login ---
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