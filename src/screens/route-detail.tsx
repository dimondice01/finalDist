import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
// Eliminamos el 'useRoute' redundante ya que usamos las props.
import { RouteDetailScreenProps } from '../navigation/AppNavigator';

import { useData } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// *******************************************************************
// CORRECCIÓN DE INTERFACES: Definimos el tipo Route completo aquí.
// Idealmente, esto DEBERÍA exportarse desde DataContext.tsx para un uso global.
// *******************************************************************
interface Invoice { id: string; clienteId: string; clienteNombre: string; clienteDireccion: string; totalVenta: number; estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda'; }
interface RouteFull { 
    id: string; 
    nombre: string; 
    facturas: Invoice[]; 
    repartidorId?: string; // Propiedad de DataContext
    fecha?: any; // Propiedad de DataContext
    // Usamos RouteFull para el tipado local.
}

const RouteDetailScreen = ({ navigation, route: { params } }: RouteDetailScreenProps) => {
    // 1. OBTENER PARÁMETROS DE REACT NAVIGATION de forma limpia (vienen en params)
    const { routeId } = params; 
    
    const { routes, clients, syncData } = useData();
    const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
    const [selectedStop, setSelectedStop] = useState<Invoice | null>(null);
    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // CORRECCIÓN 2: Tipamos la búsqueda de ruta usando la interfaz completa.
    const route = useMemo(() => 
        routes.find((r) => r.id === routeId) as RouteFull | undefined, 
    [routes, routeId]); 
    
    const [stops, setStops] = useState<Invoice[]>([]);

    useEffect(() => { 
        // El tipado RouteFull asegura que 'facturas' existe
        if (route) { setStops(route.facturas || []); } 
    }, [route]);

    const handleNavigate = (stop: Invoice) => {
        const client = clients.find(c => c.id === stop.clienteId);
        if (client?.location) {
            const { latitude, longitude } = client.location;
            const url = Platform.select({
                ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
                android: `google.navigation:q=${latitude},${longitude}&mode=d`,
            });
            if (url) Linking.openURL(url).catch(() => Alert.alert("Error", "No se pudo abrir la aplicación de mapas."));
        } else {
            Alert.alert("Sin Ubicación", "Este cliente no tiene una ubicación guardada.");
        }
    };

    const updateStopStatus = async (stop: Invoice, newStatus: 'Pagada' | 'Anulada', paymentDetails = {}) => {
        setIsSaving(true);
        const batch = writeBatch(db);
        const ventaRef = doc(db, 'ventas', stop.id);
        // El campo correcto para la venta es 'estado'
        batch.update(ventaRef, { estado: newStatus, ...paymentDetails });
        
        const routeRef = doc(db, 'rutas', routeId as string);
        const updatedFacturas = stops.map(f => f.id === stop.id ? { ...f, estadoVisita: newStatus } : f);
        batch.update(routeRef, { facturas: updatedFacturas });

        try {
            await batch.commit();
            setStops(updatedFacturas);
            Toast.show({ type: 'success', text1: 'Parada Actualizada' });
            syncData();
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error al actualizar' });
            console.error("Error al actualizar parada:", error);
        } finally {
            setIsSaving(false);
            setPaymentModalVisible(false);
            setSelectedStop(null);
        }
    };

    const handleConfirmPayment = () => {
        if (!selectedStop) return;
        const efectivo = parseFloat(pagoEfectivo) || 0;
        const transferencia = parseFloat(pagoTransferencia) || 0;
        const totalPagado = efectivo + transferencia;
        if (totalPagado <= 0) { Alert.alert("Error", "El monto debe ser mayor a cero."); return; }

        updateStopStatus(selectedStop, 'Pagada', {
            pagoEfectivo: efectivo,
            pagoTransferencia: transferencia,
            saldoPendiente: selectedStop.totalVenta - totalPagado,
        });
    };

    const handleFailedDelivery = (stop: Invoice) => {
        Alert.alert( "Confirmar Entrega Fallida", `¿Seguro que no se pudo entregar a ${stop.clienteNombre}?`,
            [ { text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', style: 'destructive', onPress: () => updateStopStatus(stop, 'Anulada') }]
        );
    };

    if (!route) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Feather name="arrow-left" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                <Text style={styles.title} numberOfLines={1}>{route.nombre}</Text>
            </View>

            <FlatList
                data={stops}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                renderItem={({ item, index }) => (
                    <View style={[styles.card, item.estadoVisita !== 'Pendiente' && styles.cardCompleted]}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.stopNumber}>{index + 1}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>{item.clienteNombre}</Text>
                                <Text style={styles.cardSubtitle}>{item.clienteDireccion}</Text>
                            </View>
                            <View style={styles.statusBadge}><Text style={styles.statusText}>{item.estadoVisita}</Text></View>
                        </View>
                        <View style={styles.cardBody}>
                            <Text style={styles.amountLabel}>Monto a Cobrar:</Text>
                            <Text style={styles.amountValue}>{formatCurrency(item.totalVenta)}</Text>
                        </View>
                        {item.estadoVisita === 'Pendiente' && (
                            <View style={styles.cardActions}>
                                <TouchableOpacity style={styles.actionButton} onPress={() => handleNavigate(item)}><Feather name="map-pin" size={20} color={COLORS.primary} /><Text style={styles.actionButtonText}>Navegar</Text></TouchableOpacity>
                                <TouchableOpacity style={styles.actionButton} onPress={() => handleFailedDelivery(item)}><Feather name="x-circle" size={20} color={COLORS.danger} /><Text style={[styles.actionButtonText, { color: COLORS.danger }]}>No Entregado</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionButton, styles.mainActionButton]} onPress={() => { setSelectedStop(item); setPaymentModalVisible(true); }}>
                                    <Feather name="check-circle" size={20} color={COLORS.primaryDark} /><Text style={[styles.actionButtonText, { color: COLORS.primaryDark }]}>Pagado</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}
            />
            
            <Modal visible={isPaymentModalVisible} transparent={true} animationType="fade" onRequestClose={() => setPaymentModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Registrar Pago</Text>
                        <Text style={styles.modalSubtitle}>Total a Cobrar: {formatCurrency(selectedStop?.totalVenta)}</Text>
                        <View style={styles.inputContainer}><Feather name="dollar-sign" size={20} color={COLORS.textSecondary} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Monto en Efectivo" keyboardType="numeric" value={pagoEfectivo} onChangeText={setPagoEfectivo} /></View>
                        <View style={styles.inputContainer}><Feather name="credit-card" size={20} color={COLORS.textSecondary} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Monto en Transferencia" keyboardType="numeric" value={pagoTransferencia} onChangeText={setPagoTransferencia} /></View>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setPaymentModalVisible(false)}><Text style={styles.cancelButtonText}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleConfirmPayment} disabled={isSaving}>
                                {isSaving ? <ActivityIndicator color={COLORS.primaryDark} /> : <Text style={styles.confirmButtonText}>Confirmar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundEnd },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
    backButton: { position: 'absolute', left: 20, top: 60, padding: 10 },
    title: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary, flex: 1, textAlign: 'center', marginRight: 40 },
    listContentContainer: { padding: 15 },
    card: { backgroundColor: COLORS.glass, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' },
    cardCompleted: { opacity: 0.5 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 15, backgroundColor: 'rgba(0,0,0,0.1)' },
    stopNumber: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, width: 30, textAlign: 'center' },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary },
    cardSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
    statusBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 'auto' },
    statusText: { color: COLORS.primaryDark, fontSize: 12, fontWeight: 'bold' },
    cardBody: { padding: 20, alignItems: 'center' },
    amountLabel: { color: COLORS.textSecondary, fontSize: 14 },
    amountValue: { color: COLORS.textPrimary, fontSize: 32, fontWeight: 'bold' },
    cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.glassBorder },
    actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 8 },
    actionButtonText: { color: COLORS.primary, fontWeight: '600' },
    mainActionButton: { backgroundColor: COLORS.success, borderBottomRightRadius: 20, },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
    modalContent: { width: '90%', backgroundColor: COLORS.backgroundStart, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, marginBottom: 15, height: 58 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
    modalButton: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
    cancelButton: { backgroundColor: COLORS.disabled },
    cancelButtonText: { color: COLORS.textPrimary, fontWeight: 'bold' },
    confirmButton: { backgroundColor: COLORS.primary },
    confirmButtonText: { color: COLORS.primaryDark, fontWeight: 'bold' },
});

export default RouteDetailScreen;