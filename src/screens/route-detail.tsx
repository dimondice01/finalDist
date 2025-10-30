// src/screens/route-detail.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, increment, runTransaction, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
// --- INICIO CAMBIOS: Importar KeyboardAvoidingView ---
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// --- FIN CAMBIOS ---
import Toast from 'react-native-toast-message';

// --- Navegación ---
import type { RouteDetailScreenProps } from '../navigation/AppNavigator';

import { useData } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// --- INTERFACES LOCALES (ACTUALIZADAS) ---
interface DriverItem {
    productId: string;
    nombre: string;
    quantity: number;
    precio: number;
}

interface Invoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda';
    location?: { latitude: number; longitude: number; };
    telefono?: string;
    items: DriverItem[];
}
interface RouteFull {
    id: string;
    fecha?: Date;
    estado?: 'Creada' | 'En Curso' | 'Completada' | 'Archivada';
    facturas: Invoice[];
}
// --- FIN INTERFACES ---


// =================================================================================
// --- Componente DeliveryAdjustmentModal (ACTUALIZADO) ---
// =================================================================================
interface DeliveryAdjustmentModalProps {
    visible: boolean;
    onClose: () => void;
    stop: Invoice;
    routeId: string;
    onConfirm: (updatedStop: Invoice) => void;
}

