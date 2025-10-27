import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
// Quitamos import { router } from 'expo-router';
// Añadimos memo y useCallback
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform, // Importamos Platform
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// --- Navegación ---
import { SelectClientForSaleScreenProps } from '../navigation/AppNavigator'; // Asumiendo tipificación

import { Client, useData } from '../../context/DataContext'; // Ajusta la ruta si es necesario
import { COLORS } from '../../styles/theme'; // Ajusta la ruta si es necesario

// --- Componente Memoizado para el Item de la Lista ---
const ClientSelectItemCard = memo(({ item, onSelect }: { item: Client, onSelect: (client: Client) => void }) => {
    // Defensa anti-crash
    if (!item || !item.id) {
        return null;
    }

    const handlePress = useCallback(() => {
        onSelect(item);
    }, [item, onSelect]);

    return (
        <TouchableOpacity
            style={styles.card}
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
    const { clients: allClients = [], isLoading } = useData(); // Quitamos isLoading: isDataLoading para evitar redundancia
    const [searchQuery, setSearchQuery] = useState('');

    // Filtrado de clientes (sin cambios)
    const filteredClients = useMemo(() => {
        let clientsToFilter = Array.isArray(allClients) ? allClients : [];
        clientsToFilter = clientsToFilter.filter(c => c && c.id); // Defensa
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

    // Función de navegación con useCallback
    const handleSelectClient = useCallback((client: Client) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        
        // CORRECCIÓN: Reemplazamos router.push con navigation.navigate
        navigation.navigate('CreateSale', { clientId: client.id });
        
    }, [navigation]);

    // Función renderItem con useCallback
    const renderClientItem = useCallback(({ item }: { item: Client }) => (
        <ClientSelectItemCard item={item} onSelect={handleSelectClient} />
    ), [handleSelectClient]); // Depende de handleSelectClient

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

            {/* Header */}
            <View style={styles.header}>
                {/* CORRECCIÓN: Reemplazamos router.back() con navigation.goBack() */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Seleccionar Cliente</Text>
                 <View style={styles.headerButton} />{/* Espaciador */}
            </View>

            {/* Barra de Búsqueda (con autoCapitalize/autoCorrect) */}
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
                    {/* Botón limpiar para Android */}
                    {searchQuery.length > 0 && Platform.OS === 'android' && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                             <Feather name="x" size={18} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* FlatList Optimizada */}
            <FlatList
                data={filteredClients} // Memoizado
                renderItem={renderClientItem} // Memoizado
                keyExtractor={(item) => item.id} // Correcto
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={ // Correcto
                    !isLoading ? (
                        <View style={styles.emptyContainer}>
                            <Feather name="users" size={48} color={COLORS.textSecondary} />
                            <Text style={styles.emptyText}>
                                {searchQuery ? 'No se encontraron clientes.' : 'No hay clientes cargados.'}
                            </Text>
                        </View>
                    ) : null
                }
                 ListFooterComponent={<View style={{ height: 20 }} />} // Espacio final

                 // --- Optimizaciones ---
                 initialNumToRender={15}
                 maxToRenderPerBatch={10}
                 windowSize={11} // Ajusta si es necesario
                 removeClippedSubviews={Platform.OS === 'android'}
                 keyboardShouldPersistTaps="handled" // Útil si la lista es larga y el teclado aparece
            />
        </View>
    );
};

// --- Estilos (sin cambios) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 15, color: COLORS.textSecondary, fontSize: 16 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + 10,
        paddingBottom: 15,
        paddingHorizontal: 10,
    },
    headerButton: { padding: 10, width: 44 }, // Ancho fijo para centrar
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        flex: 1,
        marginHorizontal: 5,
    },
    controlsContainer: { paddingHorizontal: 15, marginBottom: 10 },
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
    clearButton: { padding: 5 }, // Estilo para el botón de limpiar en Android
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 20, flexGrow: 1 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, paddingTop: 60 },
    emptyText: { marginTop: 20, fontSize: 16, color: COLORS.textSecondary, textAlign: 'center' },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        paddingVertical: 14,
        paddingLeft: 16,
        paddingRight: 12,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    cardInfo: { flex: 1, marginRight: 8 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 3 },
    cardSubtitle: { fontSize: 14, color: COLORS.textSecondary },
});

export default SelectClientForSaleScreen;