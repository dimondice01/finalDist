// src/screens/route-detail.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// --- INICIO DE CAMBIOS: Importaciones ---
import { doc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'; // <-- Añadido updateDoc y Timestamp
// --- FIN DE CAMBIOS: Importaciones ---
import React, { useMemo, useState } from 'react'; // <-- Añadido useCallback y memo
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { RouteDetailScreenProps } from '../navigation/AppNavigator'; // <-- Corregido para usar 'type'

import { useData } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// --- INTERFACES LOCALES --- (Mantenidas como en tu archivo original)
interface Invoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda';
    location?: { latitude: number; longitude: number; }; // Añadido opcional
    telefono?: string; // Añadido opcional
}
interface RouteFull {
    id: string;
    fecha?: Date; // Asumimos Date
    estado?: 'Creada' | 'En Curso' | 'Completada';
    facturas: Invoice[];
}
// --- FIN INTERFACES ---


// --- Pantalla Principal: RouteDetailScreen ---
const RouteDetailScreen = ({ route, navigation }: RouteDetailScreenProps) => {
    const routeId = route.params?.routeId;
    const { routes, clients, syncData } = useData(); // Obtenemos clients para tel/mapa
    const [isLoading, setIsLoading] = useState(false); // Para lógica de pago
    const [isUpdating, setIsUpdating] = useState(false); // Para botón Finalizar
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');

    // --- Lógica para obtener y enriquecer la ruta actual (Mantenida) ---
    const currentRoute: RouteFull | undefined = useMemo(() => {
        if (!routeId || !routes) return undefined;
        const foundRoute = routes.find(r => r.id === routeId);
        if (!foundRoute) return undefined;

        // Mapeamos facturas y añadimos datos del cliente
        const enrichedFacturas = (foundRoute.facturas || []).map(f => {
            const clientData = clients.find(c => c.id === f.clienteId);
            return {
                ...f,
                estadoVisita: f.estadoVisita || 'Pendiente', // Estado por defecto
                location: clientData?.location,
                telefono: clientData?.telefono
            };
        });

        // Aseguramos que 'fecha' sea Date si viene como Timestamp
        let routeDate = foundRoute.fecha;
        if (routeDate && !(routeDate instanceof Date) && (routeDate as any).seconds !== undefined) {
             routeDate = new Timestamp((routeDate as any).seconds, (routeDate as any).nanoseconds).toDate();
        }

        return {
             ...foundRoute,
             fecha: routeDate as Date | undefined, // Casteamos a Date
             facturas: enrichedFacturas
        };
    }, [routeId, routes, clients]);

    // --- INICIO DE CAMBIOS: Cálculo del Visor/Reporte ---
    const routeReport = useMemo(() => {
        if (!currentRoute) return { total: 0, pendientes: 0, entregadas: 0 };
        const facturas = currentRoute.facturas;
        const pendientes = facturas.filter(f => f.estadoVisita === 'Pendiente').length;
        const entregadas = facturas.length - pendientes; // Asumimos que cualquier no-pendiente es "entregada" para el contador
        return {
            total: facturas.length,
            pendientes: pendientes,
            entregadas: entregadas, // Calculamos las entregadas (no pendientes)
        };
    }, [currentRoute]);
    // --- FIN DE CAMBIOS: Cálculo del Visor/Reporte ---

    // --- Funciones handleOpenMap y handleCallClient (Mantenidas) ---
    const handleOpenMap = (invoice: Invoice) => {
        // ... (tu lógica existente)
        if (invoice.location) {
            const { latitude, longitude } = invoice.location;
            const url = Platform.select({
                ios: `maps:${latitude},${longitude}?q=${invoice.clienteDireccion}`,
                android: `geo:${latitude},${longitude}?q=${invoice.clienteDireccion}`,
            });
            Linking.openURL(url!).catch(err => console.error('Error al abrir mapas:', err));
        } else {
            Alert.alert("Ubicación no disponible", "Este cliente no tiene una ubicación registrada.");
        }
    };

    const handleCallClient = (invoice: Invoice) => {
        // ... (tu lógica existente)
         if (invoice.telefono) {
            Linking.openURL(`tel:${invoice.telefono}`).catch(err => console.error('Error al llamar:', err));
        } else {
            Alert.alert("Teléfono no disponible", "Este cliente no tiene un teléfono registrado.");
        }
    };

    // --- Funciones openPaymentModal y handleConfirmPayment (Mantenidas) ---
    const openPaymentModal = (invoice: Invoice) => {
        // ... (tu lógica existente)
        if (invoice.estadoVisita !== 'Pendiente' && invoice.estadoVisita !== 'Adeuda') {
             Toast.show({ type: 'info', text1: 'Estado inválido', text2: 'Solo se pueden cobrar facturas Pendientes o Adeudadas.', position: 'bottom' });
             return;
         }
        setSelectedInvoice(invoice);
        setPaymentAmount(invoice.totalVenta.toString());
        setModalVisible(true);
    };

    const handleConfirmPayment = async () => {
        // ... (tu lógica existente con writeBatch) ...
        if (!selectedInvoice) return;
        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) { Alert.alert("Monto inválido"); return; }
        setIsLoading(true);
        const newState = amount >= selectedInvoice.totalVenta ? 'Pagada' : 'Adeuda';
        const saldoPendiente = Math.max(0, selectedInvoice.totalVenta - amount);
        try {
            const batch = writeBatch(db);
            const saleRef = doc(db, 'sales', selectedInvoice.id); // Asume colección 'sales'
            batch.update(saleRef, { estado: newState, saldoPendiente: saldoPendiente });
            // Puedes añadir registro de pago aquí si quieres
            await batch.commit();
            Toast.show({ type: 'success', text1: 'Pago Registrado', position: 'bottom' });
            setModalVisible(false);
            setSelectedInvoice(null);
            setPaymentAmount('');
            await syncData(); // Actualizar datos
        } catch (error: any) {
            console.error("Error al confirmar pago:", error);
            Alert.alert("Error", `No se pudo registrar el pago: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Función handleMarkAsPending (Mantenida) ---
     const handleMarkAsPending = async (invoice: Invoice) => {
        // ... (tu lógica existente con updateDoc) ...
        if (invoice.estadoVisita === 'Pendiente') return;
        // Confirmación podría ser útil aquí
        setIsLoading(true); // Reutilizamos isLoading para indicar carga
        try {
            const saleRef = doc(db, 'sales', invoice.id); // Asume colección 'sales'
            await updateDoc(saleRef, {
                estado: 'Pendiente de Entrega', // Asegúrate que este sea el estado correcto en 'sales'
                saldoPendiente: invoice.totalVenta // Restablecer saldo
                // Resetea otros campos de pago si es necesario
            });
            Toast.show({ type: 'info', text1: 'Revertido a Pendiente', position: 'bottom' });
            await syncData(); // Actualizar datos locales
        } catch (error: any) {
             console.error("Error al revertir a pendiente:", error);
             Alert.alert("Error", `No se pudo revertir el estado: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // --- INICIO DE CAMBIOS: Función Finalizar Ruta ---
    const handleFinalizeRoute = async () => {
        if (!currentRoute || routeReport.pendientes > 0 || isUpdating) return;

        Alert.alert(
            "Confirmar Finalización",
            "¿Marcar esta ruta como completada?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Finalizar", onPress: async () => {
                        setIsUpdating(true);
                        try {
                            const routeRef = doc(db, 'rutas', currentRoute.id); // Asegúrate que la colección sea 'rutas'
                            await updateDoc(routeRef, {
                                estado: 'Completada'
                            });
                            Toast.show({ type: 'success', text1: 'Ruta Finalizada', position: 'bottom' });
                            navigation.goBack(); // Volver a la lista de rutas
                        } catch (error: any) {
                            console.error("Error al finalizar ruta:", error);
                            Alert.alert("Error", `No se pudo finalizar la ruta: ${error.message}`);
                            setIsUpdating(false); // Permitir reintentar si falla
                        }
                        // No ponemos finally aquí, la navegación cierra la pantalla si tiene éxito
                    },
                    style: "destructive"
                }
            ]
        );
    };
    // --- FIN DE CAMBIOS: Función Finalizar Ruta ---

    // --- Lógica de renderizado y manejo de carga (Mantenida) ---
    if (!currentRoute) {
        // ... (tu pantalla de carga o error existente) ...
        return (
             <SafeAreaView style={styles.container}>
                 <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
                 <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
                 <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                        <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Cargando...</Text>
                    <View style={styles.headerButton} />
                </View>
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    // --- Componente para renderizar cada factura (Mantenido) ---
    const renderInvoice = ({ item }: { item: Invoice }) => (
        <View style={[styles.invoiceCard, styles[`status${item.estadoVisita}`]]}>
            <View style={styles.invoiceHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.invoiceClientName} numberOfLines={1}>{item.clienteNombre}</Text>
                    <Text style={styles.invoiceAddress} numberOfLines={1}>{item.clienteDireccion || 'Dirección no disponible'}</Text>
                </View>
                <Text style={styles.invoiceTotal}>{formatCurrency(item.totalVenta)}</Text>
            </View>

            <View style={styles.invoiceActions}>
                {/* Botones Mapa y Llamar */}
                <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMap(item)} disabled={!item.location}>
                    <Feather name="map-pin" size={20} color={item.location ? COLORS.primary : COLORS.disabled} />
                    <Text style={[styles.actionButtonText, !item.location && { color: COLORS.disabled }]}>Mapa</Text>
                </TouchableOpacity>
                 <TouchableOpacity style={styles.actionButton} onPress={() => handleCallClient(item)} disabled={!item.telefono}>
                    <Feather name="phone" size={20} color={item.telefono ? COLORS.primary : COLORS.disabled} />
                    <Text style={[styles.actionButtonText, !item.telefono && { color: COLORS.disabled }]}>Llamar</Text>
                </TouchableOpacity>

                 {/* Botón Revertir (si no está pendiente) */}
                {item.estadoVisita !== 'Pendiente' && (
                    <TouchableOpacity style={[styles.actionButton, { flex: 0.5 }]} onPress={() => handleMarkAsPending(item)}>
                        <Feather name="rotate-ccw" size={18} color={COLORS.warning} />
                        {/* <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>Pend.</Text> */}
                    </TouchableOpacity>
                )}

                 {/* Botones de Pago (si está pendiente o adeuda) */}
                 {(item.estadoVisita === 'Pendiente' || item.estadoVisita === 'Adeuda') && (
                     <TouchableOpacity style={[styles.actionButton, styles.mainActionButton]} onPress={() => openPaymentModal(item)}>
                         <Feather name="dollar-sign" size={20} color={COLORS.primaryDark} />
                         <Text style={[styles.actionButtonText, { color: COLORS.primaryDark, fontWeight: 'bold' }]}>Cobrar</Text>
                     </TouchableOpacity>
                 )}
            </View>
             <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{item.estadoVisita}</Text>
            </View>
        </View>
    );

    // --- Renderizado Principal ---
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

             <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Detalle de Ruta</Text>
                {/* --- INICIO DE CAMBIOS: Botón Finalizar --- */}
                <TouchableOpacity
                    onPress={handleFinalizeRoute}
                    style={styles.headerButton}
                    // Deshabilitado si hay pendientes, está actualizando, o la ruta YA está completada
                    disabled={routeReport.pendientes > 0 || isUpdating || currentRoute.estado === 'Completada'}
                >
                    {isUpdating ? (
                        <ActivityIndicator color={COLORS.success} size="small" />
                    ) : (
                        <Feather
                            name="check-circle"
                            size={24}
                            // Verde solo si NO hay pendientes y la ruta NO está completada
                            color={routeReport.pendientes === 0 && currentRoute.estado !== 'Completada' ? COLORS.success : COLORS.disabled}
                        />
                    )}
                </TouchableOpacity>
                {/* --- FIN DE CAMBIOS: Botón Finalizar --- */}
            </View>

            {/* --- INICIO DE CAMBIOS: Visor/Reporte --- */}
            <View style={styles.reportContainer}>
                <View style={styles.reportItem}>
                    <Text style={[styles.reportValue, { color: COLORS.primary }]}>{routeReport.entregadas}</Text>
                    <Text style={styles.reportLabel}>Entregadas</Text>
                </View>
                <View style={styles.reportSeparator} />
                <View style={styles.reportItem}>
                    <Text style={[styles.reportValue, { color: COLORS.warning }]}>{routeReport.pendientes}</Text>
                    <Text style={styles.reportLabel}>Pendientes</Text>
                </View>
                 <View style={styles.reportSeparator} />
                <View style={styles.reportItem}>
                    <Text style={styles.reportValue}>{routeReport.total}</Text>
                    <Text style={styles.reportLabel}>Total</Text>
                </View>
            </View>
            {/* --- FIN DE CAMBIOS: Visor/Reporte --- */}

            <FlatList
                data={currentRoute.facturas}
                renderItem={renderInvoice}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>Esta ruta no tiene facturas asignadas.</Text>}
            />

            {/* Modal de Pago (Mantenido) */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Registrar Pago</Text>
                        <Text style={styles.modalSubtitle}>{selectedInvoice?.clienteNombre}</Text>
                        <Text style={[styles.modalSubtitle, { fontWeight: 'bold', marginBottom: 20 }]}>Total: {formatCurrency(selectedInvoice?.totalVenta)}</Text>

                        <View style={styles.inputContainer}>
                            <Feather name="dollar-sign" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Monto Pagado"
                                placeholderTextColor={COLORS.textSecondary}
                                value={paymentAmount}
                                onChangeText={setPaymentAmount}
                                keyboardType="numeric"
                                autoFocus={true}
                            />
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                                <Text style={[styles.buttonText, { color: COLORS.textSecondary }]}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmButton, isLoading && { opacity: 0.7 }]}
                                onPress={handleConfirmPayment}
                                disabled={isLoading}
                            >
                                {isLoading ? <ActivityIndicator color={COLORS.primaryDark} /> : <Text style={styles.buttonText}>Confirmar Pago</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
};

