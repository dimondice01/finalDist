// src/screens/reports.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
// Importamos el Timestamp de v9
import { Timestamp } from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
// Usamos el tipo de props de AppNavigator, que ya es correcto
import { ReportsScreenProps, RootStackParamList } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Sale as BaseSale, Client, useData } from '../../context/DataContext';
import { COLORS } from '../../styles/theme';

// Renombramos el tipo local
type Sale = BaseSale;

// --- TIPO PARA EL HOOK useNavigation (Dentro de la card) ---
type ReportsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reports'>;


// --- Funciones Auxiliares (CORREGIDAS v9) ---
const formatJSDate = (dateInput: Sale['fecha']) => {
    let date: Date;
    if (dateInput instanceof Date) { date = dateInput; }
    // --- CORREGIDO: Usamos el Timestamp importado ---
    else if (dateInput instanceof Timestamp) { date = dateInput.toDate(); }
    else if (dateInput && typeof (dateInput as { seconds: number }).seconds === 'number') { date = new Date((dateInput as { seconds: number }).seconds * 1000); }
    else { date = new Date(0); } // Default a una fecha inválida conocida

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

// --- ¡NUEVO! Función de Estilos para los "Pills" de Estado ---
const getStatusStyles = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada':
            return { bg: 'rgba(22, 163, 74, 0.15)', text: COLORS.success, icon: 'check-circle' as keyof typeof Feather.glyphMap };
        case 'Adeuda':
            return { bg: 'rgba(234, 179, 8, 0.15)', text: COLORS.warning, icon: 'alert-circle' as keyof typeof Feather.glyphMap };
        case 'Pendiente de Entrega':
            return { bg: 'rgba(107, 114, 128, 0.15)', text: COLORS.textSecondary, icon: 'clock' as keyof typeof Feather.glyphMap };
        case 'Repartiendo':
            return { bg: 'rgba(59, 130, 246, 0.15)', text: COLORS.primary, icon: 'truck' as keyof typeof Feather.glyphMap }; // Azul para repartiendo
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

    const navigateToDetail = useCallback(() => {
        navigation.navigate('SaleDetail', { saleId: item.id, clientName: item.clientName }); // Pasamos clientName
    }, [item.id, item.clientName, navigation]);

    const clientDisplayName = useMemo(() => getClientDisplayName(item, clients), [item, clients]);
    
    // --- ¡NUEVO! Usamos la función de estilos ---
    const { bg, text, icon } = useMemo(() => getStatusStyles(item.estado), [item.estado]);

    return (
        <TouchableOpacity
            style={styles.saleCard}
            onPress={navigateToDetail}
            activeOpacity={0.7}
        >
            {/* --- ¡NUEVO! Icono de estado --- */}
            <View style={[styles.statusIcon, { backgroundColor: bg }]}>
                <Feather name={icon} size={24} color={text} />
            </View>

            <View style={styles.saleInfo}>
                <Text style={styles.saleClientName} numberOfLines={1}>{clientDisplayName}</Text>
                <Text style={styles.saleDetails}>
                    {formatJSDate(item.fecha)}
                </Text>
                {(item.estado === 'Adeuda' && item.saldoPendiente > 0.01) && (
                    <Text style={styles.salePending}>
                        Saldo: {item.saldoPendiente.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                    </Text>
                )}
            </View>

            <View style={styles.saleActions}>
                <Text style={styles.saleTotal}>
                    {item.totalVenta.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                </Text>
                <Feather name="chevron-right" size={24} color={COLORS.textSecondary} style={styles.chevronIcon}/>
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
                // --- CORREGIDO: Lógica de fecha movida aquí y mejorada ---
                const getDateTimestamp = (fecha: Sale['fecha']): number => {
                    if (!fecha) return 0;
                    if (fecha instanceof Date) return fecha.getTime();
                    if (fecha instanceof Timestamp) return fecha.toMillis(); // <-- CORREGIDO v9
                    if ((fecha as any).seconds) return (fecha as any).seconds * 1000;
                    return 0;
                };
                return getDateTimestamp(b.fecha) - getDateTimestamp(a.fecha);
            });
    }, [allSales]);

    // Cálculo de métricas (ELIMINAMOS COMISIONES)
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
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            {/* Header (ESTANDARIZADO) */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Mis Reportes</Text>
                 <View style={styles.headerButton} />
            </View>

            {/* --- Métricas (SOLO QUEDA DEUDA) --- */}
            <View style={styles.metricsContainer}>
                <View style={styles.metricBox}>
                    <Feather name="alert-circle" size={24} color={COLORS.warning} style={styles.metricIcon} />
                    <View style={styles.metricTextContainer}>
                        <Text style={styles.metricLabel}>Deuda Total por Cobrar</Text>
                        <Text style={styles.metricValue}>
                            {deudaPorCobrar.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                        </Text>
                    </View>
                </View>
            </View>

            <Text style={styles.listHeader}>Historial de Ventas</Text>

            {/* FlatList Optimizada */}
            <FlatList
                data={sortedSales}
                renderItem={renderSaleItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyListContainer}>
                        <Feather name="file-text" size={48} color={COLORS.textSecondary} />
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

// --- ESTILOS (¡MEJORADOS!) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // --- HEADER ESTANDARIZADO ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 20,
        paddingBottom: 20, 
        paddingHorizontal: 10
    },
    headerButton: { 
        padding: 10,
        width: 44,
        alignItems: 'center',
    },
    title: { 
        fontSize: 22, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary 
    },
    // --- FIN HEADER ---
    metricsContainer: { 
        paddingHorizontal: 20, // Alineado
        marginBottom: 20, // Espacio antes de la lista
    },
    metricBox: { 
        // Ya no es flex: 1, ocupa todo el ancho
        backgroundColor: COLORS.glass, 
        padding: 20, 
        borderRadius: 20, 
        borderWidth: 1, 
        borderColor: COLORS.glassBorder, 
        flexDirection: 'row', // Icono al lado del texto
        alignItems: 'center', // Centrado vertical
    },
    metricIcon: { 
        marginRight: 15, // Espacio entre icono y texto
    },
    metricTextContainer: {
        flex: 1, // Ocupa el espacio restante
    },
    metricValue: { 
        fontSize: 24, // Más grande
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        marginBottom: 4, // Espacio
    },
    metricLabel: { 
        fontSize: 14, // Más legible
        color: COLORS.textSecondary, 
    },
    // --- FIN MÉTRICAS ---
    listHeader: { 
        fontSize: 16, 
        fontWeight: '600',
        color: COLORS.textSecondary, // Menos énfasis
        paddingHorizontal: 25,
        marginBottom: 15,
        textTransform: 'uppercase', // Estilo pro
        letterSpacing: 0.5,
    },
    listContentContainer: { 
        paddingHorizontal: 20, // Alineado
        paddingBottom: 20 
    },
    emptyListContainer: { 
        alignItems: 'center', 
        marginTop: 50, 
        padding: 20,
        gap: 20, // Espacio
    },
    emptyText: { 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        fontStyle: 'italic', 
        fontSize: 17 
    },
    // --- TARJETA DE VENTA MEJORADA ---
    saleCard: {
        flexDirection: 'row',
        alignItems: 'center', // Centrado vertical
        backgroundColor: COLORS.glass,
        padding: 16, // Padding estándar
        borderRadius: 16, // Redondeado
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder
    },
    statusIcon: {
        width: 44, // Círculo
        height: 44,
        borderRadius: 22, // Círculo
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        // Color de fondo dinámico
    },
    saleInfo: {
        flex: 1, // Ocupa el espacio
        marginRight: 10
    },
    saleClientName: {
        color: COLORS.textPrimary,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4, // Espacio
    },
    saleDetails: {
        color: COLORS.textSecondary,
        fontSize: 14,
    },
    salePending: {
        color: COLORS.warning,
        fontWeight: 'bold',
        fontSize: 14,
        marginTop: 4
    },
    saleActions: {
        alignItems: 'flex-end' // Alinea a la derecha
    },
    saleTotal: {
        color: COLORS.textPrimary,
        fontSize: 17,
        fontWeight: 'bold',
        marginBottom: 4, // Espacio
    },
    // --- ESTILO DE "PILL" (Eliminado) ---
    // statusBadge: { ... },
    // statusText: { ... },
    // saleDateText: { ... },
    chevronIcon: {
        // No necesita estilos extra
    },
});

export default ReportsScreen;