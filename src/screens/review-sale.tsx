// src/screens/ReviewSaleScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// --- INICIO DE CAMBIOS: Imports ---
// Quitamos collection, doc, increment, runTransaction, Timestamp, writeBatch
// Mantenemos solo lo necesario para la lógica actual (si la hay)
// --- FIN DE CAMBIOS: Imports ---
// --- CORRECCIÓN: Imports añadidos/corregidos ---
import * as Haptics from 'expo-haptics';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message'; // <-- AÑADIDO

// --- Navegación --
// --- INICIO DE CAMBIOS: Props de Navegación ---
// Importamos el tipo correcto que definimos en AppNavigator
import { ReviewSaleScreenProps } from '../navigation/AppNavigator'; // Ajusta la ruta
// --- FIN DE CAMBIOS: Props de Navegación ---

// --- Contexto, DB, Servicios, Estilos ---
// --- INICIO DE CAMBIOS: Imports Context ---
// Importamos Client y CartItem si no están ya
import { Sale as BaseSale, Client, CartItem as DataContextCartItem, useData, Vendor } from '../../context/DataContext'; // Ajusta la ruta
// Traemos la función de crearVenta (si la necesitamos aquí)
// import { crearVentaConStock } from '../../context/DataContext'; // Ajusta la ruta
// --- FIN DE CAMBIOS: Imports Context ---
import { auth } from '../../db/firebase-service'; // Ajusta la ruta
// --- CORRECCIÓN: Importar generatePdf ---
import { generatePdf } from '../../services/pdfGenerator'; // Ajusta la ruta
import { COLORS } from '../../styles/theme'; // Ajusta la ruta

// --- Interfaces ---
// (Mantenemos tu interfaz CartItem local si es diferente a la del DataContext)
interface CartItem {
    id: string;
    nombre: string;
    precio: number;
    quantity: number;
    precioOriginal?: number; // Precio sin promociones
    descuentoAplicado?: number; // Monto del descuento por promoción
}

interface Sale {
    id: string;
    clienteId: string;
    clientName: string;
    vendedorId: string;
    vendedorName: string;
    items: CartItem[];
    totalVenta: number;
    totalCosto?: number; // Opcional, si lo calculas
    totalComision?: number; // Opcional
    estado: string;
    saldoPendiente?: number;
    fecha?: any; // Timestamp o Date
    observaciones?: string;
    totalDescuentoPromociones?: number;
}

