import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Quitamos import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, onSnapshot, runTransaction, Timestamp } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { SaleDetailScreenProps } from '../navigation/AppNavigator'; // Asumiendo la tipificación de props

import { useData } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- INTERFACES ---
interface SaleItem {
    nombre: string;
    quantity: number;
    precio: number;
    promoAplicada?: string;
}
interface Sale {
    id: string;
    clienteId?: string;
    clienteNombre?: string;
    fecha: Timestamp;
    items: SaleItem[];
    totalVenta: number;
    saldoPendiente: number;
    estado: 'Pagada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' | 'Anulada';
    numeroFactura?: string;
    vendedorId?: string;
    vendedorNombre?: string;
    porcentajeComision?: number;
    totalComision?: number;
}
interface CollectDebtModalProps {
    visible: boolean;
    onClose: () => void;
    venta: Sale | null;
    onPaymentSuccess: () => void;
}

// Definición de tipos de parámetros para SaleDetailScreen
interface SaleDetailRouteParams {
    saleId: string;
}


const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

const CollectDebtModal = ({ visible, onClose, venta, onPaymentSuccess }: CollectDebtModalProps) => {
    const [montoCobrado, setMontoCobrado] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    if (!venta) return null;

    const handleConfirmPayment = async () => {
        setError('');
        const cobro = parseFloat(montoCobrado);
        if (isNaN(cobro) || cobro <= 0) { setError('Por favor, ingresa un monto válido.'); return; }
        if (cobro > venta.saldoPendiente) { setError(`El monto no puede ser mayor al saldo pendiente de ${formatCurrency(venta.saldoPendiente)}.`); return; }

        setIsSaving(true);
        try {
            await runTransaction(db, async (transaction) => {
                const ventaRef = doc(db, 'ventas', venta.id);
                // NOTA: Se asume que este addDoc de "Cobro Saldo" es un registro de movimiento/comprobante
                await addDoc(collection(db, 'ventas'), {
                    clientName: `Cobro Saldo - ${venta.clienteNombre}`, estado: "Pagada", fecha: Timestamp.now(), numeroFactura: `COBRO-${venta.numeroFactura || venta.id.substring(0,6)}`,
                    pagoEfectivo: cobro, pagoTransferencia: 0, saldoPendiente: 0, vendedorId: venta.vendedorId, vendedorNombre: venta.vendedorNombre,
                });
                const ventaDoc = await transaction.get(ventaRef);
                if (!ventaDoc.exists()) throw new Error("La factura original no fue encontrada.");
                const data = ventaDoc.data();
                const nuevoSaldo = (data.saldoPendiente || 0) - cobro;
                const nuevoEstado = nuevoSaldo <= 0.01 ? "Pagada" : "Adeuda";
                const comisionFinal = nuevoEstado === 'Pagada' ? data.totalVenta * ((data.porcentajeComision || 0) / 100) : (data.totalComision || 0);
                transaction.update(ventaRef, { saldoPendiente: nuevoSaldo, estado: nuevoEstado, totalComision: comisionFinal });
            });
            Toast.show({ type: 'success', text1: '¡Cobro registrado con éxito!' });
            if(onPaymentSuccess) onPaymentSuccess();
            onClose();
        } catch (err) {
            console.error("Error en transacción de cobro:", err);
            setError("No se pudo registrar el cobro. Intenta de nuevo.");
            Toast.show({type: 'error', text1: 'Error al registrar el cobro'});
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>Registrar Cobro</Text><Text style={styles.modalSubtitle}>Venta del {venta.fecha.toDate().toLocaleDateString('es-AR')}</Text><Text style={styles.modalDebt}>Saldo actual: {formatCurrency(venta.saldoPendiente)}</Text><TextInput style={styles.input} placeholder="Monto Cobrado" keyboardType="numeric" value={montoCobrado} onChangeText={setMontoCobrado} autoFocus/><View style={styles.modalActions}><TouchableOpacity onPress={onClose} style={styles.modalButtonCancel}><Text style={styles.modalButtonText}>Cancelar</Text></TouchableOpacity><TouchableOpacity onPress={handleConfirmPayment} disabled={isSaving} style={styles.modalButtonConfirm}>{isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Confirmar</Text>}</TouchableOpacity></View></View></View>
        </Modal>
    );
};

// Modificamos la firma del componente para recibir navigation
const SaleDetailScreen = ({ navigation }: SaleDetailScreenProps) => {
    // 1. OBTENER PARÁMETROS DE REACT NAVIGATION
    const route = useRoute();
    const { saleId } = route.params as SaleDetailRouteParams; 

    const [sale, setSale] = useState<Sale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
    const { clients, syncData } = useData(); // Se añade syncData para el refresh

    useEffect(() => {
        if (!saleId || typeof saleId !== 'string') {
            setIsLoading(false);
            return;
        }

        const saleRef = doc(db, 'ventas', saleId);
        const unsubscribe = onSnapshot(saleRef, (doc) => {
            if (doc.exists()) {
                setSale({ id: doc.id, ...doc.data() } as Sale);
            } else {
                console.error("No se encontró la venta.");
                setSale(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error al cargar la venta:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [saleId]);

    const clientName = useMemo(() => {
        if (!sale) return 'Cliente no especificado';
        if (sale.clienteNombre) return sale.clienteNombre;
        const client = clients.find(c => c.id === sale.clienteId);
        return client?.nombre || 'Cliente no especificado';
    }, [sale, clients]);
    
    // Función para refrescar los datos del contexto después de un pago
    const handlePaymentSuccess = () => {
        syncData();
        // El onSnapshot de arriba actualizará la vista automáticamente
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!sale) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
                <View style={styles.header}>
                    {/* 2. CORRECCIÓN: Reemplazamos router.back() con navigation.goBack() */}
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.errorText}>No se pudieron cargar los datos de la venta.</Text>
            </View>
        );
    }
    
    const saleDateFormatted = sale.fecha ? sale.fecha.toDate().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Fecha inválida';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            <View style={styles.header}>
                 {/* 3. CORRECCIÓN: Reemplazamos router.back() con navigation.goBack() */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Detalle de Venta</Text>
            </View>

            <View style={styles.summaryCard}>
                <Text style={styles.clientName}>{clientName}</Text>
                <Text style={styles.saleDate}>{saleDateFormatted}</Text>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Total Venta:</Text><Text style={styles.totalAmount}>{formatCurrency(sale.totalVenta)}</Text></View>
                <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Saldo Pendiente:</Text><Text style={styles.balanceAmount}>{formatCurrency(sale.saldoPendiente)}</Text></View>
            </View>
            
            <Text style={styles.listHeader}>Productos Vendidos</Text>

            <FlatList
                data={sale.items}
                keyExtractor={(item, index) => `${item.nombre}-${index}`}
                contentContainerStyle={styles.listContentContainer}
                renderItem={({ item }) => (
                    <View style={styles.itemCard}>
                        <View style={styles.itemDetails}>
                            <Text style={styles.itemName}>{item.nombre}</Text>
                            <Text style={styles.itemPrice}>{item.quantity} x {formatCurrency(item.precio)}</Text>
                             {item.promoAplicada && <Text style={styles.promoText}>{item.promoAplicada}</Text>}
                        </View>
                        <Text style={styles.itemSubtotal}>{formatCurrency(item.quantity * (item.precio || 0))}</Text>
                    </View>
                )}
            />
            
            {sale.estado === 'Adeuda' && (sale.saldoPendiente || 0) > 0 && (
                 <View style={styles.footer}>
                    <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => setIsDebtModalOpen(true)}
                    >
                        <Feather name="dollar-sign" size={20} color={COLORS.primaryDark} />
                        <Text style={styles.actionButtonText}>Registrar Cobro</Text>
                    </TouchableOpacity>
                 </View>
            )}

            <CollectDebtModal 
                visible={isDebtModalOpen}
                onClose={() => setIsDebtModalOpen(false)}
                venta={sale}
                onPaymentSuccess={handlePaymentSuccess} // Pasa la función de refresh
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: COLORS.danger, textAlign: 'center', marginTop: 100, fontSize: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 10, paddingHorizontal: 20, position: 'relative' },
    backButton: { position: 'absolute', left: 20, top: 60, padding: 10 },
    title: { fontSize: 28, fontWeight: 'bold', color: COLORS.textPrimary },
    
    summaryCard: { backgroundColor: COLORS.glass, margin: 15, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    clientName: { color: COLORS.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: 5 },
    saleDate: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 15 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopColor: COLORS.glassBorder, borderTopWidth: 1, paddingTop: 15 },
    totalLabel: { color: COLORS.textSecondary, fontSize: 16 },
    totalAmount: { color: COLORS.textPrimary, fontSize: 18, fontWeight: 'bold' },
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    balanceLabel: { color: COLORS.textSecondary, fontSize: 16 },
    balanceAmount: { color: COLORS.warning, fontSize: 18, fontWeight: 'bold' },

    listHeader: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, paddingHorizontal: 20, marginBottom: 10 },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 120 },
    itemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.glass, paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, marginBottom: 10 },
    itemDetails: { flex: 1 },
    itemName: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '500' },
    itemPrice: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },
    promoText: { color: COLORS.success, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
    itemSubtotal: { color: COLORS.textPrimary, fontSize: 16, fontWeight: 'bold' },
    
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(0, 0, 0, 0.95)', borderTopWidth: 1, borderColor: COLORS.glassBorder, paddingBottom: 40 },
    actionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 15, gap: 10 },
    actionButtonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold' },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { width: '90%', backgroundColor: COLORS.backgroundStart, borderRadius: 20, padding: 25, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 15 },
    modalDebt: { fontSize: 18, fontWeight: '600', color: COLORS.warning, textAlign: 'center', marginBottom: 20 },
    input: { backgroundColor: COLORS.glass, color: COLORS.textPrimary, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, fontSize: 18, textAlign: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, gap: 10 },
    modalButtonCancel: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: COLORS.disabled },
    modalButtonConfirm: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: COLORS.success },
    modalButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', textAlign: 'center', fontSize: 16 },
});

export default SaleDetailScreen;