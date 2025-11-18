// src/screens/client-list.tsx

import { Feather } from '@expo/vector-icons';
// Eliminamos la importación de Picker
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, RefreshControl, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ClientListScreenProps, RootStackParamList } from '../navigation/AppNavigator';

import { Client, useData } from '../../context/DataContext';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

interface Zone {
    id: string;
    nombre: string;
}

// 1. Definimos un tipo de navegación local para el sub-componente
type ClientCardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ClientList'>;

// --- Componente Modal Selector de Zona (Rediseñado) ---
// ... (Componente omitido por ser auxiliar, sin cambios en estilos)
const ZoneSelectorModal = ({ visible, onClose, zones, selectedId, onSelect }: { 
    visible: boolean; 
    onClose: () => void; 
    zones: Zone[]; 
    selectedId: string; 
    onSelect: (id: string) => void; 
}) => {
    // ... (Lógica de modal sin cambios) ...
    const dataWithAllOption: Zone[] = useMemo(() => [
        { id: '', nombre: 'Todas las Zonas' },
        ...zones
    ], [zones]);

    const renderItem = useCallback(({ item }: { item: Zone }) => (
        <TouchableOpacity
            style={modalStyles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={modalStyles.modalItemText}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}>
                       <Text style={modalStyles.modalTitle}>FILTRAR POR ZONA</Text>
                    </View>
                    <FlatList
                        data={dataWithAllOption}
                        keyExtractor={(item) => item.id || 'all'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: SIZES.medium }}
                    />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}>
                        <Text style={modalStyles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};


// --- Componente Memoizado para el Item de la Lista (CORREGIDO: Solo pasa ID) ---
const ClientCard = memo(({ item }: { item: Client }) => {
    const navigation = useNavigation<ClientCardNavigationProp>();

    if (!item || !item.id) {
        console.warn("ClientCard recibió un item inválido:", item);
        return null;
    }

    const goToClientDashboard = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate('ClientDashboard', { clientId: item.id });
    }, [item.id, navigation]);

    // ✅ CORREGIDO: En lugar de { client: item }, pasamos { clientId: item.id }
    const goToEditClient = useCallback((e: any) => {
        e.stopPropagation();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate('EditClient', { clientId: item.id }); 
    }, [item.id, navigation]);

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={goToClientDashboard}
            activeOpacity={0.8}
        >
            <Feather name="user" size={SIZES.h3} color={COLORS.primary} style={styles.userIcon} />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre || item.nombreCompleto || 'Cliente Sin Nombre'}</Text>
                {item.direccion ? <Text style={styles.cardSubtitle} numberOfLines={1}>{item.direccion}</Text> : null}
            </View>
            <TouchableOpacity
                style={styles.editButton}
                onPress={goToEditClient}
                hitSlop={{ top: SIZES.medium, bottom: SIZES.medium, left: SIZES.medium, right: SIZES.medium }}
            >
                {/* Cambiamos el icono a un 'edit' para más claridad de acción */}
                <Feather name="edit-2" size={SIZES.h3} color={COLORS.textSecondary} />
            </TouchableOpacity>
        </TouchableOpacity>
    );
});
// --- FIN Componente Memoizado ---

