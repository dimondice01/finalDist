// src/screens/home.tsx

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Timestamp } from '@react-native-firebase/firestore';

import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions // Necesario para el diseño responsivo de la grilla
    ,


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
import { auth } from '../../db/firebase-service';

// --- Estilos: Importamos el tema centralizado ---
import { COLORS, SIZES } from '../../styles/theme';

const { width } = Dimensions.get('window');
const GRID_CARD_WIDTH = (width - SIZES.large * 3) / 2; // Dos tarjetas por fila con espaciado

// --- INTERFACES AÑADIDAS PARA EVITAR ERRORES DE TIPADO ---
interface ToolCardProps {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    color: string;
    onPress: () => void;
}
// --------------------------------------------------------


// --- Función de Estilos para los "Pills" de Estado (Optimizada con SIZES) ---
const getStatusStyles = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada':
            return { bg: 'rgba(20, 184, 166, 0.15)', text: COLORS.success, icon: 'check-circle' as const };
        case 'Adeuda':
            return { bg: 'rgba(251, 191, 36, 0.15)', text: COLORS.warning, icon: 'alert-triangle' as const };
        case 'Pendiente de Entrega':
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'truck' as const };
        case 'Anulada':
            return { bg: 'rgba(239, 68, 68, 0.15)', text: COLORS.danger, icon: 'x-circle' as const };
        default:
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'circle' as const };
    }
};

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

    // Lógica de ventas recientes, logout y formato sin tocar
    // [CÓDIGO DE LÓGICA DE VENTAS Y LOGOUT SIN CAMBIOS]
    const recentSales = useMemo(() => {
        const getDate = (sale: Sale) => {
            const fecha = sale.fecha;
            if (!fecha) return 0;
            if (fecha instanceof Date) {
                return fecha.getTime();
            }
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
                            await auth.signOut();
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

    const formatCurrency = (value: number) => {
        return `$${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDate = (date: Sale['fecha']) => {
        try {
            let d: Date;
            if (date instanceof Date) {
                d = date;
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
    // ...

    if (isDataLoading || isLoggingOut) { 
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>{isLoggingOut ? 'Cerrando sesión...' : 'Cargando datos...'}</Text>
            </View>
        );
    }
    
    // --- RENDERIZADO CON ESTILOS DE VANGUARDIA ---
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
            
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
                {/* --- HEADER MEJORADO Y LIMPIO --- */}
                <View style={styles.header}>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.greeting}>Hola,</Text>
                        <Text style={styles.userName} numberOfLines={1}>
                            {currentVendedor?.nombreCompleto || 'Vendedor'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                        <Feather name="log-out" size={SIZES.h3} color={COLORS.danger} />
                    </TouchableOpacity>
                </View>

                {/* --- DASHBOARD / MIS CLIENTES CARD (Tarjeta Primaria de Alto Contraste) --- */}
                <Text style={styles.sectionTitle}>Mi Cartera</Text>
                <TouchableOpacity 
                    style={styles.clientCard} 
                    onPress={() => navigation.navigate('ClientList')}
                >
                    <View style={styles.clientCardContent}>
                        <Feather name="briefcase" size={SIZES.h2} color={COLORS.primary} />
                        <View style={styles.clientCardText}>
                            <Text style={styles.clientCardTitle}>Mis Clientes</Text>
                            <Text style={styles.clientCardSubtitle}>Gestiona tus Clientes.</Text>
                        </View>
                        <Feather name="chevron-right" size={SIZES.h3} color={COLORS.textSecondary} />
                    </View>
                </TouchableOpacity>

                {/* --- HERRAMIENTAS (Grilla 2x2 de Alto Impacto) --- */}
                <Text style={styles.sectionTitle}>Herramientas Rápidas</Text>
                <View style={styles.toolsGrid}>
                    {/* CORREGIDO: Las ToolCard ahora usan el nuevo diseño de alto impacto */}
                    <ToolCard 
                        icon="user-plus" 
                        title="Nuevo Cliente" 
                        color={COLORS.primary}
                        onPress={() => navigation.navigate('AddClient')} 
                    />
                    <ToolCard 
                        icon="map-pin" 
                        title="Ruta/Mapa" 
                        color={COLORS.secondary}
                        onPress={() => navigation.navigate('ClientMap')} 
                    />
                    <ToolCard 
                        icon="bar-chart-2" 
                        title="Reportes" 
                        color={COLORS.accent}
                        onPress={() => navigation.navigate('Reports')} 
                    />
                    <ToolCard 
                        icon="gift" 
                        title="Promociones" 
                        color={COLORS.warning}
                        onPress={() => navigation.navigate('Promotions')} 
                    />
                </View>

                {/* --- VENTAS RECIENTES (Horizontal Scroll) --- */}
                <Text style={styles.sectionTitle}>Actividad Reciente</Text>
                <FlatList
                    horizontal
                    data={recentSales}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.recentSalesList}
                    ListEmptyComponent={
                        <View style={styles.emptyRecent}>
                            <Feather name="tag" size={SIZES.h2} color={COLORS.textSecondary} style={{ marginBottom: SIZES.small }} />
                            <Text style={styles.emptyRecentText}>No hay ventas recientes.</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const statusStyle = getStatusStyles(item.estado);
                        
                        return (
                            <TouchableOpacity 
                                style={styles.recentSaleCard}
                                onPress={() => navigation.navigate('SaleDetail', { saleId: item.id , clientName : item.clientName })}
                            >
                                <View style={styles.recentSaleHeader}>
                                    <Feather name={statusStyle.icon} size={SIZES.h3} color={statusStyle.text} />
                                    <View style={[styles.recentSaleStatusPill, { backgroundColor: statusStyle.bg }]}>
                                        <Text style={[styles.recentSaleStatusText, { color: statusStyle.text }]}>
                                            {item.estado}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.recentSaleClient} numberOfLines={1}>{item.clientName}</Text>
                                <Text style={styles.recentSaleTotal}>{formatCurrency(item.totalVenta)}</Text>
                                <Text style={styles.recentSaleDate}>Fecha: {formatDate(item.fecha)}</Text>
                            </TouchableOpacity>
                        )
                    }}
                />
                
                {/* Espacio para el FAB */}
                <View style={{ height: 100 }} /> 

            </ScrollView>
            
            {/* --- FAB (Floating Action Button) - La CTA más importante --- */}
            <TouchableOpacity 
                style={styles.fab} 
                onPress={() => navigation.navigate('SelectClientForSale')}
                activeOpacity={0.9}
            >
                <Feather name="shopping-bag" size={SIZES.h2} color={COLORS.white} />
                <Text style={styles.fabText}>Nueva Venta</Text>
            </TouchableOpacity>

        </View>
    );
};

// --- Componente auxiliar ToolCard (REDESIGNADO: Alto Impacto) ---
interface ToolCardProps {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    color: string;
    onPress: () => void;
}

const ToolCard = ({ icon, title, color, onPress }: ToolCardProps) => (
    <TouchableOpacity style={[toolStyles.card, { borderColor: color + '30' }]} onPress={onPress}>
        {/* Ícono grande y prominente */}
        <Feather name={icon} size={SIZES.h2} color={color} style={toolStyles.icon} />
        
        {/* Texto con jerarquía */}
        <View style={toolStyles.textWrapper}>
            <Text style={toolStyles.title} numberOfLines={1}>{title}</Text>
            <Feather name="chevron-right" size={SIZES.body} color={COLORS.textSecondary} style={toolStyles.arrow} />
        </View>
    </TouchableOpacity>
);

const toolStyles = StyleSheet.create({
    card: {
        width: GRID_CARD_WIDTH, // Usamos la constante calculada
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius, // Más redondeado
        padding: SIZES.medium,
        borderWidth: 2, // Borde más grueso para sensación de calidad
        height: 120, // Altura más cómoda
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        // Sombra sutil para efecto de elevación (Minimalista y profesional)
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    icon: {
        marginBottom: SIZES.small, // Espacio después del ícono
    },
    textWrapper: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontSize: SIZES.body,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        flex: 1,
    },
    arrow: {
        marginLeft: SIZES.small,
        opacity: 0.6,
    }
});


// --- ESTILOS MEJORADOS DE PANTALLA ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart }, // Usamos backgroundStart como fondo principal
    background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
    
    // LOADER
    fullScreenLoader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundStart,
    },
    loadingText: {
        marginTop: SIZES.medium,
        color: COLORS.textSecondary,
        fontSize: SIZES.body
    },
    
    // SCROLL
    scrollContent: {
        paddingBottom: SIZES.xl,
    },
    
    // HEADER
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SIZES.large,
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.medium,
        marginBottom: SIZES.xl,
    },
    headerTextContainer: {
        flex: 1, 
    },
    greeting: {
        fontSize: SIZES.body,
        fontWeight: '500',
        color: COLORS.textSecondary,
    },
    userName: {
        fontSize: SIZES.h1, // 32 puntos - Nombre muy destacado
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        maxWidth: '90%', 
    },
    logoutButton: {
        padding: SIZES.small,
        backgroundColor: COLORS.danger + '10', // Fondo muy sutil
        borderRadius: SIZES.radiusSmall,
        marginLeft: SIZES.medium,
    },
    
    // SECCIONES
    sectionTitle: {
        fontSize: SIZES.caption,
        fontWeight: '700',
        color: COLORS.textSecondary, 
        paddingHorizontal: SIZES.large,
        marginBottom: SIZES.medium,
        marginTop: SIZES.large,
        textTransform: 'uppercase', 
        letterSpacing: 0.8, 
    },
    
    // DASHBOARD CARD (Mi Cartera)
    clientCard: {
        backgroundColor: COLORS.backgroundEnd,
        marginHorizontal: SIZES.large, 
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        marginBottom: SIZES.large,
        padding: SIZES.medium,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 1,
    },
    clientCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    clientCardText: {
        flex: 1,
        marginLeft: SIZES.medium,
        marginRight: SIZES.small,
    },
    clientCardTitle: {
        fontSize: SIZES.h3,
        fontWeight: '700',
        color: COLORS.primary,
    },
    clientCardSubtitle: {
        fontSize: SIZES.caption,
        color: COLORS.textSecondary,
        marginTop: SIZES.xsmall,
    },

    // GRID DE HERRAMIENTAS
    toolsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginHorizontal: SIZES.large,
        gap: SIZES.medium, // Espacio uniforme
        marginBottom: SIZES.large,
    },
    
    // VENTAS RECIENTES (Horizontal Scroll)
    recentSalesList: {
        paddingHorizontal: SIZES.large, 
        paddingBottom: SIZES.large
    },
    emptyRecent: {
        width: 256,
        height: 150, 
        padding: SIZES.large,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
    },
    emptyRecentText: {
        color: COLORS.textSecondary,
        fontStyle: 'italic',
        fontSize: SIZES.caption,
    },
    recentSaleCard: {
        width: 180, // Más compacto
        height: 150, 
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radiusSmall,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        padding: SIZES.medium,
        marginRight: SIZES.medium,
        justifyContent: 'space-between',
    },
    recentSaleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    recentSaleDate: {
        color: COLORS.textSecondary,
        fontSize: SIZES.xsmallText,
        fontWeight: '500',
    },
    recentSaleStatusPill: {
        borderRadius: SIZES.radiusSmall,
        paddingHorizontal: SIZES.xsmall,
        paddingVertical: SIZES.xsmall / 2,
        overflow: 'hidden', 
        maxWidth: 90,
    },
    recentSaleStatusText: {
        fontSize: SIZES.xsmallText,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    recentSaleClient: {
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
        fontWeight: '700',
        marginTop: SIZES.small,
    },
    recentSaleTotal: {
        color: COLORS.primary,
        fontSize: SIZES.h3,
        fontWeight: 'bold',
        marginTop: SIZES.xsmall,
    },

    // FAB (Floating Action Button)
    fab: {
        position: 'absolute',
        bottom: SIZES.large,
        right: SIZES.large,
        left: SIZES.large, // FAB ancho para mayor accesibilidad
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary, // Color principal para el CTA
        paddingVertical: SIZES.medium,
        paddingHorizontal: SIZES.large,
        borderRadius: SIZES.radius,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 10,
    },
    fabText: {
        color: COLORS.white,
        fontSize: SIZES.h3,
        fontWeight: 'bold',
        marginLeft: SIZES.small,
    },
});

export default HomeScreen;