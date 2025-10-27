// src/screens/ClientMapScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Quitamos import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// --- Navegación ---
import { ClientMapScreenProps } from '../navigation/AppNavigator'; // Importa el tipo de props

// --- Contexto y Tipos (Importa Client y useData) ---
import { Client, useData } from '../../context/DataContext';
import { useRoute } from '../../context/RouteContext';
import { COLORS } from '../../styles/theme';

// --- Componente Principal (Adaptado) ---
const ClientMapScreen = ({ navigation }: ClientMapScreenProps) => { // <-- Recibe navigation
    const { clients: allClients, isLoading } = useData(); 
    const { routeClients, visitedClients, isNavigating, startRoute, visitCurrentClient, finishRoute } = useRoute();
    
    // Cálculos useMemo (sin cambios)
    const clientsWithLocation = useMemo(() => allClients.filter(c => c.location?.latitude && c.location?.longitude), [allClients]);
    
    const mapViewRef = useRef<MapView>(null);
    const [plannedRoute, setPlannedRoute] = useState<Client[]>([]);
    const [isPlanning, setIsPlanning] = useState(false); 
    
    const initialRegion = { latitude: -29.4134, longitude: -66.8569, latitudeDelta: 0.1, longitudeDelta: 0.1 };

    // --- Handlers de Lógica y Navegación con useCallback ---

    const togglePlannedClient = useCallback((client: Client) => {
        setPlannedRoute(prev =>
            prev.find(c => c.id === client.id)
                ? prev.filter(c => c.id !== client.id)
                : [...prev, client]
        );
    }, []);
    
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
        setPlannedRoute([]);
        setIsPlanning(false);
    }, [plannedRoute, startRoute, openNavigationTo]);

    const handleNextStop = useCallback(() => {
        visitCurrentClient();
        // routeClients se actualiza asíncronamente, por eso slice(1) funciona aquí si visitCurrentClient
        // maneja el estado inmediatamente. Si hay lag, es un riesgo.
        const remainingClients = routeClients.slice(1); 
        if (remainingClients.length > 0) {
            openNavigationTo(remainingClients[0]);
        } else {
            Alert.alert("Ruta Finalizada", "Has completado todas las visitas planificadas.");
            finishRoute();
        }
    }, [routeClients, openNavigationTo, finishRoute, visitCurrentClient]);

    const handleBack = useCallback(() => {
        navigation.goBack(); // <-- Reemplazo: router.back()
    }, [navigation]);

    const handleOpenClientDashboard = useCallback((clientId: string) => {
        // --- Reemplazo: router.push -> navigation.navigate ---
        if (!isPlanning) {
            navigation.navigate('ClientDashboard', { clientId });
        }
    }, [isPlanning, navigation]);

    // --- Efectos (sin cambios) ---

    useEffect(() => {
        if (isNavigating) setIsPlanning(false);
    }, [isNavigating]);
    
    useEffect(() => {
        const clientsToShow = isNavigating ? routeClients : plannedRoute;
        if (clientsToShow.length > 0 && mapViewRef.current) {
            mapViewRef.current?.fitToSuppliedMarkers(clientsToShow.map(c => c.id), {
                edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
                animated: true,
            });
        }
    }, [plannedRoute, isNavigating, routeClients]);
    
    const currentClient = isNavigating && routeClients.length > 0 ? routeClients[0] : null;

    if (isLoading && allClients.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <MapView
                ref={mapViewRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={initialRegion}
                showsUserLocation
            >
                {clientsWithLocation.map(client => {
                    const isPlanned = !!plannedRoute.find(c => c.id === client.id);
                    const isExecuting = !!routeClients.find(c => c.id === client.id);
                    const isVisited = visitedClients.includes(client.id);
                    
                    let pinColor = '#3B82F6';
                    if (isVisited) pinColor = '#9CA3AF';
                    else if (isExecuting) pinColor = '#10B981';
                    else if (isPlanned) pinColor = '#EF4444';
                    
                    return (
                        <Marker
                            key={`${client.id}-${isPlanned}`}
                            identifier={client.id}
                            coordinate={client.location!}
                            pinColor={pinColor}
                            onPress={isPlanning ? () => togglePlannedClient(client) : undefined}
                            title={client.nombre}
                            description={!isPlanning ? "Toca aquí para ver la ficha" : ""}
                        >
                            <Callout 
                                // El Callout usa el handler adaptado handleOpenClientDashboard
                                onPress={() => handleOpenClientDashboard(client.id)}
                            />
                        </Marker>
                    );
                })}
            </MapView>

            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.primaryDark} />
                </TouchableOpacity>
                <Text style={styles.title}>{isNavigating ? "Ejecutando Ruta" : isPlanning ? "Selecciona Clientes" : "Mapa de Clientes"}</Text>
            </View>

            {!isNavigating && !isPlanning && (
                <TouchableOpacity style={styles.fab} onPress={() => setIsPlanning(true)}>
                    <Feather name="git-pull-request" size={24} color={COLORS.primaryDark} />
                    <Text style={styles.fabText}>Crear Ruta</Text>
                </TouchableOpacity>
            )}
            {isPlanning && (
                <View style={styles.routePanel}>
                    <Text style={styles.routeTitle}>{plannedRoute.length} cliente(s) en la ruta</Text>
                    <View style={styles.routeButtons}>
                        <TouchableOpacity style={styles.clearButton} onPress={() => { setPlannedRoute([]); setIsPlanning(false); }}>
                            <Text style={styles.clearButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.navigateButton} onPress={handleStartNavigation}>
                            <Text style={styles.navigateButtonText}>Iniciar Ruta</Text>
                            <Feather name="navigation" size={18} color={COLORS.primaryDark} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}
            {isNavigating && currentClient && (
                 <View style={styles.routePanel}>
                    <Text style={styles.visitingText}>Próxima Parada:</Text>
                    <Text style={styles.visitingClient}>{currentClient.nombre}</Text>
                    {/* Reemplazo: router.push -> navigation.navigate */}
                    <TouchableOpacity 
                        style={styles.mainActionButton} 
                        onPress={() => navigation.navigate('ClientDashboard', { clientId: currentClient.id })}
                    >
                        <Feather name="user" size={20} color={COLORS.primaryDark} /><Text style={styles.mainActionButtonText}>Ver Ficha</Text>
                    </TouchableOpacity>
                    <View style={styles.secondaryActions}>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleNextStop}><Feather name="chevrons-right" size={18} color={COLORS.textPrimary} /><Text style={styles.secondaryButtonText}>Siguiente</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={finishRoute} style={styles.finishRouteButton}><Text style={styles.finishRouteButtonText}>Finalizar Ruta</Text></TouchableOpacity>
                </View>
            )}
        </View>
    );
};

