// src/screens/driver.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import { Timestamp } from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { DriverScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Route as DataContextRoute, useData } from '../../context/DataContext';
import { auth } from '../../db/firebase-service';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

// --- INTERFACES (Sin cambios) ---
interface DriverItem {
    productId: string;
    nombre: string;
    quantity: number;
    precio: number;
}
interface DriverInvoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' ;
    items: DriverItem[];
}
interface DriverRoute {
    id: string;
    nombre: string; 
    fecha: Date | null; 
    estado: 'Creada' | 'En Curso' | 'Completada' | 'Archivada';
    facturas: DriverInvoice[];
}

// --- Helper Functions (Sin cambios) ---
const formatCurrency = (value?: number): string => (
    typeof value === 'number'
        ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0,00'
);

const formatDate = (date: Date | null): string => {
    if (!date || isNaN(date.getTime()) || date.getFullYear() < 1971) {
        return 'Fecha N/A';
    }
    try {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Meses son 0-indexados
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        console.error("Error formateando fecha:", date, e);
        return 'Error Fecha';
    }
};

// --- Componente Header (REDISENADO) ---
const Header = memo(({ title, onRefresh, isLoading, onLogout }: { title: string, onRefresh: () => void, isLoading: boolean, onLogout: () => void }) => (
    <View style={styles.header}>
        {/* 1. REFRESH BUTTON (IZQUIERDA) - Aumentado el tamaño del área de toque */}
        <TouchableOpacity onPress={onRefresh} style={styles.actionButtonLarge} disabled={isLoading}>
            {isLoading
                ? <ActivityIndicator color={COLORS.primary} size={SIZES.h3} /> 
                : <Feather name="refresh-cw" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
        
        {/* 2. TITLE (CENTRO) */}
        <Text style={styles.title}>{title.toUpperCase()}</Text>
        
        {/* 3. LOGOUT BUTTON (DERECHA) - Aumentado el tamaño del área de toque */}
        <TouchableOpacity onPress={onLogout} style={styles.actionButtonLarge}>
            <Feather name="log-out" size={SIZES.h3} color={COLORS.danger} /> 
        </TouchableOpacity>
    </View>
));

// --- Componente RouteItem (Estilizado y Mejorado) ---
const RouteItem = memo(({ route, onPress }: { route: DriverRoute, onPress: (route: DriverRoute) => void }) => {
    const totalPendiente = useMemo(() => route.facturas.filter(f => f.estadoVisita === 'Pendiente' || f.estadoVisita === 'Pendiente de Entrega').length, [route.facturas]);
    const totalAmount = useMemo(() => route.facturas.reduce((sum, f) => sum + f.totalVenta, 0), [route.facturas]);

    const isCompleted = route.estado === 'Completada';
    const isArchived = route.estado === 'Archivada';
    const isFinalizada = isCompleted || isArchived;

    // Colores de estado basados en el tema
    const statusColor = isFinalizada ? COLORS.success : COLORS.primary;

    return (
        <TouchableOpacity
            style={[
                styles.routeCard, 
                isFinalizada && styles.routeCardFinalized, // Estilo para finalizadas
                isArchived && styles.routeCardDisabled 
            ]}
            onPress={() => onPress(route)}
            activeOpacity={isArchived ? 1.0 : 0.8} 
            disabled={isArchived} 
        >
            {/* Header de la Card */}
            <View style={styles.routeCardHeader}>
                <View style={styles.routeCardHeaderLeft}>
                    <Feather name={isFinalizada ? "check-circle" : "truck"} size={SIZES.h3} color={statusColor} />
                    <Text style={styles.routeName}>{route.nombre || `Ruta ${route.id.substring(0, 6)}`}</Text>
                </View>
                <Text style={styles.routeDate}>{formatDate(route.fecha)}</Text>
            </View>

            {/* Detalles (Contenido Principal) */}
            <View style={styles.routeDetails}>
                <View style={styles.detailItem}>
                    <Feather name="file-text" size={SIZES.body} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}><Text style={{fontWeight: 'bold'}}>{route.facturas.length}</Text> Facturas</Text>
                </View>
                <View style={styles.detailItem}>
                    <Feather name="dollar-sign" size={SIZES.body} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>Total: <Text style={{fontWeight: 'bold'}}>{formatCurrency(totalAmount)}</Text></Text>
                </View>
                <View style={styles.detailItem}>
                    <Feather name="map-pin" size={SIZES.body} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{route.facturas.length} Destinos</Text>
                </View>

                {totalPendiente > 0 && (
                    <View style={[styles.detailItem, styles.detailItemPending]}>
                        <Feather name="alert-circle" size={SIZES.body} color={COLORS.warning} />
                        <Text style={[styles.detailText, { color: COLORS.warning, fontWeight: 'bold' }]}>
                            {totalPendiente} Pendientes de Visita
                        </Text>
                    </View>
                )}
            </View>

            {/* Footer con Flecha de Acción */}
            <View style={styles.routeCardFooter}>
                <Feather name="chevron-right" size={SIZES.h3} color={COLORS.textSecondary} />
            </View>
        </TouchableOpacity>
    );
});


