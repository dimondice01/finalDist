// src/screens/ClientDebtsScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import {
    addDoc,
    collection,
    doc,
    runTransaction,
    serverTimestamp,
    Timestamp
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS: SDK NATIVO (v9 Modular) ---

import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { ClientDebtsScreenProps } from '../navigation/AppNavigator';

// --- Contexto, DB, Estilos ---
import { Sale as BaseSale, useData } from '../../context/DataContext';

// --- ¡¡INICIO DE CORRECCIÓN DE IMPORTACIÓN!! ---
import { dbContainer } from '../../db/firebase-service';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

// Usamos el tipo completo de DataContext, renombrado para claridad
type Sale = BaseSale; 

// --- Props del Modal (ACTUALIZADA) ---
interface RegisterPaymentModalProps {
    visible: boolean;
    onClose: () => void;
    debt: Sale | null; 
    clientName?: string | string[]; 
    onPaymentSuccess: () => void;
    isOffline: boolean; 
}

// --- Función auxiliar para fechas (CORREGIDA) ---
const getDateTimestamp = (fecha: Sale['fecha']): number => {
    if (!fecha) return 0;
    if (fecha instanceof Date) {
        return !isNaN(fecha.getTime()) ? fecha.getTime() : 0;
    }
    if (fecha instanceof Timestamp) {
        return fecha.toMillis();
    }
    if (fecha && typeof (fecha as { seconds: number })?.seconds === 'number') {
        const timestampMillis = (fecha as { seconds: number }).seconds * 1000;
        return !isNaN(timestampMillis) ? timestampMillis : 0;
    }
    return 0;
};