// --- Estilos (sin cambios) ---
const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundEnd },
    header: { position: 'absolute', top: 60, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 251, 0.95)', borderRadius: 30, paddingVertical: 10, paddingHorizontal: 15, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    backButton: { padding: 5 },
    title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: COLORS.primaryDark, marginRight: 30 },

    fab: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, elevation: 8, shadowColor: '#000', shadowRadius: 5, shadowOpacity: 0.3, gap: 10 },
    fabText: { color: COLORS.primaryDark, fontSize: 16, fontWeight: 'bold' },

    routePanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(39, 39, 42, 0.95)', padding: 20, paddingBottom: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: COLORS.glassBorder },
    routeTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
    routeButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 },
    clearButton: { flex: 1, backgroundColor: COLORS.glass, padding: 15, borderRadius: 15, alignItems: 'center' },
    clearButtonText: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: 16 },
    navigateButton: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: COLORS.primary, padding: 15, borderRadius: 15 },
    navigateButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
    
    visitingText: { color: COLORS.textSecondary, fontSize: 16, textAlign: 'center' },
    visitingClient: { color: COLORS.textPrimary, fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
    mainActionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: COLORS.primary, padding: 15, borderRadius: 15, marginBottom: 10 },
    mainActionButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 18 },
    secondaryActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 15 },
    secondaryButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.glass, padding: 12, borderRadius: 15 },
    secondaryButtonText: { color: COLORS.textPrimary, fontWeight: '600' },
    finishRouteButton: { alignItems: 'center', marginTop: 5 },
    finishRouteButtonText: { color: COLORS.textSecondary, textDecorationLine: 'underline' },
});

export default ClientMapScreen;