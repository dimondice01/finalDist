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
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

import { SelectClientForSaleScreenProps } from '../navigation/AppNavigator';

import { Client, useData } from '../../context/DataContext';
import { dbContainer } from '../../db/firebase-service';
import { COLORS, SIZES } from '../../styles/theme';

interface WhatsAppItem {
    id: string;
    quantity: number;
    cantidad?: number;
}

type VisitFilter = 'todos' | 'no_visitados' | 'visitados';

// --- Componente de Pill de Filtro ---
const FilterPill = memo(({ label, active, onPress, count }: {
    label: string;
    active: boolean;
    onPress: () => void;
    count?: number;
}) => (
    <TouchableOpacity
        style={[pillStyles.pill, active && pillStyles.pillActive]}
        onPress={onPress}
        activeOpacity={0.7}
    >
        <Text style={[pillStyles.pillText, active && pillStyles.pillTextActive]}>
            {label}{count !== undefined ? ` (${count})` : ''}
        </Text>
    </TouchableOpacity>
));

// --- Componente Memoizado para el Item de la Lista (CLIENTE) ---
const ClientSelectItemCard = memo(({ item, onSelect, isVisitado }: {
    item: Client;
    onSelect: (client: Client) => void;
    isVisitado: boolean;
}) => {
    if (!item || !item.id) return null;

    const handlePress = useCallback(() => {
        onSelect(item);
    }, [item, onSelect]);

    return (
        <TouchableOpacity
            style={[styles.card, isVisitado && styles.cardVisitado]}
            onPress={handlePress}
            activeOpacity={0.8}
        >
            {isVisitado && (
                <View style={styles.visitadoBadge}>
                    <Feather name="check" size={10} color={COLORS.white} />
                </View>
            )}
            <Feather
                name="user"
                size={SIZES.h3}
                color={isVisitado ? COLORS.success : COLORS.primary}
                style={styles.userIcon}
            />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.nombre || item.nombreCompleto || 'Cliente Sin Nombre'}
                </Text>
                {item.direccion ? (
                    <Text style={styles.cardSubtitle} numberOfLines={1}>{item.direccion}</Text>
                ) : null}
            </View>
            {isVisitado ? (
                <Text style={styles.visitadoLabel}>Visitado</Text>
            ) : (
                <Feather name="chevron-right" size={SIZES.h3} color={COLORS.primary} />
            )}
        </TouchableOpacity>
    );
});

