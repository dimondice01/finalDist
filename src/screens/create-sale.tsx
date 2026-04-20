// src/screens/CreateSaleScreen.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { LinearGradient } from 'expo-linear-gradient';

// --- SDK NATIVO ---
import {
    FirebaseFirestoreTypes,
    serverTimestamp
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
import { locationService } from '../../services/locationService';
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
    ubicacion?: { lat: number; lng: number; accuracy: number } | null;
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

// --- Componente Memoizado para el Item de Producto (ESTILO IOS PREMIUM) ---
const ProductCard = memo(({ item, cart, promotions, client, handleAddProduct }: {
    item: Product,
    cart: CartItem[],
    promotions: Promotion[],
    client: Client | undefined, 
    handleAddProduct: (product: Product) => void
}) => {
    if (!item || !item.id) return null;

    // ✅ Lógica Visual: Sumamos cantidad MANUAL + cantidad REGALO para el badge
    const quantityInCart = useMemo(() => {
        return cart
            .filter(c => c.id === item.id || c.id === `gift_${item.id}`)
            .reduce((sum, c) => sum + c.quantity, 0);
    }, [cart, item.id]);

    // ✅ Lógica visual de precio especial (Listas + Promociones)
    const { displayPrice, originalPrice, isPromo, appliedList } = useMemo(() => {
        // 1. Precio Base según Lista del Cliente
        let price = item.precio;
        let listName = null;

        if (client?.listaPreciosAsignada && item.preciosExtra && item.preciosExtra[client.listaPreciosAsignada]) {
            price = item.preciosExtra[client.listaPreciosAsignada];
            listName = client.listaPreciosAsignada;
        }

        let original = price;
        let isPromo = false;
        
        // 2. Aplicar Promoción (sobre el precio de lista)
        const promoAplicable = promotions.find(promo =>
            promo.tipo === 'precio_especial' &&
            promo.productoIds?.includes(item.id) &&
            (!promo.clienteIds || promo.clienteIds.length === 0 || (client && promo.clienteIds.includes(client.id)))
        );
        
        if (promoAplicable && promoAplicable.nuevoPrecio) {
            price = promoAplicable.nuevoPrecio;
            original = listName ? (item.preciosExtra?.[listName] || item.precio) : item.precio; // Tachamos el precio de lista o base
            isPromo = true;
        }
        return { displayPrice: price, originalPrice: original, isPromo, appliedList: listName };
    }, [item, promotions, client]);

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
            activeOpacity={0.7}
            disabled={noStock} 
        >
            <View style={productCardStyles.cardContent}>
                <View style={productCardStyles.infoColumn}>
                    <Text style={productCardStyles.cardTitle} numberOfLines={2}>{item.nombre}</Text>
                    
                    <View style={productCardStyles.metaRow}>
                        <View style={[
                            productCardStyles.stockBadge,
                            lowStock && !noStock ? { backgroundColor: '#FEF3C7' } : {},
                            noStock ? { backgroundColor: '#FEE2E2' } : {}
                        ]}>
                            <Text style={[
                                productCardStyles.stockText, 
                                lowStock && !noStock && productCardStyles.stockTextLow,
                                noStock && productCardStyles.stockTextNoStock
                            ]}>
                                {noStock ? 'Sin Stock' : `Stock: ${stock}`}
                            </Text>
                        </View>

                        {isPromo && (
                            <View style={productCardStyles.promoBadge}>
                                <Feather name="zap" size={10} color={COLORS.white} />
                                <Text style={productCardStyles.promoBadgeText}>OFERTA</Text>
                            </View>
                        )}
                    </View>

                    <View style={productCardStyles.priceRow}>
                        <Text style={[
                            productCardStyles.cardPrice, 
                            { color: isPromo ? COLORS.primary : '#1F2937' }
                        ]}>
                            ${displayPrice.toLocaleString('es-AR')}
                        </Text>
                        {displayPrice !== originalPrice && (
                            <Text style={productCardStyles.cardOriginalPrice}>${originalPrice.toLocaleString('es-AR')}</Text>
                        )}
                    </View>
                    {/* Badge de Lista Aplicada */}
                    {appliedList && !isPromo && (
                        <Text style={{ fontSize: 10, color: COLORS.secondary, marginTop: 2, fontWeight: '600' }}>
                            {appliedList}
                        </Text>
                    )}
                </View>

                <View style={productCardStyles.actionColumn}>
                    {quantityInCart > 0 ? (
                        <View style={productCardStyles.quantityBadge}>
                            <Text style={productCardStyles.quantityText}>{quantityInCart}</Text>
                        </View>
                    ) : (
                        <View style={productCardStyles.addButton}>
                            <Feather name="plus" size={20} color={COLORS.primary} />
                        </View>
                    )}
                </View>
            </View>
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
        companyId,
        companyConfig,
        identity,
        registrarVisita,
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

    // ✅ CORRECCIÓN: Devolvemos undefined en lugar de null
    const client = useMemo(() => {
        if (!clientId || !clients) return undefined;
        return clients.find((c: Client) => c.id === clientId) as (Client & { tipoDocumento: string, numeroDocumento: string, requiereFacturaAfip: boolean }) | undefined;
    }, [clientId, clients]);

    const selectedCategoryName = useMemo(() => {
        if (!categoryFilter) return 'Categorías';
        const selectedCategory = categories.find(c => c.id === categoryFilter);
        return selectedCategory ? selectedCategory.nombre : 'Todas las Categorías';
    }, [categoryFilter, categories]);

    // ✅ getComision Actualizado: Recibe 'effectivePrice' para calcular comisión sobre el precio real
    const getComision = useCallback((product: Product, quantity: number, effectivePrice?: number): number => {
        if (isReposicion || isDevolucion) return 0;
        const comisionGeneral = currentVendedor?.comisionGeneral || 0;
        
        // Usamos el precio efectivo si se pasa, sino el precio base del producto
        const precio = effectivePrice !== undefined ? effectivePrice : (product.precio || 0);
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


    // ✅ Efecto para cargar items del Catálogo (RECALCULANDO PRECIOS SEGÚN LISTA)
    useEffect(() => {
        if (preselectedItems && preselectedItems.length > 0 && cart.length === 0 && !editMode) {
            const formattedItems: CartItem[] = preselectedItems.map((item) => {
                const quantity = item.quantity || item.cantidad || 1;
                
                // 1. Recalcular precio base según lista del cliente
                let effectivePrice = item.precio;
                if (client?.listaPreciosAsignada && item.preciosExtra && item.preciosExtra[client.listaPreciosAsignada]) {
                    effectivePrice = item.preciosExtra[client.listaPreciosAsignada];
                }

                // 2. Calcular comisión con este precio
                const comision = getComision(item, quantity, effectivePrice); 
                
                return {
                    ...item,
                    precio: effectivePrice, // Guardamos el precio correcto
                    quantity: quantity,
                    comision: comision,
                    precioOriginal: item.precioOriginal ?? effectivePrice, // Si venía con original bien, sino el nuevo
                    isGift: false 
                };
            });
            setCart(formattedItems);
            Toast.show({ type: 'success', text1: 'Carrito Cargado', text2: `Se agregaron ${formattedItems.length} productos.`, position: 'bottom' });
        }
    }, [preselectedItems, editMode, getComision, client]);


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
                Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontró la venta.', position: 'bottom' });
                navigation.goBack();
            }
        }
    }, [editMode, saleId, sales, navigation]);

    // --- FILTRADO Y ORDENAMIENTO ---
    useEffect(() => {
        let products = [...allProducts]; 
        if (categoryFilter) products = products.filter(p => p.categoriaId === categoryFilter);
        if (searchQuery) products = products.filter(p => p.nombre.toLowerCase().includes(searchQuery.toLowerCase()));
        
        products.sort((a, b) => {
            if (editMode || cart.length > 0) { 
                const aInCart = cart.some(cartItem => cartItem.id === a.id && !cartItem.isGift);
                const bInCart = cart.some(cartItem => cartItem.id === b.id && !cartItem.isGift);
                if (aInCart && !bInCart) return -1;
                if (!aInCart && bInCart) return 1;
            }
            return (a.nombre || '').localeCompare(b.nombre || '');
        });
        setFilteredProducts(products);
    }, [allProducts, categoryFilter, searchQuery, cart, editMode]);
    
    useEffect(() => { setVisibleProductCount(INITIAL_LOAD_COUNT); }, [categoryFilter, searchQuery]);


    // ============================================================================
    // 🎁🎁 LÓGICA AUTOMÁTICA DE REGALOS (AUTO-ADD) 🎁🎁
    // ============================================================================
    useEffect(() => {
        if (isReposicion || isDevolucion) return; 

        let newCart = [...cart];
        let cartChanged = false;

        const giftPromos = promotions.filter(p => 
            p.tipo === 'REGALO_POR_COMPRA' && 
            p.estado === 'activa' &&
            (!p.clienteIds || p.clienteIds.length === 0 || (client && p.clienteIds.includes(client.id)))
        );

        const requiredGifts = new Map<string, number>();

        giftPromos.forEach(promo => {
            const triggerItems = newCart.filter(item => promo.productoIds?.includes(item.id) && !item.isGift);
            const totalTriggerQty = triggerItems.reduce((sum, item) => sum + item.quantity, 0);

            const minQty = promo.condicion?.cantidadMinima || 0;
            const giftQtyPerBatch = promo.beneficio?.cantidadRegalo || 0;
            const giftProductId = promo.beneficio?.productoRegaloId;

            if (minQty > 0 && giftQtyPerBatch > 0 && giftProductId && totalTriggerQty >= minQty) {
                const batches = Math.floor(totalTriggerQty / minQty);
                const totalGifts = batches * giftQtyPerBatch;
                
                if (totalGifts > 0) {
                    const current = requiredGifts.get(giftProductId) || 0;
                    requiredGifts.set(giftProductId, current + totalGifts);
                }
            }
        });

        newCart = newCart.map(item => {
            if (item.isGift) {
                const originalId = item.id.replace('gift_', '');
                const neededQty = requiredGifts.get(originalId);

                if (!neededQty) {
                    cartChanged = true;
                    return null;
                } else {
                    if (item.quantity !== neededQty) {
                        cartChanged = true;
                        return { ...item, quantity: neededQty };
                    }
                    requiredGifts.delete(originalId);
                    return item;
                }
            }
            return item;
        }).filter(Boolean) as CartItem[];

        requiredGifts.forEach((qty, giftId) => {
            const productData = allProducts.find(p => p.id === giftId);
            if (productData) {
                cartChanged = true;
                newCart.push({
                    ...productData,
                    id: `gift_${giftId}`,
                    nombre: `(REGALO) ${productData.nombre}`, 
                    quantity: qty,
                    precio: productData.precio, 
                    precioOriginal: productData.precio,
                    costo: productData.costo,
                    comision: 0,
                    isGift: true 
                });
            }
        });

        if (cartChanged) setCart(newCart);

    }, [cart, promotions, client, allProducts, isReposicion, isDevolucion]); 


    // --- Handlers UI ---
    // ✅ handleAddProduct Actualizado: Detecta precio de lista y promo
    const handleAddProduct = useCallback((product: Product) => {
        const existingItem = cart.find(item => item.id === product.id && !item.isGift);
        
        // 1. Determinar Precio Base (Lista o General)
        let precioBase = product.precio;
        if (client?.listaPreciosAsignada && product.preciosExtra && product.preciosExtra[client.listaPreciosAsignada]) {
            precioBase = product.preciosExtra[client.listaPreciosAsignada];
        }

        let precioFinal = precioBase;
        let precioOriginal = precioBase;
        
        // 2. Aplicar Promoción
        if (!isReposicion && !isDevolucion) {
            const promoAplicable = promotions.find(promo =>
                promo.tipo === 'precio_especial' &&
                promo.productoIds?.includes(product.id) &&
                (!promo.clienteIds || promo.clienteIds.length === 0 || (client && promo.clienteIds.includes(client.id)))
            );
            if (promoAplicable && promoAplicable.nuevoPrecio) {
                precioFinal = promoAplicable.nuevoPrecio;
                precioOriginal = precioBase;
            }
        }
        setSelectedProduct({ ...product, precio: precioFinal, precioOriginal });
        setCurrentQuantity(existingItem ? existingItem.quantity.toString() : '1');
        setModalVisible(true);
    }, [cart, promotions, client, isReposicion, isDevolucion]);

    const handleConfirmQuantity = useCallback(() => {
        const quantity = parseInt(currentQuantity, 10);
        if (isNaN(quantity) || quantity <= 0) { Alert.alert("Cantidad Inválida", "Ingrese un número mayor a 0."); return; }
        if (!selectedProduct) return;
        
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        
        // ✅ Calculamos comisión con el precio seleccionado (que ya incluye lógica de lista/promo)
        const comision = getComision(selectedProduct, quantity, selectedProduct.precio);
        
        const cartItemToAdd: CartItem = { 
            ...selectedProduct, 
            precio: selectedProduct.precio, 
            precioOriginal: selectedProduct.precioOriginal ?? selectedProduct.precio, 
            quantity, 
            comision,
            isGift: false 
        };
        
        setCart(prevCart => {
            const existingItemIndex = prevCart.findIndex(item => item.id === selectedProduct.id && !item.isGift);
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
        setCart(prevCart => prevCart.filter(item => !(item.id === selectedProduct!.id && !item.isGift)));
        setModalVisible(false);
        setSelectedProduct(null);
        setCurrentQuantity('1');
    }, [selectedProduct]);

   // ============================================================================
    // 💰💰 LÓGICA DE TOTALES Y DESCUENTOS (BLINDADA Y ESTRICTA) 💰💰
    // ============================================================================
    const { subtotal, totalComision, totalCosto, totalFinal, totalDescuentoPromociones, itemsConDescuentosAplicados } = useMemo(() => {
        // CASO ESPECIAL: Reposición o Devolución (Costos directos, sin venta pública)
        if (isReposicion || isDevolucion) {
            const costo = cart.reduce((acc, item) => acc + (Number(item.costo) || 0) * Number(item.quantity), 0);
            return {
                subtotal: 0, 
                totalComision: 0,
                totalCosto: costo,
                totalFinal: 0,
                totalDescuentoPromociones: 0,
                itemsConDescuentosAplicados: cart.map(item => ({...item, precio: 0, precioOriginal: 0, comision: 0})),
            };
        }

        // INICIALIZACIÓN DE ACUMULADORES
        let subTotalBruto = 0; // Esto acumulará Precio LISTA * Cantidad
        let comisionTotal = 0;
        let costoTotal = 0;
        
        // Mapa para rastrear descuentos por ID de producto
        const itemDiscounts = new Map<string, number>(); 

        // 1. PRIMERA PASADA: CÁLCULO DE SUBTOTAL BRUTO (PRECIO LISTA) Y GAP DE PRECIOS
        cart.forEach(item => {
            const qty = Number(item.quantity || 0);
            // IMPORTANTE: Priorizamos precioOriginal. Si no existe, usamos precio actual.
            // Esto asegura que el subtotal se base en el precio "de lista".
            const precioLista = Number(item.precioOriginal) > 0 ? Number(item.precioOriginal) : Number(item.precio);
            const precioCobrado = Number(item.precio);
            const costoUnitario = Number(item.costo || 0);

            // Acumulamos el Subtotal BRUTO
            subTotalBruto += precioLista * qty;
            
            // Acumulamos costos y comisiones
            comisionTotal += Number(item.comision || 0);
            costoTotal += costoUnitario * qty;
            
            // DETECCIÓN DE PRECIO ESPECIAL (GAP):
            // Si el precio de lista es mayor al cobrado (ej: Promo manual o precio especial), la diferencia es descuento.
            if (precioLista > precioCobrado) {
                const gapDiscount = (precioLista - precioCobrado) * qty;
                const current = itemDiscounts.get(item.id) || 0;
                itemDiscounts.set(item.id, current + gapDiscount);
            }
        });

        // 2. SEGUNDA PASADA: CÁLCULO DE PROMOCIONES COMPLEJAS (Lleva X Paga Y, Porcentajes)
        const manualItems = cart.filter(i => !i.isGift);

        promotions.forEach(promo => {
            // Validar cliente
            if (promo.clienteIds && promo.clienteIds.length > 0 && client && !promo.clienteIds.includes(client.id)) return;
            
            const matchingItems = manualItems.filter(item => promo.productoIds?.includes(item.id));
            if (matchingItems.length === 0) return;

            const totalQty = matchingItems.reduce((sum, item) => sum + Number(item.quantity), 0);

            // --- LLEVA X PAGA Y ---
            if (promo.tipo === 'LLEVA_X_PAGA_Y' && promo.condicion?.cantidadMinima && promo.beneficio?.cantidadAPagar) {
                const X = Number(promo.condicion.cantidadMinima);
                const Y = Number(promo.beneficio.cantidadAPagar);
                
                if (totalQty >= X && X > 0) {
                    const itemsGratisPorLote = X - Y;
                    const lotes = Math.floor(totalQty / X);
                    const totalGratis = lotes * itemsGratisPorLote;

                    if (totalGratis > 0) {
                        // Aplanamos unidades para descontar las más baratas
                        let allUnits: { id: string, price: number }[] = [];
                        matchingItems.forEach(item => {
                            const unitPrice = Number(item.precio); // Usamos precio actual para descontar
                            const q = Number(item.quantity);
                            for(let i=0; i<q; i++) allUnits.push({ id: item.id, price: unitPrice });
                        });
                        
                        allUnits.sort((a, b) => a.price - b.price); // Baratos primero
                        const freeUnits = allUnits.slice(0, totalGratis);

                        freeUnits.forEach(unit => {
                            const current = itemDiscounts.get(unit.id) || 0;
                            itemDiscounts.set(unit.id, current + unit.price);
                        });
                    }
                }
            } 
            // --- DESCUENTO % POR CANTIDAD ---
            else if (promo.tipo === 'DESCUENTO_POR_CANTIDAD' && promo.condicion?.cantidadMinima) {
                const minQty = Number(promo.condicion.cantidadMinima);
                const pct = Number(promo.beneficio?.porcentajeDescuento || 0);

                if (totalQty >= minQty && pct > 0) {
                    matchingItems.forEach(item => {
                        const itemTotal = Number(item.precio) * Number(item.quantity);
                        const discountVal = itemTotal * (pct / 100);
                        const curr = itemDiscounts.get(item.id) || 0;
                        itemDiscounts.set(item.id, curr + discountVal);
                    });
                }
            }
        });

        // 3. TERCERA PASADA: CONSTRUCCIÓN FINAL Y SUMA DE DESCUENTOS
        let totalDescuentoAcumulado = 0;
        
        const itemsFinales = cart.map(item => {
            const precioLista = Number(item.precioOriginal) > 0 ? Number(item.precioOriginal) : Number(item.precio);
            const qty = Number(item.quantity);

            // Si es regalo, el descuento es el 100% del precio de lista
            if (item.isGift) {
                const giftDiscount = precioLista * qty;
                totalDescuentoAcumulado += giftDiscount;
                return {
                    ...item,
                    precio: precioLista, // En BD guardamos precio lista
                    precioOriginal: precioLista,
                    descuentoPorCantidadAplicado: giftDiscount
                };
            }
            
            // Si es item normal, recuperamos sus descuentos acumulados
            const totalDiscountForItem = itemDiscounts.get(item.id) || 0;
            totalDescuentoAcumulado += totalDiscountForItem;

            return {
                ...item,
                precio: precioLista, // En BD guardamos precio lista
                precioOriginal: precioLista,
                descuentoPorCantidadAplicado: totalDiscountForItem 
            };
        });

        // RESULTADO FINAL
        // Total Final = Subtotal Bruto - Descuentos
        return {
            subtotal: subTotalBruto, // Ahora esto es el valor REAL de la mercancía sin descuentos
            totalComision: comisionTotal,
            totalCosto: costoTotal,
            totalFinal: subTotalBruto - totalDescuentoAcumulado,
            totalDescuentoPromociones: totalDescuentoAcumulado,
            itemsConDescuentosAplicados: itemsFinales
        };

    }, [cart, promotions, client, isReposicion, isDevolucion]);


    const handleShare = useCallback(async (saleDataForPdf: BaseSale, clientData: Client, vendorName: string) => {
        if (!clientData) { Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontraron datos del cliente.' }); return; }
        try {
            const htmlContent = await generatePdf(saleDataForPdf, clientData, vendorName, companyConfig);
            if (!htmlContent) { throw new Error("generatePdf devolvió null o vacío."); }
            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Comprobante ${saleDataForPdf.id}` });
        } catch (shareError: any) {
            console.error("Error share:", shareError);
            Alert.alert("Error", "No se pudo compartir el PDF.");
        }
    }, []);


    const confirmarVenta = useCallback(async () => {
        if (isSubmitting) return;
        if (!client || !currentVendedor) { Alert.alert("Error", "Faltan datos."); return; }
        if (cart.length === 0) { Alert.alert("Carrito Vacío", "Agregue productos."); return; }

        setIsSubmitting(true);
        Haptics.notificationAsync('success' as any);

        // Captura GPS silenciosa — no bloquea el flujo si falla
        let ubicacion: { lat: number; lng: number; accuracy: number } | null = null;
        try {
            const hasPermission = await locationService.checkPermissions();
            if (hasPermission) {
                const loc = await locationService.getMandatoryLocation();
                ubicacion = { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy };
            }
        } catch {
            // GPS no disponible — continuamos sin coordenadas
        }

        // Limpiar IDs temporales
        const itemsToSave = itemsConDescuentosAplicados.map(item => {
            const cleanId = item.id.startsWith('gift_') ? item.id.replace('gift_', '') : item.id;
            const { isGift, ...rest } = item; 
            return { ...rest, id: cleanId };
        });

        const saleDataToSave: Omit<SaleDataToSave, 'fecha'> = { 
            clienteId: client.id,
            clienteNombre: client.nombre,
            vendedorId: currentVendedor.id,
            vendedorName: currentVendedor.nombreCompleto || currentVendedor.nombre,
            items: itemsToSave,
            totalVenta: totalFinal,
            totalCosto: totalCosto,
            totalComision: totalComision,
            estado: 'Pendiente de Entrega',
            saldoPendiente: totalFinal,
            totalDescuentoPromociones: totalDescuentoPromociones,
            observaciones: originalSale?.observaciones || '',
            tipo: 'venta',
            ...(editMode ? { fechaUltimaEdicion: serverTimestamp() } : {}),
            tipoDocumento: client.tipoDocumento || 'SC',
            numeroDocumento: client.numeroDocumento || '',
            facturaAfip: client.requiereFacturaAfip || false,
            afipEstado: "pendiente", afipNumeroComprobante: null, afipCAE: null, afipFechaVtoCAE: null, afipPuntoVenta: null, afipResultado: null,
            ubicacion,
        };

        try {
            const dbInstance = dbContainer.instance;
            if (!dbInstance) throw new Error("DB no lista");

            let savedSaleId = originalSale ? originalSale.id : '';

            if (editMode && originalSale) {
                if (!companyId) throw new Error("ID de empresa no disponible.");
                
                reintegrarStockLocalmente(originalSale.items);
                descontarStockLocalmente(itemsToSave);
                
                const updatedSale: BaseSale = { ...originalSale, ...saleDataToSave as any, id: originalSale.id, items: itemsToSave, fecha: originalSale.fecha };
                setSalesState(prev => prev.map(s => s.id === originalSale.id ? updatedSale : s));
                
                const saleRef = dbInstance.doc(`companies/${companyId}/ventas/${originalSale.id}`); 
                const promise = saleRef.set(saleDataToSave as any, { merge: true });
                
                if (isOffline) promise.catch(e => console.log("Offline save pending"));
                else await promise;
                
                Toast.show({ type: 'success', text1: 'Venta Actualizada' });
            } else {
                const finalSaleData = { ...saleDataToSave, tipo: 'venta' as const };
                savedSaleId = await crearVentaConStock(finalSaleData);
                descontarStockLocalmente(itemsToSave);
                Toast.show({ type: 'success', text1: 'Venta Creada' });

                // Registrar visita con venta para trazabilidad CRM
                if (identity && client) {
                    registrarVisita({
                        clienteId: client.id,
                        clientName: client.nombreCompleto || client.nombre,
                        vendedorId: identity.id,
                        vendedorName: identity.nombreCompleto || identity.nombre,
                        timestamp: new Date().toISOString(),
                        ubicacion,
                        resultado: 'con_venta',
                    }).catch(() => {}); // fire-and-forget, no bloquea
                }
            }

            const completeData: BaseSale = {
                // @ts-ignore
                ...(originalSale || {}), 
                ...saleDataToSave, 
                id: savedSaleId, 
                items: itemsToSave,
                // @ts-ignore
                fecha: originalSale?.fecha || new Date(), 
                estado: saleDataToSave.estado as BaseSale['estado'], 
                tipo: saleDataToSave.tipo as BaseSale['tipo'],
                clientName: saleDataToSave.clienteNombre
            };

            Alert.alert(
                "Éxito", "¿Compartir comprobante?",
                [
                    { text: "No", onPress: () => { setIsSubmitting(false); navigation.navigate('Home' as any); }, style: "cancel" },
                    { text: "Sí", onPress: async () => {
                        try { await handleShare(completeData, client!, currentVendedor.nombre); } 
                        finally { setIsSubmitting(false); navigation.navigate('Home' as any); }
                    }}
                ], { cancelable: false }
            );

        } catch (error: any) {
            console.error(error);
            Toast.show({ type: 'error', text1: 'Error', text2: error.message });
            setIsSubmitting(false); 
        }
    }, [
        isSubmitting, client, currentVendedor, cart, totalFinal, totalCosto, totalComision,
        totalDescuentoPromociones, itemsConDescuentosAplicados, editMode, originalSale, 
        handleShare, navigation, isOffline, descontarStockLocalmente, reintegrarStockLocalmente, 
        crearVentaConStock, setSalesState 
    ]);

    const handleConfirmPress = () => {
        if (isSubmitting) return;
        if (!client) { Alert.alert("Error", "Cliente no seleccionado"); return; }
        if (cart.length === 0) { Alert.alert("Error", "Carrito vacío"); return; }

        if (isReposicion || isDevolucion) {
            navigation.navigate('ReviewSale', { 
                cliente: client, clientId: client!.id, cart: itemsConDescuentosAplicados, 
                isReposicion, isDevolucion, totalVenta: 0, totalCosto, totalComision: 0, totalDescuento: totalDescuentoPromociones,
            });
        } else {
            confirmarVenta(); 
        }
    };

    const handleLoadMore = useCallback(() => {
        setVisibleProductCount(prev => prev + LOAD_MORE_STEP);
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
            client={client} // ✅ Pasamos el objeto cliente completo
            handleAddProduct={handleAddProduct}
        />
    ), [cart, promotions, client, handleAddProduct]);

    if (isDataLoading && !client) {
        return (
            <View style={styles.fullScreenLoader}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }
    if (!client && !isDataLoading) {
        return (
            <View style={styles.fullScreenLoader}>
                <Feather name="user-x" size={40} color={COLORS.danger} />
                <Text style={styles.loaderText}>Cliente no encontrado</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonError}><Text style={styles.backButtonErrorText}>Volver</Text></TouchableOpacity>
            </View>
        );
    }

    const headerTitle = editMode ? 'EDITAR VENTA' : (isReposicion ? 'REPOSICIÓN' : (isDevolucion ? 'DEVOLUCIÓN' : 'NUEVA VENTA'));
    const dynamicButtonColor = isReposicion ? COLORS.warning : (isDevolucion ? COLORS.secondary : COLORS.primary);

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? SIZES.xl : 0}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><Feather name="x" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.title, { color: dynamicButtonColor }]}>{headerTitle}</Text>
                    <Text style={styles.clientName}>{client?.nombreCompleto || client?.nombre}</Text>
                </View>
                <View style={styles.headerButton} />
            </View>

            <View style={styles.controlsContainer}>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Feather name="search" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput 
                        style={styles.input} placeholder="Producto..." placeholderTextColor={COLORS.textSecondary} 
                        value={searchQuery} onChangeText={setSearchQuery} clearButtonMode="while-editing" 
                    />
                    {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Feather name="x" size={18} color={COLORS.textSecondary} /></TouchableOpacity>}
                </View>
                <TouchableOpacity style={styles.pickerButton} onPress={() => setIsCategoryModalVisible(true)}>
                    <Feather name="filter" size={20} color={COLORS.textSecondary} style={styles.pickerIcon} />
                    <Text style={styles.pickerButtonText} numberOfLines={1}>{selectedCategoryName}</Text>
                    <Feather name="chevron-down" size={16} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={productsToRender}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={hasMoreProducts ? <ActivityIndicator color={COLORS.primary} style={{margin: 20}}/> : <View style={{height: 20}}/>}
            />

            <View style={styles.checkoutContainer}>
                {totalDescuentoPromociones > 0 && (
                    <View style={styles.totalsDetails}>
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, styles.discountText]}>Descuentos</Text>
                            <Text style={[styles.totalValue, styles.discountText]}>-${totalDescuentoPromociones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                        </View>
                    </View>
                )}
                
                <View style={styles.finalTotalBar}>
                    <View>
                        <Text style={styles.finalTotalLabel}>TOTAL A PAGAR</Text>
                        <Text style={styles.finalTotalValue}>${totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                        <Text style={styles.subtotalText}>Subtotal: ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.checkoutButton, { backgroundColor: dynamicButtonColor }, isSubmitting && styles.checkoutButtonDisabled]}
                        onPress={handleConfirmPress}
                        disabled={isSubmitting || cart.length === 0}
                    >
                        {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Feather name="arrow-right" size={24} color="#FFF" />}
                        <Text style={styles.checkoutButtonText}>{isSubmitting ? '...' : 'CONFIRMAR'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
                <View style={modalStyles.modalOverlay}>
                    <View style={modalStyles.modalContent}>
                        <Text style={modalStyles.modalTitle}>CANTIDAD</Text>
                        <Text style={modalStyles.modalProduct}>{selectedProduct?.nombre}</Text>
                        <TextInput style={modalStyles.modalInput} value={currentQuantity} onChangeText={setCurrentQuantity} keyboardType="number-pad" autoFocus selectTextOnFocus />
                        <View style={modalStyles.modalButtons}>
                            <TouchableOpacity style={[modalStyles.modalButton, modalStyles.modalButtonCancel]} onPress={handleRemoveFromCart}>
                                <Feather name="trash-2" size={24} color={COLORS.danger} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[modalStyles.modalButton, modalStyles.modalButtonConfirm]} onPress={handleConfirmQuantity}>
                                <Text style={modalStyles.modalButtonText}>CONFIRMAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <CategorySelectorModal visible={isCategoryModalVisible} onClose={() => setIsCategoryModalVisible(false)} categories={categories} selectedId={categoryFilter} onSelect={setCategoryFilter} />
        </KeyboardAvoidingView>
    );
};

// --- ESTILOS IOS & MODERNOS ---
const productCardStyles = StyleSheet.create({
    card: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 16, 
        marginBottom: 12, 
        marginHorizontal: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F2F4F7',
    },
    cardSelected: { 
        backgroundColor: '#F0FDF4', 
        borderColor: COLORS.primary, 
        borderWidth: 1.5
    },
    cardDisabled: { opacity: 0.5 },
    
    cardContent: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center',
    },
    infoColumn: { flex: 1, marginRight: 12 },
    actionColumn: { justifyContent: 'center', alignItems: 'center', minWidth: 40 },

    cardTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 6, letterSpacing: 0.2 },
    
    metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
    
    stockBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#F1F5F9' },
    stockText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    stockTextLow: { color: '#D97706', fontWeight: '700' },
    stockTextNoStock: { color: '#EF4444', fontWeight: '800' },
    
    promoBadge: { 
        backgroundColor: '#F59E0B', 
        borderRadius: 4, 
        paddingHorizontal: 6, 
        paddingVertical: 2, 
        flexDirection: 'row', 
        alignItems: 'center',
        gap: 4
    },
    promoBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },

    priceRow: { flexDirection: 'row', alignItems: 'baseline' },
    cardPrice: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
    cardOriginalPrice: { fontSize: 13, color: '#94A3B8', textDecorationLine: 'line-through', marginLeft: 8 },

    addButton: { 
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', 
        justifyContent: 'center', alignItems: 'center' 
    },
    quantityBadge: { 
        width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, 
        justifyContent: 'center', alignItems: 'center',
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4
    },
    quantityText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});

const modalStyles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)' },
    modalContent: { width: '80%', backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 },
    modalHeader: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', width: '100%', alignItems: 'center', marginBottom: 10 },
    modalTitle: { fontSize: 14, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 8 },
    modalProduct: { fontSize: 18, color: '#1E293B', marginBottom: 20, textAlign: 'center', fontWeight: '600' },
    modalInput: { width: '100%', fontSize: 32, textAlign: 'center', marginBottom: 30, color: COLORS.primary, fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: COLORS.primary, paddingBottom: 5 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 15 },
    modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    modalButtonCancel: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EF4444' },
    modalButtonConfirm: { backgroundColor: COLORS.primary },
    modalButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 10 },
    modalItemText: { fontSize: 16, color: '#334155' },
    separatorModal: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 10 },
    modalCloseButton: { marginTop: 20, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, width: '100%', alignItems: 'center' },
    modalCloseText: { color: '#64748B', fontWeight: 'bold' },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loaderText: { marginTop: 10, color: '#64748B' },
    backButtonError: { marginTop: 20, padding: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
    backButtonErrorText: { color: '#FFF' },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 10 },
    headerButton: { width: 40, alignItems: 'center' },
    headerTitleContainer: { alignItems: 'center' },
    title: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    clientName: { fontSize: 14, color: '#64748B', marginTop: 2, fontWeight: '500' },

    controlsContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: '#E2E8F0' },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 15, color: '#1E293B' },
    clearButton: { padding: 4 },
    pickerWrapper: { }, 
    pickerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
    pickerIcon: { marginRight: 0 },
    pickerButtonText: { fontSize: 14, fontWeight: '600', color: '#475569', maxWidth: 120 },

    listContentContainer: { paddingHorizontal: 16, paddingBottom: 20 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
    emptyText: { marginTop: 10, color: '#94A3B8' },
    loadMoreButton: { flexDirection: 'row', justifyContent: 'center', padding: 15, backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', gap: 8 },
    loadMoreText: { color: COLORS.primary, fontWeight: 'bold' },
    listEndSpacer: { height: 20 },

    checkoutContainer: { backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E2E8F0', padding: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 16, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 15 },
    totalsDetails: { marginBottom: 12 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' },
    totalValue: { fontSize: 14, fontWeight: '600' },
    discountText: { color: '#EF4444' },
    
    finalTotalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    finalTotalLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
    finalTotalValue: { fontSize: 26, fontWeight: '800', color: '#0F172A' },
    subtotalText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
    
    checkoutButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, height: 54, borderRadius: 27, gap: 10, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
    checkoutButtonDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
    checkoutButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15, letterSpacing: 0.5 },
});

export default CreateSaleScreen;