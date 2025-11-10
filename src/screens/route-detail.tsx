// src/screens/route-detail.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import {
    doc,
    increment,
    runTransaction,
    serverTimestamp,
    Timestamp,
    updateDoc,
    writeBatch
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { RouteDetailScreenProps } from '../navigation/AppNavigator';

// --- Contexto y DB ---
import { useData } from '../../context/DataContext';
import { dbContainer } from '../../db/firebase-service';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// --- INTERFACES CORREGIDAS ---
interface SaleItem { nombre: string; quantity: number; precio: number; promoAplicada?: string; }
interface DriverItem { productId: string; nombre: string; quantity: number; precio: number; }
interface Invoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    saldoPendiente: number; 
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda';
    location?: { latitude: number; longitude: number; };
    telefono?: string;
    items: DriverItem[];
}
interface RouteFull {
    id: string;
    nombre: string; 
    fecha?: Date;
    estado?: 'Creada' | 'En Curso' | 'Completada' | 'Archivada';
    facturas: Invoice[];
}

// =================================================================================
// --- Componente DeliveryAdjustmentModal Styles (Definido fuera del componente) ---
// =================================================================================
const modalStyles = StyleSheet.create({
    keyboardAvoidingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    adjustmentModalContent: {
        width: '95%',
        maxHeight: '90%', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        padding: SIZES.medium,
        overflow: 'hidden' 
    },
    modalTitle: { fontSize: SIZES.h2, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', marginBottom: SIZES.xsmall },
    modalSubtitle: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.large },
    sectionHeader: { fontSize: SIZES.caption, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: SIZES.small, marginTop: SIZES.medium },
    modalScrollViewContent: { paddingBottom: SIZES.large },
    
    // Item List
    itemList: { marginBottom: SIZES.medium, borderTopWidth: SIZES.borderWidth, borderBottomWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, flexGrow: 0 },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SIZES.small, borderBottomWidth: SIZES.borderWidth, borderBottomColor: COLORS.glassBorder, paddingHorizontal: SIZES.small },
    itemName: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body, marginRight: SIZES.small },
    quantityControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.small, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder },
    quantityButton: { padding: SIZES.xsmall },
    quantityText: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body, paddingHorizontal: SIZES.xsmall * 2, paddingVertical: SIZES.xsmall },
    quantityInput: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body, paddingHorizontal: SIZES.xsmall, paddingVertical: Platform.OS === 'android' ? SIZES.xsmall / 2 : SIZES.xsmall, minWidth: 40, textAlign: 'center', backgroundColor: COLORS.backgroundStart, borderRadius: SIZES.xsmall / 2, marginHorizontal: SIZES.xsmall / 2, height: SIZES.xl },
    itemTotal: { width: 80, textAlign: 'right', color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body },

    // Summary
    summaryContainer: { paddingVertical: SIZES.medium, paddingHorizontal: SIZES.small, backgroundColor: COLORS.backgroundStart, borderRadius: SIZES.radiusSmall, marginBottom: SIZES.large },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SIZES.xsmall },
    summaryLabel: { fontSize: SIZES.body, color: COLORS.textSecondary },
    summaryValueOriginal: { fontSize: SIZES.body, color: COLORS.textSecondary, fontWeight: 'bold', textDecorationLine: 'line-through' },
    summaryValueFinal: { fontSize: SIZES.h3, color: COLORS.primary, fontWeight: 'bold' },

    // Footer Buttons
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, paddingHorizontal: SIZES.medium, marginBottom: SIZES.medium, height: 52 },
    inputIcon: { marginRight: SIZES.medium },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body },
    
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: SIZES.medium, marginTop: SIZES.medium },
    modalButton: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center' },
    cancelButton: { backgroundColor: COLORS.disabled, borderWidth: SIZES.borderWidth, borderColor: COLORS.textSecondary },
    confirmButton: { backgroundColor: COLORS.primary },
    buttonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
});


// --- Componente DeliveryAdjustmentModal ---
interface DeliveryAdjustmentModalProps {
    visible: boolean;
    onClose: () => void;
    stop: Invoice;
    routeId: string;
    onConfirm: (updatedStop: Invoice) => void;
}

