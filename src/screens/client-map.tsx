// src/screens/client-map.tsx
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

// --- Navegación ---
import { ClientMapScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Tipos ---
import { Client, Sale, useData } from '../../context/DataContext';
import { useRoute } from '../../context/RouteContext';
import { COLORS, SIZES } from '../../styles/theme';

// --- UTILIDADES MATEMÁTICAS PARA RUTAS ---
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const optimizeRouteByDistance = (startNode: Client, pendingNodes: Client[]): Client[] => {
    let current = startNode;
    let remaining = [...pendingNodes.filter(c => c.id !== startNode.id)];
    const sortedRoute: Client[] = [startNode];

    while (remaining.length > 0) {
        let nearest: Client | null = null;
        let minDist = Infinity;
        for (const candidate of remaining) {
            const dist = getDistance(
                current.location!.latitude, current.location!.longitude,
                candidate.location!.latitude, candidate.location!.longitude
            );
            if (dist < minDist) {
                minDist = dist;
                nearest = candidate;
            }
        }
        if (nearest) {
            sortedRoute.push(nearest);
            current = nearest;
            remaining = remaining.filter(c => c.id !== nearest!.id);
        } else {
            break;
        }
    }
    return sortedRoute;
};

// --- LÓGICA DE SEMÁFORO (Helpers) ---
type ClientStatus = 'debt' | 'inactive' | 'active' | 'unknown';

const getClientStatus = (client: Client, clientSales: Sale[]): ClientStatus => {
    // 1. Verificar Deuda (Rojo)
    const hasDebt = clientSales.some(s => s.saldoPendiente > 0 && s.estado !== 'Anulada');
    if (hasDebt) return 'debt';

    // 2. Verificar Inactividad (Amarillo) > 7 días sin comprar
    if (clientSales.length === 0) return 'inactive'; // Nunca compró = Inactivo (o nuevo)

    // Obtener la fecha más reciente de compra
    const lastSale = clientSales.reduce((latest, current) => {
        const currentDate = current.fecha instanceof Date 
            ? current.fecha 
            // @ts-ignore: Manejo de Timestamp de Firebase si llega crudo
            : new Date(current.fecha.seconds * 1000);
            
        const latestDate = latest.fecha instanceof Date 
            ? latest.fecha 
            // @ts-ignore
            : new Date(latest.fecha.seconds * 1000);

        return currentDate > latestDate ? current : latest;
    });

    const lastDate = lastSale.fecha instanceof Date 
        // @ts-ignore
        ? lastSale.fecha 
        // @ts-ignore
        : new Date(lastSale.fecha.seconds * 1000);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (lastDate < sevenDaysAgo) return 'inactive';

    // 3. Al día (Verde)
    return 'active';
};


// --- Componente Principal ---
const ClientMapScreen = ({ navigation }: ClientMapScreenProps) => {
    const { clients: allClients, availableZones, sales: allSales, isLoading } = useData(); 
    const { routeClients, visitedClients, isNavigating, startRoute, visitCurrentClient, finishRoute } = useRoute();
    
    // Filtros
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<'all' | 'debt' | 'inactive' | 'active'>('all');

    const [plannedRoute, setPlannedRoute] = useState<Client[]>([]);
    const [isPlanning, setIsPlanning] = useState(false); 
    
    const mapViewRef = useRef<MapView>(null);
    const initialRegion = { latitude: -29.4134, longitude: -66.8569, latitudeDelta: 0.05, longitudeDelta: 0.05 };

    // --- 1. Cálculo de Estados (Memoizado) ---
    // Pre-calculamos el estado de CADA cliente para no hacerlo en cada render del mapa
    const clientStatuses = useMemo(() => {
        const statusMap = new Map<string, ClientStatus>();
        allClients.forEach(client => {
            const mySales = allSales.filter(s => s.clienteId === client.id);
            const status = getClientStatus(client, mySales);
            statusMap.set(client.id, status);
        });
        return statusMap;
    }, [allClients, allSales]);

    // --- 2. Filtrado de Clientes ---
    const clientsToShow = useMemo(() => {
        return allClients.filter(c => {
            // Validar ubicación
            if (!c.location?.latitude || !c.location?.longitude) return false;
            
            // Filtro de Zona
            if (selectedZoneId && c.zonaId !== selectedZoneId) return false;
            
            // Filtro de Estado
            if (selectedStatus !== 'all') {
                const status = clientStatuses.get(c.id);
                if (status !== selectedStatus) return false;
            }
            
            return true;
        });
    }, [allClients, selectedZoneId, selectedStatus, clientStatuses]);


    // --- Handlers de Lógica ---

    const togglePlannedClient = useCallback((client: Client) => {
        setPlannedRoute(prev => {
            const exists = prev.find(c => c.id === client.id);
            if (exists) return prev.filter(c => c.id !== client.id);
            return [...prev, client];
        });
    }, []);

    const handleAutoRoute = useCallback(() => {
        if (clientsToShow.length < 2) {
            Alert.alert("Insuficientes datos", "Necesitas al menos 2 clientes visibles para optimizar.");
            return;
        }
        const startPoint = clientsToShow[0]; 
        const optimized = optimizeRouteByDistance(startPoint, clientsToShow);
        
        setPlannedRoute(optimized);
        setIsPlanning(true);
        
        setTimeout(() => {
            mapViewRef.current?.fitToSuppliedMarkers(optimized.map(c => c.id), {
                edgePadding: { top: 100, right: 50, bottom: 300, left: 50 }, // Padding inferior grande para panel
                animated: true,
            });
        }, 500);

        Alert.alert("Ruta Optimizada", `Ruta creada con ${optimized.length} clientes filtrados.`);
    }, [clientsToShow]);

    const openNavigationTo = useCallback((destination: Client) => {
        const { latitude, longitude } = destination.location!;
        const url = Platform.select({
            ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
            android: `google.navigation:q=${latitude},${longitude}&mode=d`
        });
        if (url) { Linking.openURL(url).catch(() => Alert.alert("Error", "No se pudo abrir la aplicación de mapas.")); }
    }, []);
    
    const handleStartNavigation = useCallback(() => {
        if (plannedRoute.length === 0) { Alert.alert("Ruta vacía", "Selecciona al menos un cliente."); return; }
        startRoute(plannedRoute);
        openNavigationTo(plannedRoute[0]);
        setIsPlanning(false);
    }, [plannedRoute, startRoute, openNavigationTo]);

    const handleNextStop = useCallback(() => {
        visitCurrentClient();
        const remainingClients = routeClients.slice(1); 
        if (remainingClients.length > 0) {
            openNavigationTo(remainingClients[0]);
        } else {
            Alert.alert("Ruta Finalizada", "Has completado todas las visitas planificadas.");
            finishRoute();
            setPlannedRoute([]);
        }
    }, [routeClients, openNavigationTo, finishRoute, visitCurrentClient]);

    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const handleOpenClientDashboard = useCallback((clientId: string) => {
        if (!isPlanning) {
            navigation.navigate('ClientDashboard', { clientId });
        }
    }, [isPlanning, navigation]);

    // --- Efectos ---
    useEffect(() => {
        if (isNavigating) setIsPlanning(false);
    }, [isNavigating]);
    
    // Auto-zoom al cambiar filtros
    useEffect(() => {
        if (clientsToShow.length > 0 && mapViewRef.current && !isNavigating) {
            setTimeout(() => {
                 mapViewRef.current?.fitToSuppliedMarkers(clientsToShow.map(c => c.id), {
                    edgePadding: { top: 150, right: 50, bottom: 100, left: 50 },
                    animated: true,
                });
            }, 600);
        }
    }, [selectedZoneId, selectedStatus]); 

    const currentClient = isNavigating && routeClients.length > 0 ? routeClients[0] : null;
    const activeRouteLine = isNavigating ? routeClients : plannedRoute;

    if (isLoading && allClients.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            
            <MapView
                ref={mapViewRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={initialRegion}
                showsUserLocation
                showsMyLocationButton={false}
            >
                {/* Línea de Ruta */}
                {activeRouteLine.length > 1 && (
                    <Polyline
                        coordinates={activeRouteLine.map(c => c.location!)}
                        strokeColor={COLORS.primary}
                        strokeWidth={4}
                        lineDashPattern={[1]}
                    />
                )}

                {clientsToShow.map((client, index) => {
                    const isPlanned = !!plannedRoute.find(c => c.id === client.id);
                    const isExecuting = !!routeClients.find(c => c.id === client.id);
                    const isVisited = visitedClients.includes(client.id);
                    const status = clientStatuses.get(client.id);

                    // LÓGICA DE COLOR DEL PIN (SEMÁFORO)
                    let pinColor = COLORS.gray;

                    if (isVisited) {
                        pinColor = COLORS.textSecondary; // Gris (Ya visitado)
                    } else if (isExecuting) {
                        pinColor = '#3B82F6'; // Azul Brillante (Objetivo actual)
                    } else if (isPlanned) {
                        pinColor = '#6366F1'; // Violeta (En planificación)
                    } else {
                        // Semáforo Financiero
                        switch (status) {
                            case 'debt': pinColor = COLORS.danger; break;    // Rojo
                            case 'inactive': pinColor = COLORS.warning; break; // Amarillo
                            case 'active': pinColor = COLORS.success; break;   // Verde
                            default: pinColor = COLORS.gray;
                        }
                    }
                    
                    return (
                        <Marker
                            key={`${client.id}-${isPlanned}-${status}`}
                            identifier={client.id}
                            coordinate={client.location!}
                            pinColor={pinColor}
                            onPress={isPlanning ? () => togglePlannedClient(client) : undefined}
                            zIndex={status === 'debt' ? 10 : 1} // Deudores encima
                        >
                            <Callout onPress={() => handleOpenClientDashboard(client.id)}>
                                <View style={styles.calloutContainer}>
                                    <Text style={styles.calloutTitle}>{client.nombre}</Text>
                                    <Text style={[
                                        styles.calloutSubtitle, 
                                        { color: status === 'debt' ? COLORS.danger : COLORS.textSecondary }
                                    ]}>
                                        {status === 'debt' ? '⚠️ Tiene Deuda' : 
                                         status === 'inactive' ? '🕑 Inactivo (+7d)' : '✅ Al día'}
                                    </Text>
                                </View>
                            </Callout>
                        </Marker>
                    );
                })}
            </MapView>

            {/* --- HEADER Y FILTROS --- */}
            <View style={styles.topContainer}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.title}>
                        {isNavigating ? "En Ruta" : "Mapa de Clientes"}
                    </Text>
                    {/* Botón Rayo para auto-ruta con lo que se ve en pantalla */}
                    {!isNavigating && clientsToShow.length > 0 && (
                        <TouchableOpacity onPress={handleAutoRoute} style={styles.optimizeButton}>
                            <Feather name="zap" size={20} color={COLORS.white} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* FILTROS (Solo visibles si no navegas) */}
                {!isNavigating && (
                    <View>
                        {/* 1. Filtro de Zonas */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                            <TouchableOpacity 
                                style={[styles.chip, !selectedZoneId && styles.chipActive]}
                                onPress={() => setSelectedZoneId(null)}
                            >
                                <Text style={[styles.chipText, !selectedZoneId && styles.chipTextActive]}>Todas las Zonas</Text>
                            </TouchableOpacity>
                            {availableZones.map(zone => (
                                <TouchableOpacity 
                                    key={zone.id}
                                    style={[styles.chip, selectedZoneId === zone.id && styles.chipActive]}
                                    onPress={() => setSelectedZoneId(zone.id)}
                                >
                                    <Text style={[styles.chipText, selectedZoneId === zone.id && styles.chipTextActive]}>{zone.nombre}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        
                        {/* 2. Filtro de Estado (Semáforo) */}
                        <View style={styles.statusFilterRow}>
                            <TouchableOpacity 
                                style={[styles.statusChip, selectedStatus === 'all' && styles.statusChipActive]}
                                onPress={() => setSelectedStatus('all')}
                            >
                                <Text style={[styles.statusText, selectedStatus === 'all' && styles.statusTextActive]}>Todos</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.statusChip, selectedStatus === 'debt' && { backgroundColor: '#FEE2E2', borderColor: COLORS.danger }]}
                                onPress={() => setSelectedStatus(selectedStatus === 'debt' ? 'all' : 'debt')}
                            >
                                <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
                                <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>Deudores</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.statusChip, selectedStatus === 'inactive' && { backgroundColor: '#FEF3C7', borderColor: COLORS.warning }]}
                                onPress={() => setSelectedStatus(selectedStatus === 'inactive' ? 'all' : 'inactive')}
                            >
                                <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
                                <Text style={{ color: '#B45309', fontWeight: 'bold' }}>Inactivos</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.statusChip, selectedStatus === 'active' && { backgroundColor: '#D1FAE5', borderColor: COLORS.success }]}
                                onPress={() => setSelectedStatus(selectedStatus === 'active' ? 'all' : 'active')}
                            >
                                <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
                                <Text style={{ color: '#065F46', fontWeight: 'bold' }}>Al día</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>

            {/* FAB: Selección Manual */}
            {!isNavigating && !isPlanning && (
                <TouchableOpacity style={styles.fab} onPress={() => setIsPlanning(true)}>
                    <Feather name="map" size={SIZES.large} color={COLORS.white} />
                    <Text style={styles.fabText}>Selección Manual</Text>
                </TouchableOpacity>
            )}

            {/* --- PANELES INFERIORES (Iguales) --- */}
            {isPlanning && (
                <View style={styles.routePanel}>
                    <View style={styles.panelHeader}>
                        <Text style={styles.routeTitle}>{plannedRoute.length} paradas</Text>
                        <TouchableOpacity onPress={() => setIsPlanning(false)}>
                            <Feather name="x" size={24} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.routeButtons}>
                        <TouchableOpacity style={styles.clearButton} onPress={() => setPlannedRoute([])}>
                            <Text style={styles.clearButtonText}>Limpiar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.navigateButton} onPress={handleStartNavigation}>
                            <Text style={styles.navigateButtonText}>Iniciar Ruta</Text>
                            <Feather name="navigation" size={18} color={COLORS.white} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {isNavigating && currentClient && (
                 <View style={styles.routePanel}>
                    <Text style={styles.visitingText}>Próxima Parada:</Text>
                    <Text style={styles.visitingClient}>{currentClient.nombre}</Text>
                    <TouchableOpacity 
                        style={styles.mainActionButton} 
                        onPress={() => navigation.navigate('ClientDashboard', { clientId: currentClient.id })}
                    >
                        <Feather name="user" size={SIZES.h3} color={COLORS.white} />
                        <Text style={styles.mainActionButtonText}>Gestionar Cliente</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryButton} onPress={handleNextStop}>
                        <Text style={styles.secondaryButtonText}>Marcar y Seguir</Text>
                        <Feather name="chevron-right" size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={finishRoute} style={styles.finishRouteButton}>
                        <Text style={styles.finishRouteButtonText}>Cancelar Ruta</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

// --- Estilos ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart }, 
    map: { ...StyleSheet.absoluteFillObject },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    topContainer: {
        position: 'absolute', top: 0, left: 0, right: 0, paddingTop: SIZES.xxl,
    },
    header: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBackground,
        marginHorizontal: SIZES.medium, borderRadius: SIZES.radius, padding: SIZES.small,
        elevation: 4, shadowOpacity: 0.1, marginBottom: SIZES.small,
    },
    backButton: { padding: SIZES.small },
    title: { flex: 1, textAlign: 'center', fontSize: SIZES.h4, fontWeight: 'bold', color: COLORS.textPrimary },
    optimizeButton: { backgroundColor: COLORS.primary, padding: 8, borderRadius: 20, marginLeft: SIZES.small },

    // Filtros Zona
    filterScroll: { paddingHorizontal: SIZES.medium, paddingBottom: SIZES.xsmall, gap: SIZES.small },
    chip: { backgroundColor: COLORS.cardBackground, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, elevation: 2 },
    chipActive: { backgroundColor: COLORS.primary },
    chipText: { color: COLORS.textSecondary, fontSize: SIZES.caption, fontWeight: '600' },
    chipTextActive: { color: COLORS.white },

    // Filtros Estado (Semáforo)
    statusFilterRow: { 
        flexDirection: 'row', paddingHorizontal: SIZES.medium, paddingBottom: SIZES.small, 
        gap: SIZES.small, marginTop: 4 
    },
    statusChip: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBackground, 
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', elevation: 2 
    },
    statusChipActive: { backgroundColor: COLORS.textPrimary }, // "Todos" activo
    statusText: { fontSize: SIZES.caption, color: COLORS.textSecondary, fontWeight: '600' },
    statusTextActive: { color: COLORS.white },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },

    // Callout
    calloutContainer: { width: 140, alignItems: 'center', padding: 4 },
    calloutTitle: { fontWeight: 'bold', fontSize: 13, marginBottom: 2 },
    calloutSubtitle: { fontSize: 11, fontWeight: '600' },

    // FAB & Paneles
    fab: { 
        position: 'absolute', bottom: SIZES.xxl + 20, alignSelf: 'center', flexDirection: 'row', 
        alignItems: 'center', backgroundColor: COLORS.textPrimary, paddingHorizontal: 20, 
        paddingVertical: 12, borderRadius: 30, elevation: 6, gap: 8 
    },
    fabText: { color: COLORS.white, fontWeight: 'bold' },
    
    routePanel: { 
        position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.cardBackground, 
        padding: SIZES.medium, paddingBottom: SIZES.xl, borderTopLeftRadius: 20, borderTopRightRadius: 20, 
        elevation: 15 
    },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    routeTitle: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary },
    routeButtons: { flexDirection: 'row', gap: 10 },
    clearButton: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
    clearButtonText: { fontWeight: 'bold', color: COLORS.textSecondary },
    navigateButton: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, padding: 12, borderRadius: 10 },
    navigateButtonText: { color: COLORS.white, fontWeight: 'bold' },

    // Navegación Activa
    visitingText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 12 },
    visitingClient: { textAlign: 'center', fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 15 },
    mainActionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, marginBottom: 10 },
    mainActionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
    secondaryButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 10, backgroundColor: '#F3F4F6', borderRadius: 10 },
    secondaryButtonText: { color: COLORS.primary, fontWeight: '600' },
    finishRouteButton: { alignItems: 'center', marginTop: 10 },
    finishRouteButtonText: { color: COLORS.danger, fontSize: 12, textDecorationLine: 'underline' },
});

export default ClientMapScreen;