// src/screens/register-payment.tsx
import { Feather } from '@expo/vector-icons';

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { RegisterPaymentScreenProps } from '../navigation/AppNavigator';

// --- Contexto ---
import { useData } from '../../context/DataContext';
import { auth, dbContainer, functions } from '../../db/firebase-service';
import { registrarCobro } from '../../services/paymentService';
import { COLORS } from '../../styles/theme';

// --- GPS & TRAZABILIDAD ---
import { locationService, LocationData } from '../../services/locationService';
import LocationPermissionModal from '../../components/LocationPermissionModal';

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
    
    const { isOffline, syncData, companyId, identity } = useData();
    const saldoPendiente = parseFloat(initialSaldo || '0');

    // Estados de pagos
    const [pagoEfectivo, setPagoEfectivo] = useState('');
    const [pagoTransferencia, setPagoTransferencia] = useState('');
    const [pagoQR, setPagoQR] = useState('');    // ✅ Nuevo
    const [pagoPoint, setPagoPoint] = useState(''); // ✅ Nuevo

    const [isSaving, setIsSaving] = useState(false);
    const [showLocationExplainer, setShowLocationExplainer] = useState(false);
    
    // Estados de MP
    const [isChargingQR, setIsChargingQR] = useState(false);
    const [isChargingPoint, setIsChargingPoint] = useState(false);

    // QR fijo de la Caja del vendedor (siempre la misma imagen, se busca una sola vez).
    // No es un QR distinto por cobro: es el mismo QR de siempre, y lo que cambia por
    // cobro es el monto activo en MercadoPago (ver generarCobroQR).
    const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
    const [qrModalVisible, setQrModalVisible] = useState(false);
    const [qrModalAmount, setQrModalAmount] = useState(0);

    useEffect(() => {
        const cargarImagenQR = async () => {
            if (!companyId || !identity?.mpCajaId) return;
            try {
                const obtenerImagenQR = functions.httpsCallable('obtenerImagenQR');
                const result = await obtenerImagenQR({ companyId, external_id: identity.mpCajaId });
                if ((result.data as any)?.qrImage) setQrImageUrl((result.data as any).qrImage);
            } catch (error) {
                console.error('Error cargando imagen de QR:', error);
            }
        };
        cargarImagenQR();
    }, [companyId, identity?.mpCajaId]);

    // ==================================================================
    // 🔄 POLLING DE ESTADO (misma lógica probada de noar-pos-resilense):
    // en vez de esperar un webhook, la app pregunta activamente cada 3s si
    // el cobro ya se acreditó, y precarga el monto cuando se confirma.
    // ==================================================================
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, []);

    const iniciarPollingPago = (reference: string, provider: 'point' | 'mercadopago', monto: number) => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        pollingRef.current = setInterval(async () => {
            try {
                const result = await functions.httpsCallable('verificarPagoMP')({ companyId, reference, provider });
                const status = (result.data as any)?.status;

                if (status === 'approved') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    if (provider === 'point') setPagoPoint(String(monto));
                    else setPagoQR(String(monto));
                    setQrModalVisible(false);
                    Toast.show({ type: 'success', text1: 'Pago Acreditado', text2: 'Se cargó el monto automáticamente.' });
                } else if (status === 'rejected' || status === 'canceled') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    Alert.alert("Pago no acreditado", "El cobro fue rechazado o cancelado.");
                }
            } catch (error) {
                console.error('Error de polling MP:', error);
            }
        }, 3000);
    };

    // ==================================================================
    // 📠 COBRO CON POINT (ZERO CONFIG)
    // ==================================================================
    const handleChargePoint = async () => {
        const amount = parseFloat(pagoPoint.replace(',', '.')) || 0;
        if (amount <= 0) {
            Alert.alert("Monto Inválido", "Ingrese un monto para cobrar con Point.");
            return;
        }

        if (!identity?.mpDeviceId) {
            Alert.alert("Sin Terminal", "No tienes un terminal Point asignado. Contacta al administrador.");
            return;
        }

        setIsChargingPoint(true);
        try {
            const result = await functions.httpsCallable('cobrarConPoint')({
                companyId,
                deviceId: identity.mpDeviceId,
                amount: amount,
                external_reference: `V-${saleId || 'NEW'}`
            });

            const data = result.data as any;
            if (data.success) {
                Alert.alert("Orden Enviada", "Sigue las instrucciones en el datáfono Point.");
                // Point se verifica por el ID del payment-intent (no por external_reference).
                iniciarPollingPago(data.intentId, 'point', amount);
            }
        } catch (error: any) {
            Alert.alert("Error Point", error.message);
        } finally {
            setIsChargingPoint(false);
        }
    };

    // ==================================================================
    // 📱 COBRO CON QR (IN-STORE)
    // ==================================================================
    const handleChargeQR = async () => {
        const amount = parseFloat(pagoQR.replace(',', '.')) || 0;
        if (amount <= 0) {
            Alert.alert("Monto Inválido", "Ingrese un monto para cobrar con QR.");
            return;
        }

        if (!identity?.mpCajaId) {
            Alert.alert("Sin Caja", "No tienes un ID de Caja (QR) asignado. Contacta al administrador.");
            return;
        }

        setIsChargingQR(true);
        try {
            const external_reference = `QR-${saleId || 'NEW'}`;
            const result = await functions.httpsCallable('generarCobroQR')({
                companyId,
                external_id: identity.mpCajaId,
                amount: amount,
                external_reference,
                title: `Cobro ${clientName || 'Cliente'}`
            });

            if ((result.data as any).success) {
                if (qrImageUrl) {
                    setQrModalAmount(amount);
                    setQrModalVisible(true);
                } else {
                    Alert.alert("QR Listo", "El monto ya está activo en tu Caja de MercadoPago, pero no se pudo cargar la imagen del QR. Pedile al cliente que abra tu Caja desde la App de MercadoPago.");
                }
                iniciarPollingPago(external_reference, 'mercadopago', amount);
            }
        } catch (error: any) {
            Alert.alert("Error QR", error.message);
        } finally {
            setIsChargingQR(false);
        }
    };

    const handleRegisterPayment = async () => {
        const efectivo = parseFloat(pagoEfectivo.replace(',', '.')) || 0;
        const transferencia = parseFloat(pagoTransferencia.replace(',', '.')) || 0;
        const mp_qr = parseFloat(pagoQR.replace(',', '.')) || 0;
        const mp_point = parseFloat(pagoPoint.replace(',', '.')) || 0;

        const totalPagadoAhora = efectivo + transferencia + mp_qr + mp_point;

        if (totalPagadoAhora <= 0) {
            Alert.alert("Error", "El monto a pagar debe ser mayor a cero.");
            return;
        }

        if (totalPagadoAhora > saldoPendiente + 10) {
            Alert.alert("Monto Excedido", `El pago ($${totalPagadoAhora.toFixed(2)}) supera el saldo pendiente ($${saldoPendiente.toFixed(2)}).`);
            return;
        }

        const hasPermission = await locationService.checkPermissions();
        if (!hasPermission) {
            setShowLocationExplainer(true);
            return;
        }

        performPaymentRegistration(efectivo, transferencia, mp_qr, mp_point, totalPagadoAhora);
    };

    const performPaymentRegistration = async (
        efectivo: number, 
        transferencia: number, 
        qr: number, 
        point: number, 
        totalPagadoAhora: number
    ) => {
        setIsSaving(true);
        let capturedLocation: LocationData | null = null;
        try {
            capturedLocation = await locationService.getMandatoryLocation();
        } catch (err: any) {
            Alert.alert("Error de Ubicación", "No se pudo obtener una coordenada válida.");
            setIsSaving(false);
            return;
        }

        const db = dbContainer.instance;
        if (!db) {
            Alert.alert("Error", "Base de datos no inicializada.");
            setIsSaving(false);
            return;
        }
        
        const currentUser = auth.currentUser;

        try {
            if (!companyId) throw new Error("ID de empresa no disponible.");

            await registrarCobro({
                db,
                companyId,
                ventaId: saleId,
                clienteId: clientId,
                clienteNombre: clientName,
                vendedorId: currentUser?.uid,
                vendedorNombre: currentUser?.displayName || 'Vendedor',
                montos: {
                    Efectivo: efectivo,
                    Transferencia: transferencia,
                    QR: qr,
                    Point: point,
                },
                location: capturedLocation,
            });

            if (!isOffline) {
                Toast.show({ type: 'success', text1: 'Cobro Registrado', text2: `Nuevo saldo: $${(saldoPendiente - totalPagadoAhora).toFixed(2)}` });
                await syncData();
            } else {
                Alert.alert("Guardado Offline", "El cobro se sincronizará cuando tengas internet.");
            }
            navigation.goBack();

        } catch (error: any) {
            Alert.alert("Error", "No se pudo registrar el cobro: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
                <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
                
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                        <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={styles.title}>Registrar Cobro</Text>
                        <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>
                            Caja: {identity?.mpCajaId || 'No asignada'} | Point: {identity?.mpDeviceId ? 'OK' : 'No'}
                        </Text>
                    </View>
                    <View style={styles.headerButton} /> 
                </View>

                <View style={styles.content}>
                    <Text style={styles.saleInfo}>{saleInfo}</Text>
                    
                    <View style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>Saldo Pendiente Actual</Text>
                        <Text style={styles.balanceAmount}>${saldoPendiente.toLocaleString('es-AR')}</Text>
                    </View>

                    <Text style={styles.sectionTitle}>Ingrese Monto por Método:</Text>

                    {/* EFECTIVO */}
                    <View style={styles.inputContainer}>
                        <Feather name="dollar-sign" size={20} color="#16a34a" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Efectivo"
                            keyboardType="numeric"
                            value={pagoEfectivo}
                            onChangeText={setPagoEfectivo}
                        />
                    </View>

                    {/* QR MERCADOPAGO */}
                    <View style={styles.inputContainer}>
                        <Feather name="aperture" size={20} color="#009ee3" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="QR MercadoPago"
                            keyboardType="numeric"
                            value={pagoQR}
                            onChangeText={setPagoQR}
                        />
                        <TouchableOpacity style={styles.miniAction} onPress={handleChargeQR} disabled={isChargingQR}>
                            {isChargingQR ? <ActivityIndicator size="small" color="#009ee3" /> : <Feather name="zap" size={18} color="#009ee3" />}
                        </TouchableOpacity>
                    </View>

                    {/* POINT SMART */}
                    <View style={styles.inputContainer}>
                        <Feather name="smartphone" size={20} color="#009ee3" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Point Smart / Tarjeta"
                            keyboardType="numeric"
                            value={pagoPoint}
                            onChangeText={setPagoPoint}
                        />
                        <TouchableOpacity style={styles.miniAction} onPress={handleChargePoint} disabled={isChargingPoint}>
                            {isChargingPoint ? <ActivityIndicator size="small" color="#009ee3" /> : <Feather name="credit-card" size={18} color="#009ee3" />}
                        </TouchableOpacity>
                    </View>

                    {/* TRANSFERENCIA */}
                    <View style={styles.inputContainer}>
                        <Feather name="repeat" size={20} color="#2563eb" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Transferencia Bancaria"
                            keyboardType="numeric"
                            value={pagoTransferencia}
                            onChangeText={setPagoTransferencia}
                        />
                    </View>

                    <TouchableOpacity 
                        style={[styles.confirmButton, isSaving && styles.confirmButtonDisabled]} 
                        onPress={handleRegisterPayment} 
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <ActivityIndicator color="#FFF" /> 
                        ) : (
                            <Text style={styles.confirmButtonText}>CONFIRMAR COBRO TOTAL</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            <LocationPermissionModal
                visible={showLocationExplainer}
                onConfirm={() => {
                    setShowLocationExplainer(false);
                    handleRegisterPayment();
                }}
                onCancel={() => setShowLocationExplainer(false)}
            />

            <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}>
                <View style={styles.qrOverlay}>
                    <View style={styles.qrCard}>
                        <Text style={styles.qrAmount}>${qrModalAmount.toLocaleString('es-AR')}</Text>
                        <Text style={styles.qrHint}>Mostrale esta pantalla al cliente para que la escanee</Text>
                        {qrImageUrl && (
                            <Image source={{ uri: qrImageUrl }} style={styles.qrImage} resizeMode="contain" />
                        )}
                        <TouchableOpacity style={styles.qrCloseButton} onPress={() => setQrModalVisible(false)}>
                            <Text style={styles.qrCloseButtonText}>CERRAR</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 10, paddingBottom: 15, paddingHorizontal: 20,
        backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
    },
    headerButton: { padding: 8, borderRadius: 12, backgroundColor: '#F1F5F9' },
    title: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    content: { paddingHorizontal: 20, paddingTop: 10, flex: 1 },
    saleInfo: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 15 },
    balanceCard: { 
        backgroundColor: '#FFF', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
        borderWidth: 1, borderColor: '#F1F5F9'
    },
    balanceLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    balanceAmount: { color: COLORS.danger, fontSize: 32, fontWeight: '900', marginTop: 5 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10, marginLeft: 5 },
    inputContainer: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, 
        borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, marginBottom: 12, height: 55
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16, fontWeight: '600', height: '100%' },
    miniAction: { padding: 10, backgroundColor: '#F0F9FF', borderRadius: 10 },
    confirmButton: { 
        backgroundColor: COLORS.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
        marginTop: 15, height: 60, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6
    },
    confirmButtonDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
    confirmButtonText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
    qrOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.9)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    qrCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center', width: '100%', maxWidth: 340 },
    qrAmount: { fontSize: 32, fontWeight: '900', color: COLORS.textPrimary },
    qrHint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 16 },
    qrImage: { width: 260, height: 260 },
    qrCloseButton: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 32, backgroundColor: '#F1F5F9', borderRadius: 12 },
    qrCloseButtonText: { fontWeight: '800', color: COLORS.textPrimary },
});

export default RegisterPaymentScreen;