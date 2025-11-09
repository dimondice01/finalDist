// src/screens/register-payment.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import {
    doc,
    runTransaction
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS: SDK NATIVO (v9 Modular) ---

import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { RegisterPaymentScreenProps } from '../navigation/AppNavigator';

// Esta 'db' es NATIVA
import { dbContainer } from '../../db/firebase-service';
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
            // --- INICIO DE CAMBIOS: SDK NATIVO (v9) ---
            // Sintaxis v9 para la referencia
            const db = dbContainer.instance;

            // 2. Comprobación de seguridad
            if (!db) {
                console.error("RegisterPayment: DB no está lista, abortando PAGO.");
                throw new Error("La base de datos no está lista. Reinicia la app.");
            }
            const saleRef = doc(db, 'ventas', saleId as string); // <-- CORREGIDO
            
            // Sintaxis v9 para la transacción
            await runTransaction(db, async (transaction) => { // <-- CORREGIDO
            // --- FIN DE CAMBIOS: SDK NATIVO (v9) ---

                const saleDoc = await transaction.get(saleRef);
                
                // --- INICIO DE CAMBIOS: SDK NATIVO ---
                // @ts-ignore: El linter de TS se confunde con los tipos nativos vs web
                if (!saleDoc.exists) { // <-- CORREGIDO con ts-ignore
                // --- FIN DE CAMBIOS: SDK NATIVO ---
                    throw "¡La venta no existe!";
                }

                const data = saleDoc.data();
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
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            {/* --- HEADER MEJORADO --- */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Registrar Cobro</Text>
                <View style={styles.headerButton} /> {/* Placeholder */}
            </View>

            <View style={styles.content}>
                <Text style={styles.saleInfo}>{saleInfo}</Text>
                
                {/* --- TARJETA DE SALDO MEJORADA --- */}
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Saldo Pendiente</Text>
                    <Text style={styles.balanceAmount}>${(saldoPendiente || 0).toFixed(2)}</Text>
                </View>

                {/* --- INPUTS MEJORADOS --- */}
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

                {/* --- BOTÓN MEJORADO --- */}
                <TouchableOpacity style={[styles.confirmButton, isSaving && styles.confirmButtonDisabled]} onPress={handleRegisterPayment} disabled={isSaving}>
                    {isSaving ? (
                        <ActivityIndicator color={COLORS.primaryDark} /> 
                    ) : (
                        <Text style={styles.confirmButtonText}>Confirmar Pago</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

// --- ESTILOS MEJORADOS ---
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: COLORS.backgroundEnd 
    },
    background: { 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: '100%' 
    },
    // --- HEADER ESTANDARIZADO ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 20,
        paddingBottom: 20, 
        paddingHorizontal: 10
    },
    headerButton: { 
        padding: 10,
        width: 44,
        alignItems: 'center',
    },
    title: { 
        fontSize: 22, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary 
    },
    // --- FIN HEADER ---
    content: { 
        padding: 25, // Más padding
        flex: 1, 
        justifyContent: 'center' 
    },
    saleInfo: { 
        fontSize: 16, 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        marginBottom: 20,
        lineHeight: 22, // Mejor espaciado
    },
    
    balanceCard: { 
        backgroundColor: COLORS.glass, 
        borderRadius: 20, 
        paddingVertical: 20, // Padding vertical y horizontal
        paddingHorizontal: 25,
        alignItems: 'center', 
        marginBottom: 30, // Menos margen
        borderWidth: 1, 
        borderColor: COLORS.glassBorder 
    },
    balanceLabel: { 
        color: COLORS.textSecondary, 
        fontSize: 16, // Más legible
        fontWeight: '500',
    },
    balanceAmount: { 
        color: COLORS.primary, 
        fontSize: 40, // Ligeramente más pequeño
        fontWeight: 'bold', 
        marginTop: 8, // Más espacio
    },

    // --- INPUTS ESTANDARIZADOS ---
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.glass, 
        borderRadius: 15, // Más redondeado
        borderWidth: 1, 
        borderColor: COLORS.glassBorder, 
        paddingHorizontal: 15, 
        marginBottom: 15, // Menos espacio
        height: 52, // Altura estándar
    },
    inputIcon: { 
        marginRight: 10 
    },
    input: { 
        flex: 1, 
        color: COLORS.textPrimary, 
        fontSize: 17, // Ligeramente más grande
        height: '100%'
    },
    
    // --- BOTÓN ESTANDARIZADO ---
    confirmButton: { 
        backgroundColor: COLORS.primary, 
        padding: 15, // Padding estándar
        borderRadius: 15, // Más redondeado
        alignItems: 'center', 
        marginTop: 20, // Más espacio
        height: 52, // Altura estándar
        justifyContent: 'center', // Centra el spinner
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    confirmButtonDisabled: { 
        backgroundColor: COLORS.disabled,
        shadowOpacity: 0,
        elevation: 0,
    },
    confirmButtonText: { 
        color: COLORS.primaryDark, 
        fontSize: 18, 
        fontWeight: 'bold' 
    },
});

export default RegisterPaymentScreen;