// src/screens/select-client-for-sale.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// --- Navegación ---
import { SelectClientForSaleScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Client, useData } from '../../context/DataContext';
import { COLORS } from '../../styles/theme';

// --- Componente Memoizado para el Item de la Lista (Estilos Mejorados) ---
const ClientSelectItemCard = memo(({ item, onSelect }: { item: Client, onSelect: (client: Client) => void }) => {
    if (!item || !item.id) {
        return null;
    }

    const handlePress = useCallback(() => {
        onSelect(item);
    }, [item, onSelect]);

    return (
        <TouchableOpacity
            style={styles.card} // <-- Estilo mejorado
            onPress={handlePress}
            activeOpacity={0.8}
        >
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre || item.nombreCompleto || 'Cliente Sin Nombre'}</Text>
                {item.direccion ? <Text style={styles.cardSubtitle} numberOfLines={1}>{item.direccion}</Text> : null}
            </View>
            <Feather name="chevron-right" size={24} color={COLORS.primary} />
        </TouchableOpacity>
    );
});
// --- FIN Componente Memoizado ---


const SelectClientForSaleScreen = ({ navigation }: SelectClientForSaleScreenProps) => {
    const { clients: allClients = [], isLoading } = useData();
    const [searchQuery, setSearchQuery] = useState('');

    // Filtrado de clientes (sin cambios)
    const filteredClients = useMemo(() => {
        let clientsToFilter = Array.isArray(allClients) ? allClients : [];
        clientsToFilter = clientsToFilter.filter(c => c && c.id);
        if (!searchQuery.trim()) {
            clientsToFilter.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            return clientsToFilter;
        }
        const lowerQuery = searchQuery.trim().toLowerCase();
        clientsToFilter = clientsToFilter.filter(client =>
            (client.nombre?.toLowerCase() || '').includes(lowerQuery) ||
            (client.nombreCompleto?.toLowerCase() || '').includes(lowerQuery)
        );
        clientsToFilter.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        return clientsToFilter;
    }, [searchQuery, allClients]);

    // Función de navegación (sin cambios)
    const handleSelectClient = useCallback((client: Client) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate('CreateSale', { clientId: client.id });
    }, [navigation]);

    // Función renderItem (sin cambios)
    const renderClientItem = useCallback(({ item }: { item: Client }) => (
        <ClientSelectItemCard item={item} onSelect={handleSelectClient} />
    ), [handleSelectClient]);

    // Estado de carga inicial (sin cambios)
    if (isLoading && (!allClients || allClients.length === 0)) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando clientes...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            {/* Header (ESTILOS MEJORADOS) */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Seleccionar Cliente</Text>
                 <View style={styles.headerButton} />{/* Espaciador */}
            </View>

            {/* Barra de Búsqueda (ESTILOS MEJORADOS) */}
            <View style={styles.controlsContainer}>
                <View style={styles.inputContainer}>
                    <Feather name="search" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Buscar por nombre..."
                        placeholderTextColor={COLORS.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        clearButtonMode="while-editing" // iOS
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {searchQuery.length > 0 && Platform.OS === 'android' && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                             <Feather name="x" size={18} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* FlatList Optimizada (ESTILOS MEJORADOS) */}
            <FlatList
                data={filteredClients}
                renderItem={renderClientItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    !isLoading ? (
                        <View style={styles.emptyContainer}>
                            <Feather name="users" size={48} color={COLORS.textSecondary} />
                            <Text style={styles.emptyText}>
                                {searchQuery ? 'No se encontraron clientes.' : 'No hay clientes cargados.'}
                            </Text>
                        </View>
                    ) : null
                }
                 ListFooterComponent={<View style={{ height: 20 }} />}
                 initialNumToRender={15}
                 maxToRenderPerBatch={10}
                 windowSize={11}
                 removeClippedSubviews={Platform.OS === 'android'}
                 keyboardShouldPersistTaps="handled"
            />
        </View>
    );
};

// --- ESTILOS MEJORADOS ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 15, color: COLORS.textSecondary, fontSize: 16 },
    // --- HEADER ESTANDARIZADO ---
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + 20,
        paddingBottom: 20,
        paddingHorizontal: 10,
    },
    headerButton: { 
        padding: 10, 
        width: 44,
        alignItems: 'center',
    },
    title: {
        fontSize: 22, // Tamaño estándar
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
    },
    // --- FIN HEADER ---
    controlsContainer: { 
        paddingHorizontal: 20, // Padding estándar
        marginBottom: 10 
    },
    // --- INPUT ESTANDARIZADO ---
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        borderRadius: 15, // Más redondeado
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: 15, // Padding estándar
        height: 52, // Altura estándar
    },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 16,
        height: '100%'
    },
    clearButton: { padding: 5 },
    // --- FIN INPUT ---
    listContentContainer: { 
        paddingHorizontal: 20, // Padding estándar
        paddingBottom: 20, 
        flexGrow: 1 
    },
    emptyContainer: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: 30, 
        paddingBottom: 100, // Empuja hacia arriba
        gap: 20, // Espacio entre icono y texto
    },
    emptyText: { 
        fontSize: 17, // Más grande
        color: COLORS.textSecondary, 
        textAlign: 'center' 
    },
    // --- CARD MEJORADA ---
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        paddingVertical: 18, // Más alto
        paddingHorizontal: 16, // Padding estándar
        borderRadius: 16, // Más redondeado
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    cardInfo: { flex: 1, marginRight: 10 },
    cardTitle: { 
        fontSize: 17, 
        fontWeight: '600', 
        color: COLORS.textPrimary, 
        marginBottom: 3 
    },
    cardSubtitle: { 
        fontSize: 14, 
        color: COLORS.textSecondary 
    },
});

export default SelectClientForSaleScreen;