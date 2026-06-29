// src/screens/sale-detail.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- SDK NATIVO ---
import {
    addDoc,
    collection,
    doc,
    FirebaseFirestoreTypes,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from '@react-native-firebase/firestore';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { SaleDetailScreenProps } from '../navigation/AppNavigator';

// --- Contexto y DB ---
import { useData } from '../../context/DataContext';
import { dbContainer } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- INTERFACES ---
interface SaleItem {
    id: string; 
    nombre: string;
    quantity: number;
    precio: number;
    promoAplicada?: string;
}

interface Sale {
    id: string;
    clienteId?: string;
    clienteNombre?: string;
    clientName?: string; 
    fecha: FirebaseFirestoreTypes.Timestamp | Date | { seconds: number };
    items: SaleItem[];
    totalVenta: number;
    saldoPendiente: number;
    estado: 'Pagada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' | 'Anulada';
    numeroFactura?: string;
    vendedorId?: string;
    vendedorNombre?: string;
    vendedorName?: string;
    porcentajeComision?: number;
    totalComision?: number;
    tipo?: 'venta' | 'cobranza' | 'rendicion_cobranza';
    montoCobrado?: number;
    pagoEfectivo?: number;
    rendido?: boolean;
    observaciones?: string;
}

interface CollectDebtModalProps {
    visible: boolean;
    onClose: () => void;
    venta: Sale | null;
    onPaymentSuccess: () => void;
    isOffline: boolean;
    companyId: string | null;
}

interface SaleDetailRouteParams {
    saleId: string;
    clientName?: string;
}

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// --- Estilos de Estado ---
const getStatusStyles = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada': return { bg: '#ECFDF5', text: '#059669', icon: 'check-circle' as const };
        case 'Adeuda': return { bg: '#FFFBEB', text: '#D97706', icon: 'alert-circle' as const };
        case 'Pendiente de Entrega': return { bg: '#F0F9FF', text: '#0284C7', icon: 'truck' as const };
        case 'Anulada': return { bg: '#FEF2F2', text: '#DC2626', icon: 'x-circle' as const };
        default: return { bg: '#F9FAFB', text: '#6B7280', icon: 'help-circle' as const };
    }
};

