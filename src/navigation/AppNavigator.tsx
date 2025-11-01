// src/navigation/AppNavigator.tsx
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CartItem, Client } from '../../context/DataContext';

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
// 🔥 CORRECCIÓN: Importar Sale as BaseSale
import { Sale as BaseSale, useData } from '../../context/DataContext';
import { auth, db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- 1. Define los Parámetros de Ruta CORREGIDOS ---
export type RootStackParamList = {
  Login: undefined;
  Home: undefined; // Home y Driver usan esta misma entrada
  Driver: undefined; // Mantenido para el tipo del componente, pero no en Stack principal
ClientList: undefined;
    ClientDashboard: { clientId: string };
    ClientDebts: { clientId: string, clientName: string }; // <-- CORRECCIÓN: Tu dashboard solo envía clientId
    SaleDetail: { saleId: string; clientName: string }; // <-- CORRECCIÓN: Tu dashboard SÍ envía clientName
    AddClient: undefined;
    EditClient: { client: Client}; // <-- CORRECCIÓN: Espera el objeto 'client'
  SelectClientForSale: undefined;
  // 🔥 CORRECCIÓN: Parámetros para CreateSale
  CreateSale: {
   

    clientId: string;
    clientName?: string;    // Nombre para mostrar
    saleToEdit?: BaseSale; // Objeto de venta para editar
    saleId?: string;     // Para editar
  isEditing?: string;  // Para editar
  isReposicion?: boolean;
  isDevolucion?: boolean; // <-- AÑADIDO
  cliente?: Client;
  };
  // 🔥 CORRECCIÓN: Parámetros para ReviewSale (saleIdToEdit es opcional)
  ReviewSale: {
    cliente: Client;
   clientId: string;
    cart: CartItem[]; // <-- Cambiado: Espera un array de CartItem
    isReposicion: boolean;
    totalVenta: number;
    totalCosto: number;
    totalComision: number;
    totalDescuento: number; // Mantenemos por si acaso
    isDevolucion: boolean; // <-- AÑADIDO
};
  
  Reports: undefined;
  Promotions: undefined;
  ClientMap: undefined;

  RegisterPayment: { saleId: string; saldoPendiente: string; saleInfo?: string; clientName?: string; };
  RouteDetail: { routeId: string };
};

// --- 2. Define los Tipos de Props (Sin cambios, pero ahora reflejan RootStackParamList corregido) ---
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
                        // Podríamos intentar buscar por firebaseAuthUid como fallback si es necesario
                        console.warn("Datos de vendedor no encontrados por UID directo, intentando fallback...");
                        // Aquí iría la lógica de fallback si la implementas
                        throw new Error("Datos de vendedor no encontrados en DB.");
                    }

                } catch (error) {
                    console.error("Error al sincronizar datos o obtener rol:", error);
                    // Considera no cerrar sesión automáticamente aquí, quizás mostrar un error persistente
                    // await auth.signOut();
                    // setUser(null);
                    // setUserRole(null); // Asegura limpiar el rol en error
                     alert("Error de Sincronización");
                }

            } else {
                 setLoadingMessage('Esperando credenciales...');
            }

            setIsAppReady(true); // Marca la app como lista después de verificar auth y rol (o fallo)
        });

        return subscriber; // Limpia la suscripción al desmontar
    }, [isInitialDataLoaded, syncData]); // Depende de la carga inicial y la función sync

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
            return <DriverScreen {...props} />;
        }
        // Vendedor, Admin o rol no determinado (cae en Home por defecto)
        return <HomeScreen {...props} />;
    };

    const screenOptions = {
        headerShown: false,
        animation: 'slide_from_right' as const, // Animación estándar
    };

    // Opciones específicas para desmontar pantallas y liberar memoria
    const unmountOptions = {
        ...screenOptions, // Hereda las opciones base
        unmountOnBlur: true, // Desmonta la pantalla cuando pierde el foco
    };

    return (

        <Stack.Navigator screenOptions={screenOptions}>
            {user && userRole ? ( // Solo muestra el stack principal si hay usuario Y rol
                // --- USUARIO AUTENTICADO: Definición del Stack Principal ---
                <>
                    {/* Home/Driver siempre activa */}
                    <Stack.Screen name="Home" component={HomeOrDriverScreen} />

                    {/* Pantallas que se desmontan para liberar memoria */}
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

                    {/* Pantallas simples que pueden permanecer montadas (o usa unmountOptions si prefieres) */}
                    <Stack.Screen name="AddClient" component={AddClientScreen} />
                    <Stack.Screen name="EditClient" component={EditClientScreen} />

                </>
            ) : (
                // --- Pantalla de Login si el usuario NO está logueado o no tiene rol ---
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
        backgroundColor: COLORS.backgroundEnd, // Fondo oscuro
    },
    loaderText: {
        marginTop: 15,
        color: COLORS.textSecondary, // Texto gris claro
        fontSize: 16
    }
});

export default RootNavigator;