// --- Pantalla Principal: DriverScreen ---
const DriverScreen = ({ navigation }: DriverScreenProps) => {

    const { routes: dataContextRoutes, isLoading: isDataLoading, syncData } = useData();
    const [isLoadingLocal, setIsLoadingLocal] = useState(false); 
    const [selectedTab, setSelectedTab] = useState<'En Curso' | 'Finalizadas'>('En Curso');

    // --- handleLogout (Sin cambios) ---
    const handleLogout = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            "Cerrar Sesión",
            "¿Estás seguro de que quieres cerrar sesión?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Cerrar Sesión",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await auth.signOut();
                            
                            Toast.show({ type: 'info', text1: 'Sesión cerrada', position: 'bottom' });
                        } catch (error) {
                            console.error("Error al cerrar sesión:", error);
                            Toast.show({ type: 'error', text1: 'Error al cerrar sesión', position: 'bottom' });
                        }
                    }
                }
            ]
        );
    };
    // --- FIN CAMBIO LOGOUT ---

    // Mapeamos y Filtramos las rutas (CORREGIDO v9)
    const filteredRoutes: DriverRoute[] = useMemo(() => {

        const mappedRoutes = (dataContextRoutes || []).map((r: DataContextRoute): DriverRoute => {
            let routeDate: Date | null = null;
            const sourceDate = r.fecha; 

            if (sourceDate) {
                if (sourceDate instanceof Timestamp) { 
                    routeDate = sourceDate.toDate();
                } else if (sourceDate instanceof Date) { 
                    if (!isNaN(sourceDate.getTime())) { 
                        routeDate = sourceDate;
                    } else {
                        console.warn(`[MAPEO ${r.id}] Fecha inválida (Date object from context):`, sourceDate);
                    }
                } else if (typeof sourceDate === 'object' && (sourceDate as any).seconds !== undefined && typeof (sourceDate as any).seconds === 'number') {
                    try {
                        if ((sourceDate as any).seconds > 0) {
                            routeDate = new Timestamp((sourceDate as any).seconds, (sourceDate as any).nanoseconds || 0).toDate();
                        } else {
                            console.warn(`[MAPEO ${r.id}] Timestamp con seconds <= 0 encontrado:`, sourceDate);
                        }
                    } catch (e) { console.warn(`[MAPEO ${r.id}] Error convirtiendo objeto a Timestamp:`, sourceDate, e); }
                } else if (typeof sourceDate === 'string') {
                    const parsedDate = new Date(sourceDate);
                    if (!isNaN(parsedDate.getTime())) {
                        routeDate = parsedDate;
                    } else {
                        console.warn(`[MAPEO ${r.id}] Fecha inválida (string from context):`, sourceDate);
                    }
                } else {
                    console.warn(`[MAPEO ${r.id}] Tipo de fecha no reconocido en context:`, sourceDate);
                }
            } else {
                // console.log(`[MAPEO ${r.id}] Fecha es null o undefined.`);
            }
            if (routeDate && (isNaN(routeDate.getTime()) || routeDate.getFullYear() < 1971)) {
                routeDate = null;
            }

            const facturas = (r.facturas || []).map((f: any): DriverInvoice => ({
                id: f.id || f.saleId || '',
                clienteId: f.clienteId || '',
                clienteNombre: f.clienteNombre || f.clientName || 'Cliente Anónimo',
                clienteDireccion: f.clienteDireccion || f.direccion || 'Dirección no disponible',
                totalVenta: f.totalVenta || f.totalAmount || 0,
                estadoVisita: f.estadoVisita || f.estado || 'Pendiente',
                items: (f.items || []).map((i: any): DriverItem => ({
                    productId: i.id || i.productId || '',
                    nombre: i.nombre || 'Producto Anónimo',
                    quantity: i.quantity || i.cantidad || 0,
                    precio: i.precio || 0,
                }))
            }));

            return {
                id: r.id,
                nombre: `Ruta ${r.id.substring(0, 6)}`,
                fecha: routeDate,
                estado: r.estado || 'Creada',
                facturas: facturas
            };
        });

        const filtered = mappedRoutes.filter(route => {
            if (selectedTab === 'En Curso') {
                const estadosEnCurso = ['Creada', 'En Curso'];
                return estadosEnCurso.includes(route.estado);
            } else {
                const estadosFinalizados = ['Completada', 'Archivada'];
                return estadosFinalizados.includes(route.estado);
            }
        });

        return filtered.sort((a, b) => {
             if (selectedTab === 'En Curso') {
                 if (a.estado === 'En Curso' && b.estado !== 'En Curso') return -1;
                 if (a.estado !== 'En Curso' && b.estado === 'En Curso') return 1;
             }
            const dateA = a.fecha?.getTime() || 0;
            const dateB = b.fecha?.getTime() || 0;
            return dateB - dateA;
        });

    }, [dataContextRoutes, selectedTab]);

    // --- Callbacks (Sin cambios) ---
    const handleRefresh = useCallback(async () => {
        setIsLoadingLocal(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await syncData();
            Toast.show({ type: 'success', text1: 'Rutas Actualizadas', position: 'bottom' });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error al actualizar', position: 'bottom' });
            console.error("Error refreshing driver data:", error);
        } finally {
            setIsLoadingLocal(false);
        }
    }, [syncData]);

    const handleSelectRoute = (route: DriverRoute) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate('RouteDetail', { routeId: route.id });
    };

    const renderRouteItem = useCallback(({ item }: { item: DriverRoute }) => (
        <RouteItem route={item} onPress={handleSelectRoute} />
    ), [handleSelectRoute]);

    // --- Renderizado Principal (Estilizado) ---
    return (
        <SafeAreaView style={styles.container}>
            {/* Usamos dark-content en el fondo claro */}
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} /> 
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />

            <Header 
                title="Mis Rutas" 
                onRefresh={handleRefresh} 
                isLoading={isLoadingLocal || isDataLoading}
                onLogout={handleLogout} 
            />

            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tabButton, selectedTab === 'En Curso' && styles.activeTab]}
                    onPress={() => setSelectedTab('En Curso')}
                >
                    <Text style={[styles.tabText, selectedTab === 'En Curso' && styles.activeTabText]}>EN CURSO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, selectedTab === 'Finalizadas' && styles.activeTab]}
                    onPress={() => setSelectedTab('Finalizadas')}
                >
                    <Text style={[styles.tabText, selectedTab === 'Finalizadas' && styles.activeTabText]}>FINALIZADAS</Text>
                </TouchableOpacity>
            </View>

            {isDataLoading && filteredRoutes.length === 0 ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Cargando rutas...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredRoutes} 
                    renderItem={renderRouteItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContentContainer}
                    ListEmptyComponent={ 
                        <View style={styles.emptyContainer}>
                            <Feather name={selectedTab === 'En Curso' ? "truck" : "check-square"} size={SIZES.h1} color={COLORS.textSecondary} />
                            <Text style={styles.emptyText}>
                                {selectedTab === 'En Curso' ? 'No tienes rutas pendientes.' : 'No hay rutas finalizadas.'}
                            </Text>
                            <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={isLoadingLocal}>
                                <Text style={styles.refreshButtonText}>Volver a Cargar</Text>
                            </TouchableOpacity>
                        </View>
                    }
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                    windowSize={11}
                />
            )}
        </SafeAreaView>
    );
};

