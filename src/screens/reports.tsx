// src/screens/reports.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import { Timestamp } from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ReportsScreenProps, RootStackParamList } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Cobranza, Sale as BaseSale, Client, useData } from '../../context/DataContext';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

// Renombramos el tipo local
type Sale = BaseSale;

// --- TIPO PARA EL HOOK useNavigation (Dentro de la card) ---
type ReportsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reports'>;


// --- Funciones Auxiliares (CORREGIDAS v9) ---
const formatJSDate = (dateInput: Sale['fecha']) => {
    let date: Date;
    if (dateInput instanceof Date) { date = dateInput; }
    else if (dateInput instanceof Timestamp) { date = dateInput.toDate(); }
    else if (dateInput && typeof (dateInput as { seconds: number }).seconds === 'number') { date = new Date((dateInput as { seconds: number }).seconds * 1000); }
    else { date = new Date(0); }

    if (isNaN(date.getTime()) || date.getFullYear() < 1971) { return 'Fecha inválida'; }
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Las cobranzas viven en su propia colección (companies/{id}/cobranzas), separadas
// de ventas, para no duplicar ganancia en los reportes. Para mostrarlas en el mismo
// historial que las ventas, las adaptamos a la forma que espera SaleReportCard.
const cobranzaToSaleView = (cobranza: Cobranza): Sale => ({
    id: cobranza.id,
    clienteId: cobranza.clienteId,
    clientName: cobranza.clienteNombre || 'Cliente',
    clienteNombre: cobranza.clienteNombre,
    vendedorId: cobranza.vendedorId,
    vendedorName: cobranza.vendedorNombre || 'Vendedor',
    vendedorNombre: cobranza.vendedorNombre,
    items: [],
    totalVenta: 0,
    totalCosto: 0,
    totalComision: 0,
    observaciones: '',
    estado: 'Pagada',
    tipo: 'cobranza',
    fecha: cobranza.fecha,
    saldoPendiente: 0,
    montoCobrado: cobranza.monto,
    pagoEfectivo: cobranza.metodoPago === 'Efectivo' ? cobranza.monto : 0,
    pagoTransferencia: cobranza.metodoPago === 'Transferencia' ? cobranza.monto : 0,
    pagoQR: cobranza.metodoPago === 'QR' ? cobranza.monto : 0,
    pagoPoint: cobranza.metodoPago === 'Point' ? cobranza.monto : 0,
    ventaOriginalId: cobranza.ventaOriginalId,
    rendido: cobranza.rendido,
});

const getClientDisplayName = (sale: Sale, clients: Client[]) => {
    if (sale.clienteNombre) return sale.clienteNombre;
    if (sale.clientName) return sale.clientName;
    if (sale.clienteId && clients) {
        const client = clients.find(c => c.id === sale.clienteId);
        return client?.nombre ?? client?.nombreCompleto ?? `Venta ${sale.id.substring(0, 6)}`;
    }
    return `Venta ${sale.id.substring(0, 6)}`;
};

// --- Función de Estilos para los "Pills" de Estado ---
const getStatusStyles = (item: Sale) => {
    // 1. Detectar COBRANZA
    if (item.tipo === 'cobranza') {
        return { 
            bg: 'rgba(139, 92, 246, 0.15)', // Violeta suave
            text: '#8B5CF6', // Violeta
            icon: 'download' as keyof typeof Feather.glyphMap, // Icono de entrada
            label: 'COBRO' 
        };
    }

    // 2. Estados normales de VENTA
    switch (item.estado) {
        case 'Pagada': 
            return { bg: 'rgba(20, 184, 166, 0.15)', text: COLORS.success, icon: 'check-circle' as keyof typeof Feather.glyphMap, label: 'PAGADA' };
        case 'Adeuda': 
            return { bg: 'rgba(251, 191, 36, 0.15)', text: COLORS.warning, icon: 'alert-circle' as keyof typeof Feather.glyphMap, label: 'ADEUDA' };
        case 'Pendiente de Entrega': 
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'clock' as keyof typeof Feather.glyphMap, label: 'PENDIENTE' };
        case 'Repartiendo': 
            return { bg: 'rgba(59, 130, 246, 0.15)', text: COLORS.primary, icon: 'truck' as keyof typeof Feather.glyphMap, label: 'EN CAMINO' }; // Usamos primary para el color del icono
        case 'Anulada': 
            return { bg: 'rgba(239, 68, 68, 0.15)', text: COLORS.danger, icon: 'x-circle' as keyof typeof Feather.glyphMap, label: 'ANULADA' };
        default: 
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'help-circle' as keyof typeof Feather.glyphMap, label: item.estado || '-' };
    }
};
// --- Fin Funciones Auxiliares ---

