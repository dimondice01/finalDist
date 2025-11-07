// src/screens/register-payment.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO ---
// ELIMINADAS: import { doc, runTransaction } from 'firebase/firestore';
// --- FIN DE CAMBIOS: SDK NATIVO ---

import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { RegisterPaymentScreenProps } from '../navigation/AppNavigator';

// Esta 'db' es NATIVA
import { db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// Definimos la interfaz de parámetros esperada por esta pantalla
interface RouteParams {
    saleId: string;
    saldoPendiente: string;
    saleInfo: string;
}

const RegisterPaymentScreen = ({ navigation }: RegisterPaymentScreenProps) => {
    const route = useRoute();
    const { saleId, saldoPendiente: initialSaldo, saleInfo } = route.params as RouteParams;
    
    const saldoPendiente = parseFloat(initialSaldo || '0');

    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleRegisterPayment = async () => {
        const efectivo = parseFloat(pagoEfectivo) || 0;
        const transferencia = parseFloat(pagoTransferencia) || 0;
        const totalPagado = efectivo + transferencia;

        if (totalPagado <= 0) {
            Alert.alert("Error", "El monto a pagar debe ser mayor a cero.");
            return;
        }

        if (totalPagado > saldoPendiente + 0.01) { 
            Alert.alert("Monto Excedido", `El pago ($${totalPagado.toFixed(2)}) no puede ser mayor al saldo pendiente ($${saldoPendiente.toFixed(2)}).`);
            return;
        }

        setIsSaving(true);

        try {
            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            // Sintaxis Nativa para la referencia
            const saleRef = db.collection('ventas').doc(saleId as string);
            
            // Usamos el 'runTransaction' de la instancia NATIVA 'db'
            await db.runTransaction(async (transaction) => {
            // --- FIN DE CAMBIOS: SDK NATIVO ---

                const saleDoc = await transaction.get(saleRef);
                
                // --- INICIO DE CAMBIOS: SDK NATIVO ---
                // Usamos la propiedad '.exists' (Nativa) en lugar de '.exists()' (Web)
                if (!saleDoc.exists) {
                // --- FIN DE CAMBIOS: SDK NATIVO ---
                    throw "¡La venta no existe!";
                }

                const data = saleDoc.data();
                // Si 'data' es undefined (nunca debería pasar si .exists es true), lanzamos error
                if (!data) {
                    throw "No se pudieron leer los datos de la venta.";
                }
                
                const nuevoSaldo = (data.saldoPendiente || 0) - totalPagado;
                let nuevoEstado = data.estado;
                if (nuevoSaldo <= 0.01) {
                    nuevoEstado = 'Pagada';
                } else if (totalPagado > 0) { 
                    nuevoEstado = 'Adeuda'; 
                }
                
                transaction.update(saleRef, {
                    saldoPendiente: nuevoSaldo,
                    pagoEfectivo: (data.pagoEfectivo || 0) + efectivo,
                    pagoTransferencia: (data.pagoTransferencia || 0) + transferencia,
                    estado: nuevoEstado
                });
            });
            
            Alert.alert("Éxito", "El pago se ha registrado correctamente. Los datos se sincronizarán si estás sin conexión.");
            navigation.goBack();

        } catch (error) {
            console.error("Error al registrar el pago: ", error);
            Alert.alert("Error", "No se pudo registrar el pago. Inténtalo de nuevo.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Registrar Cobro</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.saleInfo}>{saleInfo}</Text>
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Saldo Pendiente</Text>
                    <Text style={styles.balanceAmount}>${(saldoPendiente || 0).toFixed(2)}</Text>
                </View>

                <View style={styles.inputContainer}>
                    <Feather name="dollar-sign" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Monto en Efectivo"
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric"
                        value={pagoEfectivo}
                        onChangeText={setPagoEfectivo}
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Feather name="credit-card" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Monto en Transferencia"
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="numeric"
                        value={pagoTransferencia}
                        onChangeText={setPagoTransferencia}
                    />
                </View>

                <TouchableOpacity style={[styles.confirmButton, isSaving && styles.confirmButtonDisabled]} onPress={handleRegisterPayment} disabled={isSaving}>
                    {isSaving ? <ActivityIndicator color={COLORS.primaryDark} /> : <Text style={styles.confirmButtonText}>Confirmar Pago</Text>}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

// --- ESTILOS (Sin cambios) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
    backButton: { position: 'absolute', left: 20, top: 60, padding: 10 },
    title: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary },
    content: { padding: 20, flex: 1, justifyContent: 'center' },
    saleInfo: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20 },
    
    balanceCard: { backgroundColor: COLORS.glass, borderRadius: 20, padding: 25, alignItems: 'center', marginBottom: 40, borderWidth: 1, borderColor: COLORS.glassBorder },
    balanceLabel: { color: COLORS.textSecondary, fontSize: 18 },
    balanceAmount: { color: COLORS.primary, fontSize: 42, fontWeight: 'bold', marginTop: 5 },

    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, marginBottom: 20, height: 58 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 18 },
    
    confirmButton: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 20 },
    confirmButtonDisabled: { backgroundColor: COLORS.disabled },
    confirmButtonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold' },
});

export default RegisterPaymentScreen;