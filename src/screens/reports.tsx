import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Añadimos memo y useCallback
import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
// Importamos los tipos necesarios para tipar la navegación
import { useNavigation } from '@react-navigation/native';
// CORRECCIÓN: Cambiamos StackNavigationProp por NativeStackNavigationProp
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ReportsScreenProps } from '../navigation/AppNavigator'; // Asume la tipificación de props

// 1. DEFINICIÓN DE TIPOS DE RUTA (NECESARIO PARA RESOLVER EL ERROR 'never')
// Esta lista debe coincidir con la configuración real de tu Stack Navigator
type RootStackParamList = {
    Reports: undefined;
    SaleDetail: { saleId: string };
    // Agrega aquí cualquier otra ruta a la que se navegue desde o hacia ReportsScreen
};

// 2. TIPO PARA EL HOOK useNavigation (Usando el tipo NativeStackNavigationProp corregido)
type ReportsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reports'>;

// Asegúrate que la ruta sea correcta
import { Sale as BaseSale, Client, useData } from '../../context/DataContext';
// Asegúrate que la ruta sea correcta
import { COLORS } from '../../styles/theme';

// Mantenemos la interfaz Sale local si es específica para esta pantalla
interface Sale extends BaseSale {}

// --- Funciones Auxiliares (fuera del componente para no recrearlas) ---
const formatJSDate = (dateInput: Sale['fecha']) => {
    let date: Date;
    if (dateInput instanceof Date) { date = dateInput; }
    else if (dateInput && typeof (dateInput as { seconds: number }).seconds === 'number') { date = new Date((dateInput as { seconds: number }).seconds * 1000); }
    else { date = new Date(); }
    if (isNaN(date.getTime())) { return 'Fecha inválida'; }
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); // Formato DD/MM/AAAA
};

const getClientDisplayName = (sale: Sale, clients: Client[]) => {
    if (sale.clienteNombre) return sale.clienteNombre;
    if (sale.clientName) return sale.clientName;
    if (sale.clienteId && clients) {
        const client = clients.find(c => c.id === sale.clienteId);
        return client?.nombre ?? client?.nombreCompleto ?? `Venta ${sale.id.substring(0, 6)}`;
    }
    return `Venta ${sale.id.substring(0, 6)}`;
};

const getStatusColor = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada': return COLORS.success;
        case 'Adeuda': return COLORS.warning;
        case 'Pendiente de Pago': return COLORS.warning;
        case 'Repartiendo': return COLORS.primary;
        case 'Anulada': return COLORS.danger;
        default: return COLORS.disabled;
    }
};
// --- Fin Funciones Auxiliares ---

