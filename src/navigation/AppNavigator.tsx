// src/navigation/AppNavigator.tsx
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// --- SDK NATIVO ---
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CartItem, Client } from '../../context/DataContext';

// --- Importa tus pantallas ---
import AddClientScreen from '../screens/add-client';
import CatalogoScreen from '../screens/catalogo-screen'; // <--- IMPORTADO CORRECTAMENTE
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
import { auth, dbContainer } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- 1. Define los Parámetros de Ruta ---
export type RootStackParamList = {
    Login: undefined;
    Home: undefined; 
    Catalogo: undefined; // <--- AÑADIDO
    Driver: undefined; 
    ClientList: undefined;
    ClientDashboard: { clientId: string };
    ClientDebts: { clientId: string, clientName: string }; 
    SaleDetail: { saleId: string; clientName: string }; 
    AddClient: undefined;
    EditClient: { clientId: string}; 
    // ✅ CORREGIDO: Agregamos 'data' para el link de WhatsApp y 'c', 'p' para el SaaS Multi-Tenney
    SelectClientForSale: { cartItems?: any[]; data?: string; c?: string; p?: string } | undefined;
    CreateSale: {
        clientId: string;
        clientName?: string; 
        saleToEdit?: BaseSale; 
        saleId?: string; 
        isEditing?: string; 
        preselectedItems?: any[];
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

// --- 2. Define los Tipos de Props ---
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
    const [isAppReady, setIsAppReady] = useState(false);
    const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
    const [userRole, setUserRole] = useState<'Vendedor' | 'Reparto' | 'Admin' | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('Verificando sesión...');

    const { syncData, isLoading: isDataLoading, isInitialDataLoaded, userRole: resolvedRole } = useData();
    
    // ✅ ESCUCHAR CAMBIOS EN EL ROL RESUELTO
    useEffect(() => {
        if (resolvedRole) {
            console.log(`AppNavigator: Actualizando Navigator con Rol Resuelto: ${resolvedRole}`);
            setUserRole(resolvedRole);
        }
    }, [resolvedRole]);

    useEffect(() => {
        if (!isInitialDataLoaded) {
            setLoadingMessage('Cargando datos locales...');
            return;
        }

        const subscriber = auth.onAuthStateChanged(async (currentUser: FirebaseAuthTypes.User | null) => {
            setUser(currentUser);
            setUserRole(null);

            if (currentUser) {
                setLoadingMessage('Sincronizando datos...');
                try {
                    const db = dbContainer.instance;
                    if (!db) {
                        console.error("AppNavigator: ¡La DB no está inicializada!");
                        throw new Error("Error fatal de inicialización de DB.");
                    }
                    const userDocRef = db.collection('users').doc(currentUser.uid);
                    const userDocSnap = await userDocRef.get();

                    if (!userDocSnap.exists) {
                        console.error("Identidad no encontrada en /users para UID:", currentUser.uid);
                        throw new Error("No tienes un perfil de identidad configurado. Contacta a un administrador.");
                    }

                    const userData = userDocSnap.data();
                    const roleFromDoc = userData?.role || userData?.rango; // Soportar ambos por migración
                    
                    if (!roleFromDoc) {
                        throw new Error("El perfil de usuario no tiene un rol asignado.");
                    }

                    // Normalizamos el rol para el Navigator
                    const rawRole = (roleFromDoc || '').toLowerCase().trim();
                    let normalizedRole: 'Vendedor' | 'Reparto' | 'Admin' = 'Vendedor';

                    if (rawRole === 'admin' || rawRole === 'superadmin') {
                        normalizedRole = 'Admin';
                    } else if (rawRole === 'reparto' || rawRole === 'repartidor' || rawRole === 'chofer') {
                        normalizedRole = 'Reparto';
                    } else {
                        normalizedRole = 'Vendedor';
                    }

                    setUserRole(normalizedRole);

                    // Sincronizamos los datos (Internamente ya resuelve companyId)
                    await syncData();
                } catch (error) {
                    console.error("Error al sincronizar datos:", error);
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

    if (!isAppReady || isDataLoading || (user && !userRole)) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>{loadingMessage}</Text>
            </View>
        );
    }

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
                <Stack.Group>
                    <Stack.Screen name="Home" component={HomeOrDriverScreen} />
                    {/* AQUÍ ESTÁ LA NUEVA PANTALLA SIN COMENTARIOS QUE ROMPAN EL CÓDIGO */}
                    <Stack.Screen name="Catalogo" component={CatalogoScreen} options={unmountOptions} />
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
                </Stack.Group>
            ) : (
                <Stack.Screen name="Login" component={LoginScreen} />
            )}
        </Stack.Navigator>
    );
}

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