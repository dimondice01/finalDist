// src/screens/register-payment.tsx
import { Feather } from '@expo/vector-icons';

// --- SDK NATIVO (v9 Modular) ---
import {
    collection,
    doc,
    runTransaction,
    Timestamp
} from '@react-native-firebase/firestore';

import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { RegisterPaymentScreenProps } from '../navigation/AppNavigator';

// --- Contexto ---
import { useData } from '../../context/DataContext';
import { auth, dbContainer } from '../../db/firebase-service'; // Agregamos auth para saber quién cobra
import { COLORS } from '../../styles/theme';

interface RouteParams {
    saleId: string;
    saldoPendiente: string;
    saleInfo: string;
    clientId?: string; // Necesitamos estos datos para el documento de cobro
    clientName?: string;
}

const RegisterPaymentScreen = ({ navigation }: RegisterPaymentScreenProps) => {
    const route = useRoute();
    const { saleId, saldoPendiente: initialSaldo, saleInfo, clientId, clientName } = route.params as RouteParams;
    
    const { isOffline, syncData } = useData();
    const saldoPendiente = parseFloat(initialSaldo || '0');

    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleRegisterPayment = async () => {
        const efectivo = parseFloat(pagoEfectivo.replace(',', '.')) || 0;
        const transferencia = parseFloat(pagoTransferencia.replace(',', '.')) || 0;
        const totalPagadoAhora = efectivo + transferencia;

        if (totalPagadoAhora <= 0) {
            Alert.alert("Error", "El monto a pagar debe ser mayor a cero.");
            return;
        }

        if (totalPagadoAhora > saldoPendiente + 10) { // Pequeña tolerancia
            Alert.alert("Monto Excedido", `El pago ($${totalPagadoAhora.toFixed(2)}) supera el saldo pendiente ($${saldoPendiente.toFixed(2)}).`);
            return;
        }

        setIsSaving(true);
        const db = dbContainer.instance;

        if (!db) {
            Alert.alert("Error", "Base de datos no inicializada.");
            setIsSaving(false);
            return;
        }
        
        const currentUser = auth.currentUser;

        try {
            await runTransaction(db, async (transaction) => {
                // 1. Leer Factura Original
                const saleRef = doc(db, 'ventas', saleId);
                const saleDoc = await transaction.get(saleRef);

                if (!saleDoc.exists) throw "La venta original no existe.";
                const saleData = saleDoc.data();

                // 2. Calcular Nuevo Saldo
                const nuevoSaldo = Math.max(0, (saleData?.saldoPendiente || 0) - totalPagadoAhora);
                let nuevoEstado = saleData?.estado;
                
                if (nuevoSaldo <= 10) { // Tolerancia de $10
                    nuevoEstado = 'Pagada';
                } else {
                    nuevoEstado = 'Adeuda';
                }

                // 3. ACTUALIZAR FACTURA ORIGINAL (Solo Saldo y Estado)
                // IMPORTANTE: NO sumamos al pagoEfectivo de la venta original para no duplicar en reportes históricos.
                // La venta original mantiene su registro de "cuánto se pagó al momento de la venta".
                transaction.update(saleRef, {
                    saldoPendiente: nuevoSaldo,
                    estado: nuevoEstado,
                    fechaUltimoPago: Timestamp.now() // Solo para ordenar
                });

                // 4. CREAR DOCUMENTO DE COBRO (Para la Caja del día)
                // Este documento representa SOLO el flujo de dinero de HOY.
                const cobroRef = doc(collection(db, 'ventas')); // Usamos la misma colección 'ventas' pero con tipo 'cobro'
                
                const cobroData = {
                    tipo: 'cobro', // Identificador clave
                    referenciaId: saleId, // Link a la venta original
                    
                    // Datos Financieros del COBRO ACTUAL
                    totalVenta: 0, // No suma a la venta bruta (ya se sumó cuando se creó la factura)
                    pagoEfectivo: efectivo,
                    pagoTransferencia: transferencia,
                    totalPagado: totalPagadoAhora,
                    
                    // Datos de Contexto
                    fecha: Timestamp.now(),
                    clienteId: saleData?.clienteId || clientId || '',
                    clienteNombre: saleData?.clienteNombre || clientName || 'Cliente',
                    vendedorId: currentUser?.uid,
                    vendedorName: currentUser?.displayName || 'Vendedor',
                    
                    // Estado para UI
                    estado: 'Pagada', // Un cobro siempre nace pagado
                    items: [{ // Item virtual para que no explote la UI de detalle
                        id: 'pago-cuenta',
                        nombre: `Cobro a cuenta: ${saleId.substring(0,6)}`,
                        quantity: 1,
                        precio: totalPagadoAhora
                    }]
                };

                transaction.set(cobroRef, cobroData);
            });

            // Éxito
            if (!isOffline) {
                Toast.show({ type: 'success', text1: 'Cobro Registrado', text2: `Nuevo saldo: $${(saldoPendiente - totalPagadoAhora).toFixed(2)}` });
                await syncData(); // Refrescar datos locales
            } else {
                Alert.alert("Guardado Offline", "El cobro se sincronizará cuando tengas internet.");
            }
            
            navigation.goBack();

        } catch (error: any) {
            console.error("Error en pago:", error);
            Alert.alert("Error", "No se pudo registrar el cobro: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
            
            {/* --- HEADER --- */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Registrar Cobro</Text>
                <View style={styles.headerButton} /> 
            </View>

            <View style={styles.content}>
                <Text style={styles.saleInfo}>{saleInfo}</Text>
                
                {/* --- TARJETA DE SALDO --- */}
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Saldo Pendiente Actual</Text>
                    <Text style={styles.balanceAmount}>${saldoPendiente.toLocaleString('es-AR')}</Text>
                </View>

                <Text style={styles.sectionTitle}>Ingrese Monto a Cobrar:</Text>

                {/* --- INPUT EFECTIVO --- */}
                <View style={styles.inputContainer}>
                    <Feather name="dollar-sign" size={20} color="#16a34a" style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Efectivo"
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric"
                        value={pagoEfectivo}
                        onChangeText={setPagoEfectivo}
                    />
                </View>

                {/* --- INPUT TRANSFERENCIA --- */}
                <View style={styles.inputContainer}>
                    <Feather name="credit-card" size={20} color="#2563eb" style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Transferencia"
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric"
                        value={pagoTransferencia}
                        onChangeText={setPagoTransferencia}
                    />
                </View>

                {/* --- BOTÓN CONFIRMAR --- */}
                <TouchableOpacity 
                    style={[styles.confirmButton, isSaving && styles.confirmButtonDisabled]} 
                    onPress={handleRegisterPayment} 
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator color="#FFF" /> 
                    ) : (
                        <Text style={styles.confirmButtonText}>CONFIRMAR COBRO</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

// --- ESTILOS PREMIUM ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    
    header: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 10, paddingBottom: 15, paddingHorizontal: 20,
        backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
    },
    headerButton: { padding: 8, borderRadius: 12, backgroundColor: '#F1F5F9' },
    title: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    
    content: { padding: 25, flex: 1, justifyContent: 'center' },
    
    saleInfo: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 25, fontWeight: '500' },
    
    balanceCard: { 
        backgroundColor: '#FFF', borderRadius: 24, padding: 25, alignItems: 'center', marginBottom: 40,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
        borderWidth: 1, borderColor: '#F1F5F9'
    },
    balanceLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    balanceAmount: { color: COLORS.danger, fontSize: 42, fontWeight: '900', marginTop: 5 },

    sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 15, marginLeft: 5 },

    inputContainer: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, 
        borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 15, marginBottom: 15, height: 60,
        shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1
    },
    inputIcon: { marginRight: 15 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 18, fontWeight: '600', height: '100%' },
    
    confirmButton: { 
        backgroundColor: COLORS.primary, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
        marginTop: 20, height: 60, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6
    },
    confirmButtonDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
    confirmButtonText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});

export default RegisterPaymentScreen;