// 2. Componente principal recibe 'navigation'
const ClientListScreen = ({ navigation }: ClientListScreenProps) => {
    const { clients: allClients = [], availableZones = [], isLoading: isDataLoading, syncData } = useData();

    const [zonaFilter, setZonaFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false);

    // ... (Lógica de filtrado y ordenación sin cambios) ...

    const sortedAvailableZones = useMemo(() => {
        const zones = Array.isArray(availableZones) ? availableZones : [];
        return [...zones]
            .filter(z => z && z.id)
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [availableZones]);

    const selectedZoneName = useMemo(() => {
        if (!zonaFilter) return 'Zonas';
        const selectedZone = sortedAvailableZones.find(z => z.id === zonaFilter);
        return selectedZone ? selectedZone.nombre : 'Seleccionar Zona';
    }, [zonaFilter, sortedAvailableZones]);

    const filteredClients = useMemo(() => {
        let clientsToFilter = Array.isArray(allClients) ? allClients : [];
        clientsToFilter = clientsToFilter.filter(c => c && c.id);
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
        clientsToFilter.sort((a, b) =>
            (a.nombre || a.nombreCompleto || '').localeCompare(b.nombre || b.nombreCompleto || '')
        );
        return clientsToFilter;
    }, [zonaFilter, searchQuery, allClients]);

    const onRefresh = useCallback(async () => {
        if (isRefreshing || isDataLoading) return;
        setIsRefreshing(true);
        try {
            await syncData();
        } catch (error) {
            console.error("Error during pull-to-refresh sync:", error);
        } finally {
            setIsRefreshing(false);
        }
    }, [syncData, isRefreshing, isDataLoading]);

    // --- Indicador de Carga Simplificado ---
    if (isDataLoading && (!allClients || allClients.length === 0)) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando clientes...</Text>
            </View>
        );
    }

    const renderClientItem = useCallback(({ item }: { item: Client }) => <ClientCard item={item} />, []);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            {/* Header (Ejecutivo) */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Mi Cartera</Text>
                {/* ✅ CORREGIDO: El botón de agregar cliente ahora navega SÓLO con el nombre de la pantalla */}
                <TouchableOpacity onPress={() => navigation.navigate('AddClient')} style={styles.headerButton}>
                    <Feather name="user-plus" size={SIZES.h3} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            {/* Controles (Fila Única Limpia) */}
            <View style={styles.controlsContainer}>
                {/* TextInput de Búsqueda */}
                <View style={styles.inputContainer}>
                    <Feather name="search" size={SIZES.h3} color={COLORS.primary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Nombre..."
                        placeholderTextColor={COLORS.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        clearButtonMode="while-editing"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {/* Botón de limpiar para Android */}
                    {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}><Feather name="x" size={SIZES.body} color={COLORS.textSecondary} /></TouchableOpacity>
                    )}
                </View>
                
                {/* REEMPLAZO DEL PICKER: Botón */}
                <View style={styles.pickerWrapper}>
                    {sortedAvailableZones.length > 0 ? (
                        <TouchableOpacity 
                            style={styles.pickerButton} 
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}
                        >
                            <Feather name="map-pin" size={SIZES.body} color={COLORS.primary} style={styles.pickerIcon} />
                            <Text style={[styles.pickerButtonText, { color: zonaFilter ? COLORS.textPrimary : COLORS.textSecondary }]}>
                                {selectedZoneName}
                            </Text>
                            <Feather name="chevron-down" size={SIZES.body} color={COLORS.primary} />
                        </TouchableOpacity>
                    ) : (
                        <Text style={styles.noZonesText}>
                            {isDataLoading ? 'Cargando zonas...' : 'No hay zonas'}
                        </Text>
                    )}
                </View>
            </View>

            {/* Indicador sutil de carga/refresco */}
            {(isRefreshing || (isDataLoading && allClients && allClients.length > 0)) && (
                <View style={styles.syncingIndicator}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.syncingText}>{isRefreshing ? 'Actualizando...' : 'Sincronizando...'}</Text>
                </View>
            )}

            {/* FlatList Optimizada */}
            <FlatList
                data={filteredClients}
                renderItem={renderClientItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        colors={[COLORS.primary]}
                        tintColor={COLORS.primary}
                    />
                }
                ListEmptyComponent={
                    !isDataLoading && !isRefreshing ? (
                        <View style={styles.emptyContainer}>
                            <Feather name="users" size={SIZES.h1} color={COLORS.disabled} />
                            <Text style={styles.emptyText}>
                                {searchQuery || zonaFilter ? 'No se encontraron clientes que coincidan.' : 'Aún no tienes clientes asignados.'}
                            </Text>
                            { !searchQuery && !zonaFilter && (!allClients || allClients.length === 0) && (
                                <TouchableOpacity onPress={() => navigation.navigate('AddClient')} style={styles.emptyButton}>
                                    <Text style={styles.emptyButtonText}>Agregar Mi Primer Cliente</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : null
                }
                ListFooterComponent={<View style={{ height: SIZES.medium }} />}
                initialNumToRender={15} 
                maxToRenderPerBatch={10} 
                windowSize={11} 
                removeClippedSubviews={Platform.OS === 'android'}
                keyboardShouldPersistTaps="handled" 
            />
            
            {/* MODAL DE SELECCIÓN DE ZONA */}
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

// --- Estilos de Componentes Auxiliares (Modal) ---
const modalStyles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { 
        width: '85%', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalHeader: { 
        paddingVertical: SIZES.medium, 
        borderBottomWidth: SIZES.borderWidth, 
        borderBottomColor: COLORS.glassBorder, 
        alignItems: 'center' 
    },
    modalTitle: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textTransform: 'uppercase' },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SIZES.medium },
    modalItemText: { fontSize: SIZES.body, color: COLORS.textPrimary },
    separatorModal: { height: SIZES.borderWidth, backgroundColor: COLORS.glassBorder, marginHorizontal: SIZES.small },
    modalCloseButton: { 
        marginTop: SIZES.large, 
        padding: SIZES.medium, 
        backgroundColor: COLORS.primary,
        borderRadius: SIZES.radius, 
        alignItems: 'center',
        marginHorizontal: SIZES.medium,
        marginBottom: SIZES.medium,
    },
    modalCloseText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
});