// --- COMPONENTE MODAL (ACTUALIZADO CON ESTILOS EJECUTIVOS) ---
const RegisterPaymentModal = ({ visible, onClose, debt, clientName, onPaymentSuccess, isOffline }: RegisterPaymentModalProps) => {
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

        const db = dbContainer.instance;
        if (!db) {
            console.error("handleConfirmPayment: DB no está lista.");
            Alert.alert('Error', 'La base de datos no está inicializada. Intente reiniciar la app.');
            return;
        }

        setIsSaving(true);
        
        const executeTransaction = async () => {
            await runTransaction(db, async (transaction) => {
                // 1. Crear el documento de "Cobro"
                await addDoc(collection(db, 'ventas'), {
                    clientName: `Cobro Saldo - ${clientName || debt.clienteNombre || 'Cliente'}`, 
                    estado: "Pagada",
                    fecha: serverTimestamp(), 
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
                
                // @ts-ignore
                if (!saleDoc.exists) throw new Error("La factura original no fue encontrada.");

                const data = saleDoc.data();
                if (!data) throw new Error("No se pudieron leer los datos de la venta.");

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
        };
        
        if (isOffline) {
            executeTransaction().catch(err => {
                console.error("Error en la escritura de cobro en segundo plano:", err);
            });

            Toast.show({ type: 'success', text1: 'Cobro Guardado (Offline)', text2: 'Se sincronizará al conectar.' });
            onPaymentSuccess();
            onClose();
            setIsSaving(false);
            setAmount('');
            return;
        }

        try {
            await executeTransaction();

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
    }, [amount, debt, clientName, onPaymentSuccess, onClose, isOffline]);

    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>REGISTRAR COBRO</Text>
                    <Text style={styles.modalSubtitle}>Venta del {modalDate}</Text>
                    <Text style={styles.modalDebt}>SALDO ACTUAL: ${debt.saldoPendiente?.toFixed(2)}</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Monto Cobrado"
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                        autoFocus
                    />

                    <View style={styles.modalActions}>
                        <TouchableOpacity onPress={onClose} style={[styles.modalButtonCancel, isSaving && { opacity: 0.5 }]}>
                            <Text style={styles.modalButtonText}>CANCELAR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={handleConfirmPayment} 
                            disabled={isSaving} 
                            style={styles.modalButtonConfirm}
                        >
                            {isSaving ? <ActivityIndicator color={COLORS.white} /> : <Text style={[styles.modalButtonText, { color: COLORS.white }]}>CONFIRMAR</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN COMPONENTE MODAL ---


// --- Componente DebtCard (Rediseñado) ---
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
            <View style={styles.debtInfoContainer}>
                <Text style={styles.debtDate}>Venta del {formattedDate}</Text>
                <Text style={styles.debtTotal}>Total: ${item.totalVenta?.toFixed(2)}</Text>
            </View>
            <View style={styles.debtAmountContainer}>
                <Text style={styles.debtAmountLabel}>ADEUDA</Text>
                <Text style={styles.debtAmount}>${item.saldoPendiente?.toFixed(2)}</Text>
            </View>
            <Feather name="arrow-right-circle" size={SIZES.h3} color={COLORS.primary} style={styles.payIcon} />
        </TouchableOpacity>
    );
});
// --- FIN Componente Memoizado ---


// --- Pantalla Principal (Estilizada) ---
const ClientDebtsScreen = ({ navigation, route }: ClientDebtsScreenProps) => {
    const { clientId, clientName } = route.params;
    const { sales, isLoading, syncData, isOffline } = useData();

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<Sale | null>(null); 

    const debts: Sale[] = useMemo(() => {
        return (sales || [])
            .filter((sale: Sale) => 
                sale &&
                sale.clienteId === clientId &&
                sale.estado === 'Adeuda' &&
                (sale.saldoPendiente || 0) > 0.01 
            )
            .sort((a, b) => getDateTimestamp(a.fecha) - getDateTimestamp(b.fecha));
    }, [sales, clientId]);

    const handleOpenModal = useCallback((debt: Sale) => { 
        setSelectedDebt(debt);
        setModalVisible(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setModalVisible(false);
        setSelectedDebt(null);
    }, []);

    const renderDebtItem = useCallback(({ item }: { item: Sale }) => ( 
        <DebtCard item={item} onPress={handleOpenModal} />
    ), [handleOpenModal]);
    
    if (isLoading && sales.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>SALDOS PENDIENTES</Text>
                <View style={styles.headerPlaceholder} />
            </View>
            <Text style={styles.clientName}>{clientName}</Text>

            <FlatList
                data={debts}
                renderItem={renderDebtItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="check-circle" size={SIZES.h1} color={COLORS.success} />
                        <Text style={styles.emptyText}>¡Este cliente no tiene saldos pendientes!</Text>
                    </View>
                }
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={Platform.OS === 'android'}
            />
            
            <RegisterPaymentModal
                visible={modalVisible}
                onClose={handleCloseModal}
                debt={selectedDebt}
                clientName={clientName} 
                onPaymentSuccess={syncData}
                isOffline={isOffline}
            />
        </View>
    );
};

// --- Estilos (Ajustados al sistema de diseño) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    
    // Header
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.medium,
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.large,
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        backgroundColor: COLORS.backgroundEnd,
    },
    backButton: { padding: SIZES.xsmall },
    headerPlaceholder: { width: SIZES.xl },
    title: { 
        fontSize: SIZES.h2, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    clientName: { 
        color: COLORS.textSecondary, 
        fontSize: SIZES.body, 
        textAlign: 'center', 
        marginBottom: SIZES.medium,
        marginTop: SIZES.medium,
    },

    // Lista y Tarjeta de Deuda
    listContentContainer: { 
        paddingHorizontal: SIZES.large, 
        paddingBottom: SIZES.large 
    },
    debtCard: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: COLORS.backgroundEnd, 
        padding: SIZES.medium, 
        borderRadius: SIZES.radius, 
        marginBottom: SIZES.small, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    debtInfoContainer: { flex: 1, marginRight: SIZES.medium },
    debtDate: { color: COLORS.textSecondary, fontSize: SIZES.caption, fontWeight: '500' },
    debtTotal: { color: COLORS.textSecondary, fontSize: SIZES.caption, fontWeight: '500', marginTop: SIZES.xsmall / 2 },
    debtAmountContainer: { alignItems: 'flex-end', marginRight: SIZES.medium },
    debtAmountLabel: { color: COLORS.warning, fontSize: SIZES.xsmallText, fontWeight: 'bold', textTransform: 'uppercase' },
    debtAmount: { color: COLORS.warning, fontSize: SIZES.h3, fontWeight: 'bold', marginTop: SIZES.xsmall / 2 },
    payIcon: { padding: SIZES.xsmall },

    // Empty State
    emptyContainer: { alignItems: 'center', marginTop: SIZES.xl, gap: SIZES.medium },
    emptyText: { color: COLORS.textSecondary, fontSize: SIZES.body, textAlign: 'center' },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { 
        width: '85%', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        padding: SIZES.large, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalTitle: { fontSize: SIZES.h2, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', textTransform: 'uppercase' },
    modalSubtitle: { fontSize: SIZES.caption, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.small },
    modalDebt: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.warning, textAlign: 'center', marginBottom: SIZES.large },
    input: { 
        backgroundColor: COLORS.backgroundStart, 
        color: COLORS.textPrimary, 
        paddingHorizontal: SIZES.medium, 
        paddingVertical: SIZES.medium, 
        borderRadius: SIZES.radiusSmall, 
        fontSize: SIZES.h3, 
        textAlign: 'center', 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SIZES.large, gap: SIZES.medium },
    modalButtonCancel: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, backgroundColor: COLORS.disabled, borderWidth: SIZES.borderWidth, borderColor: COLORS.textSecondary },
    modalButtonConfirm: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, backgroundColor: COLORS.primary },
    modalButtonText: { color: COLORS.textPrimary, fontWeight: 'bold', textAlign: 'center', fontSize: SIZES.body, textTransform: 'uppercase' },
});

export default ClientDebtsScreen;