// Asumo que el archivo está en src/screens/home.tsx ahora

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { signOut } from 'firebase/auth';
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
import { HomeScreenProps } from '../navigation/AppNavigator'; // Importamos el tipo de props del Stack Navigator

// --- Contextos y DB ---
import { Sale, useData, Vendor } from '../../context/DataContext';
import { auth } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

const HomeScreen = ({ navigation }: HomeScreenProps) => { 
    const { 
        sales, 
        vendors, 
        // Corregido: Usamos solo las propiedades correctas del contexto.
        isLoading: isDataLoading, 
        refreshAllData 
    } = useData();
    
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const currentVendedor = useMemo(() => {
        const currentUser = auth.currentUser;
        if (!currentUser || !vendors || vendors.length === 0) return null;
        // CORRECCIÓN DE BÚSQUEDA: Buscar por firebaseAuthUid si la ID de auth no es la misma que la ID de doc
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid || v.id === currentUser.uid);
    }, [vendors]);

    // --- Obtener últimas 5 ventas ---
    const recentSales = useMemo(() => {
        const getDate = (sale: Sale) => {
            if (sale.fecha instanceof Date) {
                return sale.fecha.getTime();
            }
            return (sale.fecha?.seconds || 0) * 1000; 
        };
        return [...sales]
            .sort((a, b) => getDate(b) - getDate(a))
            .slice(0, 5);
    }, [sales]);

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
                            await signOut(auth);
                            // La navegación a Login la maneja RootNavigator al detectar signOut.
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

    // --- Funciones auxiliares de formato ---
    const formatCurrency = (value: number) => {
        return `$${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDate = (date: Sale['fecha']) => {
        try {
            let d: Date;
            if (date instanceof Date) {
                d = date;
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
                    <View>
                        <Text style={styles.greeting}>Hola,</Text>
                        <Text style={styles.userName} numberOfLines={1}>
                            {currentVendedor?.nombreCompleto || 'Vendedor'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                        <Feather name="log-out" size={24} color={COLORS.danger} />
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
                        <Feather name="users" size={28} color={COLORS.primary} />
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
                        <Feather name="plus-circle" size={28} color={COLORS.primary} />
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
                            <Feather name="user-plus" size={26} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Nuevo Cliente</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('ClientMap')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="map-pin" size={26} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Mapa</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('Reports')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="bar-chart-2" size={26} color={COLORS.primary} />
                        </View>
                        <Text style={styles.toolText}>Reportes</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolButton} onPress={() => navigation.navigate('Promotions')}>
                        <View style={styles.toolIconCircle}>
                            <Feather name="gift" size={26} color={COLORS.primary} />
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
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={styles.recentSaleCard}
                            onPress={() => navigation.navigate('SaleDetail', { saleId: item.id , clientName : item.clientName })}
                        >
                            <View style={styles.recentSaleHeader}>
                                <Text style={styles.recentSaleDate}>{formatDate(item.fecha)}</Text>
                                <Text 
                                    style={[
                                        styles.recentSaleStatus, 
                                        { color: item.estado === 'Pendiente de Entrega' ? COLORS.warning : (item.estado === 'Pagada' ? COLORS.success : COLORS.textSecondary) }
                                    ]}>
                                    {item.estado}
                                </Text>
                            </View>
                            <Text style={styles.recentSaleClient} numberOfLines={1}>{item.clientName}</Text>
                            <Text style={styles.recentSaleTotal}>{formatCurrency(item.totalVenta)}</Text>
                        </TouchableOpacity>
                    )}
                />

            </ScrollView>
        </View>
    );
};

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
        paddingTop: (StatusBar.currentHeight || 0) + 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    greeting: {
        fontSize: 22,
        color: COLORS.textSecondary,
    },
    userName: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        maxWidth: 250,
    },
    logoutButton: {
        padding: 12,
        backgroundColor: COLORS.glass,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: COLORS.textPrimary,
        paddingHorizontal: 20,
        marginBottom: 15,
        marginTop: 10,
    },
    
    // --- NUEVO: Estilos de Tarjeta de Acción Principal ---
    primaryActionsCard: {
        backgroundColor: COLORS.glass,
        marginHorizontal: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        padding: 10, // Padding ligero, los botones tendrán el suyo
        marginBottom: 25,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 10,
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
        marginHorizontal: 10,
    },

    // --- NUEVO: Estilos de Herramientas (Círculos) ---
    toolsContainer: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        marginBottom: 15,
    },
    toolButton: {
        alignItems: 'center',
        marginRight: 25,
        width: 80, // Ancho fijo para alinear texto
    },
    toolIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32, // Círculo perfecto
        backgroundColor: COLORS.glass,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    toolText: {
        color: COLORS.textSecondary,
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
    },

    // --- Estilos de Ventas Recientes (Ajustados) ---
    recentSalesList: {
        paddingLeft: 20, 
        paddingRight: 10, // Espacio al final
        paddingBottom: 20
    },
    emptyRecent: {
        width: 300,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyRecentText: {
        color: COLORS.textSecondary,
        fontStyle: 'italic'
    },
    recentSaleCard: {
        width: 220, // Más pequeña
        backgroundColor: COLORS.glass,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        padding: 12,
        marginRight: 10,
    },
    recentSaleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    recentSaleDate: {
        color: COLORS.textSecondary,
        fontSize: 12,
    },
    recentSaleStatus: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    recentSaleClient: {
        color: COLORS.textPrimary,
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4,
    },
    recentSaleTotal: {
        color: COLORS.primary,
        fontSize: 17,
        fontWeight: 'bold',
        textAlign: 'right',
        marginTop: 3,
    },
});

export default HomeScreen;