// --- ESTILOS DE PANTALLA (USANDO SIZES) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart }, // Fondo principal es el gris suave
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    
    // Carga inicial
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    loadingText: { marginTop: SIZES.medium, color: COLORS.textSecondary, fontSize: SIZES.body },
    
    // Indicador de Sincronización
    syncingIndicator: {
        paddingVertical: SIZES.xsmall,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        backgroundColor: COLORS.primary + '20',
        marginBottom: SIZES.small,
    },
    syncingText: { marginLeft: SIZES.xsmall, color: COLORS.primary, fontSize: SIZES.caption, fontWeight: '500' },
    
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.small,
        paddingBottom: SIZES.medium,
        paddingHorizontal: SIZES.small,
        backgroundColor: 'transparent',
    },
    headerButton: { padding: SIZES.small, width: 48 },
    title: {
        fontSize: SIZES.h2,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        flex: 1,
        marginHorizontal: SIZES.small,
    },
    
    // Controles (Filtro y Búsqueda)
    controlsContainer: { 
        paddingHorizontal: SIZES.large, 
        marginBottom: SIZES.medium, 
        flexDirection: 'row',
        gap: SIZES.medium,
        justifyContent: 'space-between',
    },
    inputContainer: {
        flex: 2, // Toma más espacio
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd, // Fondo blanco limpio
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: SIZES.small,
        height: 52, // Altura estándar
    },
    inputIcon: { marginRight: SIZES.small },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
        height: '100%'
    },
    clearButton: { padding: SIZES.xsmall },

    // Picker (Ahora Botón)
    pickerWrapper: {
        flex: 1.5, // Toma menos espacio que la búsqueda
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        height: 52,
        justifyContent: 'center',
    },
    pickerButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SIZES.small,
        height: '100%',
    },
    pickerIcon: { marginRight: SIZES.xsmall },
    pickerButtonText: {
        fontSize: SIZES.body,
        flex: 1,
        textAlign: 'center',
    },
    noZonesText: {
        fontSize: SIZES.caption,
        color: COLORS.textSecondary,
        textAlign: 'center',
        paddingHorizontal: SIZES.small,
        fontStyle: 'italic',
    },
    
    // Lista de Clientes (FlatList)
    listContentContainer: { 
        paddingHorizontal: SIZES.large, 
        paddingBottom: SIZES.large, 
        flexGrow: 1 
    },
    
    // Tarjeta de Cliente (Rediseñada)
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd, // Fondo blanco
        paddingVertical: SIZES.medium,
        paddingLeft: SIZES.medium,
        paddingRight: SIZES.small,
        borderRadius: SIZES.radius, // Más redondeado
        marginBottom: SIZES.small,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        // Sombra sutil para destacar el item sobre el fondo
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    userIcon: { marginRight: SIZES.medium },
    cardInfo: { flex: 1, marginRight: SIZES.small },
    cardTitle: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SIZES.xsmall / 2 },
    cardSubtitle: { fontSize: SIZES.caption, color: COLORS.textSecondary },
    editButton: { padding: SIZES.small, color: COLORS.textPrimary }, 

    // Empty State
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SIZES.xl },
    emptyText: { marginTop: SIZES.medium, fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.large },
    emptyButton: { backgroundColor: COLORS.primary, paddingVertical: SIZES.medium, paddingHorizontal: SIZES.large, borderRadius: SIZES.radius, elevation: 2, shadowOpacity: 0.1, shadowRadius: 4 },
    emptyButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body },
});

export default ClientListScreen;