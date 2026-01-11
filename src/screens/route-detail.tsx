// src/screens/route-detail.tsx
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- FIREBASE ---
import firestore from '@react-native-firebase/firestore';
// Usamos funciones nativas de React Native Firebase para evitar errores de contexto
import functions from '@react-native-firebase/functions';
import { auth } from '../../db/firebase-service';

// --- CONTEXTO Y UTILS ---
import { useData } from '../../context/DataContext';
import { COLORS, SIZES } from '../../styles/theme';
import type { RouteDetailScreenProps } from '../navigation/AppNavigator';

const formatCurrency = (value?: number) =>
    typeof value === 'number'
        ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0,00';

// --- UTILIDADES DE RUTA ---
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const optimizeInvoices = (invoices: Invoice[]): Invoice[] => {
    const withLoc = invoices.filter(i => i.location?.latitude && i.location?.longitude);
    const withoutLoc = invoices.filter(i => !i.location?.latitude || !i.location?.longitude);

    if (withLoc.length < 2) return [...withLoc, ...withoutLoc];

    let current = withLoc[0];
    let remaining = withLoc.slice(1);
    const sorted: Invoice[] = [current];

    while (remaining.length > 0) {
        let nearestIndex = -1;
        let minDist = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const dist = getDistance(
                current.location!.latitude, current.location!.longitude,
                candidate.location!.latitude, candidate.location!.longitude
            );
            if (dist < minDist) {
                minDist = dist;
                nearestIndex = i;
            }
        }

        if (nearestIndex !== -1) {
            const next = remaining[nearestIndex];
            sorted.push(next);
            current = next;
            remaining.splice(nearestIndex, 1);
        } else {
            break;
        }
    }

    return [...sorted, ...withoutLoc];
};

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
    estadoVisita: 'Pendiente' | 'Pagada' | 'Anulada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo';
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
    externalPosId?: string; 
}

