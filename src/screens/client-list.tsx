import { Feather } from '@expo/vector-icons';
// Eliminamos la importación de Picker
import * as Haptics from 'expo-haptics'; // Necesario para el feedback del botón
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, RefreshControl, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'; // Añadimos Modal y FlatList a las importaciones

// --- Navegación ---
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ClientListScreenProps, RootStackParamList } from '../navigation/AppNavigator'; // Importamos tipos necesarios

import { Client, useData } from '../../context/DataContext';
import { COLORS } from '../../styles/theme';

interface Zone {
    id: string;
    nombre: string;
}

// 1. Definimos un tipo de navegación local para el sub-componente
type ClientCardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ClientList'>;

// --- Componente Modal Selector de Zona (Reemplazo del Picker) ---
const ZoneSelectorModal = ({ visible, onClose, zones, selectedId, onSelect }: { 
    visible: boolean; 
    onClose: () => void; 
    zones: Zone[]; 
    selectedId: string; 
    onSelect: (id: string) => void; 
}) => {
    // Definimos la opción "Todas las Zonas" y la combinamos con las zonas disponibles
    const dataWithAllOption: Zone[] = useMemo(() => [
        { id: '', nombre: 'Todas las Zonas' },
        ...zones
    ], [zones]);

    const renderItem = useCallback(({ item }: { item: Zone }) => (
        <TouchableOpacity
            style={styles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={styles.modalItemText}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={styles.modalHeader}>
                         <Text style={styles.modalTitle}>Filtrar por Zona</Text>
                    </View>
                    <FlatList
                        data={dataWithAllOption}
                        keyExtractor={(item) => item.id || 'all'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={styles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: 20 }}
                    />
                    <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                        <Text style={styles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN Componente Modal Selector de Zona ---


// --- Componente Memoizado para el Item de la Lista (Migrado) ---
const ClientCard = memo(({ item }: { item: Client }) => {
    // Usamos useNavigation para acceder a la navegación
    const navigation = useNavigation<ClientCardNavigationProp>();

    // --- DEFENSA: No renderizar si falta item o id ---
    if (!item || !item.id) {
        console.warn("ClientCard recibió un item inválido:", item);
        return null;
    }

    // Navegación al Dashboard (Reemplazo de router.push)
    const goToClientDashboard = useCallback(() => {
        navigation.navigate('ClientDashboard', { clientId: item.id });
    }, [item.id, navigation]);

    // Navegación a Edición (Reemplazo de router.push)
    const goToEditClient = useCallback((e: any) => {
        e.stopPropagation(); // Evita que se active el onPress de la tarjeta
        navigation.navigate('EditClient', { client: item });
    }, [item.id, navigation]);

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={goToClientDashboard}
            activeOpacity={0.8}
        >
            <View style={styles.cardInfo}>
                {/* Fallback por si ambos nombres faltan */}
                <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre || item.nombreCompleto || 'Cliente Sin Nombre'}</Text>
                {/* Renderizado condicional más limpio */}
                {item.direccion ? <Text style={styles.cardSubtitle} numberOfLines={1}>{item.direccion}</Text> : null}
            </View>
            <TouchableOpacity
                style={styles.editButton}
                onPress={goToEditClient}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} // Área de toque más grande
            >
                <Feather name="edit-2" size={20} color={COLORS.primary} />
            </TouchableOpacity>
        </TouchableOpacity>
    );
});
// --- FIN Componente Memoizado ---

// 2. Componente principal recibe 'navigation'
const ClientListScreen = ({ navigation }: ClientListScreenProps) => {
    // Obtenemos los datos y el estado de carga directamente del contexto
    const { clients: allClients = [], availableZones = [], isLoading: isDataLoading, syncData } = useData();

    const [zonaFilter, setZonaFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false); // NUEVO ESTADO para el modal

    // Ordenación de Zonas (sin cambios)
    const sortedAvailableZones = useMemo(() => {
        const zones = Array.isArray(availableZones) ? availableZones : [];
        return [...zones]
            .filter(z => z && z.id) // Defensa anti-crash
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [availableZones]);

    // Búsqueda del nombre de la zona seleccionada para mostrar en el botón
    const selectedZoneName = useMemo(() => {
        if (!zonaFilter) return 'Todas las Zonas';
        const selectedZone = sortedAvailableZones.find(z => z.id === zonaFilter);
        return selectedZone ? selectedZone.nombre : 'Seleccionar Zona';
    }, [zonaFilter, sortedAvailableZones]);

    // Filtrado y Ordenación de Clientes (sin cambios)
    const filteredClients = useMemo(() => {
        let clientsToFilter = Array.isArray(allClients) ? allClients : [];
        clientsToFilter = clientsToFilter.filter(c => c && c.id); // Defensa anti-crash
        if (zonaFilter) {
            clientsToFilter = clientsToFilter.filter(c => c.zonaId === zonaFilter);
        }
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.trim().toLowerCase();
            clientsToFilter = clientsToFilter.filter(c =>
                (c.nombre?.toLowerCase() || '').includes(lowerQuery) ||
                (c.nombreCompleto?.toLowerCase() || '').includes(lowerQuery)
            );
        }
        // Ordenar DESPUÉS de filtrar
        clientsToFilter.sort((a, b) =>
            (a.nombre || a.nombreCompleto || '').localeCompare(b.nombre || b.nombreCompleto || '')
        );
        return clientsToFilter;
    }, [zonaFilter, searchQuery, allClients]);

    // Pull-to-Refresh (sin cambios)
    const onRefresh = useCallback(async () => {
        if (isRefreshing || isDataLoading) return; // Evitar refrescar si ya está en proceso
        console.log('Pull to refresh triggered...');
        setIsRefreshing(true);
        try {
            await syncData(); // syncData ya maneja el toast
        } catch (error) {
            console.error("Error during pull-to-refresh sync:", error);
        } finally {
            setIsRefreshing(false);
        }
    }, [syncData, isRefreshing, isDataLoading]); // Agregamos isDataLoading a las dependencias

    // --- Indicador de Carga Simplificado ---
    if (isDataLoading && (!allClients || allClients.length === 0)) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando clientes...</Text>
            </View>
        );
    }

    // --- Memoizamos la función renderItem ---
    const renderClientItem = useCallback(({ item }: { item: Client }) => <ClientCard item={item} />, []);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            {/* Header (MIGRADO) */}
            <View style={styles.header}>
                 {/* Reemplazo: router.back() -> navigation.goBack() */}
                 <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><Feather name="arrow-left" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                 <Text style={styles.title}>Mis Clientes</Text>
                 {/* Reemplazo: router.push('/add-client') -> navigation.navigate('AddClient') */}
                 <TouchableOpacity onPress={() => navigation.navigate('AddClient')} style={styles.headerButton}><Feather name="plus-circle" size={26} color={COLORS.primary} /></TouchableOpacity>
            </View>

            {/* Controles (sin cambios) */}
            <View style={styles.controlsContainer}>
                {/* TextInput */}
                <View style={styles.inputContainer}>
                     <Feather name="search" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                     <TextInput
                         style={styles.input}
                         placeholder="Buscar por nombre..."
                         placeholderTextColor={COLORS.textSecondary}
                         value={searchQuery}
                         onChangeText={setSearchQuery}
                         clearButtonMode="while-editing" // Para iOS
                         autoCapitalize="none" // Generalmente no se capitaliza al buscar
                         autoCorrect={false} // Desactivar autocorrección en búsqueda
                     />
                     {/* Botón de limpiar para Android */}
                     {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                         <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}><Feather name="x" size={18} color={COLORS.textSecondary} /></TouchableOpacity>
                     )}
                </View>
                {/* REEMPLAZO DEL PICKER: Botón y Modal */}
                <View style={styles.pickerContainer}>
                    <Feather name="map-pin" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    {sortedAvailableZones.length > 0 ? (
                        <TouchableOpacity 
                            style={styles.pickerButton} 
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}
                        >
                            <Text style={[styles.pickerButtonText, { color: zonaFilter ? COLORS.textPrimary : COLORS.textSecondary }]}>
                                {selectedZoneName}
                            </Text>
                            <Feather name="chevron-down" size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                    ) : (
                         // Muestra si no hay zonas o si están cargando aún
                         <Text style={styles.noZonesText}>
                             {isDataLoading ? 'Cargando zonas...' : 'No hay zonas'}
                         </Text>
                     )}
                </View>
            </View>

            {/* Indicador sutil de carga/refresco (mientras se refresca CON datos visibles) */}
            {(isRefreshing || (isDataLoading && allClients && allClients.length > 0)) && (
                 <View style={styles.syncingIndicator}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.syncingText}>{isRefreshing ? 'Actualizando...' : 'Sincronizando...'}</Text>
                 </View>
            )}

            {/* FlatList Optimizada */}
            <FlatList
                data={filteredClients} // Ya está memoizado con useMemo
                renderItem={renderClientItem} // Ya está memoizado con useCallback
                keyExtractor={(item) => item.id} // Correcto
                contentContainerStyle={styles.listContentContainer}
                refreshControl={ // Correcto
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        colors={[COLORS.primary]} // Color spinner Android
                        tintColor={COLORS.primary} // Color spinner iOS
                    />
                }
                ListEmptyComponent={ // Correcto, muestra solo si no está cargando
                    !isDataLoading && !isRefreshing ? (
                        <View style={styles.emptyContainer}>
                            <Feather name="users" size={48} color={COLORS.textSecondary} />
                            <Text style={styles.emptyText}>
                                {searchQuery || zonaFilter ? 'No se encontraron clientes.' : 'Aún no tienes clientes asignados.'}
                            </Text>
                            {/* Botón para agregar cliente si la lista está realmente vacía (MIGRADO) */}
                            { !searchQuery && !zonaFilter && (!allClients || allClients.length === 0) && (
                                 <TouchableOpacity onPress={() => navigation.navigate('AddClient')} style={styles.emptyButton}>
                                    <Text style={styles.emptyButtonText}>Agregar Mi Primer Cliente</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : null // No muestra nada si está cargando
                }
                 ListFooterComponent={<View style={{ height: 20 }} />} // Espacio al final

                 // --- Optimizaciones de FlatList ---
                 initialNumToRender={15} 
                 maxToRenderPerBatch={10} 
                 windowSize={11} 
                 removeClippedSubviews={Platform.OS === 'android'}
                 keyboardShouldPersistTaps="handled" 
            />
            
            {/* NUEVO MODAL DE SELECCIÓN DE ZONA */}
            <ZoneSelectorModal
                visible={isZoneModalVisible}
                onClose={() => setIsZoneModalVisible(false)}
                zones={sortedAvailableZones}
                selectedId={zonaFilter}
                onSelect={setZonaFilter}
            />
        </View>
    );
};

// --- Estilos (Actualizados para el nuevo selector y modal) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundEnd },
    loadingText: { marginTop: 15, color: COLORS.textSecondary, fontSize: 16 },
    syncingIndicator: {
        paddingVertical: 5,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        backgroundColor: `${COLORS.primary}20`,
        marginBottom: 5,
    },
    syncingText: { marginLeft: 8, color: COLORS.textSecondary, fontSize: 12 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + 10,
        paddingBottom: 15,
        paddingHorizontal: 10,
        backgroundColor: 'transparent',
    },
    headerButton: { padding: 10 },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        flex: 1,
        marginHorizontal: 5,
    },
    controlsContainer: { paddingHorizontal: 15, marginBottom: 10, gap: 10 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: 12,
        height: 48,
    },
    inputIcon: { marginRight: 8 },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 16,
        height: '100%'
    },
    clearButton: { padding: 5 },
    pickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        paddingLeft: 12,
        height: 48,
        position: 'relative',
    },
    // NUEVOS ESTILOS PARA EL SELECTOR BASADO EN TOUCHABLE
    pickerButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 12,
        height: '100%',
    },
    pickerButtonText: {
        fontSize: 16,
    },
    // Eliminamos el estilo 'picker'
    
    noZonesText: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textSecondary,
        paddingVertical: 12,
        fontStyle: 'italic',
    },
    // ESTILOS DEL MODAL DE ZONAS
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
    modalContent: { width: '85%', backgroundColor: COLORS.backgroundEnd, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalHeader: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, marginBottom: 10, alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
    modalItemText: { fontSize: 16, color: COLORS.textPrimary },
    separatorModal: { height: 1, backgroundColor: COLORS.glassBorder },
    modalCloseButton: { marginTop: 15, padding: 12, backgroundColor: COLORS.disabled, borderRadius: 12, alignItems: 'center' },
    modalCloseText: { color: COLORS.textPrimary, fontWeight: 'bold' },

    listContentContainer: { paddingHorizontal: 15, paddingBottom: 20, flexGrow: 1 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    emptyText: { marginTop: 20, fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 25 },
    emptyButton: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, elevation: 2, shadowOpacity: 0.1, shadowRadius: 4 },
    emptyButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        paddingVertical: 14,
        paddingLeft: 16,
        paddingRight: 8,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        shadowColor: '#f1f5bcff',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
        elevation: 2,
    },
    cardInfo: { flex: 1, marginRight: 8 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 3 },
    cardSubtitle: { fontSize: 14, color: COLORS.textSecondary },
    editButton: { padding: 12 },
});

export default ClientListScreen;