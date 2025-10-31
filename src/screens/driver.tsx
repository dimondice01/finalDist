// src/screens/driver.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
// --- INICIO CAMBIO LOGOUT: Importar Auth de Firebase ---
import { getAuth, signOut } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
// --- FIN CAMBIO LOGOUT ---
import React, { memo, useCallback, useMemo, useState } from 'react';
// --- INICIO CAMBIO LOGOUT: Importar Alert ---
import { ActivityIndicator, Alert, FlatList, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// --- FIN CAMBIO LOGOUT ---
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { DriverScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Route as DataContextRoute, useData } from '../../context/DataContext';
import { COLORS } from '../../styles/theme';

// --- INTERFACES (Definidas correctamente) ---
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
    // --- CAMBIO LÓGICA ARCHIVADA: Aseguramos que el tipo incluya 'Archivada' ---
    estado: 'Creada' | 'En Curso' | 'Completada' | 'Archivada';
    facturas: DriverInvoice[];
}

// --- Helper Functions ---
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

// --- Componente Header (Memoizado y con Logout) ---
const Header = memo(({ title, onRefresh, isLoading, onLogout }: { title: string, onRefresh: () => void, isLoading: boolean, onLogout: () => void }) => (
    <View style={styles.header}>
        {/* --- INICIO CAMBIO LOGOUT: Placeholder por Botón --- */}
        <TouchableOpacity onPress={onLogout} style={styles.headerButton}>
            {/* Usamos el color 'danger' o 'warning' si existe, si no 'textSecondary' */}
            <Feather name="log-out" size={22} color={COLORS.danger || COLORS.warning || COLORS.textSecondary} /> 
        </TouchableOpacity>
        {/* --- FIN CAMBIO LOGOUT --- */}
        
        <Text style={styles.title}>{title}</Text>
        
        <TouchableOpacity onPress={onRefresh} style={styles.headerButton} disabled={isLoading}>
            {isLoading
                ? <ActivityIndicator color={COLORS.primary} size="small" />
                : <Feather name="refresh-cw" size={22} color={COLORS.primary} />}
        </TouchableOpacity>
    </View>
));

// --- Componente RouteItem (Estilos Modernizados) ---
const RouteItem = memo(({ route, onPress }: { route: DriverRoute, onPress: (route: DriverRoute) => void }) => {
    // Usamos 'Pendiente' y 'Pendiente de Entrega' como pendientes
    const totalPendiente = useMemo(() => route.facturas.filter(f => f.estadoVisita === 'Pendiente' || f.estadoVisita === 'Pendiente de Entrega').length, [route.facturas]);
    const totalAmount = useMemo(() => route.facturas.reduce((sum, f) => sum + f.totalVenta, 0), [route.facturas]);

    // --- INICIO CAMBIOS LÓGICA ARCHIVADA ---
    const isCompleted = route.estado === 'Completada';
    const isArchived = route.estado === 'Archivada';
    const isFinalizada = isCompleted || isArchived;
    // --- FIN CAMBIOS LÓGICA ARCHIVADA ---

    return (
        <TouchableOpacity
            style={[
                styles.routeCard, 
                isCompleted && styles.routeCardCompleted,
                isArchived && styles.routeCardDisabled // Nuevo estilo para archivadas
            ]}
            onPress={() => onPress(route)}
            activeOpacity={isArchived ? 1.0 : 0.8} // Sin feedback visual si está deshabilitada
            disabled={isArchived} // ¡BLOQUEA EL CLIC!
        >
            {/* Header de la Card */}
            <View style={styles.routeCardHeader}>
                <View style={styles.routeCardHeaderLeft}>
                    <Feather name={isFinalizada ? "check-circle" : "truck"} size={20} color={isFinalizada ? COLORS.success : COLORS.primary} />
                    <Text style={styles.routeName}>{route.nombre || `Ruta ${route.id.substring(0, 6)}`}</Text>
                </View>
                <Text style={styles.routeDate}>{formatDate(route.fecha)}</Text>
            </View>

            {/* Detalles (Contenido Principal) */}
            <View style={styles.routeDetails}>
                <View style={styles.detailItem}>
                    <Feather name="file-text" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{route.facturas.length} Facturas</Text>
                </View>
                <View style={styles.detailItem}>
                    <Feather name="dollar-sign" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{formatCurrency(totalAmount)}</Text>
                </View>
                 {!isFinalizada && totalPendiente > 0 && (
                    <View style={[styles.detailItem, styles.detailItemPending]}>
                        <Feather name="alert-circle" size={16} color={COLORS.warning} />
                        <Text style={[styles.detailText, { color: COLORS.warning, fontWeight: 'bold' }]}>{totalPendiente} Pendientes</Text>
                    </View>
                )}
            </View>

            {/* Footer con Flecha (Posicionada absolutamente) */}
            <View style={styles.routeCardFooter}>
                <Feather name="chevron-right" size={24} color={COLORS.textSecondary} />
            </View>
        </TouchableOpacity>
    );
});


