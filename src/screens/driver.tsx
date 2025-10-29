import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, increment, onSnapshot, runTransaction, Timestamp, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { RouteDetailScreenProps } from '../navigation/AppNavigator'; // Importamos tipos de props

import { useData } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- INTERFACES (RENOMBRADAS PARA EVITAR COLISIÓN CON DATA CONTEXT) ---
interface DriverItem {
    productId: string;
    nombre: string;
    quantity: number;
    precio: number;
}
interface DriverInvoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda';
    items: DriverItem[];
}
interface DriverRoute {
    id: string;
    nombre: string;
    estado: string;
    repartidorId: string;
    facturas: DriverInvoice[];
}

// --- HELPERS ---
const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// =================================================================================
// --- MODAL DE AJUSTE DE ENTREGA ---
// =================================================================================
interface DeliveryAdjustmentModalProps {
    visible: boolean;
    onClose: () => void;
    stop: DriverInvoice; // Usamos el tipo corregido
    routeId: string;
    onConfirm: (updatedStop: DriverInvoice) => void; // Usamos el tipo corregido
}

const DeliveryAdjustmentModal = ({ visible, onClose, stop, routeId, onConfirm }: DeliveryAdjustmentModalProps) => {
    const [modifiedItems, setModifiedItems] = useState<DriverItem[]>([]); // Usamos el tipo corregido
    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (stop) {
            setModifiedItems(JSON.parse(JSON.stringify(stop.items || [])));
        }
    }, [stop]);

    const newTotalVenta = useMemo(() => {
        return modifiedItems.reduce((total, item) => total + (item.precio * item.quantity), 0);
    }, [modifiedItems]);

    const handleQuantityChange = (productId: string, change: 'increment' | 'decrement') => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setModifiedItems(currentItems => {
            return currentItems.map(item => {
                if (item.productId === productId) {
                    const newQuantity = change === 'increment' ? item.quantity + 1 : Math.max(0, item.quantity - 1);
                    return { ...item, quantity: newQuantity };
                }
                return item;
            }).filter(item => item.quantity > 0);
        });
    };
    
    // --- LÓGICA DE TRANSACCIÓN ---
    const executeTransaction = async () => {
        setIsSaving(true);
        const efectivo = parseFloat(pagoEfectivo) || 0;
        const transferencia = parseFloat(pagoTransferencia) || 0;
        const totalPagado = efectivo + transferencia;

        try {
            const finalStatus = totalPagado < newTotalVenta ? 'Adeuda' : 'Pagada';

            await runTransaction(db, async (transaction) => {
                const ventaRef = doc(db, 'ventas', stop.id);
                const routeRef = doc(db, 'rutas', routeId);
                const routeDoc = await transaction.get(routeRef);
                if (!routeDoc.exists()) throw new Error("La ruta no fue encontrada.");

                const originalItemsMap = new Map(stop.items.map(i => [i.productId, i.quantity]));
                const modifiedItemsMap = new Map(modifiedItems.map(i => [i.productId, i.quantity]));

                // Ajuste de Stock
                for (const [productId, originalQty] of originalItemsMap.entries()) {
                    const newQty = modifiedItemsMap.get(productId) || 0;
                    if (originalQty - newQty !== 0) {
                        const productRef = doc(db, 'productos', productId);
                        transaction.update(productRef, { stock: increment(originalQty - newQty) });
                    }
                }

                transaction.update(ventaRef, {
                    estado: finalStatus, 
                    items: modifiedItems,
                    totalVenta: newTotalVenta,
                    pagoEfectivo: efectivo,
                    pagoTransferencia: transferencia,
                    saldoPendiente: newTotalVenta - totalPagado,
                    fechaRendicion: Timestamp.now(),
                });

                const routeData = routeDoc.data() as DriverRoute; // Usamos el tipo corregido
                const updatedFacturas = routeData.facturas.map(f =>
                    f.id === stop.id ? { ...f, estadoVisita: finalStatus, totalVenta: newTotalVenta, items: modifiedItems } : f
                ) as DriverInvoice[]; // Usamos el tipo corregido
                transaction.update(routeRef, { facturas: updatedFacturas });
            });

            Toast.show({ type: 'success', text1: `Entrega guardada como "${finalStatus}"` });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onConfirm({ ...stop, estadoVisita: finalStatus, totalVenta: newTotalVenta, items: modifiedItems });
            onClose();

        } catch (error) {
            console.error("Error en la transacción de entrega:", error);
            Toast.show({ type: 'error', text1: (error as Error).message || 'Error al guardar.' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelivery = async () => {
        const totalPagado = (parseFloat(pagoEfectivo) || 0) + (parseFloat(pagoTransferencia) || 0);
        if (totalPagado > newTotalVenta) {
            Alert.alert("Error", `El monto pagado (${formatCurrency(totalPagado)}) no puede ser mayor al total de la factura (${formatCurrency(newTotalVenta)}).`);
            return;
        }
        if (totalPagado < newTotalVenta) {
             Alert.alert("Saldo Pendiente", `La factura se marcará como "Adeuda" con un saldo de ${formatCurrency(newTotalVenta - totalPagado)}. ¿Continuar?`, [
                 { text: 'No', style: 'cancel' },
                 { text: 'Sí, Continuar', onPress: executeTransaction }
             ]);
        } else {
           await executeTransaction();
        }
    };

    if (!stop) return null;

    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.adjustmentModalContent}>
                    <Text style={styles.modalTitle}>Gestionar Entrega</Text>
                    <Text style={styles.modalSubtitle}>{stop.clienteNombre}</Text>
                    <FlatList data={modifiedItems} keyExtractor={item => item.productId} renderItem={({ item }) => (<View style={styles.itemRow}><Text style={styles.itemName} numberOfLines={1}>{item.nombre}</Text><View style={styles.quantityControl}><TouchableOpacity style={styles.quantityButton} onPress={() => handleQuantityChange(item.productId, 'decrement')}><Feather name="minus" size={16} color={COLORS.primary} /></TouchableOpacity><Text style={styles.quantityText}>{item.quantity}</Text><TouchableOpacity style={styles.quantityButton} onPress={() => handleQuantityChange(item.productId, 'increment')}><Feather name="plus" size={16} color={COLORS.primary} /></TouchableOpacity></View><Text style={styles.itemTotal}>{formatCurrency(item.precio * item.quantity)}</Text></View>)} style={styles.itemList}/>
                    <View style={styles.summaryContainer}><Text style={styles.summaryLabel}>Total Original:</Text><Text style={styles.summaryValueOriginal}>{formatCurrency(stop.totalVenta)}</Text><Text style={styles.summaryLabel}>Nuevo Total a Cobrar:</Text><Text style={styles.summaryValueFinal}>{formatCurrency(newTotalVenta)}</Text></View>
                    <View style={styles.inputContainer}><Feather name="dollar-sign" size={20} color={COLORS.textSecondary} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Monto en Efectivo" keyboardType="numeric" value={pagoEfectivo} onChangeText={setPagoEfectivo} /></View>
                    <View style={styles.inputContainer}><Feather name="credit-card" size={20} color={COLORS.textSecondary} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Monto en Transferencia" keyboardType="numeric" value={pagoTransferencia} onChangeText={setPagoTransferencia} /></View>
                    <View style={styles.modalButtons}><TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}><Text style={styles.cancelButtonText}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleConfirmDelivery} disabled={isSaving}>{isSaving ? <ActivityIndicator color={COLORS.primaryDark} /> : <Text style={styles.confirmButtonText}>Confirmar</Text>}</TouchableOpacity></View>
                </View>
            </View>
        </Modal>
    );
};


