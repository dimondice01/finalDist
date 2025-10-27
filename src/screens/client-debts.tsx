// src/screens/ClientDebtsScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Quitamos import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, runTransaction, Timestamp } from 'firebase/firestore';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { ClientDebtsScreenProps } from '../navigation/AppNavigator'; // Asegúrate de que esta ruta sea correcta

// --- Contexto, DB, Estilos ---
import { Sale as BaseSale, useData } from '../../context/DataContext'; // Importamos Sale como BaseSale
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// Usamos el tipo completo de DataContext, renombrado para claridad
type Sale = BaseSale; 

// --- Props del Modal (Adaptado para usar Sale) ---
interface RegisterPaymentModalProps {
    visible: boolean;
    onClose: () => void;
    debt: Sale | null; // <-- Usamos el tipo Sale completo
    clientName?: string | string[]; // Recibe clientName como prop
    onPaymentSuccess: () => void;
}

// --- Función auxiliar para fechas (Robusta) ---
const getDateTimestamp = (fecha: Sale['fecha']): number => {
    if (!fecha) return 0;
    if (fecha instanceof Date) {
        return !isNaN(fecha.getTime()) ? fecha.getTime() : 0;
    }
    if (fecha && typeof (fecha as { seconds: number })?.seconds === 'number') {
        const timestampMillis = (fecha as { seconds: number }).seconds * 1000;
        return !isNaN(timestampMillis) ? timestampMillis : 0;
    }
    return 0;
};

