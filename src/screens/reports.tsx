// src/screens/reports.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import { Timestamp } from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ReportsScreenProps, RootStackParamList } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Sale as BaseSale, Client, useData } from '../../context/DataContext';
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
const getStatusStyles = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada':
            return { bg: 'rgba(20, 184, 166, 0.15)', text: COLORS.success, icon: 'check-circle' as keyof typeof Feather.glyphMap };
        case 'Adeuda':
            return { bg: 'rgba(251, 191, 36, 0.15)', text: COLORS.warning, icon: 'alert-circle' as keyof typeof Feather.glyphMap };
        case 'Pendiente de Entrega':
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'clock' as keyof typeof Feather.glyphMap };
        case 'Repartiendo':
            return { bg: 'rgba(59, 130, 246, 0.15)', text: COLORS.primary, icon: 'truck' as keyof typeof Feather.glyphMap }; // Usamos primary para el color del icono
        case 'Anulada':
            return { bg: 'rgba(239, 68, 68, 0.15)', text: COLORS.danger, icon: 'x-circle' as keyof typeof Feather.glyphMap };
        default:
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'help-circle' as keyof typeof Feather.glyphMap };
    }
};
// --- Fin Funciones Auxiliares ---

// --- Componente Memoizado para el Item de Venta (MEJORADO) ---
const SaleReportCard = memo(({ item, clients }: { item: Sale, clients: Client[] }) => {
    const navigation = useNavigation<ReportsNavigationProp>();

    if (!item || !item.id) return null;

    const clientDisplayName = useMemo(() => getClientDisplayName(item, clients), [item, clients]);
    const { bg, text, icon } = useMemo(() => getStatusStyles(item.estado), [item.estado]);

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
                
                <Text style={styles.saleDetails}>
                    <Text>{formatJSDate(item.fecha)}</Text>
                </Text>
                
                {(item.estado === 'Adeuda' && (item.saldoPendiente || 0) > 0.01) && (
                    <Text style={styles.salePending}>
                        <Text style={{ color: COLORS.warning, fontWeight: 'bold' }}>SALDO: </Text>
                        <Text>{item.saldoPendiente!.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</Text>
                    </Text>
                )}
            </View>

            <View style={styles.saleActions}>
                <Text style={styles.saleTotal}>
                    {item.totalVenta.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                </Text>
                <Feather name="chevron-right" size={SIZES.h3} color={COLORS.textSecondary} style={styles.chevronIcon}/>
            </View>
        </TouchableOpacity>
    );
});
// --- Fin Componente Memoizado ---


const ReportsScreen = ({ navigation }: ReportsScreenProps) => {
    const { sales: allSales = [], isLoading, clients = [] } = useData();

    // Ordenación y filtrado inicial (sin cambios)
    const sortedSales = useMemo(() => {
        if (!Array.isArray(allSales)) return [];
        return allSales
            .filter(sale => sale && sale.id && !(sale.clientName?.startsWith('Cobro Saldo') || sale.clienteNombre?.startsWith('Cobro Saldo')))
            .sort((a, b) => {
                const getDateTimestamp = (fecha: Sale['fecha']): number => {
                    if (!fecha) return 0;
                    if (fecha instanceof Date) return fecha.getTime();
                    if (fecha instanceof Timestamp) return fecha.toMillis();
                    if ((fecha as any).seconds) return (fecha as any).seconds * 1000;
                    return 0;
                };
                return getDateTimestamp(b.fecha) - getDateTimestamp(a.fecha);
            });
    }, [allSales]);

    // Cálculo de métricas (SOLO DEUDA)
    const { deudaPorCobrar } = useMemo(() => {
        if (!Array.isArray(allSales)) return { deudaPorCobrar: 0 };
        let deuda = 0;
        allSales.forEach(sale => {
            if (!sale) return;
            if (sale.estado === 'Adeuda') { deuda += sale.saldoPendiente || 0; }
        });
        return { deudaPorCobrar: deuda };
    }, [allSales]);

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
                        <Text style={styles.emptyText}>No hay ventas registradas.</Text>
                    </View>
                }
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={11}
                ListFooterComponent={<View style={{ height: SIZES.large }} />}
            />
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
});

export default ReportsScreen;