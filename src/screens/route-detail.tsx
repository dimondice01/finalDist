// src/screens/route-detail.tsx

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- FIREBASE NATIVO ---
import firestore from '@react-native-firebase/firestore';

// --- CONTEXTO Y UTILS ---
import { useData } from '../../context/DataContext';
import { COLORS, SIZES } from '../../styles/theme';
import type { RouteDetailScreenProps } from '../navigation/AppNavigator';

const formatCurrency = (value?: number) =>
    typeof value === 'number'
        ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0,00';

// --- INTERFACES ---
interface ProductItem {
    id: string;
    productId?: string;
    nombre: string;
    quantity: number;
    precio: number;
    originalQuantity?: number; 
}

interface Invoice {
    id: string;
    clienteId: string;
    clienteNombre: string;
    clienteDireccion: string;
    totalVenta: number;
    saldoPendiente: number;
    pagoEfectivo?: number;
    pagoTransferencia?: number;
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda';
    location?: { latitude: number; longitude: number };
    telefono?: string;
    items: ProductItem[];
}

// =================================================================================
// MODAL DE GESTIÓN DE ENTREGA
// =================================================================================

interface DeliveryModalProps {
    visible: boolean;
    onClose: () => void;
    invoice: Invoice;
    routeId: string;
    onSuccess: () => void;
}

