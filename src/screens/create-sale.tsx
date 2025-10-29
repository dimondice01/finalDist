// src/screens/CreateSaleScreen.tsx
import { Feather } from '@expo/vector-icons';
// ELIMINAMOS: import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print'; // Necesario para generar el archivo PDF local
import * as Sharing from 'expo-sharing';
// --- INICIO DE CAMBIOS: Importaciones ---
// Quitamos addDoc y collection. Dejamos serverTimestamp y updateDoc para EDITAR
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
// --- FIN DE CAMBIOS: Importaciones ---
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native'; // Usamos useRoute para obtener params
import { CreateSaleScreenProps } from '../navigation/AppNavigator'; // Importa el tipo de props

// --- Contexto, DB, Servicios, Estilos ---
import {
    Sale as BaseSale,
    CartItem,
    Category,
    Client,
    Product,
    Promotion,
    useData, // <-- ¡Importante!
    Vendor
} from '../../context/DataContext'; // Ajusta la ruta si es necesario
import { auth, db } from '../../db/firebase-service'; // Ajusta la ruta si es necesario
import { generatePdf } from '../../services/pdfGenerator'; // Asumimos que retorna el HTML string
import { COLORS } from '../../styles/theme'; // Ajusta la ruta si es necesario


// Interface para la venta que guardaremos (con campos de BD correctos)
interface SaleDataToSave {
    clienteId: string;
    clientName: string;
    vendedorId: string;
    vendedorName: string;
    items: CartItem[];
    totalVenta: number;
    totalCosto: number;
    totalComision: number;
    estado: BaseSale['estado'];
    saldoPendiente: number;
    fecha?: any;
    fechaUltimaEdicion?: any;
    totalDescuentoPromociones: number;
    observaciones: string; // Ya corregido para ser obligatorio
    // --- INICIO DE CAMBIOS: Interfaz ---
    tipo: 'venta' | 'reposicion'; // <-- AÑADIDO
    // --- FIN DE CAMBIOS: Interfaz ---
}

