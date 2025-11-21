// src/screens/CreateSaleScreen.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { LinearGradient } from 'expo-linear-gradient';

// --- SDK NATIVO (v9 Modular) ---
import {
    doc,
    serverTimestamp,
    setDoc
} from '@react-native-firebase/firestore';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native';
import { CreateSaleScreenProps } from '../navigation/AppNavigator';

// --- Contexto ---
import {
    Sale as BaseSale,
    CartItem,
    Category,
    Client,
    Product,
    Promotion,
    useData,
    Vendor
} from '../../context/DataContext';

import { auth, dbContainer } from '../../db/firebase-service';
import { generatePdf } from '../../services/pdfGenerator';
import { COLORS, SIZES } from '../../styles/theme';


const { width } = Dimensions.get('window');

// --- CONSTANTES ---
const INITIAL_LOAD_COUNT = 25;
const LOAD_MORE_STEP = 25;

// Interface de Venta
interface SaleDataToSave {
    clienteId: string;
    clienteNombre: string;
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
    tipo: 'venta' | 'reposicion' | 'devolucion';
    
    // CAMPOS AFIP
    tipoDocumento: string; 
    numeroDocumento: string; 
    facturaAfip: boolean; 
    
    afipEstado: "pendiente" | "enviado" | "aprobado" | "error"; 
    afipNumeroComprobante: number | null;
    afipCAE: string | null;
    afipFechaVtoCAE: string | null; 
    afipPuntoVenta: number | null;
    afipResultado: string | null;
}

// --- Componente Modal Selector de Categoría ---
const CategorySelectorModal = memo(({ visible, onClose, categories, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    categories: Category[];
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const dataWithAllOption: Category[] = useMemo(() => [
        { id: '', nombre: 'Todas las Categorías' } as Category,
        ...categories
    ], [categories]);

    const renderItem = useCallback(({ item }: { item: Category }) => (
        <TouchableOpacity
            style={modalStyles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0, width: '85%' }]}>
                    <View style={modalStyles.modalHeader}>
                        <Text style={modalStyles.modalTitle}>FILTRAR POR CATEGORÍA</Text>
                    </View>
                    <FlatList
                        data={dataWithAllOption}
                        keyExtractor={(item) => item.id || 'all'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: SIZES.medium }}
                    />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}>
                        <Text style={modalStyles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

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

    const { displayPrice, originalPrice, isPromo } = useMemo(() => {
        let price = item.precio;
        let original = item.precio;
        let isPromo = false;

        const promoAplicable: Promotion | undefined = promotions.find(promo =>
            promo.tipo === 'precio_especial' &&
            promo.productoIds.includes(item.id) &&
            (!promo.clienteIds || promo.clienteIds.length === 0 || (clientId && promo.clienteIds.includes(clientId as string)))
        );

        if (promoAplicable && promoAplicable.nuevoPrecio) {
            price = promoAplicable.nuevoPrecio;
            original = item.precio;
            isPromo = true;
        }
        return { displayPrice: price, originalPrice: original, isPromo };
    }, [item, promotions, clientId]);

    const handlePress = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        handleAddProduct(item);
    }, [handleAddProduct, item]);

    const stock = item.stock ?? 0;
    const lowStock = stock < 10;
    const noStock = stock <= 0; 

    return (
        <TouchableOpacity
            style={[
                productCardStyles.card, 
                quantityInCart > 0 && productCardStyles.cardSelected, 
                noStock && productCardStyles.cardDisabled 
            ]}
            onPress={handlePress}
            activeOpacity={0.8}
            disabled={noStock} 
        >
            <View style={productCardStyles.cardInfo}>
                <Text style={productCardStyles.cardTitle} numberOfLines={1}>{item.nombre}</Text>
                <Text style={[
                    productCardStyles.stockText, 
                    lowStock && !noStock && productCardStyles.stockTextLow,
                    noStock && productCardStyles.stockTextNoStock
                ]}>
                    <Text>Stock: </Text>
                    <Text>{stock}</Text>
                </Text>

                <View style={productCardStyles.priceContainer}>
                    {isPromo && (
                        <View style={productCardStyles.promoPill}>
                            <Feather name="zap" size={SIZES.xsmallText} color={COLORS.accent} />
                            <Text style={productCardStyles.promoText}>PROMO</Text>
                        </View>
                    )}

                    {displayPrice !== originalPrice && (
                        <Text style={productCardStyles.cardOriginalPrice}>${originalPrice.toLocaleString('es-AR')}</Text>
                    )}
                    <Text style={[
                        productCardStyles.cardPrice, 
                        { color: isPromo ? COLORS.accent : COLORS.primary }
                    ]}>
                        ${displayPrice.toLocaleString('es-AR')}
                    </Text>
                </View>
            </View>

            {quantityInCart > 0 ? (
                <View style={productCardStyles.inCartControls}>
                    <View style={productCardStyles.quantityBadge}>
                        <Text style={productCardStyles.quantityBadgeText}>{quantityInCart}</Text>
                    </View>
                    <Feather name="edit-3" size={SIZES.h3} color={COLORS.primary} style={productCardStyles.editIcon} />
                </View>
            ) : (
                <View style={productCardStyles.addButton}>
                    <Feather name="plus" size={SIZES.h3} color={COLORS.white} />
                </View>
            )}
        </TouchableOpacity>
    );
});

