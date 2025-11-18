// src/screens/SaleDetailScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import {
    addDoc,
    collection,
    doc,
    FirebaseFirestoreTypes,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS: SDK NATIVO (v9 Modular) ---

import React, { useEffect, useMemo, useState } from 'react';
// ✅ CORREGIDO: Importamos Platform
import { ActivityIndicator, Alert, FlatList, Modal, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { SaleDetailScreenProps } from '../navigation/AppNavigator';

// --- Contexto y DB ---
import { useData } from '../../context/DataContext';
import { dbContainer } from '../../db/firebase-service';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

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
    clientName?: string; // Compatibilidad
    fecha: FirebaseFirestoreTypes.Timestamp | Date | { seconds: number }; // Compatibilidad de fechas
    items: SaleItem[];
    totalVenta: number;
    saldoPendiente: number;
    estado: 'Pagada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' | 'Anulada';
    numeroFactura?: string;
    vendedorId?: string;
    vendedorNombre?: string;
    vendedorName?: string; // Compatibilidad
    porcentajeComision?: number;
    totalComision?: number;
    // Nuevos campos para cobros
    tipo?: 'venta' | 'cobranza' | 'rendicion_cobranza';
    montoCobrado?: number;
    pagoEfectivo?: number;
    rendido?: boolean;
}

interface CollectDebtModalProps {
    visible: boolean;
    onClose: () => void;
    venta: Sale | null;
    onPaymentSuccess: () => void;
    isOffline: boolean;
}

interface SaleDetailRouteParams {
    saleId: string;
    clientName?: string;
}

