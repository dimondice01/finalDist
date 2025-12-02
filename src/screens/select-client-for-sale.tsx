// src/screens/select-client-for-sale.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { SelectClientForSaleScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Client, useData } from '../../context/DataContext'; // ✅ Importamos Product
import { COLORS, SIZES } from '../../styles/theme';

// --- Interfaces para el Link Mágico ---
interface WhatsAppItem {
    id: string;
    quantity: number;
    cantidad?: number; // Soporte para legacy o typos
}

// --- Componente Memoizado para el Item de la Lista (CLIENTE) ---
const ClientSelectItemCard = memo(({ item, onSelect }: { item: Client, onSelect: (client: Client) => void }) => {
    if (!item || !item.id) return null;

    const handlePress = useCallback(() => {
        onSelect(item);
    }, [item, onSelect]);

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={handlePress}
            activeOpacity={0.8}
        >
            <Feather name="user" size={SIZES.h3} color={COLORS.primary} style={styles.userIcon} />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.nombre || item.nombreCompleto || 'Cliente Sin Nombre'}
                </Text>
                {item.direccion ? (
                    <Text style={styles.cardSubtitle} numberOfLines={1}>{item.direccion}</Text>
                ) : null}
            </View>
            <Feather name="chevron-right" size={SIZES.h3} color={COLORS.primary} />
        </TouchableOpacity>
    );
});

// --- PANTALLA PRINCIPAL ---
const SelectClientForSaleScreen = ({ navigation, route }: SelectClientForSaleScreenProps) => {
    // ✅ TRAEMOS 'products' PARA LA HIDRATACIÓN
    const { clients: allClients = [], products, isLoading } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [hasHydrationError, setHasHydrationError] = useState(false);

    // ==============================================================================
    // 🧠 LÓGICA DE "HIDRATACIÓN" (Data Hydration Layer)
    // ==============================================================================
    const hydratedCartItems = useMemo(() => {
        // CASO A: Catálogo Interno (Ya vienen completos, pasamos directo)
        if (route.params?.cartItems) {
            return route.params.cartItems;
        }

        // CASO B: Magic Link de WhatsApp (JSON sucio -> Objetos Product Completos)
        if (route.params?.data && products.length > 0) {
            try {
                // 1. Parsing seguro
                const rawData: WhatsAppItem[] = JSON.parse(route.params.data);
                
                if (!Array.isArray(rawData)) throw new Error("Formato inválido");

                // 2. Hidratación (Cruce con Catalogo Local)
                const hydrated = rawData.map(rawItem => {
                    const cleanId = rawItem.id.trim();
                    const qty = rawItem.quantity || rawItem.cantidad || 1;

                    // BUSCAMOS EN LA FUENTE DE LA VERDAD (Contexto)
                    const fullProduct = products.find(p => p.id === cleanId);

                    if (!fullProduct) {
                        console.warn(`[Hydration] Producto ID ${cleanId} no encontrado en catálogo local.`);
                        return null; 
                    }

                    // RETORNAMOS EL PRODUCTO COMPLETO + CANTIDAD
                    // Esto permite que CreateSale calcule precios, comisiones y costos correctamente.
                    return {
                        ...fullProduct,
                        quantity: qty,
                        // Forzamos precioOriginal para que CreateSale detecte si hay cambio de lista
                        precioOriginal: fullProduct.precio 
                    };
                }).filter(Boolean); // Eliminamos nulos (productos no encontrados)

                // 3. Validación de Integridad
                if (hydrated.length === 0 && rawData.length > 0) {
                    setHasHydrationError(true);
                    return undefined; // Falló todo
                }

                if (hydrated.length < rawData.length) {
                    // UX: Avisar que algunos productos no se encontraron
                     setTimeout(() => {
                        Toast.show({
                            type: 'info',
                            text1: 'Atención',
                            text2: 'Algunos productos del enlace no existen en tu catálogo.',
                            visibilityTime: 5000
                        });
                     }, 1000);
                }

                return hydrated;

            } catch (e) {
                console.error("Error hidratando pedido de WhatsApp:", e);
                setHasHydrationError(true);
                return undefined;
            }
        }
        return undefined;
    }, [route.params, products]); // Dependencia clave: products

    // Efecto de Feedback Inicial (UX)
    useEffect(() => {
        if (hydratedCartItems && hydratedCartItems.length > 0) {
             Toast.show({
                type: 'success',
                text1: 'Pedido Importado 🪄',
                text2: `Se reconocieron ${hydratedCartItems.length} productos del enlace.`,
                position: 'bottom',
                visibilityTime: 3000
            });
        } else if (hasHydrationError) {
             Alert.alert(
                "Error de Enlace", 
                "No se pudieron cargar los productos del enlace. Verifique que su catálogo esté actualizado.",
                [{ text: "Entendido" }]
            );
        }
    }, [hydratedCartItems, hasHydrationError]);


    // Filtrado de clientes
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

    // 2. NAVEGACIÓN A CREATE SALE CON DATOS HIDRATADOS
    const handleSelectClient = useCallback((client: Client) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        
        // UX: Bloqueo si hay error en hidratación
        if (route.params?.data && !hydratedCartItems) {
            Alert.alert("Error", "El pedido es inválido. Intente abrir el enlace nuevamente.");
            return;
        }

        // Pasamos 'hydratedCartItems' que ahora son objetos Product completos
        navigation.navigate('CreateSale', { 
            clientId: client.id,
            // @ts-ignore 
            preselectedItems: hydratedCartItems 
        }); 
    }, [navigation, hydratedCartItems, route.params]);

    const renderClientItem = useCallback(({ item }: { item: Client }) => (
        <ClientSelectItemCard item={item} onSelect={handleSelectClient} />
    ), [handleSelectClient]);

    if (isLoading && (!allClients || allClients.length === 0)) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando datos...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>
                    {hydratedCartItems ? 'ASIGNAR PEDIDO A...' : 'SELECCIONAR CLIENTE'}
                </Text>
                 <View style={styles.headerButton} />
            </View>

            {/* Aviso Visual Importante */}
            {hydratedCartItems && hydratedCartItems.length > 0 && (
                <View style={styles.cartNotice}>
                    <Feather name="link" size={16} color={COLORS.white} />
                    <Text style={styles.cartNoticeText}>
                        Pedido de WhatsApp: {hydratedCartItems.length} items listos
                    </Text>
                </View>
            )}

            {/* Barra de Búsqueda */}
            <View style={styles.controlsContainer}>
                <View style={styles.inputContainer}>
                    <Feather name="search" size={SIZES.h3} color={COLORS.primary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Buscar cliente..."
                        placeholderTextColor={COLORS.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        clearButtonMode="while-editing"
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

            {/* Lista */}
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    loadingText: { marginTop: SIZES.medium, color: COLORS.textSecondary, fontSize: SIZES.body },
    
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
        flex: 1,
    },
    
    // Aviso de carrito mejorado
    cartNotice: {
        backgroundColor: COLORS.primary, // Usamos el primario para denotar que es parte del flujo de la app
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 4,
    },
    cartNoticeText: {
        color: COLORS.white,
        fontWeight: '600',
        fontSize: 14,
        letterSpacing: 0.5
    },

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
        paddingTop: SIZES.xl * 2,
        gap: SIZES.medium,
    },
    emptyText: { 
        fontSize: SIZES.body, 
        color: COLORS.textSecondary, 
        textAlign: 'center' 
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd,
        paddingVertical: SIZES.medium + SIZES.xsmall, 
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