// --- PANTALLA PRINCIPAL ---
const CreateSaleScreen = ({ navigation }: CreateSaleScreenProps) => {
    const route = useRoute();
    
    const { clientId, saleId, isEditing, isReposicion = false, isDevolucion = false, preselectedItems } = route.params as {
        clientId?: string,
        saleId?: string,
        isEditing?: string,
        isReposicion?: boolean,
        isDevolucion?: boolean,
        cliente?: Client, 
        preselectedItems?: any[] 
    };

    const editMode = isEditing === 'true';

    const {
        products: allProducts,
        categories,
        vendors,
        clients,
        sales,
        promotions,
        isLoading: isDataLoading,
        isOffline,
        descontarStockLocalmente,
        crearVentaConStock, 
        setSalesState, 
        reintegrarStockLocalmente, 
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
    
    const [visibleProductCount, setVisibleProductCount] = useState(INITIAL_LOAD_COUNT);

    const currentUser = auth.currentUser;

    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    const client = useMemo(() => {
        if (!clientId || !clients) return null;
        return clients.find((c: Client) => c.id === clientId) as (Client & { tipoDocumento: string, numeroDocumento: string, requiereFacturaAfip: boolean }) | undefined;
    }, [clientId, clients]);

    const selectedCategoryName = useMemo(() => {
        if (!categoryFilter) return 'Categorías';
        const selectedCategory = categories.find(c => c.id === categoryFilter);
        return selectedCategory ? selectedCategory.nombre : 'Todas las Categorías';
    }, [categoryFilter, categories]);

    const getComision = useCallback((product: Product, quantity: number): number => {
        if (isReposicion || isDevolucion) return 0;
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
    }, [currentVendedor, isReposicion, isDevolucion]);


    // Efecto para cargar items del Catálogo
    useEffect(() => {
        if (preselectedItems && preselectedItems.length > 0 && cart.length === 0 && !editMode) {
            console.log("Cargando items desde el Catálogo...", preselectedItems.length);
            
            const formattedItems: CartItem[] = preselectedItems.map((item) => {
                const quantity = item.quantity || item.cantidad || 1;
                const comision = getComision(item, quantity); 
                
                return {
                    ...item,
                    quantity: quantity,
                    comision: comision,
                    precioOriginal: item.precioOriginal ?? item.precio,
                };
            });

            setCart(formattedItems);
            Toast.show({
                type: 'success',
                text1: 'Carrito Cargado',
                text2: `Se agregaron ${formattedItems.length} productos.`,
                position: 'bottom'
            });
        }
    }, [preselectedItems, editMode, getComision]);


    // Efecto para editar venta
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

    // --- FILTRADO Y ORDENAMIENTO (AQUÍ ESTÁ LA MAGIA) ---
    useEffect(() => {
        // 🛑 1. CREAR COPIA DEL ARRAY para evitar problemas de referencia en React
        let products = [...allProducts]; 
        
        if (categoryFilter) {
            products = products.filter(p => p.categoriaId === categoryFilter);
        }
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            products = products.filter(p => p.nombre.toLowerCase().includes(lowerQuery));
        }
        
        products.sort((a, b) => {
            // 🛑 2. LÓGICA DE ORDENAMIENTO: Carrito siempre arriba
            if (editMode || cart.length > 0) { 
                const aInCart = cart.some(cartItem => cartItem.id === a.id);
                const bInCart = cart.some(cartItem => cartItem.id === b.id);
                if (aInCart && !bInCart) return -1; // A va primero
                if (!aInCart && bInCart) return 1;  // B va primero
            }
            return (a.nombre || '').localeCompare(b.nombre || '');
        });
        
        // 🛑 3. ACTUALIZAR ESTADO (Al ser una copia, React detecta el cambio y repinta)
        setFilteredProducts(products);
    }, [allProducts, categoryFilter, searchQuery, cart, editMode]);
    
    useEffect(() => {
        setVisibleProductCount(INITIAL_LOAD_COUNT);
    }, [categoryFilter, searchQuery]);


    const handleAddProduct = useCallback((product: Product) => {
        const existingItem = cart.find(item => item.id === product.id);
        let precioFinal = product.precio;
        let precioOriginal = product.precio;
        if (!isReposicion && !isDevolucion) {
            const promoAplicable: Promotion | undefined = promotions.find(promo =>
                promo.tipo === 'precio_especial' &&
                promo.productoIds.includes(product.id) &&
                (!promo.clienteIds || promo.clienteIds.length === 0 || (client && promo.clienteIds.includes(client.id)))
            );
            if (promoAplicable && promoAplicable.nuevoPrecio) {
                precioFinal = promoAplicable.nuevoPrecio;
                precioOriginal = product.precio;
            }
        }
        const productToAdd = { ...product, precio: precioFinal, precioOriginal: precioOriginal };
        setSelectedProduct(productToAdd);
        setCurrentQuantity(existingItem ? existingItem.quantity.toString() : '1');
        setModalVisible(true);
    }, [cart, promotions, client, isReposicion, isDevolucion]);

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

    const { subtotal, totalComision, totalCosto, totalFinal, totalDescuentoPromociones, itemsConDescuentosAplicados } = useMemo(() => {
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
        let sub: number = 0;
        let comision: number = 0;
        let costo: number = 0;
        let descuentoPrecioEspecial: number = 0;
        let descuentoPorCantidadTotal: number = 0;
        let itemsModificados: (CartItem & { descuentoPorCantidadAplicado?: number })[] = [];
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
                const isClientApplicable = !promo.clienteIds || promo.clienteIds.length === 0 || (client && promo.clienteIds.includes(client.id));
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
    }, [cart, promotions, client, isReposicion, isDevolucion]);

    const handleShare = useCallback(async (saleDataForPdf: BaseSale, clientData: Client, vendorName: string) => {
        if (!clientData) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontraron datos del cliente.' });
            return;
        }
        try {
            const htmlContent = await generatePdf(saleDataForPdf, clientData, vendorName,);
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
    }, []);


    const confirmarVenta = useCallback(async () => {
        if (isSubmitting) return;
        if (!client || !currentVendedor) { Alert.alert("Error", "Faltan datos del cliente o vendedor."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue al menos un producto."); return; }

        setIsSubmitting(true);
        Haptics.notificationAsync('success' as any); 

        const clienteTipoDocumento = client.tipoDocumento || 'SC'; 
        const clienteNumeroDocumento = client.numeroDocumento || '';
        const requiereFacturaAfip = client.requiereFacturaAfip || false;
        
        const saleDataToSave: Omit<SaleDataToSave, 'fecha'> = { 
            clienteId: client.id,
            clienteNombre: client.nombre,
            vendedorId: currentVendedor.id,
            vendedorName: currentVendedor.nombreCompleto || currentVendedor.nombre,
            items: itemsConDescuentosAplicados,
            totalVenta: totalFinal,
            totalCosto: totalCosto,
            totalComision: totalComision,
            estado: 'Pendiente de Entrega', 
            saldoPendiente: totalFinal,
            totalDescuentoPromociones: totalDescuentoPromociones,
            observaciones: originalSale?.observaciones || '',
            tipo: 'venta', 
            ...(editMode ? { fechaUltimaEdicion: serverTimestamp() } : {}),

            tipoDocumento: clienteTipoDocumento,
            numeroDocumento: clienteNumeroDocumento,
            facturaAfip: requiereFacturaAfip, 

            afipEstado: "pendiente", 
            afipNumeroComprobante: null,
            afipCAE: null,
            afipFechaVtoCAE: null,
            afipPuntoVenta: null,
            afipResultado: null,
        };

        try {
            let savedSaleId = originalSale ? originalSale.id : '';
            const dbInstance = dbContainer.instance;

            if (!dbInstance) { throw new Error("La base de datos no está lista. Reinicia la app."); }

            if (editMode && originalSale) {
                const originalSaleBackup = { ...originalSale }; 
                
                reintegrarStockLocalmente(originalSale.items);
                descontarStockLocalmente(cart);

                const updatedSale: BaseSale = {
                    ...originalSale, 
                    ...saleDataToSave as any, 
                    id: originalSale.id,
                    items: itemsConDescuentosAplicados,
                    fecha: originalSale.fecha, 
                };
                
                setSalesState(prevSales => 
                    prevSales.map(s => s.id === originalSale.id ? updatedSale : s)
                );
                
                const saleRef = doc(dbInstance, 'ventas', originalSale.id); 
                const updatePromise = setDoc(saleRef, saleDataToSave as any, { merge: true }); 

                if (isOffline) {
                    updatePromise.catch(err => console.warn(`[Offline] ${err.message}`));
                    Toast.show({ type: 'success', text1: 'Venta Actualizada (Offline)', text2: 'Se sincronizará al conectar.' });
                } else {
                    try {
                        await updatePromise; 
                        Toast.show({ type: 'success', text1: 'Venta Actualizada', text2: 'Stock ajustado.' });
                    } catch (e) {
                        setSalesState(prevSales => prevSales.map(s => s.id === originalSale.id ? originalSaleBackup as BaseSale : s));
                        descontarStockLocalmente(originalSale.items); 
                        reintegrarStockLocalmente(cart);
                        throw e; 
                    }
                }
                savedSaleId = originalSale.id;

            } else {
                const finalSaleData = {
                    ...saleDataToSave,
                    tipo: 'venta' as 'venta' | 'reposicion' | 'devolucion' 
                };
                
                savedSaleId = await crearVentaConStock(finalSaleData);
                descontarStockLocalmente(cart);
                Toast.show({ type: 'success', text1: isOffline ? 'Venta Guardada (Offline)' : 'Venta Creada' });
            }

            const completeSaleDataForPdf: BaseSale = {
                // @ts-ignore
                ...(originalSale as BaseSale || {} as BaseSale),
                ...saleDataToSave,
                id: savedSaleId,
                observaciones: saleDataToSave.observaciones,
                // @ts-ignore
                fecha: originalSale?.fecha || new Date(), 
                items: itemsConDescuentosAplicados,
                estado: saleDataToSave.estado as BaseSale['estado'],
                tipo: saleDataToSave.tipo as BaseSale['tipo'], 
            };

            const vendorName = currentVendedor.nombreCompleto || currentVendedor.nombre;

            Alert.alert(
                isOffline ? "Venta Guardada (Offline)" : "Venta Guardada",
                isOffline ? `Sincronización pendiente.` : "¿Compartir comprobante?",
                [
                    { text: "Volver", onPress: () => { 
                        setIsSubmitting(false); 
                        // ✅ NAVEGACIÓN A HOME
                        // @ts-ignore
                        navigation.navigate('Home'); 
                    }, style: "cancel" },
                    { text: "Compartir", onPress: async () => {
                        try { await handleShare(completeSaleDataForPdf, client!, vendorName); } 
                        finally { 
                            setIsSubmitting(false); 
                            // ✅ NAVEGACIÓN A HOME
                            // @ts-ignore
                            navigation.navigate('Home'); 
                        }
                    } }
                ],
                { cancelable: false }
            );

        } catch (error: any) {
            console.error("Error en confirmarVenta:", error); 
            Toast.show({ type: 'error', text1: 'Error al Guardar', text2: error.message });
            setIsSubmitting(false); 
        }
    }, [
        isSubmitting, client, currentVendedor, cart, totalFinal, totalCosto, totalComision,
        totalDescuentoPromociones, itemsConDescuentosAplicados, editMode, originalSale, 
        handleShare, navigation, isOffline, descontarStockLocalmente,
        reintegrarStockLocalmente, crearVentaConStock, setSalesState 
    ]);

    const handleConfirmPress = () => {
        if (isSubmitting) return;
        if (!client) { Alert.alert("Error", "No se ha seleccionado un cliente."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue al menos un producto."); return; }

        if (isReposicion || isDevolucion) {
            Haptics.notificationAsync('warning' as any);
            navigation.navigate('ReviewSale', { 
                cliente: client,
                clientId: client!.id,
                cart: itemsConDescuentosAplicados, 
                isReposicion: isReposicion,
                isDevolucion: isDevolucion,
                totalVenta: 0,
                totalCosto: totalCosto,
                totalComision: 0,
                totalDescuento: totalDescuentoPromociones,
            });
        } else {
            confirmarVenta(); 
        }
    };

    // Paginación
    const handleLoadMore = useCallback(() => {
        setVisibleProductCount(prevCount => prevCount + LOAD_MORE_STEP);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    const productsToRender = useMemo(() => 
        filteredProducts.slice(0, visibleProductCount), 
        [filteredProducts, visibleProductCount]
    );

    const hasMoreProducts = productsToRender.length < filteredProducts.length;

    const renderProductItem = useCallback(({ item }: { item: Product }) => (
        <ProductCard
            item={item}
            cart={cart}
            promotions={promotions}
            clientId={client?.id}
            handleAddProduct={handleAddProduct}
        />
    ), [cart, promotions, client?.id, handleAddProduct]);

    if (isDataLoading && !client) {
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>Cargando datos...</Text>
            </View>
        );
    }
    if (!client && !isDataLoading) {
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <Feather name="user-x" size={SIZES.h1} color={COLORS.danger} />
                <Text style={styles.loaderText}>Error: Cliente no encontrado</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonError}>
                    <Text style={styles.backButtonErrorText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const headerTitle = editMode ? 'EDITAR VENTA' : (isReposicion ? 'NUEVA REPOSICIÓN' : (isDevolucion ? 'NUEVA DEVOLUCIÓN' : 'NUEVA VENTA'));
    const dynamicButtonColor = isReposicion ? COLORS.warning : (isDevolucion ? COLORS.secondary : COLORS.primary);
    const buttonText = useMemo(() => {
        if (isSubmitting) return editMode ? 'ACTUALIZANDO...' : 'GUARDANDO...';
        if (isReposicion || isDevolucion) return 'REVISAR Y CONTINUAR';
        if (editMode) return isOffline ? 'ACTUALIZAR (OFFLINE)' : 'ACTUALIZAR VENTA';
        return isOffline ? 'CONFIRMAR VENTA (OFFLINE)' : 'CONFIRMAR VENTA';
    }, [isSubmitting, editMode, isReposicion, isDevolucion, isOffline]);

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? SIZES.xl : 0}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><Feather name="x" size={SIZES.large} color={COLORS.textPrimary} /></TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.title, { color: dynamicButtonColor }]}>{headerTitle}</Text>
                    <Text style={styles.clientName}>{client?.nombreCompleto || client?.nombre}</Text>
                </View>
                <View style={styles.headerButton} />
            </View>

            <View style={styles.controlsContainer}>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Feather name="search" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput 
                        style={styles.input} 
                        placeholder="Producto..." 
                        placeholderTextColor={COLORS.textSecondary} 
                        value={searchQuery} 
                        onChangeText={setSearchQuery} 
                        clearButtonMode="while-editing" 
                        autoCapitalize="none" 
                        autoCorrect={false}
                    />
                    {searchQuery.length > 0 && Platform.OS === 'android' && ( 
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                            <Feather name="x" size={SIZES.body} color={COLORS.textSecondary} />
                        </TouchableOpacity> 
                    )}
                </View>
                <View style={styles.pickerWrapper}>
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsCategoryModalVisible(true); }}
                    >
                        <Feather name="tag" size={SIZES.body} color={COLORS.textSecondary} style={styles.pickerIcon} />
                        <Text style={[styles.pickerButtonText, { color: categoryFilter ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedCategoryName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                data={productsToRender}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    !isDataLoading ? (
                        <View style={styles.emptyContainer}>
                            <Feather name="package" size={SIZES.h1} color={COLORS.disabled} />
                            <Text style={styles.emptyText}>No se encontraron productos</Text>
                        </View>
                    ) : null
                }
                ListFooterComponent={() => (
                    hasMoreProducts ? (
                        <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                            <Feather name="chevrons-down" size={SIZES.body} color={COLORS.primary} />
                            <Text style={styles.loadMoreText}>Cargar {LOAD_MORE_STEP} productos más ({productsToRender.length}/{filteredProducts.length})</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.listEndSpacer} />
                    )
                )}
                initialNumToRender={INITIAL_LOAD_COUNT}
                maxToRenderPerBatch={LOAD_MORE_STEP}
                windowSize={11}
                removeClippedSubviews={Platform.OS === 'android'}
                keyboardShouldPersistTaps="handled"
            />

            <View style={styles.checkoutContainer}>
                <View style={styles.totalsDetails}>
                    {totalDescuentoPromociones > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, styles.discountText]}>Descuentos Aplicados</Text>
                            <Text style={[styles.totalValue, styles.discountText]}>-${totalDescuentoPromociones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                        </View>
                    )}
                </View>
                
                <View style={styles.finalTotalBar}>
                    <View>
                        <Text style={styles.finalTotalLabel}>TOTAL A PAGAR</Text>
                        <Text style={styles.finalTotalValue}>${totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.checkoutButton,
                            { backgroundColor: dynamicButtonColor },
                            isSubmitting && styles.checkoutButtonDisabled,
                        ]}
                        onPress={handleConfirmPress}
                        disabled={isSubmitting || cart.length === 0}
                    >
                        {isSubmitting ? ( 
                            <ActivityIndicator color={COLORS.white} /> 
                        ) : ( 
                            <Feather name={editMode ? "check-circle" : "arrow-right-circle"} size={SIZES.h3} color={COLORS.white} /> 
                        )}
                        <Text style={styles.checkoutButtonText}>
                            {buttonText}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal transparent={true} visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
                <View style={modalStyles.modalOverlay}>
                    <View style={modalStyles.modalContent}>
                        <Text style={modalStyles.modalTitle}>CANTIDAD</Text>
                        <Text style={modalStyles.modalProduct}>{selectedProduct?.nombre}</Text>
                        <TextInput 
                            style={modalStyles.modalInput} 
                            value={currentQuantity} 
                            onChangeText={setCurrentQuantity} 
                            keyboardType="number-pad" 
                            textAlign="center" 
                            autoFocus={true} 
                            selectTextOnFocus 
                        />
                        <View style={modalStyles.modalButtons}>
                            <TouchableOpacity style={[modalStyles.modalButton, modalStyles.modalButtonCancel]} onPress={handleRemoveFromCart}>
                                <Feather name="trash-2" size={SIZES.h2} color={COLORS.danger} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[modalStyles.modalButton, modalStyles.modalButtonConfirm]} onPress={handleConfirmQuantity}>
                                <Text style={modalStyles.modalButtonText}>CONFIRMAR</Text>
                            </TouchableOpacity>
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