const DeliveryAdjustmentModal = ({ visible, onClose, stop, routeId, onConfirm }: DeliveryAdjustmentModalProps) => {
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
        }
    }, [stop]);

    const newTotalVenta = useMemo(() => {
        return modifiedItems.reduce((total, item) => total + (item.precio * item.quantity), 0);
    }, [modifiedItems]);

    const handleQuantityChange = (index: number, change: 'increment' | 'decrement' | 'input', value?: string) => {
        if (change !== 'input') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        
        setModifiedItems(currentItems => {
            const itemToModify = currentItems[index];
            if (!itemToModify) return currentItems;

            // --- CAMBIO: Buscamos el original por productId, pero desde la lista de ORIGINALES ---
            const originalItem = originalItems.find(item => item.productId === itemToModify.productId);
            // Usamos la cantidad original de ese item. Si hay duplicados, esto asume que todos tienen el mismo límite.
            // Para una lógica de duplicados *perfecta*, necesitaríamos un ID único por *línea* de item, no solo por producto.
            // Pero para este caso, usamos el primer original que coincida.
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
                        
                        if (isNaN(numericValue)) {
                            newQuantity = 0;
                        } else if (numericValue > maxQuantity) {
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

    // --- LÓGICA DE TRANSACCIÓN COMPLETA (CORREGIDA) ---
    const executeTransaction = async () => {
        setIsSaving(true);
        setEditingItemIndex(null); 
        
        const efectivo = parseFloat(pagoEfectivo.replace(',', '.')) || 0;
        const transferencia = parseFloat(pagoTransferencia.replace(',', '.')) || 0;
        const totalPagado = efectivo + transferencia;

        try {
            const finalStatus = totalPagado < newTotalVenta ? 'Adeuda' : 'Pagada';
            const finalItemsToDeliver = modifiedItems.filter(item => item.quantity > 0);

            await runTransaction(db, async (transaction) => {
                const ventaRef = doc(db, 'ventas', stop.id);
                const routeRef = doc(db, 'rutas', routeId);

                const routeDoc = await transaction.get(routeRef);
                if (!routeDoc.exists()) throw new Error("La ruta no fue encontrada.");

                // --- INICIO CORRECCIÓN LÓGICA DE STOCK (Bug 'indexOf') ---
                // Reemplazamos la lógica de Map por una que suma y resta,
                // manejando correctamente productos duplicados.
                
                const stockDevueltoMap = new Map<string, number>();

                // 1. Contar cuánto DEBERÍA HABERSE ENTREGADO (Original)
                for (const item of originalItems) {
                    stockDevueltoMap.set(item.productId, (stockDevueltoMap.get(item.productId) || 0) + item.quantity);
                }
                
                // 2. Restar lo que SÍ SE ENTREGÓ (Modificado)
                for (const item of finalItemsToDeliver) {
                     stockDevueltoMap.set(item.productId, (stockDevueltoMap.get(item.productId) || 0) - item.quantity);
                }
                
                // 3. Lo que queda en stockDevueltoMap es la cantidad NETA a devolver
                for (const [productId, stockDifference] of stockDevueltoMap.entries()) {
                    // Solo actualizamos si la diferencia es positiva (se devuelve stock)
                    if (stockDifference > 0) {
                        const productRef = doc(db, 'productos', productId);
                        transaction.update(productRef, { stock: increment(stockDifference) });
                    }
                }
                // --- FIN CORRECCIÓN LÓGICA DE STOCK ---

                // 4. Actualizar la Venta
                transaction.update(ventaRef, {
                    estado: finalStatus === 'Pagada' ? 'Pagada' : 'Pendiente de Pago',
                    items: finalItemsToDeliver,
                    totalVenta: newTotalVenta,
                    pagoEfectivo: efectivo,
                    pagoTransferencia: transferencia,
                    saldoPendiente: newTotalVenta - totalPagado,
                    fechaUltimoPago: Timestamp.now(),
                });

                // 5. Actualizar la copia de la factura dentro de la Ruta
                const routeData = routeDoc.data();
                // --- CAMBIO: Añadimos '?' por si routeData es null (aunque no debería)
                const updatedFacturas = (routeData?.facturas || []).map((f: any) =>
                    f.id === stop.id ? {
                        ...f,
                        estadoVisita: finalStatus,
                        totalVenta: newTotalVenta,
                        items: finalItemsToDeliver
                    } : f
                );
                transaction.update(routeRef, { facturas: updatedFacturas });
            });

            Toast.show({ type: 'success', text1: `Entrega guardada como "${finalStatus}"` });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            onConfirm({ ...stop, estadoVisita: finalStatus, totalVenta: newTotalVenta, items: finalItemsToDeliver });
            onClose();

        } catch (error) {
            console.error("Error en la transacción de entrega:", error);
            const err = error as Error;
            // --- CAMBIO: Mostramos el error real ---
            Toast.show({ type: 'error', text1: 'Error en la transacción', text2: err.message || 'Error desconocido' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsSaving(false);
        }
    };

    // Manejador del botón "Confirmar" (Sin cambios)
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
            if(itemsRemoved) {
                 alertMessage += ` Algunos productos se quitarán de la factura.`;
            }
            if (totalPagado < newTotalVenta) {
                 alertMessage += `\nSe marcará como "Adeuda" con un saldo de ${formatCurrency(newTotalVenta - totalPagado)}.`;
            }
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

    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            {/* --- INICIO CAMBIO TECLADO --- */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoidingContainer} // Usamos flex: 1 y centrado
            >
                <View style={styles.adjustmentModalContent}>
                    {/* --- FIN CAMBIO TECLADO --- */}

                    <Text style={styles.modalTitle}>Gestionar Entrega</Text>
                    <Text style={styles.modalSubtitle}>{stop.clienteNombre}</Text>

                    <FlatList
                        data={modifiedItems}
                        keyExtractor={(item, index) => `${item.productId}-${index}`}
                        renderItem={({ item, index }) => {
                            const isEditing = editingItemIndex === index;
                            
                            return (
                                <View style={[styles.itemRow, item.quantity === 0 && { opacity: 0.4 }]}>
                                    <Text style={styles.itemName} numberOfLines={1}>{item.nombre}</Text>
                                    
                                    <View style={styles.quantityControl}>
                                        <TouchableOpacity style={styles.quantityButton} onPress={() => handleQuantityChange(index, 'decrement')}>
                                            <Feather name="minus" size={16} color={COLORS.primary} />
                                        </TouchableOpacity>

                                        {isEditing ? (
                                            <TextInput
                                                style={styles.quantityInput}
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
                                                <Text style={styles.quantityText}>{item.quantity}</Text>
                                            </TouchableOpacity>
                                        )}

                                        <TouchableOpacity style={styles.quantityButton} onPress={() => handleQuantityChange(index, 'increment')}>
                                            <Feather name="plus" size={16} color={COLORS.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    
                                    <Text style={styles.itemTotal}>{formatCurrency(item.precio * item.quantity)}</Text>
                                </View>
                            );
                        }}
                        style={styles.itemList}
                        extraData={editingItemIndex}
                    />

                    <View style={styles.summaryContainer}>
                        <Text style={styles.summaryLabel}>Total Original:</Text>
                        <Text style={styles.summaryValueOriginal}>{formatCurrency(stop.totalVenta)}</Text>
                        <Text style={styles.summaryLabel}>Nuevo Total a Cobrar:</Text>
                        <Text style={styles.summaryValueFinal}>{formatCurrency(newTotalVenta)}</Text>
                    </View>

                    <View style={styles.inputContainer}>
                        <Feather name="dollar-sign" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Monto en Efectivo" placeholderTextColor={COLORS.textSecondary} keyboardType="numeric" value={pagoEfectivo} onChangeText={setPagoEfectivo} />
                    </View>
                    <View style={styles.inputContainer}>
                        <Feather name="credit-card" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Monto en Transferencia" placeholderTextColor={COLORS.textSecondary} keyboardType="numeric" value={pagoTransferencia} onChangeText={setPagoTransferencia} />
                    </View>

                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
                            <Text style={[styles.buttonText, { color: COLORS.textSecondary }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleConfirmDelivery} disabled={isSaving}>
                            {isSaving ? <ActivityIndicator color={COLORS.primaryDark} /> : <Text style={styles.buttonText}>Confirmar</Text>}
                        </TouchableOpacity>
                    </View>
                {/* --- INICIO CAMBIO TECLADO --- */}
                </View> 
            </KeyboardAvoidingView>
            {/* --- FIN CAMBIO TECLADO --- */}
        </Modal>
    );
};
// =================================================================================
// --- FIN Componente DeliveryAdjustmentModal ---
// =================================================================================


// --- Pantalla Principal: RouteDetailScreen ---
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
                location: clientData?.location,
                telefono: clientData?.telefono,
                items: f.items || [] 
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
            `¿Está seguro que desea ANULAR la visita a ${invoice.clienteNombre}? ESTA ACCIÓN DEVOLVERÁ EL STOCK AL INVENTARIO.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sí, Anular",
                    style: "destructive",
                    onPress: async () => {
                        setIsUpdating(true);
                        try {
                            const batch = writeBatch(db);
                            const saleRef = doc(db, 'ventas', invoice.id);
                            const routeRef = doc(db, 'rutas', routeId);

                            batch.update(saleRef, {
                                estado: 'Anulada',
                                saldoPendiente: invoice.totalVenta
                            });

                            const updatedFacturas = localInvoices.map(f =>
                                f.id === invoice.id ? { ...f, estadoVisita: 'Anulada' as const } : f
                            );
                            batch.update(routeRef, { facturas: updatedFacturas });

                            invoice.items.forEach(item => {
                                const productRef = doc(db, 'productos', item.productId);
                                batch.update(productRef, { stock: increment(item.quantity) });
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
                <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMap(item)} disabled={!item.location}>
                    <Feather name="map-pin" size={20} color={item.location ? COLORS.primary : COLORS.disabled} />
                    <Text style={[styles.actionButtonText, !item.location && { color: COLORS.disabled }]}>Mapa</Text>
                </TouchableOpacity>
                 <TouchableOpacity style={styles.actionButton} onPress={() => handleCallClient(item)} disabled={!item.telefono}>
                    <Feather name="phone" size={20} color={item.telefono ? COLORS.primary : COLORS.disabled} />
                    <Text style={[styles.actionButtonText, !item.telefono && { color: COLORS.disabled }]}>Llamar</Text>
                </TouchableOpacity>
                
                {currentRoute.estado !== 'Completada' && currentRoute.estado !== 'Archivada' && (
                    <>
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

                                <TouchableOpacity style={[styles.actionButton, styles.mainActionButton]} onPress={() => openAdjustmentModal(item)}>
                                    <Feather name="edit" size={20} color={COLORS.primaryDark} />
                                    <Text style={[styles.actionButtonText, { color: COLORS.primaryDark, fontWeight: 'bold' }]}>Gestionar</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </>
                )}
            </View>
             <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{item.estadoVisita}</Text>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

             <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Detalle de Ruta</Text>
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
                            size={24}
                            color={routeReport.pendientes === 0 && currentRoute.estado !== 'Completada' && currentRoute.estado !== 'Archivada' ? COLORS.success : COLORS.disabled}
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

// --- Estilos ---
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
    
    // --- Estilos del Modal de Gestión ---
    // --- INICIO CAMBIO TECLADO ---
    keyboardAvoidingContainer: {
        flex: 1, // Ocupa todo el overlay
        justifyContent: 'center', // Centra el contenido
        alignItems: 'center',
        width: '100%',
    },
    // --- FIN CAMBIO TECLADO ---
    adjustmentModalContent: {
        width: '95%', // El contenido del modal
        maxHeight: '85%',
        backgroundColor: COLORS.backgroundStart, 
        borderRadius: 20, 
        padding: 20, 
        borderWidth: 1, 
        borderColor: COLORS.glassBorder 
    },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
    
    itemList: { 
        marginBottom: 15, 
        maxHeight: '40%',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: COLORS.glassBorder,
        flexGrow: 0, // Evita que la flatlist crezca infinitamente
    },
    itemRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 10, 
        borderBottomWidth: 1, 
        borderBottomColor: COLORS.glassBorder 
    },
    itemName: { flex: 1, color: COLORS.textPrimary, fontSize: 16, marginRight: 8 },
    quantityControl: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.glass, 
        borderRadius: 10 
    },
    quantityButton: { padding: 8 },
    quantityText: { 
        color: COLORS.textPrimary, 
        fontWeight: 'bold', 
        fontSize: 16, 
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    quantityInput: {
        color: COLORS.textPrimary,
        fontWeight: 'bold',
        fontSize: 16,
        paddingHorizontal: 10,
        paddingVertical: Platform.OS === 'android' ? 6 : 10,
        minWidth: 40,
        textAlign: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 5,
        marginHorizontal: 2,
    },
    itemTotal: { width: 80, textAlign: 'right', color: COLORS.textPrimary, fontWeight: 'bold', fontSize: 16 },

    summaryContainer: { 
        paddingVertical: 10, 
        marginBottom: 15 
    },
    summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
    summaryValueOriginal: { fontSize: 18, color: COLORS.textSecondary, fontWeight: 'bold', textDecorationLine: 'line-through', textAlign: 'right' },
    summaryValueFinal: { fontSize: 24, color: COLORS.success, fontWeight: 'bold', textAlign: 'right' },

    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, marginBottom: 15, height: 58 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16 },
    
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
    modalButton: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
    cancelButton: { backgroundColor: COLORS.disabled },
    confirmButton: { backgroundColor: COLORS.primary },
    buttonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },

    totalButton: {},
    totalButtonText: {},
});

export default RouteDetailScreen;