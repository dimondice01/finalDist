// src/screens/driver.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// --- SDK NATIVO (v9 Modular) ---
import { Timestamp } from '@react-native-firebase/firestore';

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { DriverScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Servicios ---
import { Route as DataContextRoute, useData } from '../../context/DataContext';
import { auth } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- INTERFACES ---
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

// --- HELPERS ---
const formatCurrency = (value?: number): string => (
    typeof value === 'number'
        ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0,00'
);

const formatDate = (date: Date | null): string => {
    if (!date || isNaN(date.getTime()) || date.getFullYear() < 1971) return 'Fecha N/A';
    try {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return 'Error Fecha';
    }
};

// --- COMPONENTES UI PREMIUM ---

// Header Moderno y Limpio
const Header = memo(({ title, onRefresh, isLoading, onLogout }: { title: string, onRefresh: () => void, isLoading: boolean, onLogout: () => void }) => (
    <View style={styles.header}>
        <TouchableOpacity onPress={onRefresh} style={styles.iconButton} disabled={isLoading} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            {isLoading
                ? <ActivityIndicator color={COLORS.primary} size="small" /> 
                : <Feather name="refresh-cw" size={22} color={COLORS.primary} />}
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>{title}</Text>
        
        <TouchableOpacity onPress={onLogout} style={styles.iconButton} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Feather name="log-out" size={22} color={COLORS.danger} /> 
        </TouchableOpacity>
    </View>
));

// Item de Ruta (Estilo Tarjeta iOS)
const RouteItem = memo(({ route, onPress }: { route: DriverRoute, onPress: (route: DriverRoute) => void }) => {
    const totalPendiente = useMemo(() => route.facturas.filter(f => f.estadoVisita === 'Pendiente' || f.estadoVisita === 'Pendiente de Entrega').length, [route.facturas]);
    const totalAmount = useMemo(() => route.facturas.reduce((sum, f) => sum + f.totalVenta, 0), [route.facturas]);

    const isFinalizada = route.estado === 'Completada' || route.estado === 'Archivada';
    const isEnCurso = route.estado === 'En Curso';

    return (
        <TouchableOpacity
            style={[
                styles.routeCard, 
                isFinalizada && styles.routeCardFinalized,
            ]}
            onPress={() => onPress(route)}
            activeOpacity={0.7} 
            disabled={route.estado === 'Archivada'}
        >
            {/* Encabezado Tarjeta */}
            <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                    <View style={[styles.iconContainer, isEnCurso ? styles.iconContainerActive : styles.iconContainerDefault]}>
                        <Feather name={isFinalizada ? "check" : "truck"} size={20} color={isEnCurso ? COLORS.white : (isFinalizada ? COLORS.success : COLORS.textSecondary)} />
                    </View>
                    <View>
                        <Text style={styles.routeName}>{route.nombre || 'Ruta Sin Nombre'}</Text>
                        <Text style={styles.routeDate}>{formatDate(route.fecha)}</Text>
                    </View>
                </View>
                {isEnCurso && (
                    <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>ACTIVA</Text>
                    </View>
                )}
            </View>

            {/* Detalles */}
            <View style={styles.cardBody}>
                <View style={styles.statRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Facturas</Text>
                        <Text style={styles.statValue}>{route.facturas.length}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Total</Text>
                        <Text style={styles.statValue}>{formatCurrency(totalAmount)}</Text>
                    </View>
                </View>

                {totalPendiente > 0 && (
                    <View style={styles.alertBox}>
                        <Feather name="alert-circle" size={14} color="#B45309" />
                        <Text style={styles.alertText}>
                            {totalPendiente} entregas pendientes
                        </Text>
                    </View>
                )}
            </View>
            
            {!isFinalizada && (
                <View style={styles.cardFooter}>
                    <Text style={styles.footerText}>Ver detalles</Text>
                    <Feather name="chevron-right" size={16} color={COLORS.primary} />
                </View>
            )}
        </TouchableOpacity>
    );
});


// --- PANTALLA PRINCIPAL ---
const DriverScreen = ({ navigation }: DriverScreenProps) => {
    const { routes: dataContextRoutes, isLoading: isDataLoading, syncData } = useData();
    const [isLoadingLocal, setIsLoadingLocal] = useState(false); 
    const [selectedTab, setSelectedTab] = useState<'En Curso' | 'Finalizadas'>('En Curso');

    const handleLogout = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            "Cerrar Sesión",
            "¿Estás seguro de que quieres cerrar sesión?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Cerrar",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await auth.signOut();
                            Toast.show({ type: 'info', text1: 'Sesión cerrada' });
                        } catch (error) {
                            console.error("Error logout:", error);
                        }
                    }
                }
            ]
        );
    };

    const filteredRoutes: DriverRoute[] = useMemo(() => {
        const mappedRoutes = (dataContextRoutes || []).map((r: DataContextRoute): DriverRoute => {
            let routeDate: Date | null = null;
            const sourceDate = r.fecha; 

            // Lógica robusta de fechas (Timestamp, Date, Object, String)
            if (sourceDate) {
                if (sourceDate instanceof Timestamp) { 
                    routeDate = sourceDate.toDate();
                } else if (sourceDate instanceof Date) { 
                    if (!isNaN(sourceDate.getTime())) routeDate = sourceDate;
                } else if (typeof sourceDate === 'object' && (sourceDate as any).seconds) {
                    routeDate = new Date((sourceDate as any).seconds * 1000);
                } else if (typeof sourceDate === 'string') {
                    const parsed = new Date(sourceDate);
                    if (!isNaN(parsed.getTime())) routeDate = parsed;
                }
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
                    nombre: i.nombre || 'Producto',
                    quantity: i.quantity || i.cantidad || 0,
                    precio: i.precio || 0,
                }))
            }));

            return {
                id: r.id,
                nombre: r.id || `Ruta ${r.id.substring(0, 6)}`,
                fecha: routeDate,
                estado: r.estado || 'Creada',
                facturas: facturas
            };
        });

        const filtered = mappedRoutes.filter(route => {
            if (selectedTab === 'En Curso') {
                return ['Creada', 'En Curso'].includes(route.estado);
            } else {
                return ['Completada', 'Archivada'].includes(route.estado);
            }
        });

        return filtered.sort((a, b) => {
             if (selectedTab === 'En Curso') {
                 // Priorizar "En Curso" sobre "Creada"
                 if (a.estado === 'En Curso' && b.estado !== 'En Curso') return -1;
                 if (a.estado !== 'En Curso' && b.estado === 'En Curso') return 1;
             }
            const dateA = a.fecha?.getTime() || 0;
            const dateB = b.fecha?.getTime() || 0;
            return dateB - dateA; // Más recientes primero
        });

    }, [dataContextRoutes, selectedTab]);

    const handleRefresh = useCallback(async () => {
        setIsLoadingLocal(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await syncData();
            Toast.show({ type: 'success', text1: 'Rutas Actualizadas' });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error de conexión' });
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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
            
            {/* Header */}
            <Header 
                title="Mis Rutas" 
                onRefresh={handleRefresh} 
                isLoading={isLoadingLocal || isDataLoading}
                onLogout={handleLogout} 
            />

            {/* Segmented Control (Tabs Estilo iOS) */}
            <View style={styles.segmentedControlWrapper}>
                <View style={styles.segmentedControl}>
                    <TouchableOpacity
                        style={[styles.segmentBtn, selectedTab === 'En Curso' && styles.segmentBtnActive]}
                        onPress={() => { 
                            Haptics.selectionAsync();
                            setSelectedTab('En Curso');
                        }}
                    >
                        <Text style={[styles.segmentText, selectedTab === 'En Curso' && styles.segmentTextActive]}>En Curso</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.segmentBtn, selectedTab === 'Finalizadas' && styles.segmentBtnActive]}
                        onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedTab('Finalizadas');
                        }}
                    >
                        <Text style={[styles.segmentText, selectedTab === 'Finalizadas' && styles.segmentTextActive]}>Finalizadas</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isDataLoading && filteredRoutes.length === 0 ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Sincronizando rutas...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredRoutes} 
                    renderItem={renderRouteItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={ 
                        <View style={styles.emptyState}>
                            <Feather name={selectedTab === 'En Curso' ? "truck" : "check-circle"} size={48} color="#CBD5E1" />
                            <Text style={styles.emptyTitle}>
                                {selectedTab === 'En Curso' ? 'Sin rutas activas' : 'Sin historial'}
                            </Text>
                            <Text style={styles.emptySub}>
                                {selectedTab === 'En Curso' 
                                    ? 'No tienes rutas asignadas por el momento.' 
                                    : 'Aquí verás tus rutas completadas.'}
                            </Text>
                            <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={isLoadingLocal}>
                                <Text style={styles.refreshBtnText}>Recargar</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' }, // Fondo gris muy claro (iOS standard)

    // --- Header ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#F9FAFB',
    },
    headerTitle: { 
        fontSize: 20, 
        fontWeight: '800', 
        color: '#1E293B', 
        letterSpacing: 0.5 
    },
    iconButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4,
        elevation: 2,
    },

    // --- Tabs (Segmented Control) ---
    segmentedControlWrapper: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: '#E2E8F0',
        borderRadius: 14,
        padding: 4,
        height: 44,
    },
    segmentBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
    },
    segmentBtnActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
    },
    segmentText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    segmentTextActive: {
        color: '#1E293B',
        fontWeight: '700',
    },

    // --- Lista ---
    listContainer: { paddingHorizontal: 20, paddingBottom: 30 },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, color: '#64748B', fontSize: 14, fontWeight: '500' },

    // --- Tarjeta de Ruta (Premium) ---
    routeCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10,
        elevation: 3,
        borderWidth: 1, borderColor: '#F1F5F9',
        overflow: 'hidden',
    },
    routeCardFinalized: { opacity: 0.7, backgroundColor: '#F8FAFC' },
    
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    
    iconContainer: {
        width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    },
    iconContainerActive: { backgroundColor: COLORS.primary },
    iconContainerDefault: { backgroundColor: '#F1F5F9' },

    routeName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
    routeDate: { fontSize: 12, color: '#64748B', marginTop: 2 },

    activeBadge: {
        backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    },
    activeBadgeText: { color: '#166534', fontSize: 10, fontWeight: '800' },

    cardBody: { padding: 16 },
    statRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
    statItem: { alignItems: 'center' },
    statDivider: { width: 1, backgroundColor: '#F1F5F9', height: '80%' },
    statLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase' },
    statValue: { fontSize: 16, fontWeight: '800', color: '#334155', marginTop: 2 },

    alertBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10,
        marginTop: 4,
    },
    alertText: { color: '#B45309', fontSize: 13, fontWeight: '600' },

    cardFooter: {
        backgroundColor: '#F8FAFC', padding: 12,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
    },
    footerText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

    // --- Empty State ---
    emptyState: { alignItems: 'center', marginTop: 60, padding: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginTop: 16 },
    emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 6, marginBottom: 24 },
    refreshBtn: {
        backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30,
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    },
    refreshBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});

export default DriverScreen;