// --- Estilos Auxiliares (Modales y Product Card) ---

const modalStyles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)' },
    modalContent: { 
        width: '75%', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        padding: SIZES.large, 
        alignItems: 'center', 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalHeader: { 
        paddingVertical: SIZES.small, 
        borderBottomWidth: SIZES.borderWidth, 
        borderBottomColor: COLORS.glassBorder, 
        alignItems: 'center', 
        width: '100%',
        marginBottom: SIZES.medium,
    },
    modalTitle: { fontSize: SIZES.h2, fontWeight: 'bold', marginBottom: SIZES.xsmall, color: COLORS.textPrimary },
    modalProduct: { fontSize: SIZES.h3, color: COLORS.primary, marginBottom: SIZES.large, textAlign: 'center', fontWeight: '500' },
    modalInput: { 
        width: '100%', 
        backgroundColor: COLORS.backgroundStart, 
        borderColor: COLORS.glassBorder, 
        borderWidth: SIZES.borderWidth, 
        borderRadius: SIZES.radius, 
        paddingVertical: SIZES.small, 
        paddingHorizontal: SIZES.medium,
        fontSize: SIZES.h1, 
        textAlign: 'center', 
        marginBottom: SIZES.large, 
        color: COLORS.textPrimary,
        fontWeight: 'bold',
    },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: SIZES.medium },
    modalButton: { flex: 1, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center' },
    modalButtonCancel: { backgroundColor: COLORS.backgroundEnd, borderWidth: SIZES.borderWidth, borderColor: COLORS.danger, flex: 1 },
    modalButtonConfirm: { backgroundColor: COLORS.primary, flex: 2 },
    modalButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SIZES.medium },
    modalItemText: { fontSize: SIZES.body, color: COLORS.textPrimary },
    separatorModal: { height: SIZES.borderWidth, backgroundColor: COLORS.glassBorder },
    modalCloseButton: { 
        marginTop: SIZES.large, 
        padding: SIZES.medium, 
        backgroundColor: COLORS.backgroundStart, 
        borderRadius: SIZES.radius, 
        alignItems: 'center', 
        width: '100%',
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
    },
    modalCloseText: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
});