// --- COMPONENTE MODAL (Adaptado a recibir props) ---
const RegisterPaymentModal = ({ visible, onClose, debt, clientName, onPaymentSuccess }: RegisterPaymentModalProps) => {
    const [amount, setAmount] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    if (!debt) return null;

    const modalDate = useMemo(() => {
        const ts = getDateTimestamp(debt.fecha);
        return ts > 0 ? new Date(ts).toLocaleDateString('es-AR') : 'Fecha inválida';
    }, [debt.fecha]);

    const handleConfirmPayment = useCallback(async () => {
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            Alert.alert("Error", "Por favor, ingresa un monto válido.");
            return;
        }
        if (paymentAmount > (debt.saldoPendiente || 0) + 0.01) { 
            Alert.alert("Error", `El monto no puede ser mayor al saldo pendiente de $${(debt.saldoPendiente || 0).toFixed(2)}.`);
            return;
        }

        setIsSaving(true);
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Crear el documento de "Cobro"
                await addDoc(collection(db, 'ventas'), {
                    clientName: `Cobro Saldo - ${clientName || debt.clienteNombre || 'Cliente'}`, 
                    estado: "Pagada",
                    fecha: Timestamp.now(),
                    numeroFactura: `COBRO-${debt.numeroFactura || debt.id.substring(0, 6)}`,
                    pagoEfectivo: paymentAmount,
                    pagoTransferencia: 0,
                    saldoPendiente: 0,
                    vendedorId: debt.vendedorId,
                    vendedorNombre: debt.vendedorName,
                });

                // 2. Actualizar la factura original
                const saleRef = doc(db, 'ventas', debt.id);
                const saleDoc = await transaction.get(saleRef);
                if (!saleDoc.exists()) throw new Error("La factura original no fue encontrada.");

                const data = saleDoc.data();
                const newBalance = (data.saldoPendiente || 0) - paymentAmount;
                const newStatus = newBalance <= 0.01 ? "Pagada" : "Adeuda";

                const finalCommission = newStatus === 'Pagada'
                    ? data.totalVenta * ((data.porcentajeComision || 0) / 100)
                    : (data.totalComision || 0);

                transaction.update(saleRef, {
                    saldoPendiente: newBalance,
                    estado: newStatus,
                    totalComision: finalCommission,
                });
            });

            Toast.show({ type: 'success', text1: 'Cobro registrado con éxito!' });
            onPaymentSuccess();
            onClose();

        } catch (error: any) {
            console.error("Error en la transacción de cobro:", error);
            Toast.show({ type: 'error', text1: 'Error al registrar el cobro', text2: error.message || 'Error desconocido' });
        } finally {
            setIsSaving(false);
            setAmount('');
        }
    }, [amount, debt, clientName, onPaymentSuccess, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Registrar Cobro</Text>
                    <Text style={styles.modalSubtitle}>Venta del {modalDate}</Text>
                    <Text style={styles.modalDebt}>Saldo actual: ${debt.saldoPendiente?.toFixed(2)}</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Monto Cobrado"
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                        autoFocus
                    />

                    <View style={styles.modalActions}>
                        <TouchableOpacity onPress={onClose} style={styles.modalButtonCancel}>
                            <Text style={styles.modalButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleConfirmPayment} disabled={isSaving} style={styles.modalButtonConfirm}>
                            {isSaving ? <ActivityIndicator color={COLORS.primaryDark} /> : <Text style={styles.modalButtonText}>Confirmar</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN COMPONENTE MODAL ---


// --- Componente Memoizado para la Tarjeta de Deuda ---
const DebtCard = memo(({ item, onPress }: { item: Sale, onPress: (item: Sale) => void }) => {
    
    const formattedDate = useMemo(() => {
        const ts = getDateTimestamp(item.fecha);
        return ts > 0 ? new Date(ts).toLocaleDateString('es-AR') : 'Fecha inválida';
    }, [item.fecha]);

    const handlePress = useCallback(() => {
        onPress(item);
    }, [item, onPress]);

    return (
        <TouchableOpacity
            style={styles.debtCard}
            onPress={handlePress}
            activeOpacity={0.7}
        >
            <View>
                <Text style={styles.debtDate}>Venta del {formattedDate} (Total: ${(item.totalVenta || 0).toFixed(2)})</Text>
                <Text style={styles.debtAmount}>Saldo: ${(item.saldoPendiente || 0).toFixed(2)}</Text>
            </View>
            <Feather name="dollar-sign" size={24} color={COLORS.primary} />
        </TouchableOpacity>
    );
});
// --- FIN Componente Memoizado ---


// --- Pantalla Principal (Adaptada) ---
const ClientDebtsScreen = ({ navigation, route }: ClientDebtsScreenProps) => {
    // --- Usar route.params ---
    const { clientId, clientName } = route.params;
    const { sales, isLoading, syncData } = useData();

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<Sale | null>(null); // Usa el tipo Sale

    // --- useMemo con helper de fecha robusto ---
    const debts: Sale[] = useMemo(() => {
        return (sales || [])
            .filter((sale: Sale) => 
                sale &&
                sale.clienteId === clientId &&
                sale.estado === 'Adeuda' &&
                (sale.saldoPendiente || 0) > 0.01 // Evitar deudas mínimas
            )
            .sort((a, b) => getDateTimestamp(a.fecha) - getDateTimestamp(b.fecha)); // Orden ascendente
    }, [sales, clientId]);

    // --- Handlers con useCallback ---
    const handleOpenModal = useCallback((debt: Sale) => { // Usa el tipo Sale
        setSelectedDebt(debt);
        setModalVisible(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setModalVisible(false);
        setSelectedDebt(null);
    }, []);

    const renderDebtItem = useCallback(({ item }: { item: Sale }) => ( // Usa el tipo Sale
        <DebtCard item={item} onPress={handleOpenModal} />
    ), [handleOpenModal]);
    
    // --- Fin Handlers ---

    if (isLoading && sales.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            {/* Header Adaptado */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Saldos a Cobrar</Text>
                <View style={styles.headerPlaceholder} />{/* Espaciador */}
            </View>
            <Text style={styles.clientName}>{clientName}</Text>

            {/* FlatList Optimizada */}
            <FlatList
                data={debts}
                renderItem={renderDebtItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 15 }}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="check-circle" size={40} color={COLORS.success} />
                        <Text style={styles.emptyText}>¡Este cliente no tiene saldos pendientes!</Text>
                    </View>
                }
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={Platform.OS === 'android'}
            />
            
            {/* Modal Adaptado */}
            <RegisterPaymentModal
                visible={modalVisible}
                onClose={handleCloseModal}
                debt={selectedDebt}
                clientName={clientName} // <-- Prop clientName pasada al modal
                onPaymentSuccess={syncData}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundEnd },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 20,
        paddingBottom: 10, 
        paddingHorizontal: 20 
    },
    backButton: { padding: 10 },
    headerPlaceholder: { width: 44 },
    title: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
    clientName: { color: COLORS.textSecondary, fontSize: 18, textAlign: 'center', marginBottom: 15 },
    emptyContainer: { alignItems: 'center', marginTop: 80, gap: 15 },
    emptyText: { color: COLORS.textSecondary, fontSize: 16, textAlign: 'center' },
    debtCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.glass, padding: 20, borderRadius: 15, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
    debtDate: { color: COLORS.textSecondary, fontSize: 14, },
    debtAmount: { color: COLORS.warning, fontSize: 18, fontWeight: 'bold', marginTop: 5 },
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

export default ClientDebtsScreen;