const DeliveryModal = ({ visible, onClose, invoice, routeId, onSuccess, externalPosId }: DeliveryModalProps) => {
    const [items, setItems] = useState<ProductItem[]>([]);
    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- ESTADOS MP ---
    const [mpLoading, setMpLoading] = useState(false);
    const [mpStatus, setMpStatus] = useState('');

    useEffect(() => {
        if (visible && invoice) {
            setPagoEfectivo(invoice.pagoEfectivo ? invoice.pagoEfectivo.toString() : '');
            setPagoTransferencia(invoice.pagoTransferencia ? invoice.pagoTransferencia.toString() : '');
            setMpStatus('');
            setMpLoading(false);
            
            const hasItems = invoice.items && invoice.items.length > 0;

            if (hasItems) {
                prepareItems(invoice.items);
            } else {
                fetchFullSale(invoice.id);
            }
        }
    }, [visible, invoice]);

    // Listener Realtime (Detectar Pago Webhook)
    useEffect(() => {
        if (!visible || !invoice?.id) return;

        const unsubscribe = firestore().collection('ventas').doc(invoice.id).onSnapshot(
            (docSnap) => {
                const data = docSnap.data();
                if (data && (data.estado === 'Pagada' || (data.saldoPendiente || 0) <= 10)) {
                    if (!isSaving) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Toast.show({ type: 'success', text1: '¡Pago Acreditado!', text2: 'Detectado automáticamente.' });
                        setTimeout(() => {
                            onSuccess();
                            onClose();
                        }, 1500);
                    }
                }
            },
            (error) => console.log("Listener Error:", error)
        );

        return () => unsubscribe();
    }, [visible, invoice?.id, isSaving]);

    const fetchFullSale = async (saleId: string) => {
        setIsLoadingItems(true);
        try {
            const saleDoc = await firestore().collection('ventas').doc(saleId).get();
            if (saleDoc.exists()) { // TS: .exists es propiedad en nativo
                const saleData = saleDoc.data();
                const saleItems = saleData?.items || [];
                if (saleItems.length > 0) {
                    prepareItems(saleItems);
                } else {
                    Toast.show({ type: 'error', text1: 'Datos incompletos', text2: 'La venta no tiene productos.' });
                }
            }
        } catch (error) {
            console.error("Error fetching sale:", error);
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
            estado = 'Anulada';
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Toast.show({ type: 'info', text1: 'Stock Máximo', text2: 'No puedes entregar más de lo cargado.' });
            newQty = maxStock;
        }

        if (newQty !== item.quantity) {
            item.quantity = newQty;
            setItems(newItems);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    // --- LÓGICA MERCADOPAGO POINT (Nativo) ---
    const handlePointPayment = async () => {
        setMpLoading(true);
        setMpStatus('Buscando Point...');

        try {
            // Usamos functions() nativo
            const obtenerTerminales = functions().httpsCallable('obtenerTerminales');
            const resDevices: any = await obtenerTerminales();
            
            // En nativo, la data suele venir directa en .data
            const devices = resDevices.data?.devices || resDevices.data || [];

            if (!Array.isArray(devices) || devices.length === 0) {
                throw new Error("No hay terminales vinculadas.");
            }

            const targetDevice = devices[0].id;
            setMpStatus(`Enviando a ${devices[0].name}...`);

            // Enviar Orden
            const cobrarConPoint = functions().httpsCallable('cobrarConPoint');
            await cobrarConPoint({
                deviceId: targetDevice,
                amount: saldoRestante,
                externalReference: invoice.id
            });

            setMpStatus('Esperando tarjeta en el Point...');

        } catch (error: any) {
            console.error(error);
            Alert.alert("Error Point", error.message || "Error desconocido");
            setMpLoading(false);
        }
    };

    // --- LÓGICA QR FIJO (Nativo) ---
    const handleQrPayment = async () => {
        if (!externalPosId) {
            Alert.alert("Sin Caja Asignada", "Tu usuario no tiene una Caja MP configurada.");
            return;
        }

        setMpLoading(true);
        setMpStatus('Activando QR del Camión...');

        try {
            const activarQrFijo = functions().httpsCallable('activarQrFijo');
            
            await activarQrFijo({
                externalPosId: externalPosId,
                amount: saldoRestante,
                externalReference: invoice.id,
                title: `Pedido ${invoice.clienteNombre}`,
                items: [{ title: 'Productos Varios', unit_price: saldoRestante, quantity: 1, total_amount: saldoRestante }]
            });

            setMpStatus('¡Listo! Escaneá el Sticker ahora.');

        } catch (error: any) {
            console.error(error);
            Alert.alert("Error QR", error.message || "Error desconocido");
            setMpLoading(false);
        }
    };

    const handleConfirmTransaction = async () => {
        if (totalPagado > totalVentaNuevo + 10) {
            Alert.alert("Montos Incorrectos", `El pago (${formatCurrency(totalPagado)}) supera el total (${formatCurrency(totalVentaNuevo)}).`);
            return;
        }

        setIsSaving(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        try {
            await firestore().runTransaction(async (transaction) => {
                const routeRef = firestore().collection('rutas').doc(routeId);
                const saleRef = firestore().collection('ventas').doc(invoice.id);

                const routeDoc = await transaction.get(routeRef);
                if (!routeDoc.exists) throw new Error("Ruta no encontrada");

                // Stock
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

                const itemsToSave = items.map(item => ({
                    id: item.id,
                    productId: item.productId || item.id, 
                    nombre: item.nombre || 'Sin nombre',
                    quantity: Number(item.quantity),
                    precio: Number(item.precio),
                    originalQuantity: Number(item.originalQuantity)
                }));

                const saleDataUpdate = {
                    items: itemsToSave,
                    totalVenta: Number(totalVentaNuevo),
                    pagoEfectivo: parseFloat(pagoEfectivo.replace(',', '.')) || 0,
                    pagoTransferencia: parseFloat(pagoTransferencia.replace(',', '.')) || 0,
                    saldoPendiente: Number(saldoRestante),
                    estado: nuevoEstado === 'Adeuda' || nuevoEstado === 'Pagada' ? nuevoEstado : 'Pendiente de Entrega', 
                    estadoVisita: nuevoEstado, 
                    fechaUltimoPago: firestore.FieldValue.serverTimestamp()
                };
                transaction.update(saleRef, saleDataUpdate);

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
                    
                    {/* Header Modal */}
                    <View style={modalStyles.header}>
                        <View>
                            <Text style={modalStyles.title}>Gestionar Entrega</Text>
                            <Text style={modalStyles.subtitle}>{invoice.clienteNombre}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
                            <Feather name="x" size={24} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                        {/* Lista de Productos */}
                        <View style={modalStyles.sectionHeader}>
                            <Text style={modalStyles.sectionTitle}>PRODUCTOS</Text>
                            <Text style={modalStyles.sectionInfo}>(Ajustar si hubo rechazo)</Text>
                        </View>

                        {isLoadingItems ? (
                            <ActivityIndicator size="large" color={COLORS.primary} style={{margin: 20}} />
                        ) : (
                            items.map((item, index) => (
                                <View key={(item.id || index).toString()} style={modalStyles.itemRow}>
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
                            ))
                        )}

                        {/* Resumen Financiero */}
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

                        {/* --- SECCIÓN MERCADOPAGO --- */}
                        <View style={modalStyles.paymentSection}>
                            <Text style={modalStyles.sectionTitle}>MEDIOS DIGITALES</Text>
                            
                            {mpLoading ? (
                                <View style={modalStyles.mpLoadingBox}>
                                    <ActivityIndicator color="#009EE3" />
                                    <Text style={modalStyles.mpStatusText}>{mpStatus}</Text>
                                    <TouchableOpacity onPress={() => setMpLoading(false)}>
                                        <Text style={{color: COLORS.danger, fontWeight:'bold', marginTop:5}}>Cancelar</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={modalStyles.mpGrid}>
                                    <TouchableOpacity 
                                        style={[modalStyles.mpBtn, { backgroundColor: '#E0F2FE', borderColor: '#0284C7' }]}
                                        onPress={handlePointPayment}
                                    >
                                        <MaterialCommunityIcons name="credit-card-wireless" size={24} color="#0284C7" />
                                        <Text style={[modalStyles.mpBtnText, { color: '#0284C7' }]}>Point</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity 
                                        style={[modalStyles.mpBtn, { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }]}
                                        onPress={handleQrPayment}
                                    >
                                        <MaterialCommunityIcons name="qrcode-scan" size={24} color="#16A34A" />
                                        <Text style={[modalStyles.mpBtnText, { color: '#16A34A' }]}>QR Sticker</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* Sección Pago Manual */}
                        <View style={modalStyles.paymentSection}>
                            <Text style={modalStyles.sectionTitle}>PAGO MANUAL</Text>
                            <View style={modalStyles.inputRow}>
                                <Feather name="dollar-sign" size={20} color={COLORS.success} style={{ marginRight: 10 }} />
                                <TextInput 
                                    style={modalStyles.input} 
                                    placeholder="Efectivo" 
                                    keyboardType="numeric" 
                                    value={pagoEfectivo} 
                                    onChangeText={setPagoEfectivo} 
                                    placeholderTextColor={COLORS.textSecondary}
                                />
                            </View>
                            <View style={modalStyles.inputRow}>
                                <Feather name="credit-card" size={20} color={COLORS.secondary} style={{ marginRight: 10 }} />
                                <TextInput 
                                    style={modalStyles.input} 
                                    placeholder="Transferencia" 
                                    keyboardType="numeric" 
                                    value={pagoTransferencia} 
                                    onChangeText={setPagoTransferencia} 
                                    placeholderTextColor={COLORS.textSecondary}
                                />
                            </View>
                        </View>

                        {/* Footer Actions */}
                        <View style={modalStyles.footer}>
                            <View style={modalStyles.statusPreview}>
                                <Text style={modalStyles.statusLabel}>Estado final:</Text>
                                <View style={[modalStyles.statusBadge, 
                                    nuevoEstado === 'Pagada' ? { backgroundColor: '#DCFCE7' } : 
                                    nuevoEstado === 'Adeuda' ? { backgroundColor: '#FEF3C7' } : 
                                    { backgroundColor: '#FEE2E2' }
                                ]}>
                                    <Text style={[modalStyles.statusText, 
                                        nuevoEstado === 'Pagada' ? { color: '#166534' } : 
                                        nuevoEstado === 'Adeuda' ? { color: '#B45309' } : 
                                        { color: '#991B1B' }
                                    ]}>{nuevoEstado.toUpperCase()}</Text>
                                </View>
                            </View>

                            <TouchableOpacity 
                                style={[modalStyles.confirmBtn, isSaving && { opacity: 0.7 }]}
                                onPress={handleConfirmTransaction}
                                disabled={isSaving || isLoadingItems}
                            >
                                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={modalStyles.confirmBtnText}>CONFIRMAR ENTREGA</Text>}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// =================================================================================
// PANTALLA PRINCIPAL (ROUTE DETAIL)
// =================================================================================

const RouteDetailScreen = ({ route, navigation }: RouteDetailScreenProps) => {
    const routeId = route.params?.routeId;
    const { routes, clients, sales, syncData } = useData();
    
    // --- OBTENER CAJA DEL USUARIO (QR) ---
    const [userCajaMP, setUserCajaMP] = useState<string | undefined>(undefined);

    useEffect(() => {
        const fetchUserConfig = async () => {
            const user = auth.currentUser;
            if (user) {
                try {
                    const userDoc = await firestore().collection('users').doc(user.uid).get();
                    if (userDoc.exists()) { // TS Fix
                        const userData = userDoc.data();
                        if (userData && userData.cajaMP) {
                            setUserCajaMP(userData.cajaMP);
                        }
                    }
                } catch (e) {
                    console.log("Error cargando config usuario:", e);
                }
            }
        };
        fetchUserConfig();
    }, []);

    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // --- ESTADOS DE NAVEGACIÓN ACTIVA (MODO COPILOTO) ---
    const [isNavMode, setIsNavMode] = useState(false);
    const [navQueue, setNavQueue] = useState<Invoice[]>([]);
    const [navIndex, setNavIndex] = useState(0);

    const routeData = useMemo(() => {
        const r = routes.find(rt => rt.id === routeId);
        if (!r) return null;

        const enrichedInvoices = (r.facturas || []).map((inv: any) => {
            let targetId = (inv.clienteId || inv.clientId || '').trim();
            if (!targetId) {
                const linkedSale = sales.find(s => s.id === inv.id);
                if (linkedSale && linkedSale.clienteId) targetId = linkedSale.clienteId;
            }
            const client = clients.find(c => c.id === targetId);

            return {
                ...inv,
                clienteNombre: client?.nombre || inv.clienteNombre || 'Cliente Desconocido',
                clienteDireccion: client?.direccion || inv.clienteDireccion,
                location: client?.location || inv.location || null,
                telefono: client?.telefono || inv.telefono || null,
                items: inv.items || [] 
            } as Invoice;
        });

        enrichedInvoices.sort((a: Invoice, b: Invoice) => {
            const scoreA = a.estadoVisita === 'Pendiente' ? 0 : 1;
            const scoreB = b.estadoVisita === 'Pendiente' ? 0 : 1;
            return scoreA - scoreB;
        });

        return { ...r, facturas: enrichedInvoices };
    }, [routeId, routes, clients, sales]);

    const handleSuccessUpdate = async () => {
        await syncData();
    };

    const handleOpenDeliveryModal = (invoice: Invoice) => {
        if (invoice.estadoVisita === 'Anulada') {
            Toast.show({ type: 'info', text1: 'Anulada', text2: 'Esta parada fue anulada.' });
        }
        setSelectedInvoice(invoice);
        setDeliveryModalVisible(true);
    };

    // --- UTILS ---
    const handleCall = (phone?: string) => {
        if (!phone) return Toast.show({ type: 'info', text1: 'Sin teléfono' });
        Linking.openURL(`tel:${phone}`);
    };

    const handleWhatsApp = (phone?: string, name?: string) => {
        if (!phone) return Toast.show({ type: 'info', text1: 'Sin teléfono' });
        let number = phone.replace(/[^\d]/g, '');
        const url = `whatsapp://send?phone=${number}&text=Hola ${name || ''}`;
        Linking.openURL(url).catch(() => Toast.show({ type: 'error', text1: 'WhatsApp no instalado' }));
    };

    const handleNavigate = (lat?: number, lng?: number, label?: string) => {
        if (!lat || !lng) return Toast.show({ type: 'info', text1: 'Sin coordenadas GPS' });
        const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
        const latLng = `${lat},${lng}`;
        const url = Platform.select({ ios: `${scheme}${label}@${latLng}`, android: `${scheme}${latLng}(${label})` });
        if(url) Linking.openURL(url);
    };

    // --- LÓGICA DE INICIO DE RECORRIDO ---
    const handleStartRoute = () => {
        const pendientes = routeData?.facturas.filter(f => f.estadoVisita === 'Pendiente') || [];
        if (pendientes.length === 0) {
            Alert.alert("Ruta Completada", "No hay paradas pendientes.");
            return;
        }

        Alert.alert(
            "Iniciar Recorrido",
            `¿Quieres optimizar el recorrido para las ${pendientes.length} paradas pendientes?`,
            [
                { text: "No, orden original", onPress: () => startNavigation(pendientes) },
                { 
                    text: "Sí, Optimizar (Distancia)", 
                    onPress: () => {
                        const optimized = optimizeInvoices(pendientes);
                        startNavigation(optimized);
                        if (optimized.length > 0) {
                            const first = optimized[0];
                            setTimeout(() => {
                                handleNavigate(first.location?.latitude, first.location?.longitude, first.clienteNombre);
                            }, 500);
                        }
                    }
                }
            ]
        );
    };

    const startNavigation = (queue: Invoice[]) => {
        setNavQueue(queue);
        setNavIndex(0);
        setIsNavMode(true);
    };

    const handleNavNext = () => {
        const nextIndex = navIndex + 1;
        if (nextIndex < navQueue.length) {
            setNavIndex(nextIndex);
            const nextItem = navQueue[nextIndex];
            setTimeout(() => {
                 handleNavigate(nextItem.location?.latitude, nextItem.location?.longitude, nextItem.clienteNombre);
            }, 400); 
        } else {
            Alert.alert("Fin del Recorrido", "Has pasado por todas las paradas planificadas.");
            setIsNavMode(false);
        }
    };

    const handleFinalizeRoute = async () => {
        Alert.alert("Finalizar Ruta", "¿Confirmas que terminaste el recorrido?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Sí, Finalizar", onPress: async () => {
                setIsUpdating(true);
                try {
                    await firestore().collection('rutas').doc(routeId).update({
                        estado: 'Completada',
                        fechaFin: firestore.FieldValue.serverTimestamp()
                    });
                    Toast.show({ type: 'success', text1: 'Ruta Finalizada' });
                    navigation.goBack();
                } catch (e) { Alert.alert("Error", "Error al finalizar ruta."); } 
                finally { setIsUpdating(false); }
            }}
        ]);
    };

    if (!routeData) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
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
                    <Text style={styles.headerTitle}>Ruta {routeData.id.slice(-4)}</Text>
                    <Text style={styles.headerSubtitle}>Avance: {visitadas} / {totalVisitas}</Text>
                </View>
            </View>

            <View style={styles.heroContainer}>
                <TouchableOpacity style={styles.startRouteBtn} onPress={handleStartRoute}>
                    <Feather name="navigation" size={20} color={COLORS.white} />
                    <Text style={styles.startRouteText}>INICIAR RECORRIDO</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={routeData.facturas}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: SIZES.medium, paddingBottom: 120 }}
                renderItem={({ item, index }) => {
                    const isPendiente = item.estadoVisita === 'Pendiente';
                    let borderColor = COLORS.glassBorder;
                    if (item.estadoVisita === 'Pagada') borderColor = COLORS.success;
                    if (item.estadoVisita === 'Adeuda') borderColor = COLORS.warning;
                    if (item.estadoVisita === 'Anulada') borderColor = COLORS.danger;

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
                                {(item.estadoVisita === 'Adeuda' || item.estadoVisita === 'Pagada') && (
                                    <View style={styles.rowBetween}>
                                            <Text style={[styles.label, { color: item.estadoVisita === 'Adeuda' ? COLORS.warning : COLORS.success }]}>
                                                {item.estadoVisita === 'Adeuda' ? 'Saldo Deudor:' : 'Pagado:'}
                                            </Text>
                                            <Text style={[styles.value, { color: item.estadoVisita === 'Adeuda' ? COLORS.warning : COLORS.success }]}>
                                                {item.estadoVisita === 'Adeuda' ? formatCurrency(item.saldoPendiente) : 'Completo'}
                                            </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.quickActions}>
                                <TouchableOpacity style={styles.qaBtn} onPress={() => handleCall(item.telefono)}><Feather name="phone" size={18} color={COLORS.primary} /></TouchableOpacity>
                                <TouchableOpacity style={styles.qaBtn} onPress={() => handleWhatsApp(item.telefono, item.clienteNombre)}><Ionicons name="logo-whatsapp" size={18} color="#25D366" /></TouchableOpacity>
                                <TouchableOpacity style={styles.qaBtn} onPress={() => handleNavigate(item.location?.latitude, item.location?.longitude, item.clienteNombre)}><Feather name="map" size={18} color={COLORS.secondary} /></TouchableOpacity>
                            </View>

                            <TouchableOpacity style={styles.mainActionBtn} onPress={() => handleOpenDeliveryModal(item)}>
                                <Text style={styles.mainActionText}>{isPendiente ? 'GESTIONAR ENTREGA' : 'VER DETALLE'}</Text>
                                <Feather name="chevron-right" size={16} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    );
                }}
            />
            
            {routeData.estado !== 'Completada' && (
                <View style={styles.floatingFooter}>
                    <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalizeRoute} disabled={isUpdating}>
                        {isUpdating ? <ActivityIndicator color="#FFF" /> : (
                            <><Feather name="check-circle" size={20} color="#FFF" style={{marginRight: 10}} /><Text style={styles.finalizeText}>FINALIZAR RUTA</Text></>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* MODAL NAVEGACIÓN */}
            <Modal visible={isNavMode} transparent animationType="slide" onRequestClose={() => setIsNavMode(false)}>
                <View style={navStyles.overlay}>
                    <View style={navStyles.card}>
                        <View style={navStyles.header}>
                            <View>
                                <Text style={navStyles.progressText}>Parada {navIndex + 1} de {navQueue.length}</Text>
                                <View style={navStyles.progressBarBg}>
                                    <View style={[navStyles.progressBarFill, { width: `${((navIndex + 1) / navQueue.length) * 100}%` }]} />
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setIsNavMode(false)}><Feather name="x" size={24} color={COLORS.textSecondary} /></TouchableOpacity>
                        </View>

                        {navQueue[navIndex] && (() => {
                            const currentInv = navQueue[navIndex];
                            const freshInv = routeData.facturas.find(f => f.id === currentInv.id) || currentInv;
                            const isCompleted = freshInv.estadoVisita !== 'Pendiente';

                            return (
                                <View style={navStyles.content}>
                                    <Text style={navStyles.label}>VISITANDO A:</Text>
                                    <Text style={navStyles.clientName}>{freshInv.clienteNombre}</Text>
                                    <TouchableOpacity onPress={() => handleNavigate(freshInv.location?.latitude, freshInv.location?.longitude, freshInv.clienteNombre)} style={navStyles.addressRow}>
                                        <Feather name="map-pin" size={16} color={COLORS.primary} />
                                        <Text style={navStyles.addressText}>{freshInv.clienteDireccion || "Ver en Mapa"}</Text>
                                    </TouchableOpacity>

                                    <View style={navStyles.statsRow}>
                                        <View style={navStyles.statBox}>
                                            <Text style={navStyles.statLabel}>Total</Text>
                                            <Text style={navStyles.statValue}>{formatCurrency(freshInv.totalVenta)}</Text>
                                        </View>
                                        <View style={navStyles.statBox}>
                                            <Text style={navStyles.statLabel}>Estado</Text>
                                            <Text style={[navStyles.statValue, { color: isCompleted ? COLORS.success : COLORS.warning }]}>
                                                {freshInv.estadoVisita}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={navStyles.actions}>
                                        <TouchableOpacity 
                                            style={[navStyles.primaryBtn, isCompleted && { backgroundColor: COLORS.success }]}
                                            onPress={() => handleOpenDeliveryModal(freshInv)}
                                        >
                                            <Feather name={isCompleted ? "check" : "package"} size={24} color="#FFF" />
                                            <Text style={navStyles.primaryBtnText}>
                                                {isCompleted ? "VER DETALLE / EDITAR" : "GESTIONAR ENTREGA"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity style={navStyles.secondaryBtn} onPress={handleNavNext}>
                                            <Text style={navStyles.secondaryBtnText}>
                                                {isCompleted ? "Siguiente Cliente" : "No Recibido / Saltar"}
                                            </Text>
                                            <Feather name="chevrons-right" size={20} color={COLORS.textSecondary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })()}
                    </View>
                </View>
            </Modal>
            
            {selectedInvoice && (
                <DeliveryModal 
                    visible={deliveryModalVisible}
                    invoice={selectedInvoice}
                    routeId={routeData.id}
                    onClose={() => setDeliveryModalVisible(false)}
                    onSuccess={handleSuccessUpdate}
                    externalPosId={userCajaMP} 
                />
            )}

        </SafeAreaView>
    );
};

// =================================================================================
// ESTILOS (DEFINIDOS AL FINAL)
// =================================================================================
const navStyles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    card: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: '55%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    progressText: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 5 },
    progressBarBg: { width: 150, height: 6, backgroundColor: '#E5E5EA', borderRadius: 3 },
    progressBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
    content: { flex: 1 },
    label: { color: COLORS.textSecondary, fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
    clientName: { fontSize: 26, fontWeight: 'bold', color: COLORS.textPrimary, marginVertical: 5 },
    addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 5 },
    addressText: { color: COLORS.primary, textDecorationLine: 'underline' },
    statsRow: { flexDirection: 'row', gap: 15, marginBottom: 30 },
    statBox: { flex: 1, backgroundColor: '#F2F2F7', padding: 15, borderRadius: 12, alignItems: 'center' },
    statLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
    statValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary },
    actions: { gap: 15 },
    primaryBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 8 },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    secondaryBtn: { padding: 15, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5E5EA' },
    secondaryBtnText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' }
});

const modalStyles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    content: { backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
    closeBtn: { padding: 5 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    sectionTitle: { fontSize: 12, fontWeight: '900', color: '#8E8E93', letterSpacing: 1 },
    sectionInfo: { fontSize: 11, color: COLORS.primary },
    list: { maxHeight: 250 },
    itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, marginHorizontal: 20, marginBottom: 8, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: {width: 0, height: 2} },
    itemName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
    itemPriceUnit: { fontSize: 12, color: COLORS.textSecondary },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 8, marginHorizontal: 10 },
    qtyBtn: { padding: 8, backgroundColor: '#E5E5EA', borderRadius: 8 },
    qtyBtnDisabled: { backgroundColor: '#F2F2F7', opacity: 0.3 },
    qtyText: { width: 30, textAlign: 'center', fontWeight: 'bold', fontSize: 14 },
    itemSubtotal: { width: 70, textAlign: 'right', fontWeight: 'bold', fontSize: 14 },
    summaryContainer: { padding: 20, backgroundColor: '#FFF', marginVertical: 10, borderRadius: 12, marginHorizontal: 20 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
    summaryValue: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
    paymentSection: { paddingHorizontal: 20, marginTop: 10 },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 15, height: 50, marginBottom: 10, borderWidth: 1, borderColor: '#E5E5EA' },
    input: { flex: 1, fontSize: 16, color: COLORS.textPrimary, height: '100%' },
    footer: { padding: 20, backgroundColor: '#FFF', marginTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    statusPreview: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15},
    statusLabel: {fontSize: 14, color: COLORS.textSecondary},
    statusBadge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8},
    statusText: {fontWeight: 'bold', fontSize: 12},
    confirmBtn: { backgroundColor: COLORS.primary, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
    
    // --- ESTILOS MP ---
    mpGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    mpBtn: { flex: 1, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, gap: 5 },
    mpBtnText: { fontWeight: '700', fontSize: 13 },
    mpLoadingBox: { alignItems: 'center', padding: 15, backgroundColor: '#F0F9FF', borderRadius: 12, borderWidth: 1, borderColor: '#009EE3', borderStyle: 'dashed', marginBottom: 10 },
    mpStatusText: { marginTop: 10, color: '#0284C7', fontWeight: '600' }
});

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'transparent' },
    backBtn: { padding: 8, backgroundColor: '#FFF', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, marginLeft: 15 },
    headerSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 15 },
    heroContainer: { paddingHorizontal: 20, marginBottom: 15 },
    startRouteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 16, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5, gap: 10 },
    startRouteText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
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