// Estilos de la Product Card (Ajustados y Compactos)
const productCardStyles = StyleSheet.create({
    card: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.backgroundEnd, 
        paddingVertical: SIZES.medium, 
        paddingLeft: SIZES.medium, 
        paddingRight: SIZES.small, 
        borderRadius: SIZES.radius, 
        marginBottom: SIZES.small, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    cardSelected: { 
        backgroundColor: COLORS.backgroundEnd, 
        borderColor: COLORS.primary, 
        borderWidth: SIZES.borderWidth * 2,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.15,
    },
    cardDisabled: { opacity: 0.4, backgroundColor: COLORS.backgroundStart },
    cardInfo: { flex: 1, marginRight: SIZES.medium },
    cardTitle: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SIZES.xsmall / 2 },
    
    priceContainer: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xsmall, marginTop: SIZES.xsmall / 2 },
    promoPill: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.accent + '20', 
        borderRadius: SIZES.small, 
        paddingHorizontal: SIZES.xsmall, 
        paddingVertical: SIZES.xsmall / 2, 
        marginRight: SIZES.xsmall 
    },
    promoText: { fontSize: SIZES.xsmallText, color: COLORS.accent, fontWeight: 'bold', marginLeft: SIZES.xsmall / 2 },
    cardPrice: { fontSize: SIZES.body, color: COLORS.primary, fontWeight: 'bold' },
    cardOriginalPrice: { fontSize: SIZES.caption, color: COLORS.textSecondary, fontWeight: '500', textDecorationLine: 'line-through' },
    
    stockText: { fontSize: SIZES.caption, color: COLORS.textSecondary, fontWeight: '500' },
    stockTextLow: { color: COLORS.warning, fontWeight: 'bold' },
    stockTextNoStock: { color: COLORS.danger, fontWeight: '900' },
    
    inCartControls: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xsmall },
    quantityBadge: { 
        backgroundColor: COLORS.primary, 
        borderRadius: SIZES.radiusSmall, 
        minWidth: 40,
        height: 40, 
        justifyContent: 'center', 
        alignItems: 'center', 
        paddingHorizontal: SIZES.small 
    },
    quantityBadgeText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body },
    editIcon: { marginLeft: SIZES.small },
    addButton: { 
        backgroundColor: COLORS.primary, 
        width: 48, 
        height: 48,
        borderRadius: SIZES.radiusSmall, 
        justifyContent: 'center', 
        alignItems: 'center', 
        shadowColor: COLORS.primary, 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.3, 
        shadowRadius: 3, 
        elevation: 4 
    },
});