const DeliveryModal = ({ visible, onClose, invoice, routeId, onSuccess }: DeliveryModalProps) => {
    const [items, setItems] = useState<ProductItem[]>([]);
    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (visible && invoice) {
            setPagoEfectivo(invoice.pagoEfectivo ? invoice.pagoEfectivo.toString() : '');
            setPagoTransferencia(invoice.pagoTransferencia ? invoice.pagoTransferencia.toString() : '');
            
            const hasItems = invoice.items && invoice.items.length > 0;

            if (hasItems) {
                prepareItems(invoice.items);
            } else {
                fetchFullSale(invoice.id);
            }
        }
    }, [visible, invoice]);

    const fetchFullSale = async (saleId: string) => {
        setIsLoadingItems(true);
        try {
            const saleDoc = await firestore().collection('ventas').doc(saleId).get();
            if (saleDoc.exists()) {
                const saleData = saleDoc.data();
                const saleItems = saleData?.items || [];
                if (saleItems.length > 0) {
                    prepareItems(saleItems);
                } else {
                    Toast.show({ type: 'error', text1: 'Datos incompletos', text2: 'La venta no tiene productos.' });
                }
            } else {
                 Toast.show({ type: 'error', text1: 'Error', text2: 'Venta no encontrada en base de datos.' });
            }
        } catch (error) {
            console.error("Error fetching sale:", error);
            Toast.show({ type: 'error', text1: 'Error de conexión' });
        } finally {
            setIsLoadingItems(false);
        }
    };

    const prepareItems = (rawItems: any[]) => {
        const mappedItems = rawItems.map(i => ({
            id: i.id || i.productId || '', 
            productId: i.productId || i.id || '',
            nombre: i.nombre || 'Producto',
            quantity: typeof i.quantity === 'number' ? i.quantity : 0,
            precio: typeof i.precio === 'number' ? i.precio : 0,
            originalQuantity: typeof i.originalQuantity === 'number' ? i.originalQuantity : (typeof i.quantity === 'number' ? i.quantity : 0)
        }));
        setItems(JSON.parse(JSON.stringify(mappedItems)));
    };

    const { totalVentaNuevo, totalPagado, saldoRestante, nuevoEstado } = useMemo(() => {
        if (isLoadingItems && items.length === 0) {
            return { 
                totalVentaNuevo: invoice.totalVenta, 
                totalPagado: (invoice.pagoEfectivo || 0) + (invoice.pagoTransferencia || 0),
                saldoRestante: invoice.saldoPendiente,
                nuevoEstado: invoice.estadoVisita
            };
        }

        const total = items.reduce((acc, item) => acc + (item.precio * item.quantity), 0);
        const efectivo = parseFloat(pagoEfectivo.replace(',', '.')) || 0;
        const transfe = parseFloat(pagoTransferencia.replace(',', '.')) || 0;
        const pagado = efectivo + transfe;
        const saldo = parseFloat(Math.max(0, total - pagado).toFixed(2));

        let estado: Invoice['estadoVisita'] = 'Pendiente';
        if (total === 0 && pagado === 0 && items.length > 0) {
            estado = 'Anulada'; // Todos los items rechazados
        } else if (saldo <= 10) {
            estado = 'Pagada';
        } else {
            estado = 'Adeuda';
        }

        return { totalVentaNuevo: total, totalPagado: pagado, saldoRestante: saldo, nuevoEstado: estado };
    }, [items, pagoEfectivo, pagoTransferencia, isLoadingItems, invoice]);

    const handleQuantityChange = (index: number, delta: number) => {
        const newItems = [...items];
        const item = newItems[index];
        const maxStock = item.originalQuantity || item.quantity; 

        let newQty = item.quantity + delta;
        if (newQty < 0) newQty = 0;
        if (newQty > maxStock) {
            Toast.show({ type: 'info', text1: 'Stock Máximo', text2: 'No puedes entregar más de lo cargado.' });
            newQty = maxStock;
        }

        if (newQty !== item.quantity) {
            item.quantity = newQty;
            setItems(newItems);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleConfirmTransaction = async () => {
        if (totalPagado > totalVentaNuevo) {
            Alert.alert("Montos Incorrectos", `El pago (${formatCurrency(totalPagado)}) supera el total (${formatCurrency(totalVentaNuevo)}).`);
            return;
        }

        setIsSaving(true);
        try {
            await firestore().runTransaction(async (transaction) => {
                const routeRef = firestore().collection('rutas').doc(routeId);
                const saleRef = firestore().collection('ventas').doc(invoice.id);

                const routeDoc = await transaction.get(routeRef);
                if (!routeDoc.exists()) throw new Error("Ruta no encontrada");

                // 1. STOCK
                for (const item of items) {
                    if (!item.id) continue;
                    const cargado = item.originalQuantity || 0;
                    const entregado = item.quantity;
                    const devolucion = cargado - entregado;

                    if (devolucion > 0) {
                        const prodRef = firestore().collection('productos').doc(item.id);
                        transaction.update(prodRef, { stock: firestore.FieldValue.increment(devolucion) });
                    }
                }

                // 2. SANITIZAR DATOS
                const itemsToSave = items.map(item => ({
                    id: item.id,
                    productId: item.productId || item.id, 
                    nombre: item.nombre || 'Sin nombre',
                    quantity: Number(item.quantity),
                    precio: Number(item.precio),
                    originalQuantity: Number(item.originalQuantity)
                }));

                // 3. ACTUALIZAR VENTA
                const saleDataUpdate = {
                    items: itemsToSave,
                    totalVenta: Number(totalVentaNuevo),
                    pagoEfectivo: parseFloat(pagoEfectivo.replace(',', '.')) || 0,
                    pagoTransferencia: parseFloat(pagoTransferencia.replace(',', '.')) || 0,
                    saldoPendiente: Number(saldoRestante),
                    estado: nuevoEstado === 'Adeuda' ? 'Pendiente de Entrega' : nuevoEstado, 
                    fechaUltimoPago: firestore.FieldValue.serverTimestamp()
                };
                transaction.update(saleRef, saleDataUpdate);

                // 4. ACTUALIZAR RUTA
                const routeData = routeDoc.data();
                // @ts-ignore
                const currentInvoices = routeData?.facturas || [];
                const updatedFacturas = currentInvoices.map((f: any) => {
                    if (f.id === invoice.id) {
                        return {
                            ...f,
                            items: itemsToSave,
                            totalVenta: saleDataUpdate.totalVenta,
                            pagoEfectivo: saleDataUpdate.pagoEfectivo,
                            pagoTransferencia: saleDataUpdate.pagoTransferencia,
                            saldoPendiente: saleDataUpdate.saldoPendiente,
                            estadoVisita: nuevoEstado,
                        };
                    }
                    return f;
                });
                transaction.update(routeRef, { facturas: updatedFacturas });
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Toast.show({ type: 'success', text1: 'Entrega Registrada' });
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Transaction Error:", error);
            Alert.alert("Error", "No se pudo guardar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={modalStyles.container}>
                <View style={modalStyles.content}>
                    <View style={modalStyles.header}>
                        <View>
                            <Text style={modalStyles.title}>Gestionar Entrega</Text>
                            <Text style={modalStyles.subtitle}>{invoice.clienteNombre}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
                            <Feather name="x" size={24} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={modalStyles.sectionHeader}>
                        <Text style={modalStyles.sectionTitle}>PRODUCTOS</Text>
                        <Text style={modalStyles.sectionInfo}>(Ajustar rechazos)</Text>
                    </View>

                    {isLoadingItems ? (
                        <ActivityIndicator size="large" color={COLORS.primary} style={{margin: 20}} />
                    ) : (
                        <FlatList
                            data={items}
                            keyExtractor={(item, index) => (item.id || index).toString()}
                            style={modalStyles.list}
                            renderItem={({ item, index }) => (
                                <View style={modalStyles.itemRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={modalStyles.itemName}>{item.nombre}</Text>
                                        <Text style={modalStyles.itemPriceUnit}>{formatCurrency(item.precio)} c/u</Text>
                                    </View>
                                    <View style={modalStyles.qtyContainer}>
                                        <TouchableOpacity onPress={() => handleQuantityChange(index, -1)} style={modalStyles.qtyBtn}>
                                            <Feather name="minus" size={18} color={COLORS.primary} />
                                        </TouchableOpacity>
                                        <Text style={modalStyles.qtyText}>{item.quantity}</Text>
                                        <TouchableOpacity 
                                            onPress={() => handleQuantityChange(index, 1)}
                                            style={[modalStyles.qtyBtn, item.quantity >= (item.originalQuantity || 9999) && modalStyles.qtyBtnDisabled]}
                                            disabled={item.quantity >= (item.originalQuantity || 9999)}
                                        >
                                            <Feather name="plus" size={18} color={COLORS.white} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={modalStyles.itemSubtotal}>{formatCurrency(item.quantity * item.precio)}</Text>
                                </View>
                            )}
                        />
                    )}

                    <View style={modalStyles.summaryContainer}>
                        <View style={modalStyles.summaryRow}>
                            <Text style={modalStyles.summaryLabel}>Original:</Text>
                            <Text style={[modalStyles.summaryValue, { textDecorationLine: 'line-through', color: '#999' }]}>{formatCurrency(invoice.totalVenta)}</Text>
                        </View>
                        <View style={modalStyles.summaryRow}>
                            <Text style={[modalStyles.summaryLabel, { color: COLORS.textPrimary, fontWeight: 'bold' }]}>A COBRAR:</Text>
                            <Text style={[modalStyles.summaryValue, { color: COLORS.primary, fontSize: 18 }]}>{formatCurrency(totalVentaNuevo)}</Text>
                        </View>
                    </View>

                    <View style={modalStyles.paymentSection}>
                        <Text style={modalStyles.sectionTitle}>REGISTRAR PAGO</Text>
                        <View style={modalStyles.inputRow}>
                            <Feather name="dollar-sign" size={20} color={COLORS.textSecondary} style={{ marginRight: 10 }} />
                            <TextInput style={modalStyles.input} placeholder="Efectivo" keyboardType="numeric" value={pagoEfectivo} onChangeText={setPagoEfectivo} />
                        </View>
                        <View style={modalStyles.inputRow}>
                            <Feather name="credit-card" size={20} color={COLORS.textSecondary} style={{ marginRight: 10 }} />
                            <TextInput style={modalStyles.input} placeholder="Transferencia" keyboardType="numeric" value={pagoTransferencia} onChangeText={setPagoTransferencia} />
                        </View>
                    </View>

                    <View style={modalStyles.footer}>
                        <TouchableOpacity 
                            style={[modalStyles.confirmBtn, isSaving && { opacity: 0.7 }]}
                            onPress={handleConfirmTransaction}
                            disabled={isSaving || isLoadingItems}
                        >
                            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={modalStyles.confirmBtnText}>CONFIRMAR ENTREGA</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};


// =================================================================================
// PANTALLA PRINCIPAL
// =================================================================================

const RouteDetailScreen = ({ route, navigation }: RouteDetailScreenProps) => {
    const routeId = route.params?.routeId;
    const { routes, clients, sales, syncData } = useData();
    
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const routeData = useMemo(() => {
        const r = routes.find(rt => rt.id === routeId);
        if (!r) return null;

        const enrichedInvoices = (r.facturas || []).map((inv: any) => {
            // 1. Intentamos sacar el ID directamente
            let targetId = (inv.clienteId || inv.clientId || '').trim();
            
            // 2. PUENTE: Si no hay ID, buscamos la venta original por ID de factura
            if (!targetId) {
                const linkedSale = sales.find(s => s.id === inv.id);
                if (linkedSale && linkedSale.clienteId) {
                    targetId = linkedSale.clienteId;
                }
            }

            // 3. Buscar cliente
            const client = clients.find(c => c.id === targetId);

            return {
                ...inv,
                clienteNombre: client?.nombre || inv.clienteNombre || 'Cliente Desconocido',
                clienteDireccion: client?.direccion || inv.clienteDireccion,
                // Datos críticos para botones:
                location: client?.location || inv.location || null,
                telefono: client?.telefono || inv.telefono || null,
                items: inv.items || [] 
            } as Invoice;
        });

        // ✅ ORDENAMIENTO: PENDIENTES PRIMERO
        enrichedInvoices.sort((a: Invoice, b: Invoice) => {
            const scoreA = a.estadoVisita === 'Pendiente' ? 0 : 1;
            const scoreB = b.estadoVisita === 'Pendiente' ? 0 : 1;
            return scoreA - scoreB;
        });

        return { ...r, facturas: enrichedInvoices };
    }, [routeId, routes, clients, sales]);

    // --- ACCIONES DE BOTONES ---
    
    const handleSuccessUpdate = async () => {
        await syncData();
    };

    const handleOpenModal = (invoice: Invoice) => {
        if (invoice.estadoVisita === 'Anulada') {
            Toast.show({ type: 'info', text1: 'Anulada', text2: 'Esta parada fue anulada.' });
        }
        setSelectedInvoice(invoice);
        setModalVisible(true);
    };

    const handleCall = (phone?: string) => {
        if (!phone || phone.trim() === '') {
            return Toast.show({ type: 'info', text1: 'Sin datos', text2: 'El cliente no tiene teléfono registrado.' });
        }
        Linking.openURL(`tel:${phone}`);
    };

    const handleWhatsApp = (phone?: string, name?: string) => {
        if (!phone || phone.trim() === '') {
            return Toast.show({ type: 'info', text1: 'Sin datos', text2: 'El cliente no tiene teléfono registrado.' });
        }
        let number = phone.replace(/[^\d]/g, '');
        const message = `Hola ${name || ''}, le escribo de la distribuidora.`;
        const url = `whatsapp://send?phone=${number}&text=${encodeURIComponent(message)}`;
        
        Linking.openURL(url).catch(() => {
            Toast.show({ type: 'error', text1: 'Error', text2: 'WhatsApp no instalado.' });
        });
    };

    const handleNavigate = (lat?: number, lng?: number, label?: string) => {
        if (!lat || !lng) {
            return Toast.show({ type: 'info', text1: 'Sin ubicación', text2: 'El cliente no tiene coordenadas GPS.' });
        }
        const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
        const latLng = `${lat},${lng}`;
        const url = Platform.select({
            ios: `${scheme}${label}@${latLng}`,
            android: `${scheme}${latLng}(${label})`
        });
        if(url) Linking.openURL(url);
    };

    const handleResetStop = (invoice: Invoice) => {
        Alert.alert(
            "Revertir Parada",
            "Se volverá a marcar como 'Pendiente' y se reiniciará el saldo. ¿Continuar?",
            [
                { text: "Cancelar", style: "cancel" },
                { text: "Sí, Revertir", style: "destructive", onPress: async () => {
                    setIsUpdating(true);
                    try {
                        await firestore().runTransaction(async (transaction) => {
                            const routeRef = firestore().collection('rutas').doc(routeId);
                            const saleRef = firestore().collection('ventas').doc(invoice.id);
                            const routeDoc = await transaction.get(routeRef);
                            
                            if (!routeDoc.exists()) throw new Error("Ruta no existe");

                            transaction.update(saleRef, {
                                estado: 'Pendiente de Entrega',
                                estadoVisita: 'Pendiente', 
                                saldoPendiente: invoice.totalVenta, 
                                pagoEfectivo: 0,
                                pagoTransferencia: 0,
                            });

                            const routeData = routeDoc.data();
                            // @ts-ignore
                            const invoices = routeData?.facturas || [];
                            const newInvoices = invoices.map((f: any) => {
                                if (f.id === invoice.id) {
                                    return {
                                        ...f,
                                        estadoVisita: 'Pendiente',
                                        saldoPendiente: invoice.totalVenta,
                                        pagoEfectivo: 0,
                                        pagoTransferencia: 0
                                    };
                                }
                                return f;
                            });
                            transaction.update(routeRef, { facturas: newInvoices });
                        });
                        
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Toast.show({ type: 'success', text1: 'Parada Revertida' });
                        await syncData();
                    } catch (e: any) {
                        Alert.alert("Error", e.message);
                    } finally {
                        setIsUpdating(false);
                    }
                }}
            ]
        );
    };

    const handleFinalizeRoute = () => {
        if (!routeData) return;
        const pendientes = routeData.facturas.filter(f => f.estadoVisita === 'Pendiente').length;

        if (pendientes > 0) {
            Alert.alert("Ruta Incompleta", `Quedan ${pendientes} paradas pendientes. ¿Finalizar de todos modos?`, [
                { text: "Cancelar", style: "cancel" },
                { text: "Sí, Finalizar", style: "destructive", onPress: executeFinalize }
            ]);
        } else {
            Alert.alert("Finalizar Ruta", "¿Confirmas que terminaste el recorrido?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Sí, Finalizar", onPress: executeFinalize }
            ]);
        }
    };

    const executeFinalize = async () => {
        setIsUpdating(true);
        try {
            await firestore().collection('rutas').doc(routeId).update({
                estado: 'Completada',
                fechaFin: firestore.FieldValue.serverTimestamp()
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Toast.show({ type: 'success', text1: 'Ruta Finalizada' });
            navigation.goBack();
        } catch (e: any) {
            Alert.alert("Error", e.message);
        } finally {
            setIsUpdating(false);
        }
    };

    if (!routeData) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    const totalVisitas = routeData.facturas.length;
    const visitadas = routeData.facturas.filter(f => f.estadoVisita !== 'Pendiente').length;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>{routeData.id}</Text>
                    <Text style={styles.headerSubtitle}>Avance: {visitadas} / {totalVisitas}</Text>
                </View>
            </View>

            <FlatList
                data={routeData.facturas}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: SIZES.medium, paddingBottom: 120 }}
                renderItem={({ item }) => {
                    const isPendiente = item.estadoVisita === 'Pendiente';
                    const isPagada = item.estadoVisita === 'Pagada';
                    const isAdeuda = item.estadoVisita === 'Adeuda';
                    const isAnulada = item.estadoVisita === 'Anulada';

                    let borderColor = COLORS.glassBorder;
                    if (isPagada) borderColor = COLORS.success;
                    if (isAdeuda) borderColor = COLORS.warning;
                    if (isAnulada) borderColor = COLORS.danger;

                    return (
                        <View style={[styles.card, { borderLeftColor: borderColor, borderLeftWidth: 5 }]}>
                            <View style={styles.cardHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.clientName}>{item.clienteNombre}</Text>
                                    <Text style={styles.clientAddress} numberOfLines={1}>{item.clienteDireccion || 'Sin dirección'}</Text>
                                </View>
                                <View style={[styles.badge, { backgroundColor: borderColor + '20' }]}>
                                    <Text style={{ color: isPendiente ? COLORS.textSecondary : borderColor, fontWeight: 'bold', fontSize: 10 }}>
                                        {item.estadoVisita.toUpperCase()}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.cardBody}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.label}>Total:</Text>
                                    <Text style={styles.value}>{formatCurrency(item.totalVenta)}</Text>
                                </View>
                                {(isAdeuda || isPagada) && (
                                    <View style={styles.rowBetween}>
                                        <Text style={[styles.label, { color: isAdeuda ? COLORS.warning : COLORS.success }]}>
                                            {isAdeuda ? 'Saldo Deudor:' : 'Pagado:'}
                                        </Text>
                                        <Text style={[styles.value, { color: isAdeuda ? COLORS.warning : COLORS.success }]}>
                                            {isAdeuda ? formatCurrency(item.saldoPendiente) : 'Completo'}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.quickActions}>
                                <TouchableOpacity style={styles.qaBtn} onPress={() => handleCall(item.telefono)}>
                                    <Feather name="phone" size={18} color={COLORS.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.qaBtn} onPress={() => handleWhatsApp(item.telefono, item.clienteNombre)}>
                                    <Feather name="message-circle" size={18} color="#25D366" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.qaBtn} onPress={() => handleNavigate(item.location?.latitude, item.location?.longitude, item.clienteNombre)}>
                                    <Feather name="map" size={18} color={COLORS.secondary} />
                                </TouchableOpacity>
                                {!isPendiente && (
                                    <TouchableOpacity style={styles.qaBtn} onPress={() => handleResetStop(item)}>
                                        <Feather name="rotate-ccw" size={18} color={COLORS.warning} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <TouchableOpacity 
                                style={[styles.mainActionBtn, isAnulada && { backgroundColor: COLORS.disabled }]}
                                onPress={() => handleOpenModal(item)}
                            >
                                <Text style={styles.mainActionText}>
                                    {isPendiente ? 'GESTIONAR ENTREGA' : 'VER / EDITAR DETALLE'}
                                </Text>
                                <Feather name="chevron-right" size={16} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    );
                }}
            />
            
            {routeData.estado !== 'Completada' && (
                <View style={styles.floatingFooter}>
                    <TouchableOpacity 
                        style={[styles.finalizeBtn, isUpdating && { opacity: 0.7 }]} 
                        onPress={handleFinalizeRoute}
                        disabled={isUpdating}
                    >
                        {isUpdating ? <ActivityIndicator color="#FFF" /> : (
                            <>
                                <Feather name="check-circle" size={20} color="#FFF" style={{marginRight: 10}} />
                                <Text style={styles.finalizeText}>FINALIZAR RUTA</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {selectedInvoice && (
                <DeliveryModal 
                    visible={modalVisible}
                    invoice={selectedInvoice}
                    routeId={routeData.id}
                    onClose={() => setModalVisible(false)}
                    onSuccess={handleSuccessUpdate}
                />
            )}

        </SafeAreaView>
    );
};

// =================================================================================
// ESTILOS
// =================================================================================
const modalStyles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    content: { backgroundColor: '#F2F2F7', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
    closeBtn: { padding: 5 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    sectionTitle: { fontSize: 12, fontWeight: '900', color: '#8E8E93', letterSpacing: 1 },
    sectionInfo: { fontSize: 11, color: COLORS.primary },
    list: { maxHeight: 250 },
    itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, marginHorizontal: 20, marginBottom: 8, borderRadius: 12 },
    itemName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
    itemPriceUnit: { fontSize: 12, color: COLORS.textSecondary },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 8, marginHorizontal: 10 },
    qtyBtn: { padding: 8, backgroundColor: '#E5E5EA', borderRadius: 8 },
    qtyBtnDisabled: { backgroundColor: '#F2F2F7', opacity: 0.3 },
    qtyText: { width: 30, textAlign: 'center', fontWeight: 'bold', fontSize: 14 },
    itemSubtotal: { width: 70, textAlign: 'right', fontWeight: 'bold', fontSize: 14 },
    summaryContainer: { padding: 20, backgroundColor: '#FFF', marginVertical: 10 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
    summaryValue: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
    paymentSection: { paddingHorizontal: 20 },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 15, height: 50, marginBottom: 10, borderWidth: 1, borderColor: '#E5E5EA' },
    input: { flex: 1, fontSize: 16, color: COLORS.textPrimary, height: '100%' },
    footer: { padding: 20, backgroundColor: '#FFF', marginTop: 10 },
    statusPreview: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    confirmBtn: { backgroundColor: COLORS.primary, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 }
});

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'transparent' },
    backBtn: { padding: 8, backgroundColor: '#FFF', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, marginLeft: 15 },
    headerSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 15 },
    card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 15, marginHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
    clientName: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
    clientAddress: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, justifyContent: 'center' },
    cardBody: { padding: 15, paddingBottom: 5 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    label: { fontSize: 14, color: COLORS.textSecondary },
    value: { fontSize: 14, fontWeight: 'bold', color: COLORS.textPrimary },
    quickActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F2F2F7', backgroundColor: '#FAFAFA' },
    qaBtn: { padding: 10, borderRadius: 8, backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1, width: 50, alignItems: 'center' },
    mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, paddingVertical: 12 },
    mainActionText: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginRight: 5, letterSpacing: 0.5 },
    floatingFooter: { position: 'absolute', bottom: 20, left: 20, right: 20 },
    finalizeBtn: { flexDirection: 'row', backgroundColor: COLORS.success, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.success, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: {width: 0, height: 4}, elevation: 6 },
    finalizeText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }
});

export default RouteDetailScreen;