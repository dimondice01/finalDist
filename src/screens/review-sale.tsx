// src/screens/ReviewSaleScreen.tsx
import { Feather } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { collection, doc, increment, runTransaction, Timestamp, writeBatch } from 'firebase/firestore';
// --- CORRECCIÓN: Imports añadidos/corregidos ---
import * as Haptics from 'expo-haptics';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message'; // <-- AÑADIDO

// --- Navegación ---
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator'; // Ajusta la ruta

// --- Contexto, DB, Servicios, Estilos ---
import { Sale as BaseSale, Client, CartItem as DataContextCartItem, useData, Vendor } from '../../context/DataContext'; // Ajusta la ruta
import { auth, db } from '../../db/firebase-service'; // Ajusta la ruta
// --- CORRECCIÓN: Importar generatePdf ---
import { generatePdf } from '../../services/pdfGenerator'; // Ajusta la ruta
import { COLORS } from '../../styles/theme'; // Ajusta la ruta

// --- Interfaces ---
interface CartItem extends DataContextCartItem {}
interface CartItemWithDiscount extends CartItem { discount: number; promoDescription: string | null; }

// Tipo de Props para la pantalla
type ReviewSaleScreenProps = NativeStackScreenProps<RootStackParamList, 'ReviewSale'>;

// --- Componente Memoizado para el Item del Carrito ---
interface ReviewItemCardProps {
    item: CartItemWithDiscount;
    isSaving: boolean;
    onUpdateQuantity: (productId: string, amount: number) => void;
}

const ReviewItemCard = memo(({ item, isSaving, onUpdateQuantity }: ReviewItemCardProps) => {
    if (!item || !item.id) return null;
    const handleIncrease = useCallback(() => onUpdateQuantity(item.id, 1), [item.id, onUpdateQuantity]);
    const handleDecrease = useCallback(() => onUpdateQuantity(item.id, -1), [item.id, onUpdateQuantity]);
    const displaySubtotal = (item.precio || 0) * item.quantity;
    
    return (
        <View style={styles.itemCard}>
            <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.nombre}</Text>
                <Text style={[styles.itemSubtotal, item.discount > 0 && styles.strikethrough]}>
                    ${displaySubtotal.toFixed(2)}
                </Text>
                {item.discount > 0 && <Text style={styles.promoText}>{item.promoDescription} (-${item.discount.toFixed(2)})</Text>}
            </View>
            <View style={styles.quantityControls}>
                <TouchableOpacity style={styles.quantityButton} onPress={handleDecrease} disabled={isSaving}><Feather name="minus" size={20} color={COLORS.backgroundEnd} /></TouchableOpacity>
                <Text style={styles.quantityText}>{`${item.quantity}`}</Text>
                <TouchableOpacity style={styles.quantityButton} onPress={handleIncrease} disabled={isSaving}><Feather name="plus" size={20} color={COLORS.backgroundEnd} /></TouchableOpacity>
            </View>
        </View>
    );
});
// --- FIN Componente Memoizado ---


