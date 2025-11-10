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
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

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
            style={styles.card} 
            onPress={handlePress}
            activeOpacity={0.8}
        >
            <Feather name="user" size={SIZES.h3} color={COLORS.textSecondary} style={styles.userIcon} />
            <View style={styles.cardInfo}>
                {/* Título: SIZES.body (16px) */}
                <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre || item.nombreCompleto || 'Cliente Sin Nombre'}</Text>
                {/* Subtítulo: SIZES.caption (14px) */}
                {item.direccion ? <Text style={styles.cardSubtitle} numberOfLines={1}>{item.direccion}</Text> : null}
            </View>
            <Feather name="chevron-right" size={SIZES.h3} color={COLORS.primary} />
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
        // ✅ CORREGIDO: Pasamos solo el clientId (string)
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
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando clientes...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            {/* Header (ESTILOS MEJORADOS) */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>SELECCIONAR CLIENTE</Text>
                 <View style={styles.headerButton} />{/* Espaciador */}
            </View>

            {/* Barra de Búsqueda (ESTILOS MEJORADOS) */}
            <View style={styles.controlsContainer}>
                <View style={styles.inputContainer}>
                    <Feather name="search" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
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
                             <Feather name="x" size={SIZES.body} color={COLORS.textSecondary} />
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
                            <Feather name="users" size={SIZES.h1} color={COLORS.disabled} />
                            <Text style={styles.emptyText}>
                                {searchQuery ? 'No se encontraron clientes.' : 'No hay clientes cargados.'}
                            </Text>
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
        </View>
    );
};

// --- ESTILOS MEJORADOS (USANDO SIZES) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    loadingText: { marginTop: SIZES.medium, color: COLORS.textSecondary, fontSize: SIZES.body },
    
    // --- HEADER ESTANDARIZADO ---
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.medium,
        paddingBottom: SIZES.medium,
        paddingHorizontal: SIZES.small,
        backgroundColor: COLORS.backgroundEnd,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
    },
    headerButton: { 
        padding: SIZES.small, 
        width: SIZES.xl,
        alignItems: 'center',
    },
    title: {
        fontSize: SIZES.h3,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    // --- BARRA DE BÚSQUEDA ---
    controlsContainer: { 
        paddingHorizontal: SIZES.large, 
        paddingVertical: SIZES.medium,
        backgroundColor: COLORS.backgroundStart,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: SIZES.medium, 
        height: 52, 
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    inputIcon: { marginRight: SIZES.small },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
        height: '100%'
    },
    clearButton: { padding: SIZES.xsmall },
    
    // --- LISTA Y CARDS ---
    listContentContainer: { 
        paddingHorizontal: SIZES.large,
        paddingBottom: SIZES.large, 
        flexGrow: 1 
    },
    emptyContainer: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: SIZES.xl, 
        paddingTop: SIZES.xl * 2, // Empuja hacia abajo
        gap: SIZES.medium,
    },
    emptyText: { 
        fontSize: SIZES.body, 
        color: COLORS.textSecondary, 
        textAlign: 'center' 
    },
    // Tarjeta de Selección
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd,
        paddingVertical: SIZES.medium + SIZES.xsmall, // 20px de padding vertical
        paddingHorizontal: SIZES.medium, 
        borderRadius: SIZES.radius, 
        marginBottom: SIZES.small,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    userIcon: { marginRight: SIZES.medium },
    cardInfo: { flex: 1, marginRight: SIZES.medium },
    cardTitle: { 
        fontSize: SIZES.body, 
        fontWeight: '700', 
        color: COLORS.textPrimary, 
        marginBottom: SIZES.xsmall / 2 
    },
    cardSubtitle: { 
        fontSize: SIZES.caption, 
        color: COLORS.textSecondary 
    },
});

export default SelectClientForSaleScreen;