// --- PANTALLA PRINCIPAL ---
const SelectClientForSaleScreen = ({ navigation, route }: SelectClientForSaleScreenProps) => {
    const {
        clients: allClients = [],
        products,
        sales = [],
        identity,
        companyId,
        availableZones = [],
        isLoading: isContextLoading,
    } = useData();

    const [searchQuery, setSearchQuery] = useState('');
    const [finalCartItems, setFinalCartItems] = useState<any[] | undefined>(undefined);
    const [isHydrating, setIsHydrating] = useState(false);
    const [hasHydrationError, setHasHydrationError] = useState(false);

    // --- Filtros ---
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [visitFilter, setVisitFilter] = useState<VisitFilter>('no_visitados');

    // --- Visitas del día (desde Firestore) ---
    const [visitasFirestore, setVisitasFirestore] = useState<Set<string>>(new Set());
    const [isLoadingVisitas, setIsLoadingVisitas] = useState(false);

    // Carga las visitas del día desde Firestore al montar
    useEffect(() => {
        const loadVisitasHoy = async () => {
            if (!identity?.id || !companyId) return;
            setIsLoadingVisitas(true);
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const visited = new Set<string>();
            try {
                const db = dbContainer.instance;
                if (!db) return;
                const snap = await db
                    .collection(`companies/${companyId}/visitas`)
                    .where('vendedorId', '==', identity.id)
                    .get();
                snap.docs.forEach(doc => {
                    const data = doc.data();
                    const fecha = data.fecha?.toDate?.();
                    if (fecha && fecha >= startOfDay && data.clienteId) {
                        visited.add(data.clienteId);
                    }
                });
            } catch (e) {
                console.warn('Error cargando visitas del día:', e);
            } finally {
                setIsLoadingVisitas(false);
            }
            setVisitasFirestore(visited);
        };
        loadVisitasHoy();
    }, [identity?.id, companyId]);

    // Unión de visitas Firestore + ventas del día (reactivo a sales)
    const visitadosHoy = useMemo(() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const combined = new Set(visitasFirestore);
        if (!identity?.id) return combined;
        sales.forEach(sale => {
            if (sale.vendedorId !== identity.id) return;
            if (sale.estado === 'Anulada') return;
            let saleDate: Date | null = null;
            if (sale.fecha instanceof Date) saleDate = sale.fecha;
            else if ((sale.fecha as any)?.seconds) saleDate = new Date((sale.fecha as any).seconds * 1000);
            if (saleDate && saleDate >= startOfDay) combined.add(sale.clienteId);
        });
        return combined;
    }, [visitasFirestore, sales, identity?.id]);

    // ==============================================================================
    // 🧠 LÓGICA DE HIDRATACIÓN DUAL (Local vs Remote)
    // ==============================================================================
    useEffect(() => {
        const hydrate = async () => {
            if (route.params?.cartItems) {
                setFinalCartItems(route.params.cartItems);
                return;
            }
            if (route.params?.c && route.params?.p) {
                setIsHydrating(true);
                try {
                    const db = dbContainer.instance;
                    if (!db) throw new Error("DB no lista");
                    const orderSnap = await db.collection(`companies/${route.params.c}/pedidos_temporales`).doc(route.params.p).get();
                    if (!orderSnap.exists) throw new Error("El pedido ya no está disponible.");
                    const orderData = orderSnap.data();
                    processAndSetItems(orderData?.items || []);
                } catch (err: any) {
                    console.error("Error cargando pedido remoto:", err);
                    setHasHydrationError(true);
                } finally {
                    setIsHydrating(false);
                }
                return;
            }
            if (route.params?.data && products.length > 0) {
                try {
                    const rawData: WhatsAppItem[] = JSON.parse(route.params.data);
                    if (Array.isArray(rawData)) processAndSetItems(rawData);
                } catch (e) {
                    console.error("Error parsing local WhatsApp data:", e);
                    setHasHydrationError(true);
                }
            }
        };

        const processAndSetItems = (rawData: WhatsAppItem[]) => {
            if (products.length === 0) return;
            const hydrated = rawData.map(rawItem => {
                const cleanId = rawItem.id?.trim();
                const qty = rawItem.quantity || rawItem.cantidad || 1;
                const fullProduct = products.find(p => p.id === cleanId);
                if (!fullProduct) return null;
                return { ...fullProduct, quantity: qty, precioOriginal: fullProduct.precio };
            }).filter(Boolean);
            if (hydrated.length === 0 && rawData.length > 0) {
                setHasHydrationError(true);
            } else {
                setFinalCartItems(hydrated);
                if (hydrated.length < rawData.length) {
                    Toast.show({ type: 'info', text1: 'Atención', text2: 'Varios productos del pedido no están en tu catálogo.', visibilityTime: 4000 });
                }
            }
        };

        hydrate();
    }, [route.params, products]);

    useEffect(() => {
        if (finalCartItems && finalCartItems.length > 0) {
            Toast.show({
                type: 'success',
                text1: 'Pedido Importado 🪄',
                text2: `Se reconocieron ${finalCartItems.length} productos del enlace.`,
                position: 'bottom',
                visibilityTime: 3000
            });
        }
    }, [finalCartItems]);

    // --- Clientes filtrados ---
    const filteredClients = useMemo(() => {
        let list = (Array.isArray(allClients) ? allClients : []).filter(c => c && c.id);

        // Filtro por zona
        if (selectedZoneId) {
            list = list.filter(c => c.zonaId === selectedZoneId);
        }

        // Filtro por visita
        if (visitFilter === 'visitados') {
            list = list.filter(c => visitadosHoy.has(c.id));
        } else if (visitFilter === 'no_visitados') {
            list = list.filter(c => !visitadosHoy.has(c.id));
        }

        // Búsqueda por texto
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(c =>
                (c.nombre?.toLowerCase() || '').includes(q) ||
                (c.nombreCompleto?.toLowerCase() || '').includes(q)
            );
        }

        list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        return list;
    }, [searchQuery, allClients, selectedZoneId, visitFilter, visitadosHoy]);

    // Contadores para pills de visita
    const visitCounts = useMemo(() => {
        let base = (Array.isArray(allClients) ? allClients : []).filter(c => c && c.id);
        if (selectedZoneId) base = base.filter(c => c.zonaId === selectedZoneId);
        const visitados = base.filter(c => visitadosHoy.has(c.id)).length;
        return { todos: base.length, visitados, noVisitados: base.length - visitados };
    }, [allClients, selectedZoneId, visitadosHoy]);

    const handleSelectClient = useCallback((client: Client) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if ((route.params?.data || route.params?.p) && !finalCartItems) {
            Alert.alert("Error", "El pedido no se ha terminado de cargar o es inválido.");
            return;
        }
        navigation.navigate('CreateSale', {
            clientId: client.id,
            // @ts-ignore
            preselectedItems: finalCartItems
        });
    }, [navigation, finalCartItems, route.params]);

    const renderClientItem = useCallback(({ item }: { item: Client }) => (
        <ClientSelectItemCard
            item={item}
            onSelect={handleSelectClient}
            isVisitado={visitadosHoy.has(item.id)}
        />
    ), [handleSelectClient, visitadosHoy]);

    if (isHydrating || (isContextLoading && (!allClients || allClients.length === 0))) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>
                    {isHydrating ? 'Descargando Pedido Remoto...' : 'Cargando datos...'}
                </Text>
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
                    {finalCartItems ? 'ASIGNAR PEDIDO A...' : 'SELECCIONAR CLIENTE'}
                </Text>
                <View style={styles.headerButton} />
            </View>

            {/* Aviso de carrito */}
            {finalCartItems && finalCartItems.length > 0 && (
                <View style={styles.cartNotice}>
                    <Feather name="link" size={16} color={COLORS.white} />
                    <Text style={styles.cartNoticeText}>
                        Pedido Externo: {finalCartItems.length} items listos
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

            {/* Pills de Zona */}
            {availableZones.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.pillsRow}
                    contentContainerStyle={styles.pillsContent}
                >
                    <FilterPill
                        label="Todas las zonas"
                        active={selectedZoneId === null}
                        onPress={() => setSelectedZoneId(null)}
                    />
                    {availableZones.map(z => (
                        <FilterPill
                            key={z.id}
                            label={z.nombre || z.id}
                            active={selectedZoneId === z.id}
                            onPress={() => setSelectedZoneId(prev => prev === z.id ? null : z.id)}
                        />
                    ))}
                </ScrollView>
            )}

            {/* Pills de Visita */}
            <View style={styles.visitFilterRow}>
                <FilterPill
                    label="Sin visitar"
                    active={visitFilter === 'no_visitados'}
                    onPress={() => setVisitFilter('no_visitados')}
                    count={visitCounts.noVisitados}
                />
                <FilterPill
                    label="Todos"
                    active={visitFilter === 'todos'}
                    onPress={() => setVisitFilter('todos')}
                    count={visitCounts.todos}
                />
                <FilterPill
                    label="Visitados"
                    active={visitFilter === 'visitados'}
                    onPress={() => setVisitFilter('visitados')}
                    count={visitCounts.visitados}
                />
                {isLoadingVisitas && (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: SIZES.small }} />
                )}
            </View>

            {/* Lista */}
            <FlatList
                data={filteredClients}
                renderItem={renderClientItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    !isContextLoading ? (
                        <View style={styles.emptyContainer}>
                            <Feather
                                name={visitFilter === 'visitados' ? 'check-circle' : 'users'}
                                size={SIZES.h1}
                                color={COLORS.disabled}
                            />
                            <Text style={styles.emptyText}>
                                {visitFilter === 'visitados'
                                    ? 'Aún no visitaste clientes hoy.'
                                    : visitFilter === 'no_visitados'
                                    ? '¡Todos los clientes fueron visitados hoy!'
                                    : searchQuery
                                    ? 'No se encontraron clientes.'
                                    : 'No hay clientes cargados.'}
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

const pillStyles = StyleSheet.create({
    pill: {
        paddingHorizontal: SIZES.medium,
        paddingVertical: SIZES.xsmall + 2,
        borderRadius: 20,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        backgroundColor: COLORS.backgroundEnd,
    },
    pillActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    pillText: {
        fontSize: SIZES.caption,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    pillTextActive: {
        color: COLORS.white,
    },
});

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

    cartNotice: {
        backgroundColor: COLORS.primary,
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
        letterSpacing: 0.5,
    },

    controlsContainer: {
        paddingHorizontal: SIZES.large,
        paddingTop: SIZES.medium,
        paddingBottom: SIZES.small,
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
        height: '100%',
    },
    clearButton: { padding: SIZES.xsmall },

    pillsRow: {
        flexGrow: 0,
        paddingTop: SIZES.small,
    },
    pillsContent: {
        paddingHorizontal: SIZES.large,
        gap: SIZES.small,
        paddingBottom: SIZES.small,
    },

    visitFilterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SIZES.large,
        paddingVertical: SIZES.small,
        gap: SIZES.small,
    },

    listContentContainer: {
        paddingHorizontal: SIZES.large,
        paddingTop: SIZES.small,
        paddingBottom: SIZES.large,
        flexGrow: 1,
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
        textAlign: 'center',
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
    cardVisitado: {
        borderColor: `${COLORS.success}40`,
        backgroundColor: `${COLORS.success}08`,
    },
    visitadoBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: COLORS.success,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userIcon: { marginRight: SIZES.medium },
    cardInfo: { flex: 1, marginRight: SIZES.medium },
    cardTitle: {
        fontSize: SIZES.body,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: SIZES.xsmall / 2,
    },
    cardSubtitle: {
        fontSize: SIZES.caption,
        color: COLORS.textSecondary,
    },
    visitadoLabel: {
        fontSize: SIZES.caption,
        fontWeight: '600',
        color: COLORS.success,
    },
});

export default SelectClientForSaleScreen;