// --- Estilos --- (Añadidos estilos para el reporte)
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, paddingBottom: 15, paddingHorizontal: 10 },
    headerButton: { padding: 10, width: 44, alignItems: 'center' }, // Fixed width
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    // --- INICIO DE CAMBIOS: Estilos Reporte/Visor ---
    reportContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center', // Centrar verticalmente
        paddingVertical: 10, // Menos padding vertical
        paddingHorizontal: 10,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderBottomWidth: 1,
        borderTopWidth: 1,
        borderColor: COLORS.glassBorder,
        marginBottom: 10,
    },
    reportItem: {
        alignItems: 'center',
        flex: 1, // Para que ocupen espacio equitativo
    },
    reportValue: {
        fontSize: 22, // Más grande
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    reportLabel: {
        fontSize: 13, // Un poco más grande
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    reportSeparator: {
        width: 1,
        height: '60%', // Altura relativa al contenedor
        backgroundColor: COLORS.glassBorder,
    },
    // --- FIN DE CAMBIOS: Estilos Reporte/Visor ---
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 30 },
    emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 50, fontSize: 16 },
    invoiceCard: { backgroundColor: COLORS.glass, borderRadius: 15, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.glassBorder },
    invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
    invoiceClientName: { color: COLORS.textPrimary, fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
    invoiceAddress: { color: COLORS.textSecondary, fontSize: 14 },
    invoiceTotal: { color: COLORS.primary, fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
    invoiceActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.glassBorder, backgroundColor: 'rgba(0,0,0,0.1)' }, // Quitar justifyContent
    actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, borderRightWidth: 1, borderRightColor: COLORS.glassBorder}, // Añadir borde
    actionButtonText: { color: COLORS.primary, fontWeight: '500', fontSize: 12 }, // Más pequeño
    mainActionButton: { backgroundColor: COLORS.success /*borderBottomRightRadius: 20,*/ }, // Quitar redondeo
    statusBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusBadgeText: { fontSize: 12, fontWeight: 'bold' },
    // --- INICIO CORRECCIÓN: Estilos por estado (React Native) ---
    // Aplicamos el borde directamente al invoiceCard
    statusPendiente: { borderColor: COLORS.warning },
    statusPagada: { borderColor: COLORS.success },
    statusAdeuda: { borderColor: COLORS.white },
    statusAnulada: { borderColor: COLORS.danger, opacity: 0.7 },
    // Para los badges, necesitamos lógica en el componente renderInvoice o estilos condicionales
    // (Este bloque se elimina porque no es sintaxis StyleSheet válida)
    // --- FIN CORRECCIÓN: Estilos por estado ---

    // Estilos Modal
    modalOverlay: { // <-- AÑADIDO
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)'
    },
    modalContent: { width: '90%', backgroundColor: COLORS.backgroundStart, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 5 }, // Reducido marginBottom
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, marginBottom: 15, height: 58 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
    modalButton: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
    cancelButton: { backgroundColor: COLORS.disabled },
    confirmButton: { backgroundColor: COLORS.primary },
    buttonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
});

export default RouteDetailScreen;