// --- Pantalla Principal: DriverScreen ---
const DriverScreen = ({ navigation }: DriverScreenProps) => {

    const { routes: dataContextRoutes, isLoading: isDataLoading, syncData } = useData();
    const [isLoadingLocal, setIsLoadingLocal] = useState(false); // Estado local para refresh
    const [selectedTab, setSelectedTab] = useState<'En Curso' | 'Finalizadas'>('En Curso');

    // --- INICIO CAMBIO LOGOUT: Handler ---
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
                            const auth = getAuth();
                            await signOut(auth);
                            // No necesitamos navegar. El listener de Auth (en App.tsx)
                            // se encargará de mover al usuario al Login.
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

    // Mapeamos y Filtramos las rutas del DataContext
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

    // --- Renderizado Principal ---
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            {/* --- INICIO CAMBIO LOGOUT: Pasar handler al Header --- */}
            <Header 
                title="Mis Rutas" 
                onRefresh={handleRefresh} 
                isLoading={isLoadingLocal || isDataLoading}
                onLogout={handleLogout} // <-- Prop nueva
            />
            {/* --- FIN CAMBIO LOGOUT --- */}

            {/* --- Pestañas (Sin cambios visuales/lógicos) --- */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tabButton, selectedTab === 'En Curso' && styles.activeTab]}
                    onPress={() => setSelectedTab('En Curso')}
                >
                    <Text style={[styles.tabText, selectedTab === 'En Curso' && styles.activeTabText]}>En Curso</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, selectedTab === 'Finalizadas' && styles.activeTab]}
                    onPress={() => setSelectedTab('Finalizadas')}
                >
                    <Text style={[styles.tabText, selectedTab === 'Finalizadas' && styles.activeTabText]}>Finalizadas</Text>
                </TouchableOpacity>
            </View>

            {/* --- Lista o Loader --- */}
            {isDataLoading && filteredRoutes.length === 0 ? (
                // Loader inicial
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Cargando rutas...</Text>
                </View>
            ) : (
                // Lista de rutas
                <FlatList
                    data={filteredRoutes} 
                    renderItem={renderRouteItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContentContainer}
                    ListEmptyComponent={ 
                        <View style={styles.emptyContainer}>
                            <Feather name={selectedTab === 'En Curso' ? "truck" : "check-square"} size={48} color={COLORS.textSecondary} />
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

// --- Estilos (Actualizados para Card Moderna) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, paddingBottom: 15, paddingHorizontal: 10 },
    headerButton: { padding: 10, width: 44, alignItems: 'center' },
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    // --- Pestañas (Estilos sin cambios) ---
    tabContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: COLORS.glass,
        marginHorizontal: 15,
        borderRadius: 15,
        padding: 4,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    tabButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    activeTab: { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
    tabText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
    activeTabText: { color: COLORS.primaryDark, fontWeight: 'bold' },
    // --- Fin Pestañas ---
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 10, color: COLORS.textSecondary },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 20 },
    // --- INICIO ESTILOS CARD MODERNA ---
    routeCard: {
        backgroundColor: COLORS.glass, 
        borderRadius: 15, 
        marginBottom: 15,
        borderWidth: 1, 
        borderColor: COLORS.glassBorder,
        shadowColor: "#000", 
        shadowOffset: { width: 0, height: 3, },
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 4, 
        overflow: 'hidden', 
    },
    routeCardCompleted: { 
        backgroundColor: 'rgba(253, 234, 234, 0.99)', 
        borderColor: 'rgba(80, 80, 80, 0.9)',
    },
    // --- INICIO CAMBIO LOGOUT: Estilo para 'Archivada' (ya existía) ---
    routeCardDisabled: { 
        opacity: 0.6,
        backgroundColor: 'rgba(80, 80, 80, 0.7)', 
        borderColor: 'rgba(80, 80, 80, 0.9)',
    },
    // --- FIN CAMBIO LOGOUT ---
    routeCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18, 
        paddingVertical: 14, 
        borderBottomWidth: 1, 
        borderBottomColor: COLORS.glassBorder,
        backgroundColor: 'rgba(0,0,0,0.1)', 
    },
    routeCardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12, 
    },
    routeName: {
        color: COLORS.textPrimary,
        fontSize: 17,
        fontWeight: 'bold',
    },
    routeDate: {
        color: COLORS.textSecondary,
        fontSize: 13,
        fontWeight: '500',
    },
    routeDetails: {
        paddingHorizontal: 18, 
        paddingTop: 14, 
        paddingBottom: 10, 
        flexDirection: 'row',
        justifyContent: 'flex-start', 
        gap: 20, 
        flexWrap: 'wrap',
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7, 
        paddingVertical: 3,
    },
    detailItemPending: { 
        backgroundColor: 'rgba(255, 193, 7, 0.15)', 
        paddingHorizontal: 10, 
        borderRadius: 8, 
    },
    detailText: {
        color: COLORS.textSecondary,
        fontSize: 14,
        fontWeight: '500',
    },
    routeCardFooter: { 
        position: 'absolute',
        right: 15, 
        top: '55%', 
        transform: [{ translateY: -12 }],
    },
    // --- FIN ESTILOS CARD MODERNA ---
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 15 },
    emptyText: { fontSize: 17, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
    refreshButton: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
    refreshButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
});

export default DriverScreen;