// --- Estilos Principales de Pantalla ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    
    // Loader
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SIZES.medium, backgroundColor: COLORS.backgroundStart },
    loaderText: { fontSize: SIZES.body, color: COLORS.textSecondary },
    backButtonError: { marginTop: SIZES.large, backgroundColor: COLORS.primary, paddingVertical: SIZES.small, paddingHorizontal: SIZES.large, borderRadius: SIZES.radius },
    backButtonErrorText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body },
    
    // Header
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.small, 
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.small,
        backgroundColor: COLORS.backgroundStart,
    },
    headerButton: { padding: SIZES.small, width: 48 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    title: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textTransform: 'uppercase' },
    clientName: { fontSize: SIZES.body, color: COLORS.textPrimary, fontWeight: '500', marginTop: SIZES.xsmall / 2 },
    
    // Controles (Filtro y Búsqueda - 50/50)
    controlsContainer: { 
        paddingHorizontal: SIZES.large, 
        marginBottom: SIZES.medium, 
        flexDirection: 'row', 
        gap: SIZES.medium 
    },
    inputContainer: { 
        flex: 2,
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder, 
        paddingHorizontal: SIZES.small, 
        height: 52 
    },
    inputIcon: { marginRight: SIZES.small },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body, height: '100%' },
    clearButton: { padding: SIZES.xsmall },
    
    pickerWrapper: { flex: 1.5 },
    pickerButton: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: SIZES.small, 
        height: 52,
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder,
    },
    pickerIcon: { marginRight: SIZES.xsmall },
    pickerButtonText: { fontSize: SIZES.caption, flex: 1, textAlign: 'center', fontWeight: '500' },
    
    // Lista de Productos
    listContentContainer: { 
        paddingHorizontal: SIZES.large, 
        paddingBottom: SIZES.medium, 
        flexGrow: 1 
    },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SIZES.xl, gap: SIZES.medium, minHeight: 200 },
    emptyText: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center' },
    
    // BOTÓN CARGAR MÁS (FOOTER)
    loadMoreButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SIZES.medium,
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        marginVertical: SIZES.medium,
        gap: SIZES.small,
        marginHorizontal: SIZES.large,
    },
    loadMoreText: {
        color: COLORS.primary,
        fontSize: SIZES.body,
        fontWeight: 'bold',
    },
    listEndSpacer: { height: SIZES.large },

    // Checkout Bar (Sticky)
    checkoutContainer: { 
        backgroundColor: COLORS.backgroundEnd, 
        borderTopWidth: 1, 
        borderColor: COLORS.glassBorder, 
        paddingTop: SIZES.medium,
        paddingHorizontal: SIZES.large,
        paddingBottom: Platform.OS === 'ios' ? SIZES.xl : SIZES.medium,
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 10,
    },
    totalsDetails: {
        marginBottom: SIZES.medium,
        gap: SIZES.xsmall / 2,
    },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { color: COLORS.textSecondary, fontSize: SIZES.caption, fontWeight: '500', textTransform: 'uppercase' },
    totalValue: { color: COLORS.textPrimary, fontSize: SIZES.body, fontWeight: '600' },
    discountText: { color: COLORS.danger, fontWeight: '600' },
    
    // Total Final y Botón
    finalTotalBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: SIZES.small,
        borderTopWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        marginBottom: SIZES.small,
    },
    finalTotalLabel: { color: COLORS.textPrimary, fontSize: SIZES.body, fontWeight: 'bold', textTransform: 'uppercase' },
    finalTotalValue: { color: COLORS.primary, fontSize: SIZES.h3, fontWeight: 'bold' },
    
    checkoutButton: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        paddingVertical: SIZES.medium, 
        borderRadius: SIZES.radius, 
        gap: SIZES.small, 
        height: 56,
        flex: 1,
        marginLeft: SIZES.medium,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 8,
    },
    checkoutButtonDisabled: { 
        backgroundColor: COLORS.disabled,
        shadowOpacity: 0.1,
        elevation: 2,
    },
    checkoutButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
});

export default CreateSaleScreen;