// --- Componente Memoizado para el Ítem del Carrito ---
const ReviewItemCard = memo(({ item }: { item: DataContextCartItem }) => (
    <View style={styles.card}>
        <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.nombre}</Text>
            {item.precioOriginal && item.precioOriginal > item.precio && (
                <Text style={styles.originalPrice}>${item.precioOriginal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
            )}
            <Text style={styles.cardPrice}>
                {item.quantity} x ${item.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </Text>
        </View>
        <Text style={styles.cardTotal}>
            ${(item.precio * item.quantity).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </Text>
    </View>
));

// --- Pantalla Principal: ReviewSaleScreen ---
// --- INICIO DE CAMBIOS: Props ---
const ReviewSaleScreen = ({ route, navigation }: ReviewSaleScreenProps) => { // Usamos el tipo correcto
// --- FIN DE CAMBIOS: Props ---

    // --- INICIO DE CAMBIOS: Obtener Parámetros ---
    // Obtenemos 'cliente' (objeto) y 'cart' (array) directamente
    const { cliente, cart, isReposicion, totalVenta, totalCosto, totalComision, totalDescuento } = route.params;
    // Ya no necesitamos parsear 'cartJsonString'
    // --- FIN DE CAMBIOS: Obtener Parámetros ---

    const { vendors, refreshAllData, crearVentaConStock } = useData(); // Obtenemos la función de DataContext
    const [isSubmitting, setIsSubmitting] = useState(false);
    const currentUser = auth.currentUser;

    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    // --- Lógica de cálculo (permanece igual, ahora usa 'cart' directamente) ---
    const { subtotal, totalDescuentoCalculado, totalFinalCalculado } = useMemo(() => {
        let sub = 0;
        let desc = 0;
        cart.forEach(item => {
            const itemSubtotal = (item.precioOriginal ?? item.precio) * item.quantity;
            sub += itemSubtotal;
            if (item.precioOriginal && item.precioOriginal > item.precio) {
                desc += (item.precioOriginal - item.precio) * item.quantity;
            }
            // Añadir lógica para descuentos por cantidad si es necesario
        });
        // Usamos el 'totalDescuento' pasado por parámetro si es mayor que el calculado solo por precio_especial
        const finalDiscount = Math.max(desc, totalDescuento || 0);
        return {
            subtotal: sub,
            totalDescuentoCalculado: finalDiscount,
            totalFinalCalculado: sub - finalDiscount
        };
    }, [cart, totalDescuento]);

    // --- handleShare (sin cambios lógicos, usa 'cliente') ---
    const handleShare = useCallback(async (saleDataForPdf: BaseSale, clientData: Client, vendorName: string) => {
        // ... (lógica existente sin cambios)
        try {
            const htmlContent = await generatePdf(saleDataForPdf, clientData, vendorName);
            // ... (resto de la lógica de share)
        } catch (shareError: any) {
           console.error("handleShare Error:", shareError);
           // ... (manejo de errores)
        }
    }, []); // Dependencias omitidas para brevedad

    // --- handleConfirm (MODIFICADO para usar crearVentaConStock) ---
    const handleConfirm = useCallback(async () => {
        if (isSubmitting || !cliente || !currentVendedor) return;

        setIsSubmitting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Preparamos los datos para la función del DataContext
        const saleDataToSave = {
            clienteId: cliente.id, // <-- Usamos cliente.id
            clientName: cliente.nombre, // <-- Usamos cliente.nombre
            vendedorId: currentVendedor.id,
            vendedorName: currentVendedor.nombreCompleto || currentVendedor.nombre,
            items: cart, // Pasamos el array directamente
            totalVenta: totalFinalCalculado, // Usamos el total calculado aquí
            totalCosto: totalCosto, // Pasado por params
            totalComision: totalComision, // Pasado por params
            estado: 'Pendiente de Entrega',
            saldoPendiente: isReposicion ? 0 : totalFinalCalculado, // Saldo 0 si es reposición
            totalDescuentoPromociones: totalDescuentoCalculado,
            observaciones: '', // Puedes añadir un campo si lo necesitas
            tipo: isReposicion ? 'reposicion' : 'venta', // Establecemos el tipo
            // 'fecha' será añadida por crearVentaConStock
        };

        try {
            // --- LLAMAMOS A LA FUNCIÓN DEL DATACONTEXT ---
            const savedSaleId = await crearVentaConStock(saleDataToSave);

            Toast.show({ type: 'success', text1: isReposicion ? 'Reposición Creada' : 'Venta Creada', text2: 'Stock descontado.', position: 'bottom' });

            // --- Lógica de Compartir (sin cambios) ---
            const completeSaleDataForPdf: BaseSale = {
                ...saleDataToSave,
                id: savedSaleId,
                fecha: new Date(), // Usamos fecha actual para el PDF
                items: cart, // Pasamos el carrito original para el PDF
                estado: saleDataToSave.estado as 'Pendiente de Entrega', 
                tipo: saleDataToSave.tipo as 'venta' | 'reposicion',
                // --- FIN DE CORRECCIÓN ---
            };
            const vendorName = currentVendedor.nombreCompleto || currentVendedor.nombre;

            Alert.alert(
                isReposicion ? "Reposición Guardada" : "Venta Guardada",
                "¿Desea generar y compartir el comprobante ahora?",
                [
                    { text: "No, Volver", onPress: () => { navigation.popToTop(); }, style: "cancel" }, // Volver al inicio
                    { text: "Sí, Compartir", onPress: async () => {
                        try {
                            await handleShare(completeSaleDataForPdf, cliente, vendorName);
                        } finally {
                            navigation.popToTop(); // Volver al inicio después de compartir
                        }
                    } }
                ],
                { cancelable: false }
            );

        } catch (error: any) {
            console.error("Error al confirmar venta/reposición:", error);
            const errorMessage = error.message.includes("Stock insuficiente")
                ? error.message
                : `No se pudo guardar: ${error.message || 'Error desconocido'}`;
            Toast.show({ type: 'error', text1: 'Error al Guardar', text2: errorMessage, position: 'bottom' });
            setIsSubmitting(false); // Desbloquear botón
        } finally {
             // No ponemos setIsSubmitting(false) aquí porque esperamos la acción del Alert
        }
    }, [
        isSubmitting, cliente, currentVendedor, cart, totalFinalCalculado, totalCosto,
        totalComision, totalDescuentoCalculado, isReposicion, crearVentaConStock,
        navigation, handleShare
    ]);

    // --- Renderizado (sin cambios lógicos, usa 'cliente' y 'cart') ---
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>{isReposicion ? 'Revisar Reposición' : 'Revisar Venta'}</Text>
                <View style={styles.headerButton} /> {/* Placeholder for balance */}
            </View>

            {/* --- INICIO CAMBIO: Usar cliente.nombre --- */}
            <Text style={styles.clientName}>Cliente: {cliente?.nombre || 'Desconocido'}</Text>
            {/* --- FIN CAMBIO: Usar cliente.nombre --- */}

            <FlatList
                data={cart} // <-- Usa el array 'cart' directamente
                renderItem={({ item }) => <ReviewItemCard item={item} />}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>El carrito está vacío.</Text>}
            />

            <View style={styles.summaryContainer}>
                {/* Mostramos subtotales y descuentos */}
                <View style={styles.totalRow}>
                    <Text style={styles.originalTotalText}>Subtotal (sin descuentos)</Text>
                    <Text style={styles.originalTotalAmount}>${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                </View>
                {totalDescuentoCalculado > 0 && (
                     <View style={styles.totalRow}>
                        <Text style={styles.discountText}>Descuentos Aplicados</Text>
                        <Text style={styles.discountAmount}>-${totalDescuentoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                    </View>
                )}
                 <View style={[styles.totalRow, { borderTopWidth: 1, borderColor: COLORS.glassBorder, paddingTop: 10, marginTop: 5 }]}>
                    <Text style={styles.totalText}>Total Final</Text>
                    {/* --- INICIO CAMBIO: Total para Reposición --- */}
                    <Text style={styles.totalAmount}>${isReposicion ? '0.00' : totalFinalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                    {/* --- FIN CAMBIO: Total para Reposición --- */}
                </View>

                <TouchableOpacity
                    style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]}
                    onPress={handleConfirm}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color={COLORS.primaryDark} />
                    ) : (
                        <Feather name="check-circle" size={22} color={COLORS.primaryDark} />
                    )}
                    <Text style={styles.confirmButtonText}>
                        {isSubmitting ? 'Procesando...' : (isReposicion ? 'Confirmar Reposición' : 'Confirmar Venta')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

// --- Estilos (sin cambios) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: (StatusBar.currentHeight || 0) + 10, paddingBottom: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
    headerButton: { padding: 10, width: 44 }, // Width ensures title stays centered
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    clientName: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 10, fontWeight: '500' },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 220 }, // Increased paddingBottom
    emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 50, fontSize: 16 },
    card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.glass, padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
    cardInfo: { flex: 1, marginRight: 10 },
    cardTitle: { fontSize: 16, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 3 },
    originalPrice: { fontSize: 13, color: COLORS.textSecondary, textDecorationLine: 'line-through' },
    cardPrice: { fontSize: 14, color: COLORS.textSecondary },
    cardTotal: { fontSize: 17, fontWeight: 'bold', color: COLORS.primary },
    // --- ESTILOS ANTIGUOS (Removidos/Comentados si no se usan) ---
    // itemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
    // itemName: { fontSize: 16, color: COLORS.textPrimary, flex: 1 },
    // itemDetails: { flexDirection: 'row', alignItems: 'center' },
    // itemQuantity: { fontSize: 15, color: COLORS.textSecondary, marginRight: 10 },
    // itemPrice: { fontSize: 16, fontWeight: '500', color: COLORS.textPrimary },
    // quantityControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryDark, borderRadius: 20 },
    // quantityButton: { padding: 8 },
    // quantityText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, marginHorizontal: 12 },
    // --- FIN ESTILOS ANTIGUOS ---
    summaryContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(24, 24, 27, 0.98)', padding: 20, borderTopWidth: 1, borderColor: COLORS.glassBorder, paddingBottom: Platform.OS === 'ios' ? 40 : 30 },
    originalTotalText: { color: COLORS.textSecondary, fontSize: 14 },
    originalTotalAmount: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '500' },
    discountText: { color: COLORS.success, fontSize: 16 }, // Verde para descuento
    discountAmount: { color: COLORS.success, fontSize: 18, fontWeight: 'bold' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    totalText: { color: '#E5E7EB', fontSize: 18, fontWeight: 'bold' }, // Texto casi blanco
    totalAmount: { color: COLORS.primary, fontSize: 24, fontWeight: 'bold' },
    confirmButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 15, gap: 10, marginTop: 10 },
    confirmButtonDisabled: { backgroundColor: COLORS.disabled },
    confirmButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 18 },
});

export default ReviewSaleScreen;