// --- Estilos (Ajustados al sistema de diseño) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    // --- HEADER ESTANDARIZADO (AJUSTE VISUAL) ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : SIZES.medium,
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.large, // Aumentamos padding horizontal para centrar mejor
        backgroundColor: COLORS.backgroundEnd,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
    },
    actionButtonLarge: { 
        padding: SIZES.small,
        width: SIZES.xxl, // 40px de ancho
        height: SIZES.xxl, // 40px de alto
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    // --- TABS ---
    tabContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: COLORS.backgroundEnd, 
        marginHorizontal: SIZES.large,
        borderRadius: SIZES.radius,
        padding: SIZES.xsmall,
        marginBottom: SIZES.medium,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    tabButton: { flex: 1, paddingVertical: SIZES.small, borderRadius: SIZES.radiusSmall, alignItems: 'center' },
    activeTab: { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
    tabText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: SIZES.body },
    activeTabText: { color: COLORS.white, fontWeight: 'bold' },
    // --- LOADER & EMPTY ---
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: SIZES.small, color: COLORS.textSecondary, fontSize: SIZES.body },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SIZES.xl, gap: SIZES.medium },
    emptyText: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.small },
    refreshButton: { backgroundColor: COLORS.primary, paddingVertical: SIZES.small, paddingHorizontal: SIZES.large, borderRadius: SIZES.radius },
    refreshButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body },
    // --- LISTA ---
    listContentContainer: { paddingHorizontal: SIZES.large, paddingBottom: SIZES.large },
    // --- ROUTE CARD ---
    routeCard: {
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        marginBottom: SIZES.medium,
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.textPrimary, 
        shadowOffset: { width: 0, height: 2, },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 4, 
        paddingBottom: SIZES.medium, 
    },
    routeCardFinalized: { opacity: 0.8, backgroundColor: COLORS.backgroundEnd }, 
    routeCardDisabled: { opacity: 0.5 },
    routeCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SIZES.medium, 
        paddingVertical: SIZES.medium, 
        borderBottomWidth: SIZES.borderWidth, 
        borderBottomColor: COLORS.glassBorder,
        backgroundColor: COLORS.backgroundStart, 
        borderTopLeftRadius: SIZES.radius,
        borderTopRightRadius: SIZES.radius,
    },
    routeName: {
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
        fontWeight: 'bold',
    },
    routeDate: {
        color: COLORS.textSecondary,
        fontSize: SIZES.caption,
        fontWeight: '500',
    },
    routeCardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.small, 
    },
    routeDetails: {
        paddingHorizontal: SIZES.medium, 
        paddingTop: SIZES.medium, 
        flexDirection: 'row',
        justifyContent: 'space-between', 
        flexWrap: 'wrap',
        gap: SIZES.medium,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.xsmall, 
        paddingVertical: SIZES.xsmall,
        width: '45%', 
    },
    detailItemPending: { 
        backgroundColor: COLORS.warning + '15', 
        paddingHorizontal: SIZES.small, 
        borderRadius: SIZES.radiusSmall, 
    },
    detailText: {
        color: COLORS.textSecondary,
        fontSize: SIZES.caption,
        fontWeight: '500',
    },
    routeCardFooter: { 
        position: 'absolute',
        right: SIZES.medium, 
        top: '50%', 
        transform: [{ translateY: -SIZES.h3 / 2 }],
        padding: SIZES.small,
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius,
    },
});

export default DriverScreen;