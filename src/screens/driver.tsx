// src/screens/driver.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
// --- INICIO CORRECCIÓN FECHA: Importar Timestamp ---
import { Timestamp } from 'firebase/firestore'; // Asegúrate de importar Timestamp
// --- FIN CORRECCIÓN FECHA ---
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { DriverScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
// Renombramos Route de DataContext para evitar colisión
// Usamos directamente la interfaz Route importada ya que DataContext la exporta
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
    // Ajustamos los estados posibles si son diferentes en DataContext
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' ; // Ampliamos con los estados de Sale
    items: DriverItem[];
}
interface DriverRoute {
    id: string;
    nombre: string; // Nombre para mostrar
    fecha: Date | null; // <-- Mantenemos Date | null
    estado: 'Creada' | 'En Curso' | 'Completada';
    facturas: DriverInvoice[];
}

// --- Helper Functions ---
const formatCurrency = (value?: number): string => (
    typeof value === 'number'
        ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0,00'
);

// --- INICIO CORRECCIÓN FECHA: Función formatDate ---
const formatDate = (date: Date | null): string => {
    // Verifica si la fecha es válida
    // Chequeamos null, undefined, isNaN y año > 0 (evita 1969/1970)
    if (!date || isNaN(date.getTime()) || date.getFullYear() < 1971) {
        // Devuelve un placeholder más claro si la fecha es inválida/ausente
        return 'Fecha N/A';
    }
    // Formato DD/MM/AAAA (Argentina)
    try {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Meses son 0-indexados
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        // Fallback por si acaso
        console.error("Error formateando fecha:", date, e);
        return 'Error Fecha';
    }
};
// --- FIN CORRECCIÓN FECHA ---