// =================================================================================
// --- PANTALLA DE DETALLE DE RUTA (Stack Screen) ---
// =================================================================================
const DriverScreen = ({ navigation, route: routeProps }: RouteDetailScreenProps) => {
    const { routeId } = routeProps.params;
    
    // routes de useData tiene el tipo simple Route, lo casteamos a DriverRoute.
    const { clients, routes, syncData } = useData();
    const routeData = useMemo(() => routes.find((r) => r.id === routeId) as DriverRoute | undefined, [routes, routeId]);

    const [route, setRoute] = useState<DriverRoute | null>(routeData || null); // Usamos el tipo corregido
    
    // Usaremos onSnapshot para la ruta actual para tener updates en tiempo real
    useEffect(() => {
        if (!routeId) return;
        const routeRef = doc(db, 'rutas', routeId);
        const unsubscribe = onSnapshot(routeRef, (docSnap) => {
            if (docSnap.exists()) {
                // CASTING: Casteamos el resultado de Firestore al tipo completo esperado
                setRoute(docSnap.data() as DriverRoute); 
            } else {
                setRoute(null);
                navigation.goBack();
            }
        }, (error) => {
            console.error("Error al sincronizar ruta:", error);
            Toast.show({ type: 'error', text1: 'Error de sincronización de ruta.' });
        });

        return () => unsubscribe();
    }, [routeId, navigation]);

    const [isAdjustmentModalVisible, setAdjustmentModalVisible] = useState(false);
    const [selectedStop, setSelectedStop] = useState<DriverInvoice | null>(null); // Usamos el tipo corregido
    const [isSaving, setIsSaving] = useState(false);

    // stops ahora usa el tipo correcto del estado local
    const stops = route?.facturas || []; 
    const areAllStopsCompleted = useMemo(() => stops.every(stop => stop.estadoVisita !== 'Pendiente'), [stops]);

    const handleNavigate = (stop: DriverInvoice) => { 
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
        const client = clients.find(c => c.id === stop.clienteId); 
        if (client?.location) { 
            const { latitude, longitude } = client.location; 
            const url = Platform.select({ 
                ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`, 
                android: `google.navigation:q=${latitude},${longitude}&mode=d` 
            }); 
            if (url) Linking.openURL(url).catch(() => Alert.alert("Error", "No se pudo abrir la aplicación de mapas.")); 
        } else { 
            Alert.alert("Sin Ubicación", "Este cliente no tiene una ubicación guardada."); 
        } 
    };

    const handleFailedDelivery = (stop: DriverInvoice) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert("Confirmar Entrega Fallida", `¿Seguro que no se pudo entregar a ${stop.clienteNombre}?`,
            [{ text: 'Cancelar', style: 'cancel' }, {
                text: 'Confirmar', style: 'destructive', onPress: async () => {
                    const batch = writeBatch(db);
                    const ventaRef = doc(db, 'ventas', stop.id);
                    const routeRef = doc(db, 'rutas', routeId);

                    batch.update(ventaRef, { estado: 'Anulada' });
                    
                    const updatedFacturas = stops.map(f => f.id === stop.id ? { ...f, estadoVisita: 'Anulada' as const } : f) as DriverInvoice[];
                    
                    batch.update(routeRef, { facturas: updatedFacturas });
                    
                    stop.items.forEach(item => {
                        const productRef = doc(db, 'productos', item.productId);
                        batch.update(productRef, { stock: increment(item.quantity) });
                    });

                    try {
                        await batch.commit();
                        syncData(); // Sincroniza después del batch
                        Toast.show({ type: 'info', text1: `Parada marcada como Anulada` });
                    } catch (error) {
                        console.error("Error al anular entrega: ", error);
                        Toast.show({ type: 'error', text1: 'Error al anular la entrega.' });
                    }
                }
            }]
        );
    };
    
    const handleConfirmAndUpdateUI = (updatedStop: DriverInvoice) => { 
        const updatedFacturas = stops.map(s => s.id === updatedStop.id ? updatedStop : s) as DriverInvoice[];
        setRoute(prev => prev ? { ...prev, facturas: updatedFacturas } : null);
        syncData(); // Sincroniza los datos
    };
    
    const handleOpenAdjustmentModal = (stop: DriverInvoice) => { setSelectedStop(stop); setAdjustmentModalVisible(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); };

    const handleCompleteRoute = async () => { 
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
        Alert.alert("Finalizar Ruta", "¿Estás seguro de que has completado todas las entregas?", 
        [{ text: 'Cancelar', style: 'cancel' }, 
        { text: 'Sí, Finalizar', style: 'default', onPress: async () => { 
            setIsSaving(true); 
            try { 
                await runTransaction(db, async (transaction) => { 
                    const routeRef = doc(db, 'rutas', routeId); 
                    const routeDoc = await transaction.get(routeRef); 
                    if (!routeDoc.exists() || routeDoc.data().estado !== 'En Curso') throw new Error("Esta ruta ya no está en curso."); 
                    transaction.update(routeRef, { estado: 'Completada' }); 
                }); 
                Toast.show({ type: 'success', text1: '¡Ruta completada con éxito!' }); 
                navigation.goBack(); // Vuelve al Home del Repartidor
                syncData(); // Sincroniza el estado final
            } catch (error) { 
                Toast.show({ type: 'error', text1: 'Error al finalizar la ruta' }); 
                console.error("Error al finalizar la ruta:", error); 
            } finally { 
                setIsSaving(false); 
            } 
        } }]); 
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
                renderItem={({ item, index }) => {
                    const statusColor = item.estadoVisita === 'Pagada' ? COLORS.success 
                                      : item.estadoVisita === 'Anulada' ? COLORS.danger
                                      : item.estadoVisita === 'Adeuda' ? COLORS.warning
                                      : COLORS.primary;

                    return (
                        <View style={[styles.card, item.estadoVisita !== 'Pendiente' && styles.cardCompleted]}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.stopNumber}>{index + 1}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.cardTitle}>{item.clienteNombre}</Text>
                                    <Text style={styles.cardSubtitle}>{item.clienteDireccion}</Text>
                                </View>
                                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}><Text style={styles.statusText}>{item.estadoVisita}</Text></View>
                            </View>
                            <View style={styles.cardBody}>
                                <Text style={styles.amountLabel}>Monto a Cobrar:</Text>
                                <Text style={styles.amountValue}>{formatCurrency(item.totalVenta)}</Text>
                            </View>
                            {item.estadoVisita === 'Pendiente' && (
                                <View style={styles.cardActions}>
                                    <TouchableOpacity style={styles.actionButton} onPress={() => handleNavigate(item)}><Feather name="map-pin" size={20} color={COLORS.primary} /><Text style={styles.actionButtonText}>Navegar</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.actionButton} onPress={() => handleFailedDelivery(item)}><Feather name="x-circle" size={20} color={COLORS.danger} /><Text style={[styles.actionButtonText, { color: COLORS.danger }]}>No Entregado</Text></TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionButton, styles.mainActionButton]} onPress={() => handleOpenAdjustmentModal(item)}>
                                        <Feather name="edit" size={20} color={COLORS.primaryDark} /><Text style={[styles.actionButtonText, { color: COLORS.primaryDark, fontWeight: 'bold' }]}>Gestionar</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    );
                }}
            />
            
            {areAllStopsCompleted && (
                 <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.cardCompleted} onPress={handleCompleteRoute} disabled={isSaving}>
                        {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.cardCompleted}>Finalizar Ruta</Text>}
                    </TouchableOpacity>
                 </View>
            )}
            
            {selectedStop && (
                <DeliveryAdjustmentModal 
                    visible={isAdjustmentModalVisible} 
                    onClose={() => setAdjustmentModalVisible(false)} 
                    stop={selectedStop} 
                    routeId={route.id} 
                    onConfirm={handleConfirmAndUpdateUI}
                />
            )}
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
    // Estilos del modal que se deben añadir
    adjustmentModalContent: { width: '95%', maxHeight: '85%', backgroundColor: COLORS.backgroundStart, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    itemList: { marginBottom: 15, maxHeight: '40%' },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
    itemName: { flex: 1, color: COLORS.textPrimary, fontSize: 16, marginRight: 8 },
    quantityControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 10 },
    quantityButton: { padding: 8 },
    quantityText: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: 16, paddingHorizontal: 12 },
    itemTotal: { width: 80, textAlign: 'right', color: COLORS.textPrimary, fontWeight: 'bold', fontSize: 16 },
    summaryContainer: { paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 15 },
    summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
    summaryValueOriginal: { fontSize: 18, color: COLORS.textSecondary, fontWeight: 'bold', textDecorationLine: 'line-through', textAlign: 'right' },
    summaryValueFinal: { fontSize: 24, color: COLORS.success, fontWeight: 'bold', textAlign: 'right' },
    tabContainer: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.glass, marginHorizontal: 20, borderRadius: 15, padding: 5, marginBottom: 10, },
    tabButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    activeTab: { backgroundColor: COLORS.primary },
    tabText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 16 },
    activeTabText: { color: COLORS.primaryDark },
});

export default DriverScreen;