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
import { COLORS, SIZES } from '../../styles/theme'; // <--- Importamos SIZES

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

    // --- Handlers de Lógica y Navegación con useCallback (sin cambios) ---

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
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
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
                    
                    // Uso de COLORS de la paleta
                    let pinColor = '#3B82F6'; // Azul (por defecto, no en theme)
                    if (isVisited) pinColor = COLORS.textSecondary; // Visitado: Gris (similar a '#9CA3AF')
                    else if (isExecuting) pinColor = COLORS.success; // Ejecutando: Verde (similar a '#10B981')
                    else if (isPlanned) pinColor = COLORS.danger; // Planificado: Rojo (similar a '#EF4444')
                    
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
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>{isNavigating ? "Ejecutando Ruta" : isPlanning ? "Selecciona Clientes" : "Mapa de Clientes"}</Text>
            </View>

            {!isNavigating && !isPlanning && (
                <TouchableOpacity style={styles.fab} onPress={() => setIsPlanning(true)}>
                    <Feather name="git-pull-request" size={SIZES.large} color={COLORS.white} />
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
                            <Feather name="navigation" size={18} color={COLORS.white} />
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
                        <Feather name="user" size={SIZES.h3} color={COLORS.white} /><Text style={styles.mainActionButtonText}>Ver Ficha</Text>
                    </TouchableOpacity>
                    <View style={styles.secondaryActions}>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleNextStop}>
                            <Feather name="chevrons-right" size={SIZES.body} color={COLORS.textPrimary} />
                            <Text style={styles.secondaryButtonText}>Siguiente</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={finishRoute} style={styles.finishRouteButton}><Text style={styles.finishRouteButtonText}>Finalizar Ruta</Text></TouchableOpacity>
                </View>
            )}
        </View>
    );
};

// --- Estilos (Centralizados en Theme.js - SIZES y COLORS) ---
const styles = StyleSheet.create({
    // Estilos Base
    container: { 
        flex: 1, 
        backgroundColor: COLORS.backgroundStart 
    }, 
    map: { 
        ...StyleSheet.absoluteFillObject 
    },
    loadingContainer: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: COLORS.backgroundStart 
    }, 
    
    // Header Flotante
    header: { 
        position: 'absolute', 
        top: SIZES.xxl + SIZES.large, // 64 (para compensar StatusBar)
        left: SIZES.medium, // 16
        right: SIZES.medium, // 16
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.cardOverlay, // Fondo semi-transparente limpio
        borderRadius: 30, // Estilo "pill"
        paddingVertical: SIZES.small, // 8
        paddingHorizontal: SIZES.medium, // 16
        elevation: 5, 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 4 
    },
    backButton: { 
        padding: SIZES.xsmall // 4 
    },
    title: { 
        flex: 1, 
        textAlign: 'center', 
        fontSize: SIZES.h3, // 20
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        marginRight: SIZES.xl // 32
    },

    // FAB (Crear Ruta)
    fab: { 
        position: 'absolute', 
        bottom: SIZES.xxl, // 40
        alignSelf: 'center', 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.primary, // Verde Esmeralda
        paddingHorizontal: SIZES.large, // 24
        paddingVertical: SIZES.small + SIZES.xsmall, // 12
        borderRadius: 30, // Pill
        elevation: 8, 
        shadowColor: COLORS.secondary, 
        shadowRadius: 5, 
        shadowOpacity: 0.3, 
        gap: SIZES.small // 8
    },
    fabText: { 
        color: COLORS.white, 
        fontSize: SIZES.body, // 16
        fontWeight: 'bold' 
    },

    // Panel Inferior (Route Panel) - Bottom Sheet Style
    routePanel: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        backgroundColor: COLORS.cardBackground, // Blanco limpio
        padding: SIZES.medium, // 16
        paddingBottom: SIZES.xl, // 32 (Para zona de seguridad)
        borderTopLeftRadius: SIZES.large, // 24
        borderTopRightRadius: SIZES.large, // 24
        borderTopWidth: 1, 
        borderColor: COLORS.glassBorder, // Borde sutil
        elevation: 10,
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: -2 }, 
        shadowOpacity: 0.05, 
        shadowRadius: 5
    },
    routeTitle: { 
        color: COLORS.textPrimary, 
        fontSize: SIZES.h3, // 20
        fontWeight: 'bold', 
        textAlign: 'center', 
        marginBottom: SIZES.medium // 16
    },
    routeButtons: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        gap: SIZES.medium // 16
    },
    
    // Botones de Creación de Ruta
    clearButton: { 
        flex: 1, 
        backgroundColor: COLORS.glassBorder, // Fondo secundario
        padding: SIZES.medium, // 16
        borderRadius: SIZES.radius, // 12
        alignItems: 'center' 
    },
    clearButtonText: { 
        color: COLORS.textSecondary, 
        fontWeight: 'bold', 
        fontSize: SIZES.body // 16
    },
    navigateButton: { 
        flex: 2, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: SIZES.small, // 8
        backgroundColor: COLORS.primary, 
        padding: SIZES.medium, // 16
        borderRadius: SIZES.radius // 12
    },
    navigateButtonText: { 
        color: COLORS.white, 
        fontWeight: 'bold', 
        fontSize: SIZES.body // 16
    },
    
    // Controles de Navegación Activa
    visitingText: { 
        color: COLORS.textSecondary, 
        fontSize: SIZES.body, // 16
        textAlign: 'center' 
    },
    visitingClient: { 
        color: COLORS.textPrimary, 
        fontSize: SIZES.h2, // 24
        fontWeight: 'bold', 
        textAlign: 'center', 
        marginBottom: SIZES.medium // 16
    },
    mainActionButton: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: SIZES.small, // 8
        backgroundColor: COLORS.primary, 
        padding: SIZES.medium, // 16
        borderRadius: SIZES.radius, // 12
        marginBottom: SIZES.small // 8
    },
    mainActionButtonText: { 
        color: COLORS.white, 
        fontWeight: 'bold', 
        fontSize: SIZES.h3 // 20
    },
    secondaryActions: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        gap: SIZES.small, // 8
        marginBottom: SIZES.medium // 16
    },
    secondaryButton: { 
        flex: 1, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: SIZES.xsmall, // 4
        backgroundColor: COLORS.glassBorder, 
        padding: SIZES.small, // 8
        borderRadius: SIZES.radius // 12
    },
    secondaryButtonText: { 
        color: COLORS.textPrimary, 
        fontWeight: '600',
        fontSize: SIZES.caption // 14
    },
    finishRouteButton: { 
        alignItems: 'center', 
        marginTop: SIZES.xsmall // 4
    },
    finishRouteButtonText: { 
        color: COLORS.textSecondary, 
        textDecorationLine: 'underline',
        fontSize: SIZES.caption // 14
    },
});

export default ClientMapScreen;