// --- Componente Header (Memoizado y sin cambios) ---
const Header = memo(({ title, onRefresh, isLoading }: { title: string, onRefresh: () => void, isLoading: boolean }) => (
    <View style={styles.header}>
        <View style={styles.headerButton} /> {/* Placeholder para centrar título */}
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
    const isCompleted = route.estado === 'Completada';

    return (
        <TouchableOpacity
            style={[styles.routeCard, isCompleted && styles.routeCardCompleted]} // Estilo diferente si está completada
            onPress={() => onPress(route)}
            activeOpacity={0.8} // Efecto visual al tocar
        >
            {/* Header de la Card */}
            <View style={styles.routeCardHeader}>
                <View style={styles.routeCardHeaderLeft}>
                    {/* Icono cambia si está completada */}
                    <Feather name={isCompleted ? "check-circle" : "truck"} size={20} color={isCompleted ? COLORS.success : COLORS.primary} />
                    <Text style={styles.routeName}>{route.nombre || `Ruta ${route.id.substring(0, 6)}`}</Text>
                </View>
                {/* Fecha ahora usa formatDate corregido */}
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
                 {/* Mostramos pendientes solo si no está completada */}
                 {!isCompleted && totalPendiente > 0 && (
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

    // Mapeamos y Filtramos las rutas del DataContext
    const filteredRoutes: DriverRoute[] = useMemo(() => {
        // Log para ver qué llega del DataContext
        // console.log("DataContext Routes:", JSON.stringify(dataContextRoutes, null, 2));

        const mappedRoutes = (dataContextRoutes || []).map((r: DataContextRoute): DriverRoute => {
            // --- INICIO CORRECCIÓN FECHA: Conversión robusta ---
            let routeDate: Date | null = null;
            const sourceDate = r.fecha; // Usamos variable temporal

            if (sourceDate) {
                if (sourceDate instanceof Timestamp) { // Si es Timestamp de Firestore
                    routeDate = sourceDate.toDate();
                    // console.log(`[MAPEO ${r.id}] Timestamp -> Date:`, routeDate);
                } else if (sourceDate instanceof Date) { // Si ya es Date (cargado de AsyncStorage o directo)
                    if (!isNaN(sourceDate.getTime())) { // Verificar si es válido
                       routeDate = sourceDate;
                       // console.log(`[MAPEO ${r.id}] Date object -> Date:`, routeDate);
                    } else {
                       console.warn(`[MAPEO ${r.id}] Fecha inválida (Date object from context):`, sourceDate);
                    }
                } else if (typeof sourceDate === 'object' && (sourceDate as any).seconds !== undefined && typeof (sourceDate as any).seconds === 'number') {
                    // Intenta convertir desde objeto {seconds, nanoseconds} (Común desde JSON)
                    try {
                        // Verificamos que 'seconds' sea un número razonable (mayor a 0, evita 1969)
                        if ((sourceDate as any).seconds > 0) {
                            routeDate = new Timestamp((sourceDate as any).seconds, (sourceDate as any).nanoseconds || 0).toDate();
                            // console.log(`[MAPEO ${r.id}] Object {seconds...} -> Date:`, routeDate);
                        } else {
                             console.warn(`[MAPEO ${r.id}] Timestamp con seconds <= 0 encontrado:`, sourceDate);
                        }
                    } catch (e) { console.warn(`[MAPEO ${r.id}] Error convirtiendo objeto a Timestamp:`, sourceDate, e); }
                } else if (typeof sourceDate === 'string') {
                     // Intenta convertir desde string ISO (Común desde JSON)
                     const parsedDate = new Date(sourceDate);
                     if (!isNaN(parsedDate.getTime())) {
                         routeDate = parsedDate;
                         // console.log(`[MAPEO ${r.id}] String -> Date:`, routeDate);
                     } else {
                         console.warn(`[MAPEO ${r.id}] Fecha inválida (string from context):`, sourceDate);
                     }
                } else {
                     console.warn(`[MAPEO ${r.id}] Tipo de fecha no reconocido en context:`, sourceDate);
                }
            } else {
                // console.log(`[MAPEO ${r.id}] Fecha es null o undefined.`);
            }
            // Última validación: si la conversión resultó en fecha inválida o muy antigua, la ponemos null
            if (routeDate && (isNaN(routeDate.getTime()) || routeDate.getFullYear() < 1971)) {
                 // console.warn(`[MAPEO ${r.id}] Fecha parseada es inválida o < 1971, seteando a null:`, routeDate);
                 routeDate = null;
            }
            // --- FIN CORRECCIÓN FECHA ---

            // Mapeo de facturas (sin cambios)
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
                nombre: `Ruta ${r.id.substring(0, 6)}`, // O el nombre real si lo tienes
                fecha: routeDate, // <-- Fecha Corregida
                estado: r.estado || 'Creada',
                facturas: facturas
            };
        });

        // Filtramos según la pestaña seleccionada
        const filtered = mappedRoutes.filter(route => {
            if (selectedTab === 'En Curso') {
                // Rutas 'Creada' o 'En Curso' van aquí
                return route.estado !== 'Completada';
            } else {
                // Rutas 'Completada' van aquí
                return route.estado === 'Completada';
            }
        });

        // Ordenamos: 'En Curso' primero, luego 'Creada', y por fecha descendente
        return filtered.sort((a, b) => {
             // Prioridad por estado si estamos en "En Curso"
             if (selectedTab === 'En Curso') {
                 if (a.estado === 'En Curso' && b.estado !== 'En Curso') return -1;
                 if (a.estado !== 'En Curso' && b.estado === 'En Curso') return 1;
             }
             // Luego por fecha (más reciente primero, las inválidas/null al final)
            const dateA = a.fecha?.getTime() || 0; // Fechas inválidas/null van al final
            const dateB = b.fecha?.getTime() || 0;
            return dateB - dateA;
        });

    }, [dataContextRoutes, selectedTab]); // Depende de las rutas y la pestaña

    // --- Funciones handleRefresh y handleSelectRoute (Sin cambios lógicos) ---
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

    // --- Función renderRouteItem (Usa el componente RouteItem actualizado) ---
    const renderRouteItem = useCallback(({ item }: { item: DriverRoute }) => (
        <RouteItem route={item} onPress={handleSelectRoute} />
    ), [handleSelectRoute]); // Solo depende de la función de navegación

    // --- Renderizado Principal ---
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            <Header title="Mis Rutas" onRefresh={handleRefresh} isLoading={isLoadingLocal || isDataLoading} />

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
                    data={filteredRoutes} // Usa las rutas filtradas y ordenadas
                    renderItem={renderRouteItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContentContainer}
                    ListEmptyComponent={ // Mensaje si no hay rutas en la pestaña actual
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
                    // Optimizaciones de FlatList (sin cambios)
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
        backgroundColor: COLORS.glass, // Fondo glassmorphism
        borderRadius: 15, // Bordes más redondeados
        marginBottom: 15,
        borderWidth: 1, // Borde sutil
        borderColor: COLORS.glassBorder,
        shadowColor: "#000", // Sombra iOS
        shadowOffset: { width: 0, height: 3, },
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 4, // Sombra Android
        overflow: 'hidden', // Para asegurar bordes redondeados
    },
    routeCardCompleted: { // Estilo tenue para completadas
        backgroundColor: 'rgba(40, 40, 40, 0.6)', // Más oscuro y translúcido
        borderColor: 'rgba(80, 80, 80, 0.9)',
    },
    routeCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18, // Más padding horizontal
        paddingVertical: 14, // Más padding vertical
        borderBottomWidth: 1, // Separador sutil
        borderBottomColor: COLORS.glassBorder,
        backgroundColor: 'rgba(0,0,0,0.1)', // Fondo ligeramente diferente
    },
    routeCardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12, // Mayor espacio icono-texto
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
        paddingHorizontal: 18, // Consistente con header
        paddingTop: 14, // Padding superior
        paddingBottom: 10, // Menos padding inferior antes de la flecha
        flexDirection: 'row',
        justifyContent: 'flex-start', // Alinear a la izquierda
        gap: 20, // Mayor espacio entre items
        flexWrap: 'wrap',
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7, // Espacio icono-texto
        paddingVertical: 3,
    },
    detailItemPending: { // Estilo para pendientes
        backgroundColor: 'rgba(255, 193, 7, 0.15)', // Amarillo más visible
        paddingHorizontal: 10, // Padding horizontal
        borderRadius: 8, // Bordes redondeados
    },
    detailText: {
        color: COLORS.textSecondary,
        fontSize: 14,
        fontWeight: '500',
    },
    routeCardFooter: { // Contenedor solo para la flecha, posicionado absoluto
        position: 'absolute',
        right: 15, // Alinear con padding
        top: '55%', // Ajustar verticalmente si es necesario
        transform: [{ translateY: -12 }],
    },
    // --- FIN ESTILOS CARD MODERNA ---
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 15 },
    emptyText: { fontSize: 17, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
    refreshButton: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
    refreshButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
});

export default DriverScreen;