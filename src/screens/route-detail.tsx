// src/screens/route-detail.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { RouteDetailScreenProps } from '../navigation/AppNavigator';

import { useData } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// --- INTERFACES LOCALES ---
interface Invoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda';
    location?: { latitude: number; longitude: number; }; 
    telefono?: string; 
}
interface RouteFull {
    id: string;
    fecha?: Date; 
    estado?: 'Creada' | 'En Curso' | 'Completada';
    facturas: Invoice[];
}
// --- FIN INTERFACES ---


// --- Pantalla Principal: RouteDetailScreen ---
const RouteDetailScreen = ({ route, navigation }: RouteDetailScreenProps) => {
    const routeId = route.params?.routeId;
    // --- INICIO DE CAMBIOS: Traemos syncData ---
    const { routes, clients, syncData } = useData(); 
    // --- FIN DE CAMBIOS ---
    const [isLoading, setIsLoading] = useState(false); 
    const [isUpdating, setIsUpdating] = useState(false); 
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    
    const [cashAmount, setCashAmount] = useState('');
    const [transferAmount, setTransferAmount] = useState('');

    const [localInvoices, setLocalInvoices] = useState<Invoice[]>([]);

    // --- Lógica para obtener la ruta actual (Mantenida) ---
    const currentRoute: RouteFull | undefined = useMemo(() => {
        if (!routeId || !routes) return undefined;
        const foundRoute = routes.find(r => r.id === routeId);
        if (!foundRoute) return undefined;

        const enrichedFacturas = (foundRoute.facturas || []).map(f => {
            const clientData = clients.find(c => c.id === f.clienteId);
            return {
                ...f,
                estadoVisita: f.estadoVisita || 'Pendiente', 
                location: clientData?.location,
                telefono: clientData?.telefono
            };
        });

        let routeDate = foundRoute.fecha;
        if (routeDate && !(routeDate instanceof Date) && (routeDate as any).seconds !== undefined) {
             routeDate = new Timestamp((routeDate as any).seconds, (routeDate as any).nanoseconds).toDate();
        }

        return {
             ...foundRoute,
             fecha: routeDate as Date | undefined, 
             facturas: enrichedFacturas
        };
    }, [routeId, routes, clients]);

    // --- useEffect para inicializar el estado local (Corregido) ---
    useEffect(() => {
        if (currentRoute?.facturas && localInvoices.length === 0) {
            setLocalInvoices(currentRoute.facturas);
        }
    }, [currentRoute, localInvoices.length]);


    // --- Cálculo del Visor/Reporte (usa estado local) ---
    const routeReport = useMemo(() => {
        if (localInvoices.length === 0) return { total: 0, pendientes: 0, entregadas: 0 };
        
        const facturas = localInvoices; 
        const pendientes = facturas.filter(f => f.estadoVisita === 'Pendiente').length;
        const entregadas = facturas.length - pendientes;
        return {
            total: facturas.length,
            pendientes: pendientes,
            entregadas: entregadas,
        };
    }, [localInvoices]); 

    // --- Funciones handleOpenMap y handleCallClient (Mantenidas) ---
    const handleOpenMap = (invoice: Invoice) => {
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
         if (invoice.telefono) {
            Linking.openURL(`tel:${invoice.telefono}`).catch(err => console.error('Error al llamar:', err));
        } else {
            Alert.alert("Teléfono no disponible", "Este cliente no tiene un teléfono registrado.");
        }
    };

    // --- Funciones openPaymentModal (Mantenida) ---
    const openPaymentModal = (invoice: Invoice) => {
        if (invoice.estadoVisita !== 'Pendiente' && invoice.estadoVisita !== 'Adeuda') {
             Toast.show({ type: 'info', text1: 'Estado inválido', text2: 'Solo se pueden cobrar facturas Pendientes o Adeudadas.', position: 'bottom' });
             return;
         }
        setSelectedInvoice(invoice);
        setCashAmount('');
        setTransferAmount('');
        setModalVisible(true);
    };

    // --- Lógica de Pago (Corregida, sin syncData) ---
    const handleConfirmPayment = async () => {
        if (!selectedInvoice) return;

        const cash = parseFloat(cashAmount.replace(',', '.')) || 0;
        const transfer = parseFloat(transferAmount.replace(',', '.')) || 0;
        const totalPaid = cash + transfer;
    
        if (totalPaid <= 0) {
            Alert.alert("Monto inválido", "El monto total pagado debe ser mayor a cero.");
            return;
        }
    
        setIsLoading(true);
    
        const newState = totalPaid >= selectedInvoice.totalVenta ? 'Pagada' : 'Adeuda';
        const saldoPendiente = Math.max(0, selectedInvoice.totalVenta - totalPaid);
    
        try {
            const batch = writeBatch(db);
            const saleRef = doc(db, 'ventas', selectedInvoice.id); 
    
            batch.update(saleRef, {
                estado: newState,
                saldoPendiente: saldoPendiente,
                pagoEfectivo: cash,
                pagoTransferencia: transfer,
                fechaUltimoPago: Timestamp.now()
            });
    
            await batch.commit();

            setLocalInvoices(prevInvoices => 
                prevInvoices.map(inv => 
                    inv.id === selectedInvoice.id 
                        ? { ...inv, estadoVisita: newState } 
                        : inv
                )
            );
    
            Toast.show({ type: 'success', text1: 'Pago Registrado', position: 'bottom' });
            setModalVisible(false);
            setSelectedInvoice(null);
            setCashAmount('');
            setTransferAmount('');
            
        } catch (error: any) {
            console.error("Error al confirmar pago:", error);
            Alert.alert("Error", `No se pudo registrar el pago: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };


    // --- handleMarkAsPending (Corregida, sin syncData) ---
     const handleMarkAsPending = async (invoice: Invoice) => {
        if (invoice.estadoVisita === 'Pendiente') return;
        
        Alert.alert(
            "Revertir a Pendiente",
            `¿Seguro que desea revertir el estado de ${invoice.clienteNombre} a 'Pendiente'? Se restablecerá el saldo deudor.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Revertir", 
                    style: "destructive",
                    onPress: async () => {
                        setIsLoading(true);
                        try {
                            const saleRef = doc(db, 'ventas', invoice.id); 
                            await updateDoc(saleRef, {
                                estado: 'Pendiente de Entrega', 
                                saldoPendiente: invoice.totalVenta,
                                pagoEfectivo: 0,
                                pagoTransferencia: 0,
                            });

                            setLocalInvoices(prevInvoices => 
                                prevInvoices.map(inv => 
                                    inv.id === invoice.id 
                                        ? { ...inv, estadoVisita: 'Pendiente' } 
                                        : inv
                                )
                            );

                            Toast.show({ type: 'info', text1: 'Revertido a Pendiente', position: 'bottom' });

                        } catch (error: any) {
                             console.error("Error al revertir a pendiente:", error);
                             Alert.alert("Error", `No se pudo revertir el estado: ${error.message}`);
                        } finally {
                            setIsLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // --- handleCancelInvoice (Corregida, sin syncData y con toast 'info') ---
    const handleCancelInvoice = async (invoice: Invoice) => {
        if (invoice.estadoVisita === 'Anulada') return;

        Alert.alert(
            "Anular Factura",
            `¿Está seguro que desea ANULAR la visita a ${invoice.clienteNombre}?`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Anular",
                    style: "destructive",
                    onPress: async () => {
                        setIsLoading(true); 
                        try {
                            const saleRef = doc(db, 'ventas', invoice.id);
                            await updateDoc(saleRef, {
                                estado: 'Anulada',
                                saldoPendiente: invoice.totalVenta 
                            });

                            setLocalInvoices(prevInvoices => 
                                prevInvoices.map(inv => 
                                    inv.id === invoice.id 
                                        ? { ...inv, estadoVisita: 'Anulada' } 
                                        : inv
                                )
                            );

                            Toast.show({ type: 'info', text1: 'Visita Anulada', position: 'bottom' });

                        } catch (error: any) {
                            console.error("Error al anular factura:", error);
                            Alert.alert("Error", `No se pudo anular la visita: ${error.message}`);
                        } finally {
                            setIsLoading(false);
                        }
                    }
                }
            ]
        );
    };


    // --- INICIO DE CAMBIOS: Función Finalizar Ruta (AHORA CON syncData) ---
    const handleFinalizeRoute = async () => {
        if (!currentRoute || routeReport.pendientes > 0 || isUpdating) {
            if (routeReport.pendientes > 0) {
                Alert.alert("Ruta Incompleta", `Aún quedan ${routeReport.pendientes} visitas pendientes. No se puede finalizar.`);
            }
            return;
        }

        Alert.alert(
            "Confirmar Finalización",
            "¿Marcar esta ruta como completada?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Finalizar", onPress: async () => {
                        setIsUpdating(true);
                        try {
                            const routeRef = doc(db, 'rutas', currentRoute.id); 
                            await updateDoc(routeRef, {
                                estado: 'Completada'
                            });

                            // --- ¡LA SOLUCIÓN! ---
                            // Forzar la actualización del DataContext ANTES de volver.
                            await syncData();
                            // ---------------------

                            Toast.show({ type: 'success', text1: 'Ruta Finalizada', position: 'bottom' });
                            navigation.goBack(); 
                        } catch (error: any) {
                            console.error("Error al finalizar ruta:", error);
                            Alert.alert("Error", `No se pudo finalizar la ruta: ${error.message}`);
                            setIsUpdating(false); 
                        }
                        // No es necesario un 'finally' aquí si la navegación tiene éxito
                    },
                    style: "destructive"
                }
            ]
        );
    };
    // --- FIN DE CAMBIOS: Función Finalizar Ruta ---

    // --- Lógica de renderizado y manejo de carga (Mantenida) ---
    if (!currentRoute) {
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

    // --- Componente renderInvoice (Mantenido) ---
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

                {/* --- LÓGICA CONDICIONAL DE ACCIONES --- */}

                {(item.estadoVisita === 'Pagada' || item.estadoVisita === 'Anulada' || item.estadoVisita === 'Adeuda') && (
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleMarkAsPending(item)}>
                        <Feather name="rotate-ccw" size={20} color={COLORS.warning} />
                        <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>Pendiente</Text>
                    </TouchableOpacity>
                )}

                {(item.estadoVisita === 'Pendiente' || item.estadoVisita === 'Adeuda') && (
                    <>
                        <TouchableOpacity style={styles.actionButton} onPress={() => handleCancelInvoice(item)}>
                            <Feather name="x-circle" size={20} color={COLORS.danger} />
                            <Text style={[styles.actionButtonText, { color: COLORS.danger }]}>Anular</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.actionButton, styles.mainActionButton]} onPress={() => openPaymentModal(item)}>
                            <Feather name="dollar-sign" size={20} color={COLORS.primaryDark} />
                            <Text style={[styles.actionButtonText, { color: COLORS.primaryDark, fontWeight: 'bold' }]}>Cobrar</Text>
                        </TouchableOpacity>
                    </>
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
                {/* Botón Finalizar */}
                <TouchableOpacity
                    onPress={handleFinalizeRoute}
                    style={styles.headerButton}
                    disabled={routeReport.pendientes > 0 || isUpdating || currentRoute.estado === 'Completada'}
                >
                    {isUpdating ? (
                        <ActivityIndicator color={COLORS.success} size="small" />
                    ) : (
                        <Feather
                            name="check-circle"
                            size={24}
                            color={routeReport.pendientes === 0 && currentRoute.estado !== 'Completada' ? COLORS.success : COLORS.disabled}
                        />
                    )}
                </TouchableOpacity>
            </View>

            {/* Visor/Reporte */}
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

            {/* FlatList */}
            <FlatList
                data={localInvoices} 
                renderItem={renderInvoice}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>Esta ruta no tiene facturas asignadas.</Text>}
                extraData={localInvoices} 
            />

            {/* Modal de Pago */}
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
                                placeholder="Monto en Efectivo"
                                placeholderTextColor={COLORS.textSecondary}
                                value={cashAmount}
                                onChangeText={setCashAmount}
                                keyboardType="numeric"
                                autoFocus={true}
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Feather name="credit-card" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Monto Transferencia"
                                placeholderTextColor={COLORS.textSecondary}
                                value={transferAmount}
                                onChangeText={setTransferAmount}
                                keyboardType="numeric"
                            />
                        </View>

                        <TouchableOpacity 
                            style={styles.totalButton} 
                            onPress={() => {
                                setCashAmount(selectedInvoice?.totalVenta.toString() ?? '0');
                                setTransferAmount(''); 
                            }}>
                            <Text style={styles.totalButtonText}>Asignar Total a Efectivo</Text>
                        </TouchableOpacity>


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

// --- Estilos --- (Sin cambios)
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, paddingBottom: 15, paddingHorizontal: 10 },
    headerButton: { padding: 10, width: 44, alignItems: 'center' }, 
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    reportContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center', 
        paddingVertical: 10, 
        paddingHorizontal: 10,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderBottomWidth: 1,
        borderTopWidth: 1,
        borderColor: COLORS.glassBorder,
        marginBottom: 10,
    },
    reportItem: {
        alignItems: 'center',
        flex: 1, 
    },
    reportValue: {
        fontSize: 22, 
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    reportLabel: {
        fontSize: 13, 
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    reportSeparator: {
        width: 1,
        height: '60%', 
        backgroundColor: COLORS.glassBorder,
    },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 30 },
    emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 50, fontSize: 16 },
    invoiceCard: { backgroundColor: COLORS.glass, borderRadius: 15, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.glassBorder },
    invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
    invoiceClientName: { color: COLORS.textPrimary, fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
    invoiceAddress: { color: COLORS.textSecondary, fontSize: 14 },
    invoiceTotal: { color: COLORS.primary, fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
    invoiceActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.glassBorder, backgroundColor: 'rgba(0,0,0,0.1)' }, 
    actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, borderRightWidth: 1, borderRightColor: COLORS.glassBorder}, 
    actionButtonText: { color: COLORS.primary, fontWeight: '500', fontSize: 12 }, 
    mainActionButton: { backgroundColor: COLORS.success }, 
    statusBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusBadgeText: { fontSize: 12, fontWeight: 'bold' },
    statusPendiente: { borderColor: COLORS.warning },
    statusPagada: { borderColor: COLORS.success },
    statusAdeuda: { borderColor: COLORS.white },
    statusAnulada: { borderColor: COLORS.danger, opacity: 0.7 },
    modalOverlay: { 
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)'
    },
    modalContent: { width: '90%', backgroundColor: COLORS.backgroundStart, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 5 }, 
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, marginBottom: 15, height: 58 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
    modalButton: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
    cancelButton: { backgroundColor: COLORS.disabled },
    confirmButton: { backgroundColor: COLORS.primary },
    buttonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
    totalButton: {
        backgroundColor: COLORS.glass,
        borderColor: COLORS.primary,
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
        alignItems: 'center',
        marginBottom: 20, 
        marginTop: 5, 
    },
    totalButtonText: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default RouteDetailScreen;