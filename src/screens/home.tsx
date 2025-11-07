// src/screens/home.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
// Importamos el Timestamp de v9
import { Timestamp } from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// --- Importaciones de Navegación ---
import { HomeScreenProps } from '../navigation/AppNavigator';

// --- Contextos y DB ---
import { Sale, useData, Vendor } from '../../context/DataContext';
// Esta 'auth' es NATIVA
import { auth } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- ¡NUEVO! Función de Estilos para los "Pills" de Estado ---
const getStatusStyles = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada':
            return { bg: 'rgba(22, 163, 74, 0.15)', text: COLORS.success };
        case 'Adeuda':
            return { bg: 'rgba(234, 179, 8, 0.15)', text: COLORS.warning };
        case 'Pendiente de Entrega':
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary };
        case 'Anulada':
            return { bg: 'rgba(239, 68, 68, 0.15)', text: COLORS.danger };
        default:
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary };
    }
};
// --- Fin de la nueva función ---

const HomeScreen = ({ navigation }: HomeScreenProps) => { 
    const { 
        sales, 
        vendors, 
        isLoading: isDataLoading, 
        refreshAllData 
    } = useData();
    
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const currentVendedor = useMemo(() => {
        const currentUser = auth.currentUser;
        if (!currentUser || !vendors || vendors.length === 0) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid || v.id === currentUser.uid);
    }, [vendors]);

    // --- Obtener últimas 5 ventas (CORREGIDO v9) ---
    const recentSales = useMemo(() => {
        const getDate = (sale: Sale) => {
            const fecha = sale.fecha;
            if (!fecha) return 0;
            if (fecha instanceof Date) {
                return fecha.getTime();
            }
            // --- CORREGIDO: Usamos el Timestamp importado ---
            if (fecha instanceof Timestamp) {
                return fecha.toMillis();
            }
            if ((fecha as any).seconds) { 
                return (fecha as any).seconds * 1000; 
            }
            return 0;
        };
        return [...sales]
            .sort((a, b) => getDate(b) - getDate(a))
            .slice(0, 5);
    }, [sales]);

    // --- onRefresh (Sin cambios) ---
    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await refreshAllData();
        } catch (error) {
            console.error("Error en pull-to-refresh:", error);
            Alert.alert("Error", "No se pudieron actualizar los datos.");
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshAllData]);

    // --- handleLogout (Limpio, sin importación web) ---
    const handleLogout = async () => {
        Alert.alert(
            "Cerrar Sesión",
            "¿Estás seguro de que quieres salir?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Salir",
                    style: "destructive",
                    onPress: async () => {
                        setIsLoggingOut(true);
                        try {
                            await auth.signOut(); // Usa la instancia nativa
                        } catch (error) {
                            console.error("Error al cerrar sesión:", error);
                            Alert.alert("Error", "No se pudo cerrar la sesión.");
                            setIsLoggingOut(false);
                        }
                    },
                },
            ]
        );
    };
    // --- FIN de handleLogout ---

    // --- Funciones auxiliares de formato (CORREGIDO v9) ---
    const formatCurrency = (value: number) => {
        return `$${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDate = (date: Sale['fecha']) => {
        try {
            let d: Date;
            if (date instanceof Date) {
                d = date;
            // --- CORREGIDO: Usamos el Timestamp importado ---
            } else if (date instanceof Timestamp) {
                d = date.toDate();
            } else {
                d = new Date((date?.seconds || 0) * 1000);
            }
            if (isNaN(d.getTime())) {
                return 'Fecha inválida';
            }
            return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        } catch (e) {
            return "Fecha errónea";
        }
    };

    // --- RENDERIZADO ---

    if (isDataLoading || isLoggingOut) { 
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>{isLoggingOut ? 'Cerrando sesión...' : 'Cargando datos...'}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        colors={[COLORS.primary]}
                        tintColor={COLORS.primary}
                    />
                }
            >
                {/* --- HEADER --- */}
                <View style={styles.header}>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.greeting}>Hola,</Text>
                        <Text style={styles.userName} numberOfLines={1}>
                            {currentVendedor?.nombreCompleto || 'Vendedor'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                        <Feather name="log-out" size={22} color={COLORS.danger} />
                    </TouchableOpacity>
                </View>
                
                {/* --- Tarjeta de Acciones Principales --- */}
                <Text style={styles.sectionTitle}>Acciones Principales</Text>
                <View style={styles.primaryActionsCard}>
                    {/* Botón Mis Clientes */}
                    <TouchableOpacity 
                        style={styles.primaryButton} 
                        onPress={() => navigation.navigate('ClientList')}
                    >
                        <Feather name="users" size={26} color={COLORS.primary} />
                        <View style={styles.primaryButtonTextContainer}>
                            <Text style={styles.primaryButtonTitle}>Mis Clientes</Text>
                            <Text style={styles.primaryButtonSubtitle}>Gestionar cartera y ventas</Text>
                        </View>
                        <Feather name="chevron-right" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>

                    {/* Divisor */}
                    <View style={styles.divider} />

                    {/* Botón Crear Venta */}
                    <TouchableOpacity 
                        style={styles.primaryButton} 
                        onPress={() => navigation.navigate('SelectClientForSale')}
                    >
                        <Feather name="plus-circle" size={26} color={COLORS.primary} />
                        <View style={styles.primaryButtonTextContainer}>
                            <Text style={styles.primaryButtonTitle}>Crear Venta</Text>
                            <Text style={styles.primaryButtonSubtitle}>Iniciar un pedido rápido</Text>
                        </View>
                        <Feather name="chevron-right" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* --- Herramientas (Menú de Círculos) --- */}
                <Text style={styles.sectionTitle}>Herramientas</Text>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.toolsContainer}
                >
                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('AddClient')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="user-plus" size={24} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Nuevo Cliente</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('ClientMap')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="map-pin" size={24} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Mapa</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('Reports')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="bar-chart-2" size={24} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Reportes</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('Promotions')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="gift" size={24} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Promos</Text>
                    </TouchableOpacity>
                </ScrollView>


                {/* --- VENTAS RECIENTES (Menos invasivo) --- */}
                <Text style={styles.sectionTitle}>Actividad Reciente</Text>
                <FlatList
                    horizontal
                    data={recentSales}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.recentSalesList}
                    ListEmptyComponent={
                        <View style={styles.emptyRecent}>
                            <Text style={styles.emptyRecentText}>No hay ventas recientes.</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        // --- ¡NUEVO! Usamos la función de estilos ---
                        const statusStyle = getStatusStyles(item.estado);
                        
                        return (
                            <TouchableOpacity 
                                style={styles.recentSaleCard}
                                onPress={() => navigation.navigate('SaleDetail', { saleId: item.id , clientName : item.clientName })}
                            >
                                <View style={styles.recentSaleHeader}>
                                    <Text style={styles.recentSaleDate}>{formatDate(item.fecha)}</Text>
                                    {/* --- ¡NUEVO! "Pill" de estado --- */}
                                    <View style={[styles.recentSaleStatusPill, { backgroundColor: statusStyle.bg }]}>
                                        <Text style={[styles.recentSaleStatusText, { color: statusStyle.text }]}>
                                            {item.estado}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.recentSaleClient} numberOfLines={1}>{item.clientName}</Text>
                                <Text style={styles.recentSaleTotal}>{formatCurrency(item.totalVenta)}</Text>
                            </TouchableOpacity>
                        )
                    }}
                />

            </ScrollView>
        </View>
    );
};

// --- Estilos (¡Mejorados!) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
    fullScreenLoader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 15,
        color: COLORS.textSecondary,
        fontSize: 16
    },
    scrollContent: {
        paddingBottom: 40,
        paddingTop: (StatusBar.currentHeight || 0) + 20, // Más espacio arriba
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 25, // Más padding
        marginBottom: 20, // Espacio antes del primer título
    },
    headerTextContainer: {
        flex: 1, // Permite que el texto se trunque si es necesario
    },
    greeting: {
        fontSize: 20, // Un poco más pequeño
        fontWeight: '300', // Más liviano
        color: COLORS.textPrimary, // Más contraste
    },
    userName: {
        fontSize: 32, // Más grande
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        maxWidth: 300, // Límite más grande
    },
    logoutButton: {
        padding: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)', // Fondo sutil rojo
        borderRadius: 16, // Más redondeado
        marginLeft: 10, // Espacio del texto
    },
    sectionTitle: {
        fontSize: 16, // Más pequeño y profesional
        fontWeight: '600',
        color: COLORS.textSecondary, // Menos énfasis
        paddingHorizontal: 25,
        marginBottom: 15,
        marginTop: 20, // Espacio consistente entre secciones
        textTransform: 'uppercase', // Estilo pro
        letterSpacing: 0.5, // Estilo pro
    },
    
    primaryActionsCard: {
        backgroundColor: COLORS.glass,
        marginHorizontal: 25, // Alineado con padding
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: 5, // Padding interno
        paddingVertical: 10,
        marginBottom: 25,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18, // Más espaciado vertical
        paddingHorizontal: 15, // Padding interno
    },
    primaryButtonTextContainer: {
        flex: 1,
        marginLeft: 15,
        marginRight: 10,
    },
    primaryButtonTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    primaryButtonSubtitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.glassBorder,
        marginHorizontal: 15, // Alineado con padding de botones
    },

    toolsContainer: {
        paddingLeft: 25, // Alineado
        paddingRight: 15, // Espacio al final
        paddingBottom: 10,
        marginBottom: 15,
        gap: 20, // Espacio uniforme entre botones
    },
    toolButton: {
        alignItems: 'center',
        width: 75, // Ancho fijo
    },
    toolIconCircle: {
        width: 60, // Ligeramente más pequeño
        height: 60,
        borderRadius: 30, 
        backgroundColor: COLORS.glass,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10, // Más espacio
    },
    toolText: {
        color: COLORS.textSecondary,
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
    },

    recentSalesList: {
        paddingLeft: 25, // Alineado
        paddingRight: 15, 
        paddingBottom: 20
    },
    emptyRecent: {
        width: 240, // Mismo ancho que las tarjetas
        height: 120, // Alto similar
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.glass,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    emptyRecentText: {
        color: COLORS.textSecondary,
        fontStyle: 'italic'
    },
    recentSaleCard: {
        width: 240, // Más ancho
        height: 120, // Alto fijo para consistencia
        backgroundColor: COLORS.glass,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        padding: 15, // Más padding
        marginRight: 10,
        justifyContent: 'space-between', // Distribuye el contenido
    },
    recentSaleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    recentSaleDate: {
        color: COLORS.textSecondary,
        fontSize: 13, // Un poco más grande
    },
    // --- ESTILO ANTIGUO (Solo texto) ---
    // recentSaleStatus: {
    //     fontSize: 12,
    //     fontWeight: 'bold',
    // },
    // --- ¡NUEVO ESTILO "PILL"! ---
    recentSaleStatusPill: {
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        overflow: 'hidden', // Para que el border-radius funcione en Text (Android)
    },
    recentSaleStatusText: {
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    // --- FIN ESTILO NUEVO ---
    recentSaleClient: {
        color: COLORS.textPrimary,
        fontSize: 16, // Más grande
        fontWeight: '600',
    },
    recentSaleTotal: {
        color: COLORS.primary,
        fontSize: 19, // Más grande
        fontWeight: 'bold',
        textAlign: 'right',
        marginTop: 5,
    },
});

export default HomeScreen;