const ReviewSaleScreen = ({ navigation, route }: ReviewSaleScreenProps) => {
    // --- Usar route.params ---
    const { clientId, clientName, cart: cartJsonString } = route.params;

    const { promotions = [], clients = [], vendors = [] } = useData();
    
    // --- Parsear el carrito ---
    const [cart, setCart] = useState<CartItem[]>(() => {
        try {
            return cartJsonString ? JSON.parse(cartJsonString) : [];
        } catch (e) {
            console.error("Error al parsear el carrito:", e);
            Alert.alert("Error", "No se pudo cargar el carrito.", [{ text: "OK", onPress: () => navigation.goBack() }]);
            return [];
        }
    });
    
    const [isSaving, setIsSaving] = useState(false);

    const clientData = useMemo(() => clients.find((c: Client) => c.id === clientId), [clients, clientId]);
    const currentUser = auth.currentUser;
    const currentVendorName = useMemo(() => {
        if (!currentUser || !vendors || vendors.length === 0) return 'Vendedor';
        const vendor = vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid);
        return vendor?.nombreCompleto || vendor?.nombre || 'Vendedor';
    }, [currentUser, vendors]);

    // --- cartWithDiscounts (CORREGIDO) ---
    const cartWithDiscounts = useMemo<{ items: CartItemWithDiscount[], totalDiscount: number }>(() => {
        if (!Array.isArray(promotions) || !Array.isArray(cart)) return { items: [], totalDiscount: 0 };
        
        const itemsWithDiscount = cart.map(item => {
            // --- CORRECCIÓN: Usar productoIds (plural) y .includes() ---
            const promo = promotions.find(p => p.productoIds?.includes(item.id));
            let itemDiscount = 0;
            let promoDescription: string | null = null;
            const basePrice = item.precio;

            if (promo) {
                // --- CORRECCIÓN: Asumir que 'condicion' y 'beneficio' existen (según DataContext.tsx) ---
                if (promo.tipo === 'LLEVA_X_PAGA_Y' && promo.condicion?.cantidadMinima && item.quantity >= promo.condicion.cantidadMinima) {
                    const numPromos = Math.floor(item.quantity / promo.condicion.cantidadMinima);
                    const unidadesGratis = numPromos * (promo.condicion.cantidadMinima - (promo.beneficio?.cantidadAPagar || promo.condicion.cantidadMinima));
                    itemDiscount = unidadesGratis * basePrice;
                    promoDescription = promo.descripcion || 'Promo X por Y';
                } else if (promo.tipo === 'DESCUENTO_POR_CANTIDAD' && promo.condicion?.cantidadMinima && item.quantity >= promo.condicion.cantidadMinima && promo.beneficio?.porcentajeDescuento) {
                    itemDiscount = (basePrice * item.quantity) * (promo.beneficio.porcentajeDescuento / 100);
                    promoDescription = promo.descripcion || 'Descuento por cantidad';
                }
            }
            return { ...item, discount: itemDiscount, promoDescription };
        });
        
        return { items: itemsWithDiscount, totalDiscount: itemsWithDiscount.reduce((sum, i) => sum + i.discount, 0) };
    }, [cart, promotions]);

    // Totales (Usando la lógica original)
    const cartTotal = useMemo(() => cart.reduce((total, item) => total + (item.precio || 0) * item.quantity, 0), [cart]);
    const finalTotal = cartTotal - cartWithDiscounts.totalDiscount;

    const totalComision = useMemo(() => {
        return cartWithDiscounts.items.reduce((total, item) => {
            const comisionPorcentaje = item.comision || 0;
            const subtotalItemFinal = (item.precio * item.quantity) - item.discount;
            return total + ((subtotalItemFinal * comisionPorcentaje) / 100);
        }, 0);
    }, [cartWithDiscounts.items]);

    // --- CORRECCIÓN: Asegurar que currentCart sea un array ---
    const handleUpdateQuantity = useCallback((productId: string, amount: number) => {
        setCart(currentCart =>
            (currentCart || []) 
                .map(item => item.id === productId ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item)
                .filter(item => item.quantity > 0)
        );
    }, []);

    // --- CORRECCIÓN: handleConfirmSale adaptado (sin FileSystem) ---
    const handleConfirmSale = useCallback(async () => {
        if (cart.length === 0 || !clientData) { Alert.alert("Faltan datos", "El carrito o los datos del cliente no están listos."); return; }
        const vendedorId = auth.currentUser?.uid; if (!vendedorId) { Alert.alert("Error", "No se pudo identificar al vendedor."); return; }
        
        setIsSaving(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        const netState = await NetInfo.fetch();

        const saleDataForDb = {
            clienteId: clientId as string, clientName: clientName as string, vendedorId,
            items: cartWithDiscounts.items.map(item => ({
                productId: item.id, nombre: item.nombre, precio: item.precio, costo: item.costo, quantity: item.quantity,
                descuentoAplicado: item.discount, promoDescription: item.promoDescription, comision: item.comision,
                ...( (item.precioOriginal && item.precioOriginal !== item.precio) && { precioOriginal: item.precioOriginal } )
            })),
            totalVentaBruto: cartTotal,
            totalDescuento: cartWithDiscounts.totalDiscount,
            totalVenta: finalTotal,
            totalCosto: cart.reduce((sum, item) => sum + (item.costo || 0) * item.quantity, 0),
            totalComision: totalComision,
            estado: 'Pendiente de Pago' as const,
            fecha: Timestamp.now(),
            saldoPendiente: finalTotal, 
            pagoEfectivo: 0, 
            pagoTransferencia: 0,
        };

        const newSaleRef = doc(collection(db, 'ventas'));
        try {
            // Lógica de Transacción/Batch (sin cambios)
            if (netState.isConnected) {
                await runTransaction(db, async (transaction) => { /* ... verificación stock y guardado ... */
                    const productRefs = cart.map(item => doc(db, 'productos', item.id));
                    const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
                    for (let i = 0; i < productDocs.length; i++) {
                        const productDoc = productDocs[i]; const item = cart[i];
                        if (!productDoc.exists()) { throw new Error(`El producto "${item.nombre}" ya no existe.`); }
                        const currentStock = productDoc.data().stock ?? 0;
                        if (currentStock < item.quantity) { throw new Error(`Stock insuficiente para "${item.nombre}". Disponible: ${currentStock}.`); }
                    }
                    transaction.set(newSaleRef, saleDataForDb);
                    cart.forEach((item, index) => { transaction.update(productRefs[index], { stock: increment(-item.quantity) }); });
                });
            } else { /* ... batch offline ... */
                const batch = writeBatch(db);
                batch.set(newSaleRef, saleDataForDb);
                for (const item of cart) { batch.update(doc(db, 'productos', item.id), { stock: increment(-item.quantity) }); }
                await batch.commit();
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Toast.show({ type: 'success', text1: 'Venta Registrada', position: 'bottom', visibilityTime: 2000 });

            // Preparar datos para PDF
            const pdfData: BaseSale = {
                ...saleDataForDb,
                id: newSaleRef.id,
                fecha: saleDataForDb.fecha.toDate(),
                // @ts-ignore
                cliente: clientData,
                distribuidora: { nombre: "Tu Distribuidora S.A.", direccion: "Calle Falsa 123, La Rioja", telefono: "380-4123456" }
            };

            // --- CORRECCIÓN: Lógica simple de PDF ---
            const html = await generatePdf(pdfData, clientData!, currentVendorName);
            if (!html) throw new Error("No se pudo generar el contenido del PDF.");
            
            const { uri } = await Print.printToFileAsync({ html }); // Solo obtenemos la URI
            // --- FIN CORRECCIÓN PDF ---

            const alertMessage = netState.isConnected ? "¿Compartir comprobante?" : "Venta guardada offline. ¿Compartir?";
            Alert.alert("Venta Registrada", alertMessage, [
                { text: 'Compartir', onPress: async () => {
                    try { 
                        await Sharing.shareAsync(uri); // Compartimos la URI directamente
                    } catch(shareError: any) { 
                        if (!(shareError.message?.includes('Sharing dismissed'))) { console.error(shareError); } 
                    } finally {
                        setIsSaving(false);
                        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                    }
                }},
                { text: 'Finalizar', onPress: () => {
                    setIsSaving(false);
                    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                }, style: 'cancel' }
            ], { cancelable: false });

        } catch (error: any) {
            console.error("Error al guardar la venta: ", error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Error", `No se pudo registrar la venta. ${error?.message || ''}`);
            setIsSaving(false);
        }
    }, [cart, clientData, cartWithDiscounts, cartTotal, finalTotal, totalComision, navigation, currentVendorName, currentUser]); // Dependencias

    // --- renderItem memoizado ---
    const renderCartItem = useCallback(({ item }: { item: CartItemWithDiscount }) => (
        <ReviewItemCard
            item={item}
            isSaving={isSaving}
            onUpdateQuantity={handleUpdateQuantity}
        />
    ), [isSaving, handleUpdateQuantity]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            {/* Header Adaptado */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} disabled={isSaving} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Revisar Venta</Text>
                 <View style={{ width: 44 }} />{/* Espaciador */}
            </View>
            <Text style={styles.clientInfo}>Cliente: <Text style={styles.clientName}>{clientName || clientData?.nombre}</Text></Text>

            {/* FlatList Optimizada */}
            <FlatList
                data={cartWithDiscounts.items}
                keyExtractor={(item) => item.id}
                renderItem={renderCartItem}
                contentContainerStyle={styles.listContentContainer}
                ListHeaderComponent={<Text style={styles.listHeader}>Resumen del Carrito</Text>}
                ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyText}>El carrito está vacío.</Text></View>}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={11}
            />
            
            {/* Resumen (con totales corregidos) */}
            <View style={styles.summaryContainer}>
                {cartWithDiscounts.totalDiscount > 0 && (
                    <View style={styles.totalRow}>
                        <Text style={styles.originalTotalText}>Subtotal (c/dto. precio):</Text>
                        <Text style={styles.originalTotalAmount}>${cartTotal.toFixed(2)}</Text>
                    </View>
                )}
                {cartWithDiscounts.totalDiscount > 0 && (
                    <View style={styles.totalRow}>
                        <Text style={styles.discountText}>Descuentos (Cantidad/Promo):</Text>
                        <Text style={styles.discountAmount}>-${cartWithDiscounts.totalDiscount.toFixed(2)}</Text>
                    </View>
                )}
                <View style={styles.totalRow}>
                    <Text style={styles.totalText}>Total Final:</Text>
                    <Text style={styles.totalAmount}>${finalTotal.toFixed(2)}</Text>
                </View>
                <TouchableOpacity style={[styles.confirmButton, isSaving && styles.confirmButtonDisabled]} onPress={handleConfirmSale} disabled={isSaving}>
                    {isSaving ? <ActivityIndicator color={COLORS.primaryDark} /> : (<><Feather name="check-circle" size={22} color={COLORS.primaryDark} /><Text style={styles.confirmButtonText}>Confirmar Venta</Text></>)}
                </TouchableOpacity>
            </View>
        </View>
    );
};