const DeliveryAdjustmentModal = ({ visible, onClose, stop, routeId, onConfirm }: DeliveryAdjustmentModalProps) => {
    // [Lógica del modal... sin cambios]
    const [modifiedItems, setModifiedItems] = useState<DriverItem[]>([]);
    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [originalItems, setOriginalItems] = useState<DriverItem[]>([]);
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

    useEffect(() => {
        if (stop) {
            const deepCopy = JSON.parse(JSON.stringify(stop.items || []));
            setModifiedItems(deepCopy);
            setOriginalItems(deepCopy);
            setEditingItemIndex(null);
            setPagoEfectivo('');
            setPagoTransferencia('');
        }
    }, [stop]);

    const newTotalVenta = useMemo(() => {
        return modifiedItems.reduce((total, item) => total + (item.precio * item.quantity), 0);
    }, [modifiedItems]);

    const handleQuantityChange = (index: number, change: 'increment' | 'decrement' | 'input', value?: string) => {
        if (change !== 'input') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
        
        setModifiedItems(currentItems => {
            const itemToModify = currentItems[index];
            if (!itemToModify) return currentItems;

            const originalItem = originalItems.find(item => item.productId === itemToModify.productId);
            const maxQuantity = originalItem ? originalItem.quantity : 0;

            return currentItems.map((item, idx) => {
                if (idx === index) {
                    let newQuantity: number;

                    if (change === 'increment') {
                        newQuantity = Math.min(item.quantity + 1, maxQuantity);
                    } else if (change === 'decrement') {
                        newQuantity = Math.max(0, item.quantity - 1);
                    } else { 
                        const numericValue = parseInt(value || "0", 10);
                        
                        if (isNaN(numericValue)) { newQuantity = 0; } 
                        else if (numericValue > maxQuantity) {
                            Toast.show({ type: 'error', text1: 'Cantidad Excesiva', text2: `No puede superar la cantidad original (${maxQuantity})` });
                            newQuantity = maxQuantity;
                        } else if (numericValue < 0) {
                            newQuantity = 0;
                        } else {
                            newQuantity = numericValue;
                        }
                    }
                    return { ...item, quantity: newQuantity };
                }
                return item;
            });
        });
    };

    const executeTransaction = async () => {
        setIsSaving(true);
        setEditingItemIndex(null); 
        
        const efectivo = parseFloat(pagoEfectivo.replace(',', '.')) || 0;
        const transferencia = parseFloat(pagoTransferencia.replace(',', '.')) || 0;
        const totalPagado = efectivo + transferencia;

        try {
            const finalStatus = totalPagado < newTotalVenta ? 'Adeuda' : 'Pagada';
            const finalItemsToDeliver = modifiedItems.filter(item => item.quantity > 0);

            const db = dbContainer.instance;
            if (!db) { throw new Error("La base de datos no está lista. Reinicia la app."); }
            
            await runTransaction(db, async (transaction) => {
                const ventaRef = doc(db, 'ventas', stop.id);
                const routeRef = doc(db, 'rutas', routeId);
                
                const routeDoc = await transaction.get(routeRef);
                // @ts-ignore
                if (!routeDoc.exists) throw new Error("La ruta no fue encontrada.");

                const stockDevueltoMap = new Map<string, number>();

                for (const item of originalItems) {
                    stockDevueltoMap.set(item.productId, (stockDevueltoMap.get(item.productId) || 0) + item.quantity);
                }
                
                for (const item of finalItemsToDeliver) {
                    stockDevueltoMap.set(item.productId, (stockDevueltoMap.get(item.productId) || 0) - item.quantity);
                }
                
                for (const [productId, stockDifference] of stockDevueltoMap.entries()) {
                    if (stockDifference > 0 && productId) { 
                        const productRef = doc(db, 'productos', productId);
                        transaction.update(productRef, { stock: increment(stockDifference) });
                    }
                }

                transaction.update(ventaRef, {
                    estado: finalStatus,
                    items: finalItemsToDeliver,
                    totalVenta: newTotalVenta,
                    pagoEfectivo: efectivo,
                    pagoTransferencia: transferencia,
                    saldoPendiente: newTotalVenta - totalPagado,
                    fechaUltimoPago: serverTimestamp(),
                });

                const routeData = routeDoc.data();
                const updatedFacturas = (routeData?.facturas || []).map((f: any) =>
                    f.id === stop.id ? { ...f, estadoVisita: finalStatus, totalVenta: newTotalVenta, items: finalItemsToDeliver } : f
                );
                transaction.update(routeRef, { facturas: updatedFacturas });
            });

            Toast.show({ type: 'success', text1: `Entrega guardada como "${finalStatus}"` });
            Haptics.notificationAsync('success' as any);
            
            onConfirm({ ...stop, estadoVisita: finalStatus, totalVenta: newTotalVenta, items: finalItemsToDeliver });
            onClose();

        } catch (error) {
            console.error("Error en la transacción de entrega:", error);
            const err = error as Error;
            Toast.show({ type: 'error', text1: 'Error en la transacción', text2: err.message || 'Error desconocido' });
            Haptics.notificationAsync('error' as any);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelivery = async () => {
        const efectivo = parseFloat(pagoEfectivo.replace(',', '.')) || 0;
        const transferencia = parseFloat(pagoTransferencia.replace(',', '.')) || 0;
        const totalPagado = efectivo + transferencia;

        if (totalPagado > newTotalVenta) {
            Alert.alert("Error", `El monto pagado (${formatCurrency(totalPagado)}) no puede ser mayor al nuevo total de la factura (${formatCurrency(newTotalVenta)}).`);
            return;
        }

        const itemsChanged = JSON.stringify(originalItems) !== JSON.stringify(modifiedItems);
        const finalItemsToDeliver = modifiedItems.filter(item => item.quantity > 0);
        const itemsRemoved = finalItemsToDeliver.length < originalItems.length;

        if (itemsChanged) {
            let alertMessage = `Se modificaron las cantidades. El nuevo total es ${formatCurrency(newTotalVenta)}.`;
            if(itemsRemoved) { alertMessage += ` Algunos productos se quitarán de la factura.`; }
            if (totalPagado < newTotalVenta) { alertMessage += `\nSe marcará como "Adeuda" con un saldo de ${formatCurrency(newTotalVenta - totalPagado)}.`; }
            alertMessage += "\n\n¿Continuar?";
            
            Alert.alert("Revisar Cambios", alertMessage, [
                { text: 'No', style: 'cancel' },
                { text: 'Sí, Confirmar', onPress: executeTransaction }
            ]);
        }
        else if (totalPagado < newTotalVenta) {
            Alert.alert("Saldo Pendiente", `La factura se marcará como "Adeuda" con un saldo de ${formatCurrency(newTotalVenta - totalPagado)}. ¿Continuar?`, [
                { text: 'No', style: 'cancel' },
                { text: 'Sí, Continuar', onPress: executeTransaction }
            ]);
        } 
        else {
           await executeTransaction();
        }
    };

    if (!stop) return null;

    // --- RENDER DEL MODAL (ESTILIZADO) ---
    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={modalStyles.keyboardAvoidingContainer} 
            >
                <View style={modalStyles.adjustmentModalContent}>
                    <ScrollView contentContainerStyle={modalStyles.modalScrollViewContent}> 
                        <Text style={modalStyles.modalTitle}>GESTIONAR ENTREGA</Text>
                        <Text style={modalStyles.modalSubtitle}>{stop.clienteNombre}</Text>

                        <Text style={modalStyles.sectionHeader}>PRODUCTOS</Text>
                        
                        <FlatList
                            data={modifiedItems}
                            keyExtractor={(item, index) => `${item.productId}-${index}`}
                            renderItem={({ item, index }) => {
                                const isEditing = editingItemIndex === index;
                                
                                return (
                                    <View style={[modalStyles.itemRow, item.quantity === 0 && { opacity: 0.5 }]}>
                                        <Text style={modalStyles.itemName} numberOfLines={1}>{item.nombre}</Text>
                                        
                                        <View style={modalStyles.quantityControl}>
                                            <TouchableOpacity style={modalStyles.quantityButton} onPress={() => handleQuantityChange(index, 'decrement')}>
                                                <Feather name="minus" size={SIZES.body} color={COLORS.primary} />
                                            </TouchableOpacity>

                                            {isEditing ? (
                                                <TextInput
                                                    style={modalStyles.quantityInput}
                                                    value={item.quantity.toString()}
                                                    onChangeText={(text) => handleQuantityChange(index, 'input', text)}
                                                    onBlur={() => setEditingItemIndex(null)}
                                                    keyboardType="numeric"
                                                    autoFocus
                                                    maxLength={3}
                                                    selectTextOnFocus
                                                />
                                            ) : (
                                                <TouchableOpacity onPress={() => setEditingItemIndex(index)}>
                                                    <Text style={modalStyles.quantityText}>{item.quantity}</Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity style={modalStyles.quantityButton} onPress={() => handleQuantityChange(index, 'increment')}>
                                                <Feather name="plus" size={SIZES.body} color={COLORS.primary} />
                                            </TouchableOpacity>
                                        </View>
                                        
                                        <Text style={modalStyles.itemTotal}>{formatCurrency(item.precio * item.quantity)}</Text>
                                    </View>
                                );
                            }}
                            style={modalStyles.itemList}
                            extraData={editingItemIndex}
                        />

                        <View style={modalStyles.summaryContainer}>
                            <View style={modalStyles.summaryRow}>
                                <Text style={modalStyles.summaryLabel}>Total Original:</Text>
                                <Text style={modalStyles.summaryValueOriginal}>{formatCurrency(stop.totalVenta)}</Text>
                            </View>
                            <View style={modalStyles.summaryRow}>
                                <Text style={modalStyles.summaryLabel}>Nuevo Total a Cobrar:</Text>
                                <Text style={modalStyles.summaryValueFinal}>{formatCurrency(newTotalVenta)}</Text>
                            </View>
                        </View>
                        
                        <Text style={modalStyles.sectionHeader}>PAGOS</Text>

                        <View style={modalStyles.inputContainer}>
                            <Feather name="dollar-sign" size={SIZES.h3} color={COLORS.textSecondary} style={modalStyles.inputIcon} />
                            <TextInput style={modalStyles.input} placeholder="Monto en Efectivo" placeholderTextColor={COLORS.textSecondary} keyboardType="numeric" value={pagoEfectivo} onChangeText={setPagoEfectivo} />
                        </View>
                        <View style={modalStyles.inputContainer}>
                            <Feather name="credit-card" size={SIZES.h3} color={COLORS.textSecondary} style={modalStyles.inputIcon} />
                            <TextInput style={modalStyles.input} placeholder="Monto en Transferencia" placeholderTextColor={COLORS.textSecondary} keyboardType="numeric" value={pagoTransferencia} onChangeText={setPagoTransferencia} />
                        </View>

                        <View style={modalStyles.modalButtons}>
                            <TouchableOpacity style={[modalStyles.modalButton, modalStyles.cancelButton]} onPress={onClose}>
                                <Text style={[modalStyles.buttonText, { color: COLORS.textSecondary }]}>CANCELAR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[modalStyles.modalButton, modalStyles.confirmButton]} onPress={handleConfirmDelivery} disabled={isSaving}>
                                {isSaving ? <ActivityIndicator color={COLORS.white} /> : <Text style={modalStyles.buttonText}>CONFIRMAR ENTREGA</Text>}
                            </TouchableOpacity>
                        </View>
                    </ScrollView> 
                </View> 
            </KeyboardAvoidingView>
        </Modal>
    );
};


// --- Pantalla Principal: RouteDetailScreen (ACTUALIZADA CON SDK NATIVO v9) ---
const RouteDetailScreen = ({ route, navigation }: RouteDetailScreenProps) => {
    const routeId = route.params?.routeId;
    const { routes, clients, syncData } = useData();
    const [isUpdating, setIsUpdating] = useState(false);

    const [isAdjustmentModalVisible, setAdjustmentModalVisible] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const [localInvoices, setLocalInvoices] = useState<Invoice[]>([]);

    const currentRoute: RouteFull | undefined = useMemo(() => {
        if (!routeId || !routes) return undefined;
        const foundRoute = routes.find(r => r.id === routeId);
        if (!foundRoute) return undefined;

        const enrichedFacturas = (foundRoute.facturas || []).map(f => {
            const clientData = clients.find(c => c.id === f.clienteId);
            return {
                ...f,
                estadoVisita: f.estadoVisita || 'Pendiente',
                saldoPendiente: f.saldoPendiente || f.totalVenta, // ✅ Aseguramos que exista saldoPendiente
                location: clientData?.location || null, 
                telefono: clientData?.telefono || null,
                items: f.items || [] 
            };
        });

        let routeDate: any = foundRoute.fecha;
        if (routeDate && !(routeDate instanceof Date) && (routeDate as any).seconds !== undefined) {
              routeDate = new Timestamp((routeDate as any).seconds, (routeDate as any).nanoseconds).toDate(); 
        }

        return {
             ...foundRoute,
             nombre: (foundRoute as any).nombre || `Ruta ${foundRoute.id.substring(0, 6)}`, // ✅ Garantizamos el nombre
             fecha: routeDate as Date | undefined,
             facturas: enrichedFacturas
        };
    }, [routeId, routes, clients]);

    useEffect(() => {
        if (currentRoute?.facturas) {
             if (JSON.stringify(localInvoices) !== JSON.stringify(currentRoute.facturas)) {
                 setLocalInvoices(currentRoute.facturas);
             }
        }
    }, [currentRoute, localInvoices]);

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

    const openAdjustmentModal = (invoice: Invoice) => {
        if (invoice.estadoVisita !== 'Pendiente' && invoice.estadoVisita !== 'Adeuda') {
             Toast.show({ type: 'info', text1: 'Estado inválido', text2: 'Solo se pueden gestionar facturas Pendientes o Adeudadas.', position: 'bottom' });
             return;
           }
        if (currentRoute?.estado === 'Completada' || currentRoute?.estado === 'Archivada') {
            Toast.show({ type: 'info', text1: 'Ruta Finalizada', text2: 'No se pueden gestionar facturas de una ruta finalizada.', position: 'bottom' });
            return;
        }
        setSelectedInvoice(invoice);
        setAdjustmentModalVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const handleConfirmAndUpdateUI = (updatedInvoice: Invoice) => {
        setLocalInvoices(prevInvoices =>
            prevInvoices.map(inv =>
                inv.id === updatedInvoice.id ? updatedInvoice : inv
            )
        );
        syncData();
    };

    const handleMarkAsPending = async (invoice: Invoice) => {
        if (invoice.estadoVisita === 'Pendiente') return;

        if (currentRoute?.estado === 'Completada' || currentRoute?.estado === 'Archivada') {
            Toast.show({ type: 'info', text1: 'Ruta Finalizada', text2: 'No se puede revertir el estado.', position: 'bottom' });
            return;
        }
        
        Alert.alert(
            "Revertir a Pendiente",
            `¿Seguro que desea revertir el estado de ${invoice.clienteNombre} a 'Pendiente'? Se restablecerá el saldo deudor y se anularán los pagos registrados.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Revertir",
                    style: "destructive",
                    onPress: async () => {
                        setIsUpdating(true);
                        try {
                            const db = dbContainer.instance;
                            if (!db) { throw new Error("La base de datos no está lista. Reinicia la app."); }
                            
                            const batch = writeBatch(db);
                            const saleRef = doc(db, 'ventas', invoice.id); 
                            const routeRef = doc(db, 'rutas', routeId); 

                            batch.update(saleRef, {
                                estado: 'Pendiente de Entrega',
                                saldoPendiente: invoice.totalVenta,
                                pagoEfectivo: 0,
                                pagoTransferencia: 0,
                            });

                            const updatedFacturas = localInvoices.map(f =>
                                f.id === invoice.id ? { ...f, estadoVisita: 'Pendiente' as const } : f
                            );
                            batch.update(routeRef, { facturas: updatedFacturas });
                            
                            await batch.commit(); 
                            
                            setLocalInvoices(updatedFacturas);
                            Toast.show({ type: 'info', text1: 'Revertido a Pendiente', position: 'bottom' });

                        } catch (error: any) {
                             console.error("Error al revertir a pendiente:", error);
                             Alert.alert("Error", `No se pudo revertir el estado: ${error.message}`);
                        } finally {
                            setIsUpdating(false);
                        }
                    }
                }
            ]
        );
    };

    const handleCancelInvoice = async (invoice: Invoice) => {
        if (invoice.estadoVisita === 'Anulada') return;

        if (currentRoute?.estado === 'Completada' || currentRoute?.estado === 'Archivada') {
            Toast.show({ type: 'info', text1: 'Ruta Finalizada', text2: 'No se puede anular la factura.', position: 'bottom' });
            return;
        }

        Alert.alert(
            "Anular Factura",
            `¿Está seguro que desea ANULAR la visita a ${invoice.clienteNombre}? ESTA ACCIÓN DEVOLVERÁ EL STOCK ORIGINAL AL INVENTARIO.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Anular",
                    style: "destructive",
                    onPress: async () => {
                        setIsUpdating(true);
                        try {
                            const originalRoute = routes.find(r => r.id === routeId);
                            const originalInvoice = originalRoute?.facturas?.find(f => f.id === invoice.id);
                            const itemsToReturn = originalInvoice?.items || invoice.items;
                            
                            if (!originalInvoice) {
                                console.warn(`ADVERTENCIA: No se encontró la factura original en DataContext (ID: ${invoice.id}). Se usará la factura local para anular. El stock devuelto podría ser incorrecto si la factura fue modificada.`);
                            }
                            
                            const db = dbContainer.instance;
                            if (!db) { throw new Error("La base de datos no está lista. Reinicia la app."); }

                            const batch = writeBatch(db);
                            const saleRef = doc(db, 'ventas', invoice.id); 
                            const routeRef = doc(db, 'rutas', routeId); 

                            // 4. Actualizar la Venta
                            batch.update(saleRef, {
                                estado: 'Anulada',
                                saldoPendiente: invoice.totalVenta 
                            });

                            // 5. Actualizar la Factura en la Ruta
                            const updatedFacturas = localInvoices.map(f =>
                                f.id === invoice.id ? { ...f, estadoVisita: 'Anulada' as const } : f
                            );
                            batch.update(routeRef, { facturas: updatedFacturas });

                            // 6. Devolver Stock usando los items ORIGINALES (itemsToReturn)
                            itemsToReturn.forEach((item: DriverItem) => {
                                if (item.productId && typeof item.quantity === 'number' && item.quantity > 0) {
                                    const productRef = doc(db, 'productos', item.productId);
                                    batch.update(productRef, { stock: increment(item.quantity) });
                                } else {
                                    console.warn("Item inválido al anular, no se devuelve stock para este item:", item);
                                }
                            });
                            
                            await batch.commit(); 
                            
                            setLocalInvoices(updatedFacturas);
                            Toast.show({ type: 'info', text1: 'Visita Anulada y Stock Devuelto', position: 'bottom' });
                            syncData(); 

                        } catch (error: any) {
                            console.error("Error al anular factura:", error);
                            Alert.alert("Error", `No se pudo anular la visita: ${error.message}`);
                        } finally {
                            setIsUpdating(false);
                        }
                    }
                }
            ]
        );
    };

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
                            const db = dbContainer.instance;
                            if (!db) { throw new Error("La base de datos no está lista. Reinicia la app."); }
                            
                            const routeRef = doc(db, 'rutas', currentRoute.id); 
                            await updateDoc(routeRef, {
                                estado: 'Completada'
                            });
                            
                            await syncData();
                            
                            Toast.show({ type: 'success', text1: 'Ruta Finalizada', position: 'bottom' });
                            navigation.goBack();
                        } catch (error: any) {
                            console.error("Error al finalizar ruta:", error);
                            Alert.alert("Error", `No se pudo finalizar la ruta: ${error.message}`);
                            setIsUpdating(false);
                        }
                    },
                    style: "destructive"
                }
            ]
        );
    };

    // --- RENDERIZADO PRINCIPAL (ESTILIZADO) ---
    if (!currentRoute) {
        return (
             <SafeAreaView style={styles.container}>
                <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                 <View style={styles.header}>
                     <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                         <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                     </TouchableOpacity>
                     <Text style={styles.title}>CARGANDO RUTA</Text>
                     <View style={styles.headerButton} />
                 </View>
                 <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SIZES.xl * 2 }} />
             </SafeAreaView>
        );
    }

    const renderInvoice = ({ item }: { item: Invoice }) => {
        const isGestionable = item.estadoVisita === 'Pendiente' || item.estadoVisita === 'Adeuda';
        const isCompleted = item.estadoVisita === 'Pagada';
        const isAnulada = item.estadoVisita === 'Anulada';

        // ✅ CORREGIDO: Accedemos al estilo de estado por nombre literal
        const statusStyleKey = `status${item.estadoVisita}` as keyof typeof styles;

        return (
            <View style={[styles.invoiceCard, styles[statusStyleKey], isAnulada && { opacity: 0.6 }]}>
                
                <View style={styles.invoiceHeader}>
                    
                    <View style={{ flex: 1, paddingRight: SIZES.small }}> {/* Reducido paddingRight */}
                        <Text style={styles.invoiceClientName} numberOfLines={1}>{item.clienteNombre}</Text>
                        <Text style={styles.invoiceAddress} numberOfLines={1}>{item.clienteDireccion || 'Dirección no disponible'}</Text>
                    </View>
                    <View style={styles.statusBadge}>
                        <Text style={[styles.statusBadgeText, { color: isAnulada ? COLORS.danger : (isCompleted ? COLORS.success : COLORS.warning) }]}>
                            {item.estadoVisita.toUpperCase()}
                        </Text>
                    </View>
                    <View style={styles.totalBlock}>
                        <Text style={styles.invoiceTotal}>{formatCurrency(item.totalVenta)}</Text>
                        {item.estadoVisita === 'Adeuda' && <Text style={styles.balanceWarning}>Saldo: {formatCurrency(item.saldoPendiente)}</Text>}
                        {item.estadoVisita === 'Pendiente' && <Text style={styles.pendingText}>Pendiente</Text>}
                    </View>
                    
                </View>

                <View style={styles.invoiceActions}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMap(item)} disabled={!item.location}>
                        <Feather name="map-pin" size={SIZES.h3} color={item.location ? COLORS.primary : COLORS.disabled} />
                        <Text style={[styles.actionButtonText, !item.location && { color: COLORS.disabled }]}>MAPA</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleCallClient(item)} disabled={!item.telefono}>
                        <Feather name="phone" size={SIZES.h3} color={item.telefono ? COLORS.primary : COLORS.disabled} />
                        <Text style={[styles.actionButtonText, !item.telefono && { color: COLORS.disabled }]}>LLAMAR</Text>
                    </TouchableOpacity>
                    
                    {isGestionable && currentRoute.estado !== 'Completada' && currentRoute.estado !== 'Archivada' && (
                        <>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleCancelInvoice(item)}>
                                <Feather name="x-circle" size={SIZES.h3} color={COLORS.danger} />
                                <Text style={[styles.actionButtonText, { color: COLORS.danger }]}>ANULAR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.actionButton, styles.mainActionButton]} onPress={() => openAdjustmentModal(item)}>
                                <Feather name="edit-3" size={SIZES.h3} color={COLORS.white} />
                                <Text style={[styles.actionButtonText, styles.mainActionButtonText]}>GESTIONAR</Text>
                            </TouchableOpacity>
                        </>
                    )}
                     {isCompleted && (
                        <TouchableOpacity style={[styles.actionButton]} onPress={() => handleMarkAsPending(item)}>
                            <Feather name="rotate-ccw" size={SIZES.h3} color={COLORS.warning} />
                            <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>REVERTIR</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />

            <View style={[styles.header, { backgroundColor: COLORS.backgroundEnd, borderColor: COLORS.glassBorder }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>{currentRoute.nombre.toUpperCase()}</Text>
                <TouchableOpacity
                    onPress={handleFinalizeRoute}
                    style={styles.headerButton}
                    disabled={routeReport.pendientes > 0 || isUpdating || currentRoute.estado === 'Completada' || currentRoute.estado === 'Archivada'}
                >
                    {isUpdating ? (
                        <ActivityIndicator color={COLORS.success} size="small" />
                    ) : (
                        <Feather
                            name="check-circle"
                            size={SIZES.h3}
                            color={routeReport.pendientes === 0 && currentRoute.estado !== 'Completada' ? COLORS.success : COLORS.disabled}
                        />
                    )}
                </TouchableOpacity>
            </View>

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

            <FlatList
                data={localInvoices}
                renderItem={renderInvoice}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>Esta ruta no tiene facturas asignadas.</Text>}
                extraData={localInvoices}
            />

            {selectedInvoice && currentRoute && (
                <DeliveryAdjustmentModal
                    visible={isAdjustmentModalVisible}
                    onClose={() => setAdjustmentModalVisible(false)}
                    stop={selectedInvoice}
                    routeId={currentRoute.id}
                    onConfirm={handleConfirmAndUpdateUI}
                />
            )}
        </SafeAreaView>
    );
};

// --- Estilos de Pantalla (AJUSTADOS AL TEMA) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    // --- HEADER ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : SIZES.medium,
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.small,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        backgroundColor: COLORS.backgroundEnd,
    },
    headerButton:  { 
        padding: SIZES.small,
        width: SIZES.xxl, // 40px de ancho
        height: SIZES.xxl, // 40px de alto
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', textTransform: 'uppercase' },
    // --- REPORT SUMMARY ---
    reportContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingVertical: SIZES.medium,
        paddingHorizontal: SIZES.small,
        backgroundColor: COLORS.backgroundEnd,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        marginBottom: SIZES.medium,
    },
    reportItem: {
        alignItems: 'center',
        flex: 1,
    },
    reportValue: {
        fontSize: SIZES.h2, 
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    reportLabel: {
        fontSize: SIZES.caption,
        color: COLORS.textSecondary,
        marginTop: SIZES.xsmall / 2,
    },
    reportSeparator: {
        width: SIZES.borderWidth,
        height: '60%',
        backgroundColor: COLORS.glassBorder,
    },
    // --- LISTA ---
    listContentContainer: { paddingHorizontal: SIZES.medium, paddingBottom: SIZES.xl * 2 },
    emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: SIZES.xl, fontSize: SIZES.body },
    // --- INVOICE CARD ---
    invoiceCard: { 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        marginBottom: SIZES.medium,
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        overflow: 'hidden',
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    invoiceHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: SIZES.medium,
        borderBottomWidth: SIZES.borderWidth, 
        borderBottomColor: COLORS.glassBorder,
    },
    invoiceClientName: { color: COLORS.textPrimary, fontSize: SIZES.body, fontWeight: 'bold', marginBottom: SIZES.xsmall / 2 },
    invoiceAddress: { color: COLORS.textSecondary, fontSize: SIZES.caption },
    totalBlock: { alignItems: 'flex-end', marginLeft: SIZES.small },
    invoiceTotal: { color: COLORS.primary, fontSize: SIZES.h3, fontWeight: 'bold' },
    balanceWarning: { color: COLORS.warning, fontSize: SIZES.caption, fontWeight: 'bold' },
    pendingText: { color: COLORS.textSecondary, fontSize: SIZES.caption, fontWeight: '500' },

    statusBadge: { 
        paddingHorizontal: SIZES.small, 
        paddingVertical: SIZES.xsmall / 2, 
        borderRadius: SIZES.radiusSmall,
        borderWidth: SIZES.borderWidth,
        alignItems: 'center',
    },
    statusBadgeText: { fontSize: SIZES.caption, fontWeight: 'bold' },
    
    // ✅ CORREGIDO: Estilos de estado para la tarjeta
    statusPendiente: { borderColor: COLORS.warning, borderLeftWidth: SIZES.small / 2, borderLeftColor: COLORS.warning },
    statusPagada: { borderColor: COLORS.success, borderLeftWidth: SIZES.small / 2, borderLeftColor: COLORS.success },
    statusAdeuda: { borderColor: COLORS.warning, borderLeftWidth: SIZES.small / 2, borderLeftColor: COLORS.warning },
    statusAnulada: { borderColor: COLORS.danger, borderLeftWidth: SIZES.small / 2, borderLeftColor: COLORS.danger, opacity: 0.7 },
    
    // ACCIONES
    invoiceActions: { 
        flexDirection: 'row', 
        borderTopWidth: 0, 
        backgroundColor: COLORS.backgroundStart,
    },
    actionButton: { 
        flex: 1, 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingVertical: SIZES.small, 
        gap: SIZES.xsmall,
        borderRightWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder
    },
    actionButtonText: { color: COLORS.primary, fontWeight: '600', fontSize: SIZES.xsmallText, textTransform: 'uppercase' },
    mainActionButton: { backgroundColor: COLORS.primary, flex: 1.2 },
    mainActionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.caption },

    // --- MODAL ESTILOS ---
    keyboardAvoidingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    adjustmentModalContent: {
        width: '95%',
        maxHeight: '90%', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        padding: SIZES.medium,
        overflow: 'hidden' 
    },
    modalTitle: { fontSize: SIZES.h2, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', marginBottom: SIZES.xsmall },
    modalSubtitle: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.large },
    sectionHeader: { fontSize: SIZES.caption, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: SIZES.small, marginTop: SIZES.medium },
    modalScrollViewContent: { paddingBottom: SIZES.large },
    
    // Item List
    itemList: { marginBottom: SIZES.medium, borderTopWidth: SIZES.borderWidth, borderBottomWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, flexGrow: 0 },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SIZES.small, borderBottomWidth: SIZES.borderWidth, borderBottomColor: COLORS.glassBorder, paddingHorizontal: SIZES.small },
    itemName: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body, marginRight: SIZES.small },
    quantityControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.small, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder },
    quantityButton: { padding: SIZES.xsmall },
    quantityText: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body, paddingHorizontal: SIZES.xsmall * 2, paddingVertical: SIZES.xsmall },
    quantityInput: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body, paddingHorizontal: SIZES.xsmall, paddingVertical: Platform.OS === 'android' ? SIZES.xsmall / 2 : SIZES.xsmall, minWidth: 40, textAlign: 'center', backgroundColor: COLORS.backgroundStart, borderRadius: SIZES.xsmall / 2, marginHorizontal: SIZES.xsmall / 2, height: SIZES.xl },
    itemTotal: { width: 80, textAlign: 'right', color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body },

    // Summary
    summaryContainer: { paddingVertical: SIZES.medium, paddingHorizontal: SIZES.small, backgroundColor: COLORS.backgroundStart, borderRadius: SIZES.radiusSmall, marginBottom: SIZES.large },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SIZES.xsmall },
    summaryLabel: { fontSize: SIZES.body, color: COLORS.textSecondary },
    summaryValueOriginal: { fontSize: SIZES.body, color: COLORS.textSecondary, fontWeight: 'bold', textDecorationLine: 'line-through' },
    summaryValueFinal: { fontSize: SIZES.h3, color: COLORS.primary, fontWeight: 'bold' },

    // Footer Buttons
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, paddingHorizontal: SIZES.medium, marginBottom: SIZES.medium, height: 52 },
    inputIcon: { marginRight: SIZES.medium },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body },
    
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: SIZES.medium, marginTop: SIZES.medium },
    modalButton: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center' },
    cancelButton: { backgroundColor: COLORS.disabled, borderWidth: SIZES.borderWidth, borderColor: COLORS.textSecondary },
    confirmButton: { backgroundColor: COLORS.primary },
    buttonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },

    totalButton: {},
    totalButtonText: {},
});

export default RouteDetailScreen;