// --- Componente CollectDebtModal ---
const CollectDebtModal = ({ visible, onClose, venta, onPaymentSuccess, isOffline, companyId }: CollectDebtModalProps) => {
    const [montoCobrado, setMontoCobrado] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    if (!venta) return null;

    const getModalDate = () => {
        if (!venta.fecha) return 'Fecha inválida';
        if (venta.fecha instanceof Date) return venta.fecha.toLocaleDateString('es-AR');
        // @ts-ignore
        if (venta.fecha.toDate) return venta.fecha.toDate().toLocaleDateString('es-AR');
        // @ts-ignore
        if (venta.fecha.seconds) return new Date(venta.fecha.seconds * 1000).toLocaleDateString('es-AR');
        return 'Fecha inválida';
    };
    const modalDate = getModalDate();

    const handleConfirmPayment = async () => {
        setError('');
        const cobro = parseFloat(montoCobrado);
        if (isNaN(cobro) || cobro <= 0) { setError('Por favor, ingresa un monto válido.'); return; }
        if (cobro > (venta.saldoPendiente || 0) + 0.5) { setError(`El monto no puede ser mayor al saldo pendiente de ${formatCurrency(venta.saldoPendiente)}.`); return; }

        setIsSaving(true);
        const db = dbContainer.instance;
        if (!db) {
            Alert.alert("Error", "La base de datos no está lista. Reinicia la app.");
            setIsSaving(false);
            return;
        }
        if (!companyId) {
            Alert.alert("Error", "ID de empresa no disponible.");
            setIsSaving(false);
            return;
        }

        const performTransaction = async () => {
            await runTransaction(db, async (transaction) => {
                const ventaRef = doc(db, `companies/${companyId}/ventas`, venta.id);

                await addDoc(collection(db, `companies/${companyId}/ventas`), {
                    tipo: 'cobranza',
                    clientName: `Cobro Saldo - ${venta.clienteNombre || venta.clientName || 'Cliente'}`, 
                    clienteId: venta.clienteId,
                    estado: "Pagada", 
                    fecha: serverTimestamp(), 
                    numeroFactura: `COBRO-${venta.numeroFactura || venta.id.substring(0,6)}`,
                    pagoEfectivo: cobro, 
                    pagoTransferencia: 0, 
                    saldoPendiente: 0, 
                    totalVenta: 0, 
                    montoCobrado: cobro, 
                    items: [], 
                    vendedorId: venta.vendedorId, 
                    vendedorNombre: venta.vendedorNombre || venta.vendedorName,
                    ventaOriginalId: venta.id,
                    rendido: false 
                });
                
                const saleDoc = await transaction.get(ventaRef);
                if (!saleDoc.exists) throw new Error("La factura original no fue encontrada.");
                const data = saleDoc.data();
                if (!data) throw new Error("No data");
                
                const nuevoSaldo = (data.saldoPendiente || 0) - cobro;
                const nuevoEstado = nuevoSaldo <= 1 ? "Pagada" : "Adeuda";
                
                let updates: any = { saldoPendiente: nuevoSaldo < 0 ? 0 : nuevoSaldo, estado: nuevoEstado };
                
                if (nuevoEstado === 'Pagada') {
                    const comisionFinal = data.totalVenta * ((data.porcentajeComision || 0) / 100);
                    if (comisionFinal > 0) updates.totalComision = comisionFinal;
                    updates.fechaPagoCompleto = serverTimestamp();
                }
                transaction.update(ventaRef, updates);
            });
        };

        try {
            if (isOffline) {
                performTransaction().catch(err => console.error("Error offline:", err));
                Toast.show({ type: 'success', text1: 'Cobro Guardado (Offline)', text2: 'Se sincronizará al conectar.' });
            } else {
                await performTransaction();
                Toast.show({ type: 'success', text1: '¡Cobro registrado con éxito!' });
            }
            if(onPaymentSuccess) onPaymentSuccess();
            onClose();
        } catch (err) {
            console.error("Error cobro:", err);
            setError("No se pudo registrar. Intenta de nuevo.");
        } finally {
            setIsSaving(false);
            setMontoCobrado('');
        }
    };
    
    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Registrar Cobro</Text>
                    <Text style={styles.modalSubtitle}>Venta del <Text style={{fontWeight: 'bold'}}>{modalDate}</Text></Text> 
                    {error ? <Text style={styles.modalError}>{error}</Text> : null}
                    <Text style={styles.modalDebt}>Saldo actual: <Text style={{ color: COLORS.warning }}>{formatCurrency(venta.saldoPendiente)}</Text></Text>
                    <TextInput 
                        style={styles.input} placeholder="Monto Cobrado" placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric" value={montoCobrado} onChangeText={setMontoCobrado} autoFocus
                    />
                    <View style={styles.modalActions}>
                        <TouchableOpacity onPress={onClose} style={styles.modalButtonCancel}><Text style={styles.modalButtonText}>Cancelar</Text></TouchableOpacity>
                        <TouchableOpacity onPress={handleConfirmPayment} disabled={isSaving} style={styles.modalButtonConfirm}>
                            {isSaving ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.modalButtonText}>Confirmar</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// --- PANTALLA PRINCIPAL ---
const SaleDetailScreen = ({ navigation }: SaleDetailScreenProps) => {
    const route = useRoute();
    const { saleId } = route.params as SaleDetailRouteParams; 

    const [sale, setSale] = useState<Sale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
    
    const { clients, syncData, isOffline, deleteSaleAndRevertStock, companyId } = useData();

    useEffect(() => {
        if (!saleId) { setIsLoading(false); return; }
        if (!companyId) return;
        const db = dbContainer.instance;
        if (!db) { setIsLoading(false); return; }

        const unsubscribe = onSnapshot(doc(db, `companies/${companyId}/ventas`, saleId), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                if (data) {
                    let fechaNormalizada = data.fecha;
                    if (data.fecha?.toDate) fechaNormalizada = data.fecha.toDate();
                    else if (data.fecha?.seconds) fechaNormalizada = new Date(data.fecha.seconds * 1000);
                    setSale({ id: docSnapshot.id, ...data, fecha: fechaNormalizada } as Sale);
                }
            } else {
                setSale(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error al cargar:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [saleId, companyId]);

    const clientName = useMemo(() => {
        if (!sale) return 'Cliente no especificado';
        if (sale.clienteNombre) return sale.clienteNombre;
        if (sale.clientName) return sale.clientName;
        const client = clients.find(c => c.id === sale.clienteId);
        return client?.nombre || 'Cliente no especificado';
    }, [sale, clients]);
    
    const handlePaymentSuccess = useCallback(() => {
        syncData(); 
        setIsDebtModalOpen(false); 
    }, [syncData]);

    // 🔥🔥🔥 LÓGICA DE BORRADO OPTIMISTA (CORREGIDA) 🔥🔥🔥
    const handleDelete = () => {
        if (!sale) return;
        Alert.alert(
            "Eliminar Venta",
            "¿Estás seguro? Esta acción eliminará la venta y RESTAURARÁ el stock de los productos.",
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Eliminar", 
                    style: "destructive",
                    onPress: () => {
                        // 1. NAVEGACIÓN INMEDIATA (OPTIMISTA)
                        // Volvemos a la pantalla anterior (Reports, ClientDebts, etc.)
                        // sin esperar a la DB.
                        navigation.goBack(); 
                        
                        // 2. FEEDBACK VISUAL
                        Toast.show({ type: 'info', text1: 'Procesando eliminación...', position: 'bottom' });

                        // 3. OPERACIÓN EN SEGUNDO PLANO (BACKGROUND)
                        // Llamamos a la función del context. Como el context actualiza el estado local
                        // antes o durante la transacción, la lista en 'Reports' se refrescará sola.
                        // @ts-ignore
                        deleteSaleAndRevertStock(sale.id, sale.items as any[])
                            .then(() => {
                                Toast.show({ type: 'success', text1: 'Venta eliminada y stock restaurado', position: 'bottom' });
                            })
                            .catch((error: any) => {
                                console.error("Error al eliminar venta:", error);
                                Toast.show({ type: 'error', text1: 'Error crítico', text2: 'No se pudo eliminar la venta.', position: 'bottom' });
                            });
                    }
                }
            ]
        );
    };

    const handleEdit = () => {
        if (!sale) return;
        // @ts-ignore
        navigation.navigate('CreateSale', { 
            saleId: sale.id, 
            clientId: sale.clienteId || '', 
            isEditing: 'true',
            clientName: clientName 
        });
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!sale) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                    <Text style={styles.title}>Error</Text>
                    <View style={{width: 24}} />
                </View>
                <Text style={styles.errorText}>Venta no encontrada.</Text>
            </View>
        );
    }
    
    const saleDateFormatted = sale.fecha instanceof Date 
        ? sale.fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
        : 'Fecha desconocida';

    const isCobranza = sale.tipo === 'cobranza';
    const montoMostrar = isCobranza ? (sale.pagoEfectivo || sale.montoCobrado || 0) : sale.totalVenta;
    const statusStyle = getStatusStyles(sale.estado);
    const statusLabel = isCobranza ? 'COBRO' : sale.estado.toUpperCase();
    const isAdeuda = !isCobranza && (sale.estado === 'Adeuda' || sale.estado === 'Repartiendo');
    const isAnulada = sale.estado === 'Anulada';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
            
            {/* --- HEADER --- */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>{isCobranza ? 'Detalle de Cobro' : 'Detalle de Venta'}</Text>
                
                {!isAnulada && !isCobranza ? (
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={handleEdit} style={styles.actionIcon}>
                            <Feather name="edit-3" size={22} color={COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDelete} style={styles.actionIcon}>
                            <Feather name="trash-2" size={22} color={COLORS.danger} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={{ width: 60 }} /> 
                )}
            </View>
            
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* --- TARJETA RESUMEN (DISEÑO CORREGIDO) --- */}
                <LinearGradient
                    colors={isCobranza ? ['#7C3AED', '#5B21B6'] : (isAnulada ? ['#EF4444', '#991B1B'] : [COLORS.primary, '#115E59'])}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.summaryCard}
                >
                    {/* 1. TITULO Y MONTO */}
                    <View style={styles.summaryTop}>
                        <Text style={styles.summaryLabel}>TOTAL</Text>
                        <Text style={styles.summaryTotal}>{formatCurrency(montoMostrar)}</Text>
                    </View>
                    
                    {/* 2. ESTADO EN FILA PROPIA (SOLUCIÓN DE DESBORDE) */}
                    <View style={styles.statusRow}>
                        <View style={styles.statusPillLight}>
                            <Feather name={statusStyle.icon} size={14} color={statusStyle.text} />
                            <Text style={[styles.statusTextLight, { color: statusStyle.text }]}>{statusLabel}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.summaryRow}>
                        <Feather name="user" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.summaryText}>{clientName}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Feather name="calendar" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.summaryText}>{saleDateFormatted}</Text>
                    </View>
                    
                    {!isCobranza && (
                        <View style={[styles.summaryRow, { marginTop: 8 }]}>
                            <Text style={styles.summaryLabelSmall}>Saldo Pendiente:</Text>
                            <Text style={styles.summaryValueSmall}>{formatCurrency(sale.saldoPendiente)}</Text>
                        </View>
                    )}
                </LinearGradient>

                {/* --- OBSERVACIONES --- */}
                {sale.observaciones ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Observaciones</Text>
                        <Text style={styles.obsText}>{sale.observaciones}</Text>
                    </View>
                ) : null}

                {/* --- LISTA DE PRODUCTOS --- */}
                {!isCobranza && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Productos ({sale.items.length})</Text>
                        {sale.items.map((item, index) => (
                            <View key={`${item.id}-${index}`} style={styles.itemRow}>
                                <View style={styles.itemInfo}>
                                    <Text style={styles.itemName}>{item.nombre}</Text>
                                    <Text style={styles.itemMeta}>{item.quantity} x {formatCurrency(item.precio)}</Text>
                                    {item.promoAplicada && <Text style={styles.promoText}>{item.promoAplicada}</Text>}
                                </View>
                                <Text style={styles.itemTotal}>{formatCurrency(item.quantity * item.precio)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* --- FAB COBRAR --- */}
            {isAdeuda && (sale.saldoPendiente || 0) > 0.01 && (
                <TouchableOpacity 
                    style={styles.fabContainer}
                    activeOpacity={0.9}
                    onPress={() => setIsDebtModalOpen(true)}
                >
                    <LinearGradient
                        colors={[COLORS.warning, '#D97706']}
                        style={styles.fabGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <Feather name="dollar-sign" size={22} color="white" />
                        <Text style={styles.fabText}>Registrar Cobro</Text>
                    </LinearGradient>
                </TouchableOpacity>
            )}

            <CollectDebtModal
                visible={isDebtModalOpen}
                onClose={() => setIsDebtModalOpen(false)}
                venta={sale}
                onPaymentSuccess={handlePaymentSuccess}
                isOffline={isOffline}
                companyId={companyId}
            />
        </View>
    );
};

// --- ESTILOS ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: COLORS.danger, textAlign: 'center', marginTop: 50 },

    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 20,
        paddingTop: (StatusBar.currentHeight || 20) + 10, 
        paddingBottom: 15,
        backgroundColor: '#F8FAFC',
    },
    headerButton: { padding: 8 },
    title: { fontSize: 16, fontWeight: '700', textTransform: 'uppercase', color: '#334155' },
    headerActions: { flexDirection: 'row', gap: 15 },
    actionIcon: { padding: 6 },

    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },

    summaryCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 25,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    summaryTop: { marginBottom: 10 }, 
    summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 2 },
    summaryTotal: { color: 'white', fontSize: 32, fontWeight: '800' },
    
    // Nueva fila para el estado
    statusRow: { 
        flexDirection: 'row', 
        justifyContent: 'flex-start', 
        marginBottom: 15 
    },
    statusPillLight: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: 'white', 
        paddingHorizontal: 10, 
        paddingVertical: 6, 
        borderRadius: 20,
        alignSelf: 'flex-start' 
    },
    statusTextLight: { fontSize: 11, fontWeight: '700', marginLeft: 6, textTransform: 'uppercase' },

    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 15 },

    summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
    summaryText: { color: 'white', fontSize: 15, fontWeight: '500' },
    summaryLabelSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
    summaryValueSmall: { color: 'white', fontSize: 16, fontWeight: '700', marginLeft: 'auto' },

    section: { marginBottom: 25 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 15 },
    obsText: { color: '#64748B', fontStyle: 'italic', fontSize: 14 },

    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 16,
        marginBottom: 10,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    itemMeta: { fontSize: 13, color: '#64748B', marginTop: 4 },
    promoText: { fontSize: 11, color: COLORS.success, fontWeight: '600', marginTop: 2 },
    itemTotal: { fontSize: 15, fontWeight: '700', color: COLORS.primary },

    fabContainer: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
        shadowColor: COLORS.warning,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
        borderRadius: 30,
    },
    fabGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 30,
    },
    fabText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#1E293B' },
    modalSubtitle: { textAlign: 'center', color: '#64748B', marginTop: 8, marginBottom: 20 },
    modalDebt: { textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 20 },
    modalError: { color: COLORS.danger, textAlign: 'center', marginBottom: 10 },
    input: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 16, fontSize: 24, textAlign: 'center', fontWeight: '700', color: '#1E293B' },
    modalActions: { flexDirection: 'row', marginTop: 24, gap: 15 },
    modalButtonCancel: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
    modalButtonConfirm: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
    modalButtonText: { fontWeight: 'bold' },
});

export default SaleDetailScreen;