// --- Estilos (Ajustados) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: (StatusBar.currentHeight || 0) + 20, paddingBottom: 10, paddingHorizontal: 20, position: 'relative' },
    backButton: { position: 'absolute', left: 15, top: (StatusBar.currentHeight || 0) + 20, padding: 10, zIndex: 1 },
    title: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary },
    clientInfo: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 15 },
    clientName: { fontWeight: 'bold', color: COLORS.textPrimary },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 220 },
    listHeader: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 15 },
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: COLORS.textSecondary, fontSize: 16 },
    itemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.glass, padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
    itemInfo: { flex: 1, marginRight: 10 },
    itemName: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
    itemSubtotal: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
    strikethrough: { textDecorationLine: 'line-through' },
    promoText: { color: COLORS.success, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
    finalPriceText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500', marginTop: 4 },
    quantityControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryDark, borderRadius: 20 },
    quantityButton: { padding: 8 },
    quantityText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, marginHorizontal: 12 },
    summaryContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(24, 24, 27, 0.98)', padding: 20, borderTopWidth: 1, borderColor: COLORS.glassBorder, paddingBottom: Platform.OS === 'ios' ? 40 : 30 },
    originalTotalText: { color: COLORS.textSecondary, fontSize: 14 },
    originalTotalAmount: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '500' },
    discountText: { color: COLORS.success, fontSize: 16 },
    discountAmount: { color: COLORS.success, fontSize: 18, fontWeight: 'bold' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    totalText: { color: '#E5E7EB', fontSize: 18, fontWeight: 'bold' },
    totalAmount: { color: COLORS.primary, fontSize: 24, fontWeight: 'bold' },
    confirmButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 15, gap: 10, marginTop: 10 },
    confirmButtonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold' },
    confirmButtonDisabled: { backgroundColor: COLORS.disabled },
});

export default ReviewSaleScreen;