// --- Componente Memoizado para el Item de Venta (MEJORADO) ---
const SaleReportCard = memo(({ item, clients }: { item: Sale, clients: Client[] }) => {
    const navigation = useNavigation<ReportsNavigationProp>();

    if (!item || !item.id) return null;

    const clientDisplayName = useMemo(() => getClientDisplayName(item, clients), [item, clients]);
    
    // Obtenemos estilos y etiqueta usando la nueva lógica
    const { bg, text, icon, label } = useMemo(() => getStatusStyles(item), [item]);

    // Determinamos qué monto mostrar: Si es cobranza, mostramos lo cobrado. Si es venta, el total.
    const montoAMostrar = item.tipo === 'cobranza' 
        ? (item.pagoEfectivo || item.montoCobrado || 0) 
        : item.totalVenta;

    const navigateToDetail = useCallback(() => {
        navigation.navigate('SaleDetail', { saleId: item.id, clientName: clientDisplayName }); // Pasamos clientName
    }, [item.id, clientDisplayName, navigation]);


    return (
        <TouchableOpacity
            style={styles.saleCard}
            onPress={navigateToDetail}
            activeOpacity={0.7}
        >
            {/* --- Icono de estado circular --- */}
            <View style={[styles.statusIcon, { backgroundColor: bg }]}>
                <Feather name={icon} size={SIZES.h3} color={text} />
            </View>

            <View style={styles.saleInfo}>
                <Text style={styles.saleClientName} numberOfLines={1}>{clientDisplayName}</Text>
                
                <View style={{flexDirection:'row', alignItems:'center', gap: 8}}>
                    {/* Etiqueta de Tipo/Estado */}
                    <View style={{ backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: text, fontSize: 10, fontWeight: 'bold' }}>{label}</Text>
                    </View>
                    <Text style={styles.saleDetails}>{formatJSDate(item.fecha)}</Text>
                </View>
                
                {/* Solo mostramos saldo si es venta y adeuda */}
                {(item.tipo !== 'cobranza' && item.estado === 'Adeuda' && (item.saldoPendiente || 0) > 0.01) && (
                    <Text style={styles.salePending}>
                        <Text style={{ color: COLORS.warning, fontWeight: 'bold' }}>SALDO: </Text>
                        <Text>{item.saldoPendiente!.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</Text>
                    </Text>
                )}
            </View>

            <View style={styles.saleActions}>
                <Text style={[styles.saleTotal, item.tipo === 'cobranza' && { color: '#8B5CF6' }]}>
                    {montoAMostrar.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                </Text>
                <Feather name="chevron-right" size={SIZES.h3} color={COLORS.textSecondary} style={styles.chevronIcon}/>
            </View>
        </TouchableOpacity>
    );
});
// --- Fin Componente Memoizado ---

// --- Item de Deuda (NUEVO - Pestaña Saldos) ---
const DebtReportCard = memo(({ item, clients }: { item: Sale, clients: Client[] }) => {
    const navigation = useNavigation<ReportsNavigationProp>();
    const clientDisplayName = useMemo(() => getClientDisplayName(item, clients), [item, clients]);
    
    const handleGoToCollection = useCallback(() => {
        navigation.navigate('ClientDebts', { 
            clientId: item.clienteId, 
            clientName: clientDisplayName 
        });
    }, [navigation, item.clienteId, clientDisplayName]);

    return (
        <View style={styles.debtCard}>
            <View style={styles.debtInfo}>
                <Text style={styles.debtClientName} numberOfLines={1}>{clientDisplayName}</Text>
                <Text style={styles.debtDate}>Venta del {formatJSDate(item.fecha)}</Text>
                <Text style={styles.debtAmountLabel}>ADEUDA: <Text style={styles.debtAmountValue}>${item.saldoPendiente?.toFixed(2)}</Text></Text>
            </View>
            <TouchableOpacity style={styles.payButton} onPress={handleGoToCollection}>
                <Feather name="dollar-sign" size={SIZES.medium} color={COLORS.white} />
                <Text style={styles.payButtonText}>COBRAR</Text>
            </TouchableOpacity>
        </View>
    );
});


const ReportsScreen = ({ navigation }: ReportsScreenProps) => {
    const { sales: allSales = [], cobranzas: allCobranzas = [], isLoading, clients = [] } = useData();
    const [activeTab, setActiveTab] = useState<'history' | 'debts'>('history');

    // Ordenación y filtrado inicial
    // 1. Historial: Ventas (sin rendiciones internas) + Cobranzas (colección separada)
    const sortedSales = useMemo(() => {
        const getDateTimestamp = (fecha: Sale['fecha']): number => {
            if (!fecha) return 0;
            if (fecha instanceof Date) return fecha.getTime();
            if (fecha instanceof Timestamp) return fecha.toMillis();
            if ((fecha as any).seconds) return (fecha as any).seconds * 1000;
            return 0;
        };

        const sales = Array.isArray(allSales) ? allSales : [];
        const cobranzas = Array.isArray(allCobranzas) ? allCobranzas : [];

        const movimientos: Sale[] = [
            ...sales.filter(sale =>
                sale &&
                sale.id &&
                sale.clienteId !== 'INTERNAL_RENDICION' && // Ocultar rendiciones de caja internas
                sale.tipo !== 'rendicion_cobranza' &&
                // Cobros legacy que quedaron guardados como venta (antes de separar la
                // colección cobranzas): 'ventaOriginalId' es la huella que solo tiene un
                // cobro, ninguna venta real la tiene. Ver functions/scripts/migrate-cobranzas.js.
                sale.tipo !== 'cobranza' &&
                (sale.tipo as string) !== 'cobro' &&
                !sale.ventaOriginalId
            ),
            ...cobranzas.map(cobranzaToSaleView),
        ];

        return movimientos.sort((a, b) => getDateTimestamp(b.fecha) - getDateTimestamp(a.fecha));
    }, [allSales, allCobranzas]);

    // 2. Deudas: Solo ventas con estado "Adeuda"
    const pendingDebts = useMemo(() => {
        if (!Array.isArray(allSales)) return [];
        return allSales
            .filter(sale =>
                sale.tipo !== 'cobranza' && // Los cobros no son deudas
                (sale.tipo as string) !== 'cobro' &&
                !sale.ventaOriginalId &&
                sale.estado === 'Adeuda' &&
                (sale.saldoPendiente || 0) > 1 // Filtramos saldos ínfimos
            )
            .sort((a, b) => {
                const getTime = (d: any) => d instanceof Date ? d.getTime() : d?.seconds ? d.seconds * 1000 : 0;
                return getTime(a.fecha) - getTime(b.fecha); // Más antiguas primero (para cobrar primero lo viejo)
            });
    }, [allSales]);

    // Cálculo de métricas (SOLO DEUDA)
    const { deudaPorCobrar } = useMemo(() => ({ deudaPorCobrar: pendingDebts.reduce((sum, s) => sum + (s.saldoPendiente || 0), 0) }), [pendingDebts]);

    // Indicador de Carga (sin cambios)
    if (isLoading && (!allSales || allSales.length === 0)) {
        return (
            <View style={styles.loadingContainer}>
                   <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    // Función renderItem Memoizada
    const renderSaleItem = useCallback(({ item }: { item: Sale }) => (
        <SaleReportCard item={item} clients={clients} />
    ), [clients]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
            
            {/* Header (ESTANDARIZADO) */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>MIS REPORTES</Text>
                   <View style={styles.headerButton} />
            </View>

             {/* --- TABS --- */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'history' && styles.activeTab]} onPress={() => setActiveTab('history')}>
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>HISTORIAL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'debts' && styles.activeTab]} onPress={() => setActiveTab('debts')}>
                    <Text style={[styles.tabText, activeTab === 'debts' && styles.activeTabText]}>SALDOS ({pendingDebts.length})</Text>
                </TouchableOpacity>
            </View>

            {/* --- CONTENIDO --- */}
            {activeTab === 'history' ? (
                <>
                    <Text style={styles.listHeader}>HISTORIAL DE VENTAS</Text>
                    {/* FlatList Optimizada */}
                    <FlatList
                        data={sortedSales}
                        renderItem={renderSaleItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContentContainer}
                        ListEmptyComponent={
                            <View style={styles.emptyListContainer}>
                                <Feather name="file-text" size={SIZES.h1} color={COLORS.textSecondary} />
                                <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
                            </View>
                        }
                        initialNumToRender={10}
                        maxToRenderPerBatch={5}
                        windowSize={11}
                        ListFooterComponent={<View style={{ height: SIZES.large }} />}
                    />
                </>
            ) : (
                <>
                     {/* --- Métricas (DEUDA TOTAL) --- */}
                    <View style={styles.metricsContainer}>
                        <View style={styles.metricBox}>
                            <Feather name="alert-triangle" size={SIZES.h3} color={COLORS.warning} style={styles.metricIcon} />
                            <View style={styles.metricTextContainer}>
                                <Text style={styles.metricLabel}>DEUDA TOTAL POR COBRAR</Text>
                                <Text style={styles.metricValue}>
                                    {deudaPorCobrar.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                                </Text>
                            </View>
                        </View>
                    </View>
                    <FlatList
                        data={pendingDebts}
                        renderItem={({ item }) => <DebtReportCard item={item} clients={clients} />}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContentContainer}
                        ListEmptyComponent={
                            <View style={styles.emptyListContainer}>
                                <Feather name="check-circle" size={SIZES.h1} color={COLORS.success} />
                                <Text style={styles.emptyText}>¡Todo al día! No hay deudas pendientes.</Text>
                            </View>
                        }
                    />
                </>
            )}
        </View>
    );
};

// --- ESTILOS (¡MEJORADOS!) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    
    // --- HEADER ESTANDARIZADO ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.medium,
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.small,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        backgroundColor: COLORS.backgroundEnd,
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
        textTransform: 'uppercase',
    },
    
    // Tabs
    tabsContainer: { flexDirection: 'row', marginHorizontal: SIZES.large, marginTop: SIZES.medium, backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, padding: 4, borderWidth: 1, borderColor: COLORS.glassBorder },
    tab: { flex: 1, paddingVertical: SIZES.small, alignItems: 'center', borderRadius: SIZES.radiusSmall },
    activeTab: { backgroundColor: COLORS.primary },
    tabText: { fontWeight: '600', color: COLORS.textSecondary, fontSize: SIZES.caption },
    activeTabText: { color: COLORS.white },

    // --- MÉTRICAS ---
    metricsContainer: { 
        paddingHorizontal: SIZES.large, 
        marginBottom: SIZES.medium, 
        marginTop: SIZES.medium,
    },
    metricBox: { 
        backgroundColor: COLORS.backgroundEnd, 
        padding: SIZES.medium, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder, 
        flexDirection: 'row', 
        alignItems: 'center',
        shadowColor: COLORS.warning,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    metricIcon: { 
        marginRight: SIZES.medium,
    },
    metricTextContainer: {
        flex: 1,
    },
    metricValue: { 
        fontSize: SIZES.h2, // 24px Dominante
        fontWeight: 'bold', 
        color: COLORS.warning, // Color de deuda
        marginBottom: SIZES.xsmall,
    },
    metricLabel: { 
        fontSize: SIZES.caption, 
        color: COLORS.textSecondary, 
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    // --- LISTA ---
    listHeader: { 
        fontSize: SIZES.caption, 
        fontWeight: '700',
        color: COLORS.textSecondary, 
        paddingHorizontal: SIZES.large,
        marginBottom: SIZES.medium,
        textTransform: 'uppercase', 
        letterSpacing: 0.8,
        marginTop: SIZES.large, 
    },
    listContentContainer: { 
        paddingHorizontal: SIZES.large, 
        paddingBottom: SIZES.medium
    },
    emptyListContainer: { 
        alignItems: 'center', 
        marginTop: SIZES.xl, 
        padding: SIZES.large,
        gap: SIZES.medium,
    },
    emptyText: { 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        fontStyle: 'italic', 
        fontSize: SIZES.body 
    },
    // --- TARJETA DE VENTA MEJORADA ---
    saleCard: {
        flexDirection: 'row',
        alignItems: 'center', 
        backgroundColor: COLORS.backgroundEnd,
        padding: SIZES.medium, 
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
    statusIcon: {
        width: 48, // Cuadrado de icono
        height: 48,
        borderRadius: SIZES.radiusSmall, 
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SIZES.medium,
    },
    saleInfo: {
        flex: 1, 
        marginRight: SIZES.medium,
    },
    saleClientName: {
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
        fontWeight: '700',
        marginBottom: SIZES.xsmall,
    },
    saleDetails: {
        color: COLORS.textSecondary,
        fontSize: SIZES.caption,
    },
    salePending: {
        color: COLORS.warning,
        fontSize: SIZES.caption,
        marginTop: SIZES.xsmall,
    },
    saleActions: {
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 48, // Alineado con el icono de estado
    },
    saleTotal: {
        color: COLORS.textPrimary,
        fontSize: SIZES.h3,
        fontWeight: 'bold',
        marginBottom: SIZES.xsmall,
    },
    chevronIcon: {
        // Estilo implícito de SIZES.h3
    },

    // --- TARJETA DE DEUDA ---
    debtCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, padding: SIZES.medium, borderRadius: SIZES.radius, marginBottom: SIZES.small, borderLeftWidth: 4, borderLeftColor: COLORS.warning, borderWidth: 1, borderColor: COLORS.glassBorder, elevation: 2 },
    debtInfo: { flex: 1 },
    debtClientName: { fontSize: SIZES.body, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 4 },
    debtDate: { fontSize: SIZES.caption, color: COLORS.textSecondary, marginBottom: 4 },
    debtAmountLabel: { fontSize: SIZES.caption, color: COLORS.textSecondary, fontWeight: '600' },
    debtAmountValue: { fontSize: SIZES.h3, color: COLORS.warning, fontWeight: 'bold' },
    payButton: { backgroundColor: COLORS.success, paddingHorizontal: SIZES.medium, paddingVertical: SIZES.small, borderRadius: SIZES.radius, flexDirection: 'row', alignItems: 'center', gap: 4 },
    payButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.caption },
});

export default ReportsScreen;