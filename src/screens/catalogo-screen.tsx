// src/screens/catalogo-screen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  Share, // 1. Importamos Share
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { PriceList, Product, useData } from '../../context/DataContext';
import { auth } from '../../db/firebase-service'; // 2. Importamos Auth
import { COLORS } from '../../styles/theme';

// ⚠️ REEMPLAZA ESTO CON TU DOMINIO REAL DE VERCEL O FIREBASE HOSTING
const WEB_APP_URL = "https://distribuidora-1de93.web.app"; 

// --- COMPONENTE DE TARJETA ---
const ProductCard = React.memo(({ 
  item, 
  qty, 
  index, 
  displayPrice, 
  onAdd, 
  onRemove,
  onImagePress, 
  onQtyPress    
}: { 
  item: Product, 
  qty: number, 
  index: number, 
  displayPrice: number, 
  onAdd: () => void, 
  onRemove: () => void,
  onImagePress: () => void,
  onQtyPress: () => void
}) => {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  useEffect(() => {
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, delay: index * 30 }).start();
  }, []);

  return (
    <Animated.View style={[styles.cardContainer, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.card}>
          <TouchableOpacity activeOpacity={0.9} onPress={onImagePress} style={styles.imageContainer}>
              {item.img ? (
                  <Image 
                    source={item.img} 
                    style={styles.productImage} 
                    contentFit="cover" 
                    transition={200} 
                    cachePolicy="memory-disk" 
                  />
              ) : (
                  <View style={styles.placeholderImage}>
                      <Ionicons name="image-outline" size={32} color={COLORS.disabled} />
                  </View>
              )}
              {qty > 0 && (
                  <View style={[styles.badgeContainer, { backgroundColor: COLORS.secondary }]}>
                    <Text style={styles.badgeText}>{qty}</Text>
                  </View>
              )}
          </TouchableOpacity>

          <View style={styles.infoContainer}>
              <Text numberOfLines={2} style={styles.productName}>{item.nombre}</Text>
              
              <Text style={[styles.productPrice, { color: COLORS.primary }]}>
                  ${displayPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </Text>
              
              {qty === 0 ? (
                  <TouchableOpacity style={styles.addButton} onPress={onAdd} activeOpacity={0.7}>
                      <Text style={styles.addButtonText}>Agregar</Text>
                  </TouchableOpacity>
              ) : (
                  <View style={[styles.qtyControls, { backgroundColor: COLORS.primary }]}>
                      <TouchableOpacity onPress={onRemove} style={styles.qtyBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                          <Ionicons name="remove" size={20} color="white" />
                      </TouchableOpacity>
                      
                      <TouchableOpacity onPress={onQtyPress} style={styles.qtyNumberContainer}>
                        <Text style={styles.qtyText} numberOfLines={1}>{qty}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={onAdd} style={styles.qtyBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                          <Ionicons name="add" size={20} color="white" />
                      </TouchableOpacity>
                  </View>
              )}
          </View>
      </View>
    </Animated.View>
  );
});

// --- MODAL SELECTOR DE LISTA ---
const PriceListSelectorModal = ({ visible, onClose, lists, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    lists: PriceList[]; 
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefault = useMemo(() => [
        { id: '', nombre: 'Precio Base (General)' }, 
        ...lists
    ], [lists]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Seleccionar Lista de Precios</Text>
                    </View>
                    <FlatList 
                        data={dataWithDefault} 
                        keyExtractor={(item) => item.id || item.nombre} 
                        renderItem={({ item }) => ( 
                            <TouchableOpacity 
                                style={styles.modalItem} 
                                onPress={() => { onSelect(item.nombre === 'Precio Base (General)' ? '' : item.nombre); onClose(); }}
                            >
                                <Text style={[styles.modalItemText, (item.nombre === selectedId || (selectedId === '' && item.id === '')) ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>
                                    {item.nombre}
                                </Text>
                                {(item.nombre === selectedId || (selectedId === '' && item.id === '')) && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View style={styles.separatorModal} />} 
                    />
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

export default function CatalogoScreen() {
  const navigation = useNavigation();
  const { products, categories, isLoading, priceLists } = useData(); 

  // --- Estados Locales ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({}); 

  const [selectedPriceList, setSelectedPriceList] = useState(''); 
  const [priceModalVisible, setPriceModalVisible] = useState(false);

  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [qtyModalVisible, setQtyModalVisible] = useState(false);
  const [tempQty, setTempQty] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const bottomBarAnim = useRef(new Animated.Value(150)).current; 

  // --- Helper para obtener precio ---
  const getProductPrice = (product: Product) => {
      if (selectedPriceList && product.preciosExtra && product.preciosExtra[selectedPriceList]) {
          return Number(product.preciosExtra[selectedPriceList]);
      }
      return Number(product.precio);
  };

  // --- Animación Barra Inferior ---
  useEffect(() => {
    const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
    if (totalItems > 0) {
      Animated.spring(bottomBarAnim, { toValue: 0, useNativeDriver: true, damping: 15 }).start();
    } else {
      Animated.timing(bottomBarAnim, { toValue: 150, duration: 300, useNativeDriver: true }).start();
    }
  }, [cart]);

  // --- Filtros ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory ? p.categoriaId === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // --- Carrito ---
  const updateCartQty = (id: string, quantity: number) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (quantity <= 0) delete newCart[id];
      else newCart[id] = quantity;
      return newCart;
    });
  };

  const addToCart = (id: string) => { updateCartQty(id, (cart[id] || 0) + 1); };
  const removeFromCart = (id: string) => { updateCartQty(id, (cart[id] || 0) - 1); };

  const handleManualQtySubmit = () => {
    if (editingProductId) {
        const qty = parseInt(tempQty, 10);
        if (!isNaN(qty)) updateCartQty(editingProductId, qty);
    }
    setQtyModalVisible(false);
    setTempQty('');
    setEditingProductId(null);
  };

  const openManualQty = (id: string, currentQty: number) => {
      setEditingProductId(id);
      setTempQty(currentQty.toString());
      setQtyModalVisible(true);
  };

  const getTotalPrice = () => {
    return Object.entries(cart).reduce((total, [id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return total;
      const price = getProductPrice(product);
      return total + (price * qty);
    }, 0);
  };

  const handleContinue = () => {
    const itemsForSale = Object.entries(cart).map(([id, quantity]) => {
      const product = products.find(p => p.id === id);
      return { ...product, cantidad: quantity }; 
    });
    // @ts-ignore 
    navigation.navigate('SelectClientForSale', { cartItems: itemsForSale });
  };

  // 🚀 3. FUNCIÓN PARA COMPARTIR CATÁLOGO PERSONALIZADO
  const handleShareCatalog = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Generamos el link: tudominio.com/catalogo/Lista?v=UID
    const listPath = selectedPriceList ? `/${encodeURIComponent(selectedPriceList)}` : '';
    const link = `${WEB_APP_URL}/catalogo${listPath}?v=${currentUser.uid}`;

    try {
      await Share.share({
        message: `Hola! 👋 Te comparto mi catálogo digital${selectedPriceList ? ` (${selectedPriceList})` : ''}. Miralo y haceme tu pedido por acá: \n\n${link}`,
      });
    } catch (error) {
      console.log("Error sharing:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>Catálogo</Text>
            
            {/* Botonera Header (Lista + Compartir) */}
            <View style={styles.headerActions}>
                <TouchableOpacity 
                    style={styles.priceListPill} 
                    onPress={() => setPriceModalVisible(true)}
                >
                    <Text style={styles.priceListText} numberOfLines={1}>
                        {selectedPriceList || 'Base'}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={COLORS.textSecondary} />
                </TouchableOpacity>

                {/* ✅ BOTÓN COMPARTIR LINK */}
                <TouchableOpacity 
                    style={styles.shareBtn} 
                    onPress={handleShareCatalog}
                >
                    <Ionicons name="share-outline" size={20} color="white" />
                </TouchableOpacity>
            </View>
        </View>
        
        {/* BARRA DE BÚSQUEDA */}
        <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
            <TextInput 
                placeholder="Buscar producto..." 
                placeholderTextColor={COLORS.textSecondary}
                style={styles.searchInput}
                value={searchTerm}
                onChangeText={setSearchTerm}
            />
            {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm('')}>
                    <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
            )}
        </View>

        {/* CHIPS CATEGORÍAS */}
        <View style={{ height: 40 }}>
            <FlatList 
                horizontal
                data={[{ id: 'all', nombre: 'Todo' }, ...categories]}
                keyExtractor={item => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 4 }}
                renderItem={({ item }) => {
                    const isActive = (selectedCategory === null && item.id === 'all') || selectedCategory === item.id;
                    return (
                        <TouchableOpacity 
                            style={[styles.chip, isActive && styles.chipActive]}
                            onPress={() => setSelectedCategory(item.id === 'all' ? null : item.id)}
                        >
                            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{item.nombre}</Text>
                        </TouchableOpacity>
                    );
                }}
            />
        </View>
      </View>

      {/* GRILLA DE PRODUCTOS */}
      <FlatList
        data={filteredProducts}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <ProductCard 
            item={item} 
            index={index} 
            qty={cart[item.id] || 0}
            displayPrice={getProductPrice(item)}
            onAdd={() => addToCart(item.id)}
            onRemove={() => removeFromCart(item.id)}
            onImagePress={() => setZoomImage(item.img || null)}
            onQtyPress={() => openManualQty(item.id, cart[item.id] || 0)}
          />
        )}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={!isLoading ? (
            <View style={styles.emptyState}>
                <Ionicons name="basket-outline" size={64} color={COLORS.disabled} />
                <Text style={{ color: COLORS.textSecondary, marginTop: 10 }}>No hay productos</Text>
            </View>
        ) : null}
      />

      {/* BARRA INFERIOR FLOTANTE */}
      <Animated.View style={[styles.bottomBar, { transform: [{ translateY: bottomBarAnim }] }]}>
         <View style={styles.bottomBarInfo}>
             <Text style={styles.totalLabel}>Total Estimado ({selectedPriceList || 'Base'}):</Text>
             <Text style={styles.totalValue}>${getTotalPrice().toFixed(2)}</Text>
             <Text style={styles.totalItems}>{Object.values(cart).reduce((a, b) => a + b, 0)} unidades</Text>
         </View>
         <TouchableOpacity 
            style={[styles.checkoutButton, { backgroundColor: COLORS.primary }]} 
            onPress={handleContinue}
         >
             <Text style={styles.checkoutButtonText}>Continuar</Text>
             <Ionicons name="arrow-forward" size={18} color="white" />
         </TouchableOpacity>
      </Animated.View>

      {/* --- MODAL ZOOM IMAGEN --- */}
      <Modal visible={!!zoomImage} transparent={true} animationType="fade">
          <View style={styles.modalImageContainer}>
              <TouchableOpacity style={styles.closeImageBtn} onPress={() => setZoomImage(null)}>
                  <Ionicons name="close" size={30} color="white" />
              </TouchableOpacity>
              {zoomImage && (
                  <Image 
                    source={zoomImage} 
                    style={styles.fullImage} 
                    contentFit="contain"
                  />
              )}
          </View>
      </Modal>

      {/* --- MODAL INPUT CANTIDAD --- */}
      <Modal visible={qtyModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalQtyOverlay}>
            <TouchableWithoutFeedback onPress={() => setQtyModalVisible(false)}>
                <View style={styles.modalQtyBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.modalQtyContent}>
                <Text style={styles.modalQtyTitle}>Ingresar Cantidad</Text>
                <TextInput
                    style={styles.qtyInput}
                    value={tempQty}
                    onChangeText={setTempQty}
                    keyboardType="number-pad"
                    autoFocus
                    selectTextOnFocus
                />
                <View style={styles.modalQtyButtons}>
                    <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setQtyModalVisible(false)}>
                        <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={handleManualQtySubmit}>
                        <Text style={styles.confirmBtnText}>Confirmar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL SELECTOR DE LISTA --- */}
      <PriceListSelectorModal 
        visible={priceModalVisible} 
        onClose={() => setPriceModalVisible(false)} 
        lists={priceLists} 
        selectedId={selectedPriceList} 
        onSelect={setSelectedPriceList} 
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  
  // HEADER
  header: { 
    paddingHorizontal: 16, 
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 10, 
    paddingBottom: 12, 
    backgroundColor: '#FFFFFF', 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9', 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
    zIndex: 10 
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
  
  headerActions: { flexDirection: 'row', gap: 8 },

  // PILL PRECIO
  priceListPill: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', 
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6,
      borderWidth: 1, borderColor: '#E2E8F0'
  },
  priceListText: { fontSize: 12, fontWeight: '700', color: '#475569', maxWidth: 100 },

  // BOTON SHARE
  shareBtn: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: '#10B981', // Verde Whatsapp/Share
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#10B981', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3
  },

  // BUSCADOR
  searchBar: { 
    flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, 
    height: 44, alignItems: 'center', marginBottom: 12
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1E293B', height: '100%' },

  // CHIPS
  chip: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#F8FAFC', borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0', height: 32 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: '#64748B', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#FFF' },
  
  listContent: { padding: 8, paddingBottom: 120 },
  
  // TARJETA
  cardContainer: { flex: 1, margin: 6, maxWidth: '48%' }, 
  card: { 
      backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', height: 260,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3
  },
  
  imageContainer: { height: 140, width: '100%', backgroundColor: '#F8FAFC', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  productImage: { width: '100%', height: '100%' },
  placeholderImage: { opacity: 0.5 },
  
  badgeContainer: { position: 'absolute', top: 8, right: 8, borderRadius: 10, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  
  infoContainer: { padding: 10, flex: 1, justifyContent: 'space-between' },
  productName: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 4, height: 36, lineHeight: 18 },
  productPrice: { fontSize: 16, fontWeight: '800' },
  
  // BOTONES
  addButton: { marginTop: 8, backgroundColor: '#F1F5F9', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  
  qtyControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, borderRadius: 8, padding: 3, height: 34 },
  qtyBtn: { width: 28, alignItems: 'center', justifyContent: 'center' },
  qtyNumberContainer: { flex: 1, alignItems: 'center' },
  qtyText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
  emptyState: { alignItems: 'center', marginTop: 60 },
  
  // BARRA INFERIOR
  bottomBar: { 
      position: 'absolute', bottom: 24, left: 16, right: 16, 
      backgroundColor: '#1E293B', borderRadius: 20, flexDirection: 'row', alignItems: 'center', padding: 16, 
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 10 
  },
  bottomBarInfo: { flex: 1 },
  totalLabel: { color: '#94A3B8', fontSize: 10, textTransform: 'uppercase', fontWeight: '700' },
  totalValue: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  totalItems: { color: '#CBD5E1', fontSize: 12, fontWeight: '500' },
  checkoutButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 },
  checkoutButtonText: { color: 'white', fontWeight: 'bold', marginRight: 6, fontSize: 14 },

  // MODALES
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: '85%', backgroundColor: 'white', borderRadius: 24, padding: 0, overflow: 'hidden', maxHeight: '60%' },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
  modalItemText: { fontSize: 16, color: '#475569' },
  separatorModal: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 16 },

  modalImageContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '80%' },
  closeImageBtn: { position: 'absolute', top: 50, right: 20, padding: 10, zIndex: 20 },

  modalQtyOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalQtyBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalQtyContent: { width: '80%', backgroundColor: 'white', borderRadius: 24, padding: 24, elevation: 10 },
  modalQtyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center', color: '#1E293B' },
  qtyInput: { borderWidth: 2, borderColor: COLORS.primary, borderRadius: 12, padding: 10, fontSize: 28, textAlign: 'center', marginBottom: 24, color: '#1E293B', fontWeight: 'bold' },
  modalQtyButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  confirmBtn: { backgroundColor: COLORS.primary },
  cancelBtnText: { color: '#64748B', fontWeight: '700' },
  confirmBtnText: { color: 'white', fontWeight: 'bold' },
});