const formatCurrency = (value?: number) => (typeof value === 'number' ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0,00');

// --- Componente CollectDebtModal (ESTILIZADO Y CORREGIDO) ---
const CollectDebtModal = ({ visible, onClose, venta, onPaymentSuccess, isOffline }: CollectDebtModalProps) => {
    const [montoCobrado, setMontoCobrado] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    if (!venta) return null;

    // Helper seguro para fecha
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
            console.error("CollectDebtModal: DB no está lista, abortando PAGO.");
            Alert.alert("Error", "La base de datos no está lista. Reinicia la app.");
            setIsSaving(false);
            return;
        }

        const performTransaction = async () => {
            await runTransaction(db, async (transaction) => {
                
                const ventaRef = doc(db, 'ventas', venta.id); 
                
                // 1. Crear el documento de "Cobro" (CORREGIDO: tipo 'cobranza')
                await addDoc(collection(db, 'ventas'), {
                    tipo: 'cobranza', // <--- CRÍTICO PARA REPORTE Y CAJA
                    clientName: `Cobro Saldo - ${venta.clienteNombre || venta.clientName || 'Cliente'}`, 
                    clienteId: venta.clienteId,
                    estado: "Pagada", 
                    fecha: serverTimestamp(), 
                    numeroFactura: `COBRO-${venta.numeroFactura || venta.id.substring(0,6)}`,
                    
                    pagoEfectivo: cobro, 
                    pagoTransferencia: 0, 
                    saldoPendiente: 0, 
                    totalVenta: 0, // Para no duplicar venta
                    montoCobrado: cobro, // Dato real
                    items: [], 

                    vendedorId: venta.vendedorId, 
                    vendedorNombre: venta.vendedorNombre || venta.vendedorName,
                    ventaOriginalId: venta.id,
                    rendido: false 
                });
                
                // 2. Actualizar la factura original
                const saleDoc = await transaction.get(ventaRef);
                
                if (!saleDoc.exists()) throw new Error("La factura original no fue encontrada.");
                
                const data = saleDoc.data();
                if (!data) throw new Error("No se pudieron leer los datos de la venta.");
                
                const nuevoSaldo = (data.saldoPendiente || 0) - cobro;
                const nuevoEstado = nuevoSaldo <= 1 ? "Pagada" : "Adeuda";
                
                let updates: any = { 
                    saldoPendiente: nuevoSaldo < 0 ? 0 : nuevoSaldo, 
                    estado: nuevoEstado 
                };
                
                if (nuevoEstado === 'Pagada') {
                    // Asegurar comisión completa si se paga todo
                    const comisionFinal = data.totalVenta * ((data.porcentajeComision || 0) / 100);
                    if (comisionFinal > 0) updates.totalComision = comisionFinal;
                    updates.fechaPagoCompleto = serverTimestamp();
                }

                transaction.update(ventaRef, updates);
            });
        };

        if (isOffline) {
            performTransaction()
                .then(() => console.log("Cobro offline enviado a la cola."))
                .catch(err => console.error("Error offline:", err));
            
            Toast.show({ type: 'success', text1: 'Cobro Guardado (Offline)', text2: 'Se sincronizará al conectar.' });
            if(onPaymentSuccess) onPaymentSuccess();
            onClose();

            setIsSaving(false);
            setMontoCobrado('');
            return;
        }

        try {
            await performTransaction();
            
            Toast.show({ type: 'success', text1: '¡Cobro registrado con éxito!' });
            if(onPaymentSuccess) onPaymentSuccess();
            onClose();

        } catch (err) {
            console.error("Error cobro:", err);
            setError("No se pudo registrar. Intenta de nuevo.");
            Toast.show({type: 'error', text1: 'Error al registrar'});
        } finally {
            setIsSaving(false);
            setMontoCobrado('');
        }
    };
    
    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Registrar Cobro</Text>
                    <Text style={styles.modalSubtitle}>Venta del <Text style={{fontWeight: 'bold'}}>{modalDate}</Text></Text> 
                    
                    {error ? <Text style={styles.modalError}>{error}</Text> : null}

                    <Text style={styles.modalDebt}>Saldo actual: <Text style={{ color: COLORS.warning }}>{formatCurrency(venta.saldoPendiente)}</Text></Text>
                    
                    <TextInput 
                        style={styles.input} 
                        placeholder="Monto Cobrado" 
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric" 
                        value={montoCobrado} 
                        onChangeText={setMontoCobrado} 
                        autoFocus
                    />
                    
                    <View style={styles.modalActions}>
                        <TouchableOpacity onPress={onClose} style={styles.modalButtonCancel}>
                            <Text style={styles.modalButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={handleConfirmPayment} 
                            disabled={isSaving} 
                            style={styles.modalButtonConfirm}
                        >
                            {isSaving ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.modalButtonText}>Confirmar</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// --- Pantalla SaleDetailScreen ---
const SaleDetailScreen = ({ navigation }: SaleDetailScreenProps) => {
    const route = useRoute();
    const { saleId } = route.params as SaleDetailRouteParams; 

    const [sale, setSale] = useState<Sale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
    const { clients, syncData, isOffline } = useData(); 

    useEffect(() => {
        if (!saleId || typeof saleId !== 'string') {
            setIsLoading(false);
            return;
        }

        const db = dbContainer.instance;
        if (!db) {
            console.error("SaleDetailScreen: DB no está lista.");
            setIsLoading(false);
            return;
        }

        const saleRef = doc(db, 'ventas', saleId);
        
        const unsubscribe = onSnapshot(saleRef, (docSnapshot) => {
            // ✅ CORRECCIÓN DE ERROR TYPESCRIPT: docSnapshot.exists() es función
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                if (data) {
                     // Normalizar fechas
                    let fechaNormalizada = data.fecha;
                    if (data.fecha && typeof data.fecha.toDate === 'function') {
                        fechaNormalizada = data.fecha.toDate();
                    } else if (data.fecha && typeof data.fecha.seconds === 'number') {
                        fechaNormalizada = new Date(data.fecha.seconds * 1000);
                    }
                    setSale({ id: docSnapshot.id, ...data, fecha: fechaNormalizada } as Sale);
                }
            } else {
                console.error("No se encontró la venta.");
                setSale(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error al cargar:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [saleId]);

    const clientName = useMemo(() => {
        if (!sale) return 'Cliente no especificado';
        if (sale.clienteNombre) return sale.clienteNombre;
        if (sale.clientName) return sale.clientName;
        const client = clients.find(c => c.id === sale.clienteId);
        return client?.nombre || 'Cliente no especificado';
    }, [sale, clients]);
    
    const handlePaymentSuccess = () => {
        syncData();
    };
    
    // --- Render Lógica de Carga ---
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!sale) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <View style={[styles.header, { backgroundColor: COLORS.backgroundEnd, borderColor: COLORS.glassBorder }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                        <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Error</Text>
                    <View style={styles.headerButton} />
                </View>
                <Text style={styles.errorText}>No se pudieron cargar los datos.</Text>
            </View>
        );
    }
    
    const saleDateFormatted = sale.fecha instanceof Date 
        ? sale.fecha.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) 
        : 'Fecha desconocida';

    // LÓGICA VISUAL (Agregada sutilmente)
    const isCobranza = sale.tipo === 'cobranza';
    const montoMostrar = isCobranza ? (sale.pagoEfectivo || sale.montoCobrado || 0) : sale.totalVenta;
    
    const getStatusColor = (estado: Sale['estado']) => {
        if (isCobranza) return '#8B5CF6'; // Color Violeta para cobros
        switch (estado) {
            case 'Pagada': return COLORS.success;
            case 'Adeuda': return COLORS.warning;
            case 'Anulada': return COLORS.danger;
            default: return COLORS.textSecondary;
        }
    };
    
    const statusColor = getStatusColor(sale.estado);
    const statusLabel = isCobranza ? 'COBRO' : sale.estado.toUpperCase();
    const isAdeuda = !isCobranza && (sale.estado === 'Adeuda' || sale.estado === 'Repartiendo');
    const isAnulada = sale.estado === 'Anulada';


    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
            
            {/* --- HEADER --- */}
            <View style={[styles.header, { backgroundColor: COLORS.backgroundEnd, borderColor: COLORS.glassBorder }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                {/* Cambiamos título si es cobro */}
                <Text style={styles.title}>{isCobranza ? 'DETALLE DE COBRO' : 'DETALLE DE VENTA'}</Text>
                <View style={styles.headerButton} />
            </View>
            
            <FlatList
                ListHeaderComponent={
                    <View style={styles.headerContentContainer}>
                        {/* Summary Card */}
                        <View style={[styles.summaryCard, isAnulada && { opacity: 0.5 }]}>
                            
                            <View style={styles.clientHeaderRow}>
                                <Text style={styles.clientName} numberOfLines={1}>{clientName}</Text>
                                <View style={[styles.statusPillContainer, { borderColor: statusColor, backgroundColor: `${statusColor}20` }]}>
                                    <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                                </View>
                            </View>

                            <Text style={styles.saleDate}>Vendedor: <Text style={{fontWeight: 'bold', color: COLORS.textPrimary}}>{sale.vendedorNombre || sale.vendedorName || 'Tú'}</Text></Text> 
                            
                            <Text style={styles.saleDate}>{saleDateFormatted}</Text>
                            
                            <View style={[styles.totalRow, styles.totalRowBorder]}>
                                <Text style={styles.totalLabel}>{isCobranza ? 'MONTO COBRADO:' : 'TOTAL VENTA:'}</Text>
                                {/* Usamos color violeta si es cobro */}
                                <Text style={[styles.totalAmount, isCobranza && { color: '#8B5CF6' }]}>{formatCurrency(montoMostrar)}</Text>
                            </View>
                            
                            {/* Solo mostramos saldo si NO es cobro */}
                            {!isCobranza && (
                                <View style={styles.balanceRow}>
                                    <Text style={styles.balanceLabel}>SALDO PENDIENTE:</Text>
                                    <Text style={styles.balanceAmount}>{formatCurrency(sale.saldoPendiente)}</Text>
                                </View>
                            )}
                        </View>
                        
                        {/* Solo mostramos titulo de productos si NO es cobro */}
                        {!isCobranza && <Text style={styles.listHeader}>PRODUCTOS VENDIDOS</Text>}
                    </View>
                }
                // Si es cobro, lista vacía
                data={isCobranza ? [] : sale.items}
                keyExtractor={(item, index) => `${item.nombre}-${index}`}
                contentContainerStyle={styles.listContentContainer}
                renderItem={({ item }) => (
                    <View style={styles.itemCard}>
                        <View style={styles.itemDetails}>
                            <Text style={styles.itemName}>{item.nombre}</Text>
                            <Text style={styles.itemPrice}>
                                <Text>{item.quantity} x </Text><Text>{formatCurrency(item.precio)}</Text>
                            </Text>
                            {item.promoAplicada && <Text style={styles.promoText}>{item.promoAplicada}</Text>}
                        </View>
                        <Text style={styles.itemSubtotal}>{formatCurrency(item.quantity * (item.precio || 0))}</Text>
                    </View>
                )}
                ListEmptyComponent={
                    isCobranza ? (
                        <View style={styles.emptyContainer}>
                            <Feather name="check-circle" size={SIZES.h1} color="#8B5CF6" />
                            <Text style={styles.emptyText}>Pago registrado correctamente.</Text>
                        </View>
                    ) : null
                }
            />
            
            {/* --- FOOTER DE ACCIÓN (Solo si es Venta y hay Deuda) --- */}
            {isAdeuda && (sale.saldoPendiente || 0) > 0.01 && (
                <View style={[styles.footer, { paddingBottom: SIZES.medium }]}>
                    <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => setIsDebtModalOpen(true)}
                    >
                        <Feather name="dollar-sign" size={SIZES.h3} color={COLORS.cardBackground} />
                        <Text style={styles.actionButtonText}>REGISTRAR COBRO</Text>
                    </TouchableOpacity>
                </View>
            )}

            <CollectDebtModal 
                visible={isDebtModalOpen}
                onClose={() => setIsDebtModalOpen(false)}
                venta={sale}
                onPaymentSuccess={handlePaymentSuccess} 
                isOffline={isOffline} 
            />
        </View>
    );
};

// --- Estilos Originales Mantenidos ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    errorText: { color: COLORS.danger, textAlign: 'center', marginTop: SIZES.medium * 5, fontSize: SIZES.body },
    
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.small,
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.small,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        backgroundColor: COLORS.backgroundEnd,
    },
    headerButton: { 
        padding: SIZES.small,
        width: SIZES.large * 2, 
        alignItems: 'center',
    },
    title: { 
        fontSize: SIZES.h3, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary,
        textTransform: 'uppercase',
    },
    
    headerContentContainer: {
        paddingHorizontal: SIZES.medium, 
        paddingBottom: SIZES.small,
    },
    summaryCard: { 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        padding: SIZES.medium, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        marginBottom: SIZES.medium,
    },
    clientHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start', 
        marginBottom: SIZES.small,
    },
    clientName: { 
        color: COLORS.textPrimary, 
        fontSize: SIZES.h3, 
        fontWeight: 'bold', 
        flex: 1, 
        paddingRight: SIZES.small,
    },
    saleDate: { color: COLORS.textSecondary, fontSize: SIZES.xsmallText, marginBottom: SIZES.xsmall / 2 },

    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalRowBorder: { borderTopColor: COLORS.glassBorder, borderTopWidth: SIZES.borderWidth, paddingTop: SIZES.medium, marginTop: SIZES.xsmall },
    totalLabel: { color: COLORS.textSecondary, fontSize: SIZES.body, fontWeight: '500' },
    totalAmount: { color: COLORS.primary, fontSize: SIZES.h3, fontWeight: 'bold' },
    
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SIZES.xsmall },
    balanceLabel: { color: COLORS.textSecondary, fontSize: SIZES.body, fontWeight: '500' },
    balanceAmount: { color: COLORS.warning, fontSize: SIZES.h3, fontWeight: 'bold' },

    statusPillContainer: {
        borderRadius: SIZES.small,
        paddingHorizontal: SIZES.small,
        paddingVertical: SIZES.xsmall,
        borderWidth: SIZES.borderWidth,
        maxWidth: '40%',
    },
    statusPillText: {
        fontSize: SIZES.xsmallText,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },

    listHeader: { 
        fontSize: SIZES.body, 
        fontWeight: '600', 
        color: COLORS.textSecondary, 
        paddingHorizontal: SIZES.medium, 
        marginBottom: SIZES.small, 
        textTransform: 'uppercase', 
        letterSpacing: 0.5,
    },
    listContentContainer: { 
        paddingHorizontal: SIZES.medium, 
        paddingBottom: SIZES.medium * 8 
    },
    itemCard: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: COLORS.cardBackground, 
        paddingVertical: SIZES.medium, 
        paddingHorizontal: SIZES.medium, 
        borderRadius: SIZES.small, 
        marginBottom: SIZES.small, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
    },
    itemDetails: { flex: 1 },
    itemName: { color: COLORS.textPrimary, fontSize: SIZES.body, fontWeight: '500' },
    itemPrice: { color: COLORS.textSecondary, fontSize: SIZES.xsmallText, marginTop: SIZES.xsmall / 2 },
    promoText: { color: COLORS.success, fontSize: SIZES.xsmallText, fontStyle: 'italic', marginTop: SIZES.xsmall / 2 },
    itemSubtotal: { color: COLORS.textPrimary, fontSize: SIZES.body, fontWeight: 'bold' },
    
    footer: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        paddingHorizontal: SIZES.medium, 
        paddingVertical: SIZES.small, 
        backgroundColor: COLORS.backgroundEnd, 
        borderTopWidth: SIZES.borderWidth * 2, 
        borderColor: COLORS.primary, 
        shadowColor: COLORS.textPrimary, 
        shadowOffset: { width: 0, height: -2 }, 
        shadowOpacity: 0.2, 
        shadowRadius: 5, 
        elevation: 10,
    },
    actionButton: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: COLORS.primary, 
        paddingVertical: SIZES.medium, 
        borderRadius: SIZES.radius, 
        gap: SIZES.small, 
        height: 56,
    },
    actionButtonText: { 
        color: COLORS.cardBackground, 
        fontSize: SIZES.h3, 
        fontWeight: 'bold',
    },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { 
        width: '85%', 
        backgroundColor: COLORS.backgroundStart, 
        borderRadius: SIZES.radius, 
        padding: SIZES.large, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalTitle: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: SIZES.xsmallText, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.small },
    modalDebt: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center', marginBottom: SIZES.medium * 1.5, marginTop: SIZES.small }, 
    modalError: { fontSize: SIZES.xsmallText, color: COLORS.danger, textAlign: 'center', marginBottom: SIZES.small },
    input: { 
        backgroundColor: COLORS.cardBackground, 
        color: COLORS.textPrimary, 
        paddingHorizontal: SIZES.medium, 
        paddingVertical: SIZES.small, 
        borderRadius: SIZES.small, 
        fontSize: SIZES.h3, 
        textAlign: 'center', 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SIZES.medium, gap: SIZES.small },
    modalButtonCancel: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, backgroundColor: COLORS.disabled, borderWidth: SIZES.borderWidth, borderColor: COLORS.textSecondary },
    modalButtonConfirm: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, backgroundColor: COLORS.success }, 
    modalButtonText: { color: COLORS.primary, fontWeight: 'bold', textAlign: 'center', fontSize: SIZES.body },
    
    emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: SIZES.large, gap: SIZES.small },
    emptyText: { color: COLORS.textSecondary, fontStyle: 'italic' }
});

export default SaleDetailScreen;