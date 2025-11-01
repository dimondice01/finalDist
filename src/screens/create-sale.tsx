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
    // --- CAMBIO: Estandarización de BD (de la charla anterior) ---
    clienteNombre: string; // ANTES: clientName
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
    observaciones: string; 
    tipo: 'venta' | 'reposicion' | 'devolucion'; // <-- AÑADIDO 'devolucion'
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
    const stock = item.stock ?? 0;
    const lowStock = stock < 10;
    const noStock = stock <= 0; 

    return (
        <TouchableOpacity
            style={[
                styles.card, 
                quantityInCart > 0 && styles.cardSelected,
                noStock && styles.cardDisabled 
            ]}
            onPress={handlePress}
            activeOpacity={0.8}
            disabled={noStock} 
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
                <Text style={[
                    styles.stockText, 
                    lowStock && !noStock && styles.stockTextLow,
                    noStock && styles.stockTextNoStock
                ]}>
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
    // Añadimos 'isDevolucion'
    const { clientId, saleId, isEditing, isReposicion = false, isDevolucion = false, cliente: initialCliente } = route.params as {
        clientId?: string, // <--- Este es el clientId (string) que viene de AppNavigator
        saleId?: string,
        isEditing?: string,
        isReposicion?: boolean,
        isDevolucion?: boolean, // <-- AÑADIDO
        cliente?: Client // <--- Este es el objeto Cliente que también puede venir
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
        crearVentaConStock 
    } = useData();

    const [cart, setCart] = useState<CartItem[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [modalVisible, setModalVisible] = useState(false);
    const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false); 
    const [selectedProduct, setSelectedProduct] = useState<Product & { precioOriginal?: number } | null>(null);
    const [currentQuantity, setCurrentQuantity] = useState('1');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [originalSale, setOriginalSale] = useState<BaseSale | null>(null);

    const currentUser = auth.currentUser;

    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    // --- ¡¡¡CORRECCIÓN CLAVE!!! ---
    // Aquí definimos 'client' (con 't') como un OBJETO Client, no un string.
    const client = useMemo(() => {
        // Si nos pasaron el objeto 'cliente' (desde client-dashboard), lo usamos.
        if (initialCliente) return initialCliente;
        
        // Si solo nos pasaron 'clientId' (desde otra pantalla), lo buscamos.
        if (!clientId || !clients) return null;
        return clients.find((c: Client) => c.id === clientId);
        
    }, [clientId, clients, initialCliente]); // <-- Dependemos de initialCliente
    // --- FIN CORRECCIÓN ---

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

    // --- useEffect de filtrado y orden (sin cambios) ---
    useEffect(() => {
        let products = allProducts;
        if (categoryFilter) {
            products = products.filter(p => p.categoriaId === categoryFilter);
        }
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            products = products.filter(p => p.nombre.toLowerCase().includes(lowerQuery));
        }

        products.sort((a, b) => {
            if (editMode) {
                const aInCart = cart.some(cartItem => cartItem.id === a.id);
                const bInCart = cart.some(cartItem => cartItem.id === b.id);

                if (aInCart && !bInCart) return -1; 
                if (!aInCart && bInCart) return 1;  
            }
            return (a.nombre || '').localeCompare(b.nombre || '');
        });

        setFilteredProducts(products);
    }, [allProducts, categoryFilter, searchQuery, cart, editMode]);
    // --- FIN useEffect de filtrado ---

    const getComision = useCallback((product: Product, quantity: number): number => {
        // --- INICIO CAMBIO: Comisión Cero para Repos/Devolución ---
        if (isReposicion || isDevolucion) return 0;
        // --- FIN CAMBIO ---

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
    }, [currentVendedor, isReposicion, isDevolucion]); // <-- Añadidas dependencias

     const handleAddProduct = useCallback((product: Product) => {
        const existingItem = cart.find(item => item.id === product.id);
        let precioFinal = product.precio;
        let precioOriginal = product.precio;

        // --- INICIO CAMBIO: Sin promos para Repos/Devolución ---
        if (!isReposicion && !isDevolucion) {
            const promoAplicable: Promotion | undefined = promotions.find(promo =>
                promo.tipo === 'precio_especial' &&
                promo.productoIds.includes(product.id) &&
                (!promo.clienteIds || promo.clienteIds.length === 0 || (client && promo.clienteIds.includes(client.id))) // <-- Usar client.id
            );
            if (promoAplicable && promoAplicable.nuevoPrecio) {
                precioFinal = promoAplicable.nuevoPrecio;
                precioOriginal = product.precio;
            }
        }
        // --- FIN CAMBIO ---

        const productToAdd = { ...product, precio: precioFinal, precioOriginal: precioOriginal };
        setSelectedProduct(productToAdd);
        setCurrentQuantity(existingItem ? existingItem.quantity.toString() : '1');
        setModalVisible(true);
    }, [cart, promotions, client, isReposicion, isDevolucion]); // <-- Añadidas dependencias

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

    // --- BLOQUE USEMEMO ---
    const { subtotal, totalComision, totalCosto, totalFinal, totalDescuentoPromociones, itemsConDescuentosAplicados } = useMemo(() => {
         // --- INICIO CAMBIO: Total Cero para Repos/Devolución ---
         if (isReposicion || isDevolucion) {
            const costo = cart.reduce((acc, item) => acc + (item.costo || 0) * item.quantity, 0);
            return {
                subtotal: 0,
                totalComision: 0,
                totalCosto: costo,
                totalFinal: 0,
                totalDescuentoPromociones: 0,
                itemsConDescuentosAplicados: cart.map(item => ({...item, precio: 0, precioOriginal: 0, comision: 0})),
            };
         }
         // --- FIN CAMBIO ---

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
                 const isClientApplicable = !promo.clienteIds || promo.clienteIds.length === 0 || (client && promo.clienteIds.includes(client.id)); // <-- Usar client.id
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
    }, [cart, promotions, client, isReposicion, isDevolucion]); // <-- Añadidas dependencias
    // --- FIN DEL BLOQUE USEMEMO ---

    // --- handleShare (Modificado para pasar el tipo) ---
    const handleShare = useCallback(async (saleDataForPdf: BaseSale, clientData: Client, vendorName: string) => {
        if (!clientData) {
           Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontraron datos del cliente.' });
           return;
        }

        try {
            // --- INICIO CAMBIO: Pasar tipo a PDF ---
            const htmlContent = await generatePdf(saleDataForPdf, clientData, vendorName,);
            // --- FIN CAMBIO ---
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


    // --- confirmarVenta (antes handleCheckout) ---
    const confirmarVenta = useCallback(async () => {
        if (isSubmitting) return;
        if (!client || !currentVendedor) { Alert.alert("Error", "Faltan datos del cliente o vendedor."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue al menos un producto."); return; }

        setIsSubmitting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Preparamos los datos
        const saleDataToSave: Omit<SaleDataToSave, 'fecha'> = { 
            clienteId: client.id,
            clienteNombre: client.nombre, // <-- Corregido (de la charla anterior)
            vendedorId: currentVendedor.id,
            vendedorName: currentVendedor.nombreCompleto || currentVendedor.nombre,
            items: cart.map((item: CartItem) => {
                const { precioOriginal, ...restOfItem } = item;
                return { ...restOfItem, ...(precioOriginal !== undefined && precioOriginal !== item.precio && { precioOriginal }) };
            }),
            totalVenta: totalFinal,
            totalCosto: totalCosto,
            totalComision: totalComision,
            estado: 'Pendiente de Entrega', 
            saldoPendiente: totalFinal,
            totalDescuentoPromociones: totalDescuentoPromociones,
            observaciones: originalSale?.observaciones || '',
            // --- CAMBIO: 'tipo' es solo 'venta' aquí ---
            tipo: 'venta', 
            ...(editMode ? { fechaUltimaEdicion: serverTimestamp() } : {})
        };

        try {
            let savedSaleId = originalSale ? originalSale.id : '';

            if (editMode && originalSale) {
                // Lógica de EDICIÓN
                const saleRef = doc(db, 'ventas', originalSale.id);
                await updateDoc(saleRef, saleDataToSave as any);
                Toast.show({ type: 'success', text1: 'Venta Actualizada', position: 'bottom', visibilityTime: 2000 });

            } else {
                // --- LÓGICA DE NUEVA VENTA ---
                const finalSaleData = {
                    ...saleDataToSave,
                    tipo: 'venta' as 'venta' | 'reposicion' | 'devolucion' // Asegurar tipo
                };
                
                console.log("Intentando descontar stock y crear venta...");
                savedSaleId = await crearVentaConStock(finalSaleData);
                console.log("Venta creada con ID:", savedSaleId);

                Toast.show({ type: 'success', text1: 'Venta Creada', text2: 'Stock descontado.', position: 'bottom', visibilityTime: 2000 });
            }

            // --- Lógica de Compartir ---
            const completeSaleDataForPdf: BaseSale = {
                ...(originalSale as BaseSale || {} as BaseSale),
                ...saleDataToSave,
                id: savedSaleId,
                observaciones: saleDataToSave.observaciones,
                // @ts-ignore
                fecha: new Date(),
                items: itemsConDescuentosAplicados,
                estado: saleDataToSave.estado as BaseSale['estado'],
                tipo: saleDataToSave.tipo as BaseSale['tipo'], 
            };

            const vendorName = currentVendedor.nombreCompleto || currentVendedor.nombre;

            Alert.alert(
                "Venta Guardada",
                "¿Desea generar y compartir el comprobante ahora?",
                [
                    { text: "No, Volver", onPress: () => {
                        setIsSubmitting(false); 
                        navigation.goBack();
                    }, style: "cancel" },
                    { text: "Sí, Compartir", onPress: async () => {
                        try {
                            await handleShare(completeSaleDataForPdf, client, vendorName);
                        } finally {
                            setIsSubmitting(false); 
                            navigation.goBack();
                        }
                    } }
                ],
                 { cancelable: false }
            );

        } catch (error: any) {
            console.error("Error capturado en confirmarVenta:", error); 
            const errorMessage = error.message.includes("Stock insuficiente")
                ? error.message 
                : (error.message || 'No se pudo completar la operación.');
            
            Toast.show({ type: 'error', text1: 'Error al Guardar', text2: errorMessage, position: 'bottom' });
            setIsSubmitting(false); 
        }
    }, [
        isSubmitting, client, currentVendedor, cart, totalFinal, totalCosto, totalComision,
        totalDescuentoPromociones,
        itemsConDescuentosAplicados,
        editMode, originalSale, handleShare, refreshAllData, navigation,
        crearVentaConStock
    ]);
    // --- FIN DE confirmarVenta ---

    // --- INICIO DE CAMBIOS: Nueva Función "Tenedor" ---
    /**
     * Esta función decide qué hacer cuando se presiona el botón principal:
     * 1. Si es Reposición O Devolución -> Navega a ReviewSale
     * 2. Si es Venta -> Llama a confirmarVenta
     */
    const handleConfirmPress = () => {
        if (isSubmitting) return;

        // Validaciones básicas
        if (!client) { Alert.alert("Error", "No se ha seleccionado un cliente."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue al menos un producto."); return; }


        // --- CAMBIO: Añadido 'isDevolucion' ---
        if (isReposicion || isDevolucion) {
            // Es Reposición O Devolución: Navegamos a ReviewSale
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            // --- ¡¡¡CORRECCIÓN CLAVE!!! ---
            // Tu AppNavigator.tsx espera 'clientId: string'
            // Y TAMBIÉN 'cliente: Client'
            // Le pasamos ambos para máxima compatibilidad.
            navigation.navigate('ReviewSale', { 
                cliente: client,
                clientId: client!.id, // <-- Pasamos el CLIENTID STRING (para que coincida con tu AppNav)
                cart: itemsConDescuentosAplicados, 
                isReposicion: isReposicion,
                isDevolucion: isDevolucion, // <-- AÑADIDO
                totalVenta: 0, // Se fuerza a 0
                totalCosto: totalCosto,
                totalComision: 0, // Cero comisión
                totalDescuento: totalDescuentoPromociones,
            });
        } else {
            // Es Venta: Confirmamos
            confirmarVenta(); 
        }
    };
    // --- FIN DE CAMBIOS: Nueva Función "Tenedor" ---

    const renderProductItem = useCallback(({ item }: { item: Product }) => (
        <ProductCard
            item={item}
            cart={cart}
            promotions={promotions}
            clientId={client?.id} // <-- Usar client.id (string)
            handleAddProduct={handleAddProduct}
        />
    ), [cart, promotions, client?.id, handleAddProduct]);

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

    // --- CAMBIO: Color de fondo dinámico ---
    const headerTitle = editMode ? 'Editar Venta' : (isReposicion ? 'Nueva Reposición' : (isDevolucion ? 'Nueva Devolución' : 'Nueva Venta'));
    const dynamicButtonColor = isReposicion ? COLORS.warning : (isDevolucion ? COLORS.secondary : COLORS.primary); // <-- Usar secondary para devolución
    // --- FIN CAMBIO ---

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><Feather name="x" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    {/* --- INICIO CAMBIO: Título Dinámico --- */}
                    <Text style={styles.title}>{headerTitle}</Text>
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
                        { backgroundColor: dynamicButtonColor }, // Color dinámico
                        isSubmitting && styles.checkoutButtonDisabled,
                    ]}
                    onPress={handleConfirmPress} // <-- Llama a la nueva función "Tenedor"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? ( <ActivityIndicator color={COLORS.primaryDark} /> ) : ( <Feather name={editMode ? "check-circle" : "arrow-right-circle"} size={22} color={COLORS.primaryDark} /> )}
                    <Text style={styles.checkoutButtonText}>
                        {isSubmitting
                            ? (editMode ? 'Actualizando...' : 'Guardando...')
                            : (isReposicion ? 'Revisar Reposición' : (isDevolucion ? 'Revisar Devolución' : (editMode ? 'Actualizar Venta' : 'Confirmar Venta')))
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

// --- ESTILOS ---
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
    pickerButton: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 12, height: '100%' },
    pickerButtonText: { fontSize: 16, },
    listContentContainer: { paddingHorizontal: 15, paddingBottom: 10, flexGrow: 1 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 15, minHeight: 200 },
    emptyText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, paddingVertical: 12, paddingLeft: 15, paddingRight: 10, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
    cardSelected: { backgroundColor: 'rgba(241, 245, 188, 0.2)', borderColor: COLORS.primary },
    cardDisabled: { // <-- AÑADIDO (PULIDO ANTERIOR)
        opacity: 0.5,
        backgroundColor: COLORS.disabled, 
    },
    cardInfo: { flex: 1, marginRight: 8 },
    cardTitle: { fontSize: 16, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 2 },
    priceContainer: {flexDirection: 'row', alignItems: 'baseline', gap: 5},
    cardPrice: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
    cardOriginalPrice: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '400', textDecorationLine: 'line-through' },
    stockText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
    stockTextLow: { // <-- AÑADIDO (PULIDO ANTERIOR)
        color: COLORS.danger, 
        fontWeight: 'bold',
    },
    stockTextNoStock: { // <-- AÑADIDO (PULIDO ANTERIOR)
        color: COLORS.danger,
        fontWeight: '900',
        fontSize: 14,
    },
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
    checkoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 15, gap: 10, marginTop: 10 },
    checkoutButtonDisabled: { backgroundColor: COLORS.disabled },
    checkoutButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 18 },
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
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
    modalItemText: { fontSize: 16, color: COLORS.textPrimary },
    separatorModal: { height: 1, backgroundColor: COLORS.glassBorder },
    modalCloseButton: { marginTop: 15, padding: 12, backgroundColor: COLORS.disabled, borderRadius: 12, alignItems: 'center', width: '100%' },
    modalCloseText: { color: COLORS.primaryDark, fontWeight: 'bold' },
});

export default CreateSaleScreen;