// --- Componente Memoizado para el Item de Venta (Tipado Correctamente) ---
const SaleReportCard = memo(({ item, clients }: { item: Sale, clients: Client[] }) => {
    // Aplicamos el tipo ReportsNavigationProp corregido
    const navigation = useNavigation<ReportsNavigationProp>();

    // Defensa
    if (!item || !item.id) return null;

    const navigateToDetail = useCallback(() => {
        // navigation.navigate ahora tiene el tipo correcto y acepta esta estructura
        navigation.navigate('SaleDetail', { saleId: item.id });
    }, [item.id, navigation]);

    const clientDisplayName = useMemo(() => getClientDisplayName(item, clients), [item, clients]);
    const statusColor = useMemo(() => getStatusColor(item.estado), [item.estado]);

    // Estructura visual
    return (
        <TouchableOpacity
            style={styles.saleCard}
            onPress={navigateToDetail}
            activeOpacity={0.7}
        >
            <View style={styles.saleInfo}>
                <Text style={styles.saleClientName} numberOfLines={1}>{clientDisplayName}</Text>
                <Text style={styles.saleDetails}>
                    Total: {item.totalVenta.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                </Text>
                {(item.estado === 'Adeuda' && item.saldoPendiente > 0.01) && (
                    <Text style={styles.salePending}>
                        Saldo: {item.saldoPendiente.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                    </Text>
                )}
            </View>
            <View style={styles.saleActions}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                    <Text style={styles.statusText}>{item.estado}</Text>
                </View>
                <Text style={styles.saleDateText}>{formatJSDate(item.fecha)}</Text>
                <Feather name="chevron-right" size={24} color={COLORS.textSecondary} style={styles.chevronIcon}/>
            </View>
        </TouchableOpacity>
    );
});
// --- Fin Componente Memoizado ---

// RECIBIMOS navigation en las props del componente principal
const ReportsScreen = ({ navigation }: ReportsScreenProps) => {
    const { sales: allSales = [], isLoading, clients = [] } = useData();

    // Ordenación y filtrado inicial (sin cambios)
    const sortedSales = useMemo(() => {
        if (!Array.isArray(allSales)) return [];
        return allSales
            .filter(sale => sale && sale.id && !(sale.clientName?.startsWith('Cobro Saldo') || sale.clienteNombre?.startsWith('Cobro Saldo')))
            .sort((a, b) => {
                const getDateTimestamp = (sale: Sale): number => {
                    if (sale.fecha instanceof Date) return sale.fecha.getTime();
                    if (sale.fecha && typeof (sale.fecha as { seconds: number }).seconds === 'number') {
                        return (sale.fecha as { seconds: number }).seconds * 1000;
                    }
                    return 0;
                };
                return getDateTimestamp(b) - getDateTimestamp(a);
            });
    }, [allSales]);

    // Cálculo de métricas (sin cambios)
    const { comisionesGanadas, deudaPorCobrar } = useMemo(() => {
        if (!Array.isArray(allSales)) return { comisionesGanadas: 0, deudaPorCobrar: 0 };
        let comisiones = 0;
        let deuda = 0;
        allSales.forEach(sale => {
            if (!sale) return;
            if (sale.estado === 'Pagada' || sale.estado === 'Adeuda') { comisiones += sale.totalComision || 0; }
            if (sale.estado === 'Adeuda') { deuda += sale.saldoPendiente || 0; }
        });
        return { comisionesGanadas: comisiones, deudaPorCobrar: deuda };
    }, [allSales]);

    // Indicador de Carga (sin cambios)
    if (isLoading && (!allSales || allSales.length === 0)) {
        return (
            <View style={styles.loadingContainer}>
                 <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
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
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            {/* Header (Adaptado) */}
            <View style={styles.header}>
                {/* CORRECCIÓN: Reemplazamos router.back() con navigation.goBack() */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Mis Reportes</Text>
                 <View style={styles.headerPlaceholder} />
            </View>

            {/* Métricas (con formato de moneda mejorado) */}
            <View style={styles.metricsContainer}>
                <View style={styles.metricBox}>
                    <Feather name="award" size={24} color={COLORS.success} style={styles.metricIcon} />
                    <Text style={styles.metricValue}>
                        {comisionesGanadas.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </Text>
                    <Text style={styles.metricLabel}>Comisiones Generadas</Text>
                </View>
                <View style={styles.metricBox}>
                    <Feather name="alert-circle" size={24} color={COLORS.warning} style={styles.metricIcon} />
                    <Text style={styles.metricValue}>
                        {deudaPorCobrar.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </Text>
                    <Text style={styles.metricLabel}>Deuda por Cobrar</Text>
                </View>
            </View>

            <Text style={styles.listHeader}>Últimas Ventas Realizadas</Text>

            {/* FlatList Optimizada */}
            <FlatList
                data={sortedSales}
                renderItem={renderSaleItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyListContainer}>
                        <Text style={styles.emptyText}>No hay ventas registradas.</Text>
                    </View>
                }
                 initialNumToRender={10}
                 maxToRenderPerBatch={5}
                 windowSize={11}
                 ListFooterComponent={<View style={{ height: 20 }} />}
            />
        </View>
    );
};

// --- Estilos (sin cambios) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + 20,
        paddingBottom: 20,
        paddingHorizontal: 20
    },
    backButton: { padding: 10 },
    headerPlaceholder: { width: 44 }, // Para centrar el título si es necesario
    title: { fontSize: 28, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center'},
    metricsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 15, marginBottom: 30, gap: 15 },
    metricBox: { flex: 1, backgroundColor: COLORS.glass, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center' },
    metricIcon: { marginBottom: 10 },
    metricValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 5 },
    metricLabel: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
    listHeader: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, paddingHorizontal: 20, marginBottom: 15 },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 20 },
    emptyListContainer: { alignItems: 'center', marginTop: 30, padding: 20 },
    emptyText: { color: COLORS.textSecondary, textAlign: 'center', fontStyle: 'italic', fontSize: 16 },
    saleCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        padding: 18,
        borderRadius: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder
    },
    saleInfo: {
        flex: 1,
        marginRight: 10
    },
    saleClientName: {
        color: COLORS.textPrimary,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 5
    },
    saleDetails: {
        color: COLORS.textSecondary,
        fontSize: 14
    },
    salePending: {
        color: COLORS.warning,
        fontWeight: 'bold',
        fontSize: 14,
        marginTop: 4
    },
    saleActions: {
        alignItems: 'flex-end'
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        marginBottom: 5,
    },
    statusText: {
        color: COLORS.primaryDark,
        fontSize: 12,
        fontWeight: 'bold'
    },
    saleDateText: {
        color: COLORS.textSecondary,
        fontSize: 12,
        marginTop: 4,
        marginBottom: 4,
    },
    chevronIcon: {
        
    },
});

export default ReportsScreen;