// --- Componente Modal Selector de Categoría (REEMPLAZO DEL PICKER) ---
const CategorySelectorModal = memo(({ visible, onClose, categories, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    categories: Category[];
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    // Data incluye "Todas las Categorías"
    const dataWithAllOption: Category[] = useMemo(() => [
        { id: '', nombre: 'Todas las Categorías' } as Category,
        ...categories
    ], [categories]);

    const renderItem = useCallback(({ item }: { item: Category }) => (
        <TouchableOpacity
            style={styles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[styles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={styles.modalHeader}>
                         <Text style={styles.modalTitle}>Filtrar por Categoría</Text>
                    </View>
                    <FlatList
                        data={dataWithAllOption}
                        keyExtractor={(item) => item.id || 'all'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={styles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: 20 }}
                    />
                    <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                        <Text style={styles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});
// --- FIN Componente Modal Selector de Categoría ---


// --- Componente Memoizado para el Item de Producto ---
const ProductCard = memo(({ item, cart, promotions, clientId, handleAddProduct }: {
    item: Product,
    cart: CartItem[],
    promotions: Promotion[],
    clientId: string | string[] | undefined,
    handleAddProduct: (product: Product) => void
}) => {
    if (!item || !item.id) return null;

    const itemInCart = useMemo(() => cart.find(cartItem => cartItem.id === item.id), [cart, item.id]);
    const quantityInCart = itemInCart?.quantity || 0;

    const { displayPrice, originalPrice } = useMemo(() => {
        let price = item.precio;
        let original = item.precio;
        const promoAplicable: Promotion | undefined = promotions.find(promo =>
            promo.tipo === 'precio_especial' &&
            promo.productoIds.includes(item.id) &&
            (!promo.clienteIds || promo.clienteIds.length === 0 || (clientId && promo.clienteIds.includes(clientId as string)))
        );
        if (promoAplicable && promoAplicable.nuevoPrecio) {
            price = promoAplicable.nuevoPrecio;
            original = item.precio;
        }
        return { displayPrice: price, originalPrice: original };
    }, [item, promotions, clientId]);

    const handlePress = useCallback(() => {
        handleAddProduct(item);
    }, [handleAddProduct, item]);

    // --- MEJORA VISUAL (1/3): Determinar stock y color ---
    const stock = item.stock ?? 0; // Usamos 0 si el stock es undefined
    const lowStock = stock < 10;
    // --- FIN MEJORA VISUAL (1/3) ---

    return (
        <TouchableOpacity
            style={[styles.card, quantityInCart > 0 && styles.cardSelected]}
            onPress={handlePress}
            activeOpacity={0.8}
        >
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre}</Text>

                {/* Precios */}
                {displayPrice !== originalPrice ? (
                    <View style={styles.priceContainer}>
                        <Text style={styles.cardPrice}>${displayPrice.toLocaleString('es-AR')}</Text>
                        <Text style={styles.cardOriginalPrice}>${originalPrice.toLocaleString('es-AR')}</Text>
                    </View>
                ) : (
                    <Text style={styles.cardPrice}>${item.precio.toLocaleString('es-AR')}</Text>
                )}

                {/* --- MEJORA VISUAL (2/3): Mostrar Stock --- */}
                <Text style={[styles.stockText, lowStock && styles.stockTextLow]}>
                    Stock: {stock}
                </Text>
                {/* --- FIN MEJORA VISUAL (2/3) --- */}

            </View>

            {quantityInCart > 0 ? (
                <View style={styles.inCartControls}>
                    <View style={styles.quantityBadge}>
                        <Text style={styles.quantityBadgeText}>{quantityInCart}</Text>
                    </View>
                    <Feather name="edit" size={22} color={COLORS.primary} style={styles.editIcon} />
                </View>
            ) : (
                <View style={styles.addButton}>
                    <Feather name="plus" size={20} color={COLORS.primaryDark} />
                </View>
            )}
        </TouchableOpacity>
    );
});
// --- FIN Componente Memoizado ---


const CreateSaleScreen = ({ navigation }: CreateSaleScreenProps) => {
    // --- Obtener parámetros de useRoute ---
    const route = useRoute();
    // --- INICIO DE CAMBIOS: Parámetros de Ruta ---
    // Añadimos 'isReposicion' y 'cliente' (como 'initialCliente')
    const { clientId, saleId, isEditing, isReposicion = false, cliente: initialCliente } = route.params as {
        clientId?: string,
        saleId?: string,
        isEditing?: string,
        isReposicion?: boolean,
        cliente?: Client
    };
    // --- FIN DE CAMBIOS: Parámetros de Ruta ---

    const editMode = isEditing === 'true';

    const {
        products: allProducts,
        categories,
        vendors,
        clients,
        sales,
        promotions,
        isLoading: isDataLoading,
        refreshAllData,
        // --- INICIO DE CAMBIOS: Obtener función de Contexto ---
        crearVentaConStock // <-- OBTENEMOS LA NUEVA FUNCIÓN
        // --- FIN DE CAMBIOS: Obtener función de Contexto ---
    } = useData();

    const [cart, setCart] = useState<CartItem[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [modalVisible, setModalVisible] = useState(false);
    const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false); // Nuevo: Modal de categoría
    const [selectedProduct, setSelectedProduct] = useState<Product & { precioOriginal?: number } | null>(null);
    const [currentQuantity, setCurrentQuantity] = useState('1');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [originalSale, setOriginalSale] = useState<BaseSale | null>(null);

    const currentUser = auth.currentUser;

    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    // --- INICIO DE CAMBIOS: Memo del Cliente ---
    const client = useMemo(() => {
        if (initialCliente) return initialCliente; // Damos prioridad al objeto 'cliente'
        if (!clientId || !clients) return null;
        return clients.find((c: Client) => c.id === clientId);
    }, [clientId, clients, initialCliente]);
    // --- FIN DE CAMBIOS: Memo del Cliente ---

    // Obtener nombre de la categoría seleccionada para el botón
    const selectedCategoryName = useMemo(() => {
        if (!categoryFilter) return 'Todas las Categorías';
        const selectedCategory = categories.find(c => c.id === categoryFilter);
        return selectedCategory ? selectedCategory.nombre : 'Todas las Categorías';
    }, [categoryFilter, categories]);

    useEffect(() => {
        if (editMode && saleId && sales.length > 0) {
            const saleToEdit = sales.find((s: BaseSale) => s.id === saleId);
            if (saleToEdit) {
                setOriginalSale(saleToEdit);
                const cartItems = (saleToEdit.items || []).map((item: CartItem) => ({
                    ...item,
                    precioOriginal: item.precioOriginal ?? item.precio
                }));
                setCart(cartItems);
            } else {
                Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontró la venta para editar.', position: 'bottom' });
                navigation.goBack();
            }
        }
    }, [editMode, saleId, sales, navigation]);

    // --- MEJORA VISUAL (3/3): useEffect de filtrado y orden ---
    useEffect(() => {
        let products = allProducts;
        if (categoryFilter) {
            products = products.filter(p => p.categoriaId === categoryFilter);
        }
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            products = products.filter(p => p.nombre.toLowerCase().includes(lowerQuery));
        }

        // Lógica de ordenamiento mejorada
        products.sort((a, b) => {
            // Solo en modo edición, priorizar los que están en el carrito
            if (editMode) {
                const aInCart = cart.some(cartItem => cartItem.id === a.id);
                const bInCart = cart.some(cartItem => cartItem.id === b.id);

                if (aInCart && !bInCart) return -1; // 'a' (en carrito) va primero
                if (!aInCart && bInCart) return 1;  // 'b' (en carrito) va primero
            }

            // Si ambos están (o no están) en el carrito, ordenar alfabéticamente
            return (a.nombre || '').localeCompare(b.nombre || '');
        });

        setFilteredProducts(products);
    }, [allProducts, categoryFilter, searchQuery, cart, editMode]); // Añadimos cart y editMode a las dependencias
    // --- FIN MEJORA VISUAL (3/3) ---

    const getComision = useCallback((product: Product, quantity: number): number => {
        const comisionGeneral = currentVendedor?.comisionGeneral || 0;
        const precio = product.precio || 0;
        const costo = product.costo || 0;
        let comisionPorItem = 0;
        if (product.comisionEspecifica && product.comisionEspecifica > 0) {
            comisionPorItem = product.comisionEspecifica;
        } else if (costo > 0 && precio > 0) {
            const ganancia = precio - costo;
            comisionPorItem = ganancia * (comisionGeneral / 100);
        } else if (precio > 0) {
            comisionPorItem = precio * (comisionGeneral / 100);
        }
        return comisionPorItem * quantity;
    }, [currentVendedor]);

     const handleAddProduct = useCallback((product: Product) => {
        const existingItem = cart.find(item => item.id === product.id);
        let precioFinal = product.precio;
        let precioOriginal = product.precio;
        const promoAplicable: Promotion | undefined = promotions.find(promo =>
            promo.tipo === 'precio_especial' &&
            promo.productoIds.includes(product.id) &&
            (!promo.clienteIds || promo.clienteIds.length === 0 || (clientId && promo.clienteIds.includes(clientId as string)))
        );
        if (promoAplicable && promoAplicable.nuevoPrecio) {
            precioFinal = promoAplicable.nuevoPrecio;
            precioOriginal = product.precio; // Usar product.precio para precioOriginal
        }
        const productToAdd = { ...product, precio: precioFinal, precioOriginal: precioOriginal };
        setSelectedProduct(productToAdd);
        setCurrentQuantity(existingItem ? existingItem.quantity.toString() : '1');
        setModalVisible(true);
    }, [cart, promotions, clientId]);

    const handleConfirmQuantity = useCallback(() => {
        const quantity = parseInt(currentQuantity, 10);
        if (isNaN(quantity) || quantity <= 0) { Alert.alert("Cantidad Inválida", "Por favor ingrese un número mayor a 0."); return; }
        if (!selectedProduct) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const comision = getComision(selectedProduct, quantity);
        const cartItemToAdd: CartItem = { ...selectedProduct, precio: selectedProduct.precio, precioOriginal: selectedProduct.precioOriginal ?? selectedProduct.precio, quantity, comision };
        setCart(prevCart => {
            const existingItemIndex = prevCart.findIndex(item => item.id === selectedProduct.id);
            if (existingItemIndex > -1) { return prevCart.map((item, index) => index === existingItemIndex ? cartItemToAdd : item ); }
            else { return [...prevCart, cartItemToAdd]; }
        });
        setModalVisible(false);
        setSelectedProduct(null);
        setCurrentQuantity('1');
    }, [currentQuantity, selectedProduct, getComision]);

    const handleRemoveFromCart = useCallback(() => {
        if (!selectedProduct) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCart(prevCart => prevCart.filter(item => item.id !== selectedProduct!.id));
        setModalVisible(false);
        setSelectedProduct(null);
        setCurrentQuantity('1');
    }, [selectedProduct]);

    // --- BLOQUE USEMEMO (Sin cambios, ya estaba correcto) ---
    const { subtotal, totalComision, totalCosto, totalFinal, totalDescuentoPromociones, itemsConDescuentosAplicados } = useMemo(() => {
         let sub: number = 0;
         let comision: number = 0;
         let costo: number = 0;
         let descuentoPrecioEspecial: number = 0;
         let descuentoPorCantidadTotal: number = 0;
         const itemsModificados: (CartItem & { descuentoPorCantidadAplicado?: number })[] = [];

         cart.forEach(item => {
             const subtotalItemBase = item.precio * item.quantity;
             sub += subtotalItemBase;
             comision += item.comision;
             costo += (item.costo || 0) * item.quantity;

             if (item.precioOriginal && item.precioOriginal > item.precio) {
                 descuentoPrecioEspecial += (item.precioOriginal - item.precio) * item.quantity;
             }

             const quantity = item.quantity;
             const itemPrice = item.precio;
             let descuentoPorCantidadItem: number = 0;

             const quantityPromosForProduct = promotions.filter(promo => {
                 const isQuantityPromo = promo.tipo === 'LLEVA_X_PAGA_Y' || promo.tipo === 'DESCUENTO_POR_CANTIDAD';
                 const isProductInPromo = promo.productoIds?.includes(item.id);
                 const isClientApplicable = !promo.clienteIds || promo.clienteIds.length === 0 || (clientId && promo.clienteIds.includes(clientId as string));
                 const hasCondition = promo.condicion?.cantidadMinima && promo.condicion.cantidadMinima > 0;
                 return isQuantityPromo && isProductInPromo && isClientApplicable && hasCondition;
             });

             if (quantityPromosForProduct.length > 0) {
                 const promo = quantityPromosForProduct[0];

                 if (promo.tipo === 'LLEVA_X_PAGA_Y' && quantity >= promo.condicion.cantidadMinima) {
                     const X = promo.condicion.cantidadMinima;
                     const Y = promo.beneficio.cantidadAPagar;
                     const itemsGratisPorLote = X - Y;

                     if (X > 0 && Y > 0 && itemsGratisPorLote > 0) {
                         const numLotes = Math.floor(quantity / X);
                         const itemsGratisTotales = numLotes * itemsGratisPorLote;
                         descuentoPorCantidadItem = itemsGratisTotales * itemPrice;
                     }
                 } else if (promo.tipo === 'DESCUENTO_POR_CANTIDAD' && quantity >= promo.condicion.cantidadMinima) {
                     const porcentaje = promo.beneficio.porcentajeDescuento;

                     if (porcentaje > 0 && porcentaje <= 100) {
                         const subtotalItem = itemPrice * quantity;
                         const descuentoCalculado = subtotalItem * (porcentaje / 100);
                         descuentoPorCantidadItem = descuentoCalculado;
                     }
                 }
             }

             descuentoPorCantidadTotal += descuentoPorCantidadItem;

             itemsModificados.push({
                 ...item,
                 precioOriginal: item.precioOriginal ?? item.precio,
                 descuentoPorCantidadAplicado: descuentoPorCantidadItem
             });
         });

         const totalDescuentoTotal = descuentoPrecioEspecial + descuentoPorCantidadTotal;

         return {
             subtotal: sub,
             totalComision: comision,
             totalCosto: costo,
             totalFinal: sub - descuentoPorCantidadTotal,
             totalDescuentoPromociones: totalDescuentoTotal,
             itemsConDescuentosAplicados: itemsModificados
         };
    }, [cart, promotions, clientId]);
    // --- FIN DEL BLOQUE USEMEMO ---

    // --- handleShare (Sin cambios) ---
    const handleShare = useCallback(async (saleDataForPdf: BaseSale, clientData: Client, vendorName: string) => {
        if (!clientData) {
           Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontraron datos del cliente.' });
           return;
        }

        try {
            const htmlContent = await generatePdf(saleDataForPdf, clientData, vendorName);
            if (!htmlContent) { throw new Error("generatePdf devolvió null o vacío."); }

            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            if (!uri) { throw new Error("printToFileAsync no devolvió URI."); }

            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) { throw new Error("La función de compartir no está disponible."); }

            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Compartir Comprobante ${saleDataForPdf.id}`,
            });

        } catch (shareError: any) {
           console.error("handleShare: Error con expo-sharing/print:", shareError);
           if (!(shareError.message?.includes('Sharing dismissed') || shareError.message?.includes('cancelled'))) {
              Alert.alert("Error al Compartir", `Detalle: ${shareError.message || 'Error desconocido'}`);
           }
        }
    }, [refreshAllData]);
    // --- FIN DE handleShare ---


    // --- INICIO DE CAMBIOS: confirmarVenta (antes handleCheckout) ---
    // 1. RENOMBRAMOS 'handleCheckout' a 'confirmarVenta'
    const confirmarVenta = useCallback(async () => {
        if (isSubmitting) return;
        if (!client || !currentVendedor) { Alert.alert("Error", "Faltan datos del cliente o vendedor."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue al menos un producto."); return; }

        setIsSubmitting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Preparamos los datos
        const saleDataToSave: Omit<SaleDataToSave, 'fecha'> = { // Omitimos 'fecha' ya que la maneja el contexto
            clienteId: client.id,
            clientName: client.nombre,
            vendedorId: currentVendedor.id,
            vendedorName: currentVendedor.nombreCompleto || currentVendedor.nombre,
            items: cart.map((item: CartItem) => {
                const { precioOriginal, ...restOfItem } = item;
                return { ...restOfItem, ...(precioOriginal !== undefined && precioOriginal !== item.precio && { precioOriginal }) };
            }),
            totalVenta: totalFinal,
            totalCosto: totalCosto,
            totalComision: totalComision,
            estado: 'Pendiente de Entrega', // Ya estaba correcto
            saldoPendiente: totalFinal,
            totalDescuentoPromociones: totalDescuentoPromociones,
            observaciones: originalSale?.observaciones || '',
            tipo: 'venta', // <-- AÑADIDO TIPO POR DEFECTO
            ...(editMode ? { fechaUltimaEdicion: serverTimestamp() } : {})
        };

        try {
            let savedSaleId = originalSale ? originalSale.id : '';

            if (editMode && originalSale) {
                // Lógica de EDICIÓN (no toca stock por ahora)
                const saleRef = doc(db, 'ventas', originalSale.id);
                await updateDoc(saleRef, saleDataToSave as any);
                Toast.show({ type: 'success', text1: 'Venta Actualizada', position: 'bottom', visibilityTime: 2000 });

            } else {
                // --- LÓGICA DE NUEVA VENTA (MODIFICADA) ---
                // Preparamos datos finales con el tipo
                const finalSaleData = {
                    ...saleDataToSave,
                    tipo: 'venta' as 'venta' | 'reposicion'
                };

                // --- INICIO DE CAMBIOS: Añadir Logs ---
                console.log("Intentando descontar stock y crear venta...");
                console.log("Datos de la venta:", JSON.stringify(finalSaleData, null, 2)); // Log detallado de datos
                // --- FIN DE CAMBIOS: Añadir Logs ---

                // Llamamos a la función del CONTEXTO
                savedSaleId = await crearVentaConStock(finalSaleData);

                // --- INICIO DE CAMBIOS: Añadir Log ---
                console.log("Venta creada con ID:", savedSaleId);
                // --- FIN DE CAMBIOS: Añadir Log ---

                Toast.show({ type: 'success', text1: 'Venta Creada', text2: 'Stock descontado.', position: 'bottom', visibilityTime: 2000 });
                // --- FIN LÓGICA MODIFICADA ---
            }

            // --- Lógica de Compartir (sin cambios) ---
            const completeSaleDataForPdf: BaseSale = {
                ...(originalSale as BaseSale || {} as BaseSale),
                ...saleDataToSave,
                id: savedSaleId,
                observaciones: saleDataToSave.observaciones,
                // @ts-ignore
                fecha: new Date(),
                items: itemsConDescuentosAplicados,
                // --- INICIO DE CAMBIOS: Forzar tipo correcto ---
                estado: saleDataToSave.estado as BaseSale['estado'],
                tipo: saleDataToSave.tipo as BaseSale['tipo'],
                // --- FIN DE CAMBIOS: Forzar tipo correcto ---
            };

            const vendorName = currentVendedor.nombreCompleto || currentVendedor.nombre;

            Alert.alert(
                "Venta Guardada",
                "¿Desea generar y compartir el comprobante ahora?",
                [
                    { text: "No, Volver", onPress: () => {
                        setIsSubmitting(false); // Resetear aquí también
                        navigation.goBack();
                    }, style: "cancel" },
                    { text: "Sí, Compartir", onPress: async () => {
                        try {
                            await handleShare(completeSaleDataForPdf, client, vendorName);
                        } finally {
                            setIsSubmitting(false); // Resetear después de compartir
                            navigation.goBack();
                        }
                    } }
                ],
                 { cancelable: false }
            );

        } catch (error: any) {
            // --- INICIO DE CAMBIOS: Log de Error Mejorado ---
            console.error("Error capturado en confirmarVenta:", error); // Log más detallado
            const errorMessage = error.message.includes("Stock insuficiente")
                ? error.message // Mostramos el error de stock específico
                : (error.message || 'No se pudo completar la operación.');
            // --- FIN DE CAMBIOS: Log de Error Mejorado ---

            Toast.show({ type: 'error', text1: 'Error al Guardar', text2: errorMessage, position: 'bottom' });
            setIsSubmitting(false); // Importante: desbloquear el botón
        }
        // Quitamos el finally para resetear isSubmitting en los callbacks del Alert o en el catch
    }, [
        isSubmitting, client, currentVendedor, cart, totalFinal, totalCosto, totalComision,
        totalDescuentoPromociones,
        itemsConDescuentosAplicados,
        editMode, originalSale, handleShare, refreshAllData, navigation, clientId,
        crearVentaConStock // <-- AÑADIR DEPENDENCIA
    ]);
    // --- FIN DE CAMBIOS: confirmarVenta ---

    // --- INICIO DE CAMBIOS: Nueva Función "Tenedor" ---
    /**
     * Esta función decide qué hacer cuando se presiona el botón principal:
     * 1. Si es Reposición -> Navega a ReviewSale
     * 2. Si es Venta -> Llama a confirmarVenta
     */
    const handleConfirmPress = () => {
        if (isSubmitting) return;

        // Validaciones básicas antes de decidir
        if (!client) { Alert.alert("Error", "No se ha seleccionado un cliente."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue al menos un producto."); return; }


        if (isReposicion) {
            // Es Reposición: Navegamos a ReviewSale
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            navigation.navigate('ReviewSale', { // Asumimos que ReviewSale existe y acepta esto
                cliente: client!,
                cart: itemsConDescuentosAplicados, // Usamos los items con descuentos calculados
                isReposicion: true,
                totalVenta: 0,
                totalCosto: totalCosto,
                totalComision: 0, // Reposición no da comisión
                totalDescuento: totalDescuentoPromociones, // Pasamos el descuento por si acaso
            });
        } else {
            // Es Venta: Confirmamos
            confirmarVenta(); // Llamamos a la función renombrada
        }
    };
    // --- FIN DE CAMBIOS: Nueva Función "Tenedor" ---

    const renderProductItem = useCallback(({ item }: { item: Product }) => (
        <ProductCard
            item={item}
            cart={cart}
            promotions={promotions}
            clientId={clientId}
            handleAddProduct={handleAddProduct}
        />
    ), [cart, promotions, clientId, handleAddProduct]);

    // --- RENDERIZADO PRINCIPAL ---
    if (isDataLoading && !client) {
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>Cargando datos...</Text>
            </View>
        );
    }
    if (!client && !isDataLoading) {
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <Feather name="user-x" size={48} color={COLORS.danger} />
                <Text style={styles.loaderText}>Error: Cliente no encontrado</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonError}>
                    <Text style={styles.backButtonErrorText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><Feather name="x" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    {/* --- INICIO CAMBIO: Título Dinámico --- */}
                    <Text style={styles.title}>{editMode ? 'Editar Venta' : (isReposicion ? 'Nueva Reposición' : 'Nueva Venta')}</Text>
                    {/* --- FIN CAMBIO: Título Dinámico --- */}
                    <Text style={styles.clientName}>{client?.nombre}</Text>
                </View>
                <View style={styles.headerButton} />
            </View>

            <View style={styles.controlsContainer}>
                <View style={styles.inputContainer}>
                    <Feather name="search" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Buscar producto..." placeholderTextColor={COLORS.textSecondary} value={searchQuery} onChangeText={setSearchQuery} clearButtonMode="while-editing" autoCapitalize="none" autoCorrect={false}/>
                     {searchQuery.length > 0 && Platform.OS === 'android' && ( <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}><Feather name="x" size={18} color={COLORS.textSecondary} /></TouchableOpacity> )}
                </View>
                {/* REEMPLAZO DEL PICKER: Botón y Modal */}
                <View style={styles.pickerContainer}>
                    <Feather name="tag" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsCategoryModalVisible(true); }}
                    >
                         <Text style={[styles.pickerButtonText, { color: categoryFilter ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedCategoryName}
                         </Text>
                        <Feather name="chevron-down" size={20} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                data={filteredProducts}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                 !isDataLoading ? (
                     <View style={styles.emptyContainer}>
                         <Feather name="package" size={48} color={COLORS.textSecondary} />
                         <Text style={styles.emptyText}>No se encontraron productos</Text>
                     </View>
                 ) : null
                }
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={Platform.OS === 'android'}
                keyboardShouldPersistTaps="handled"
            />

            <View style={styles.checkoutContainer}>
                <ScrollView>
                    <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text></View>
                    {totalDescuentoPromociones > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, styles.discountText]}>Descuentos Aplicados</Text>
                            <Text style={[styles.totalValue, styles.discountText]}>-${totalDescuentoPromociones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                        </View>
                    )}
                    <View style={[styles.totalRow, styles.finalTotalRow]}><Text style={styles.finalTotalLabel}>Total a Pagar</Text><Text style={styles.finalTotalValue}>${totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text></View>
                </ScrollView>

                {/* --- INICIO DE CAMBIOS: Botón Principal --- */}
                <TouchableOpacity
                    style={[
                        styles.checkoutButton,
                        isSubmitting && styles.checkoutButtonDisabled,
                        isReposicion && { backgroundColor: COLORS.warning } // Color Naranja si es Reposición
                    ]}
                    onPress={handleConfirmPress} // <-- Llama a la nueva función "Tenedor"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? ( <ActivityIndicator color={COLORS.primaryDark} /> ) : ( <Feather name={editMode ? "check-circle" : "arrow-right-circle"} size={22} color={COLORS.primaryDark} /> )}
                    <Text style={styles.checkoutButtonText}>
                        {isSubmitting
                            ? (editMode ? 'Actualizando...' : 'Guardando...')
                            : (isReposicion ? 'Revisar Reposición' : (editMode ? 'Actualizar Venta' : 'Confirmar Venta'))
                        }
                    </Text>
                </TouchableOpacity>
                {/* --- FIN DE CAMBIOS: Botón Principal --- */}
            </View>

            <Modal transparent={true} visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Cantidad</Text>
                        <Text style={styles.modalProduct}>{selectedProduct?.nombre}</Text>
                        <TextInput style={styles.modalInput} value={currentQuantity} onChangeText={setCurrentQuantity} keyboardType="number-pad" textAlign="center" autoFocus={true} selectTextOnFocus />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={handleRemoveFromCart}><Feather name="trash-2" size={20} color={COLORS.danger} /></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={handleConfirmQuantity}><Text style={styles.modalButtonText}>Confirmar</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* NUEVO MODAL DE SELECCIÓN DE CATEGORÍA */}
            <CategorySelectorModal
                visible={isCategoryModalVisible}
                onClose={() => setIsCategoryModalVisible(false)}
                categories={categories}
                selectedId={categoryFilter}
                onSelect={setCategoryFilter}
            />
        </KeyboardAvoidingView>
    );
};

// --- ESTILOS --- (Añadidos estilos de Stock)
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
    loaderText: { fontSize: 16, color: COLORS.textSecondary },
    backButtonError: { marginTop: 20, backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 25, borderRadius: 25 },
    backButtonErrorText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: (StatusBar.currentHeight || 0) + 10, paddingBottom: 15, paddingHorizontal: 10 },
    headerButton: { padding: 10, width: 44 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    clientName: { fontSize: 15, color: COLORS.primary, fontWeight: '500' },
    controlsContainer: { paddingHorizontal: 15, marginBottom: 10, gap: 10 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 12, height: 48 },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16, height: '100%' },
    clearButton: { padding: 5 },
    pickerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder, paddingLeft: 12, justifyContent: 'center', paddingVertical: 5, height: 48 },

    // NUEVOS ESTILOS PARA EL SELECTOR BASADO EN TOUCHABLE
    pickerButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 12,
        height: '100%',
    },
    pickerButtonText: {
        fontSize: 16,
    },

    listContentContainer: { paddingHorizontal: 15, paddingBottom: 10, flexGrow: 1 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 15, minHeight: 200 },
    emptyText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, paddingVertical: 12, paddingLeft: 15, paddingRight: 10, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
    cardSelected: { backgroundColor: 'rgba(241, 245, 188, 0.2)', borderColor: COLORS.primary },
    cardInfo: { flex: 1, marginRight: 8 },
    cardTitle: { fontSize: 16, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 2 },
    priceContainer: {flexDirection: 'row', alignItems: 'baseline', gap: 5},
    cardPrice: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
    cardOriginalPrice: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '400', textDecorationLine: 'line-through' },

    // --- ESTILOS MEJORA VISUAL ---
    stockText: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 4,
        fontWeight: '500',
    },
    stockTextLow: {
        color: COLORS.danger, // Asumiendo que COLORS.danger es tu rojo
        fontWeight: 'bold',
    },
    // --- FIN ESTILOS MEJORA ---

    inCartControls: { flexDirection: 'row', alignItems: 'center' },
    quantityBadge: { backgroundColor: COLORS.primary, borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
    quantityBadgeText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 14 },
    editIcon: { marginLeft: 8 },
    addButton: { backgroundColor: COLORS.primary, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 4 },
    checkoutContainer: { backgroundColor: COLORS.glass, borderTopWidth: 1, borderColor: COLORS.glassBorder, padding: 15, paddingBottom: Platform.OS === 'ios' ? 30 : 15 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    totalLabel: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '500' },
    totalValue: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
    discountText: { color: COLORS.danger, fontWeight: '600' },
    finalTotalRow: { borderTopWidth: 1, borderColor: COLORS.glassBorder, paddingTop: 10, marginTop: 5 },
    finalTotalLabel: { color: COLORS.textPrimary, fontSize: 18, fontWeight: 'bold' },
    finalTotalValue: { color: COLORS.primary, fontSize: 20, fontWeight: 'bold' },
    checkoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 15, gap: 10, marginTop: 10 },
    checkoutButtonDisabled: { backgroundColor: COLORS.disabled },
    checkoutButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 18 },

    // ESTILOS DE MODAL (comunes para cantidad y categoría)
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)' },
    modalContent: { width: '80%', backgroundColor: COLORS.backgroundEnd, borderRadius: 15, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder },
    modalHeader: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, marginBottom: 10, alignItems: 'center', width: '100%'},
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 5, color: COLORS.textPrimary },
    modalProduct: { fontSize: 16, color: COLORS.primary, marginBottom: 20, textAlign: 'center', fontWeight: '500' },
    modalInput: { width: '100%', backgroundColor: COLORS.glass, borderColor: COLORS.glassBorder, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 22, textAlign: 'center', marginBottom: 20, color: COLORS.textPrimary },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 10 },
    modalButton: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
    modalButtonCancel: { backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.danger },
    modalButtonConfirm: { backgroundColor: COLORS.primary },
    modalButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
    // Específicos de FlatList Modal
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
    modalItemText: { fontSize: 16, color: COLORS.textPrimary },
    separatorModal: { height: 1, backgroundColor: COLORS.glassBorder },
    modalCloseButton: { marginTop: 15, padding: 12, backgroundColor: COLORS.disabled, borderRadius: 12, alignItems: 'center', width: '100%' },
    modalCloseText: { color: COLORS.primaryDark, fontWeight: 'bold' },
});

export default CreateSaleScreen;