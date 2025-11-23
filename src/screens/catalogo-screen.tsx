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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

// ✅ IMPORTANTE: Consumimos del Contexto, no de Firebase directo
import { Product, useData } from '../../context/DataContext';
import { COLORS, SIZES } from '../../styles/theme';

// (Eliminamos las interfaces locales Product/Category para usar las globales)

// --- COMPONENTE DE TARJETA OPTIMIZADO (Sin cambios lógicos, solo props) ---
const ProductCard = React.memo(({ 
  item, 
  qty, 
  index, 
  onAdd, 
  onRemove,
  onImagePress, 
  onQtyPress    
}: { 
  item: Product, 
  qty: number, 
  index: number, 
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
              <Text style={[styles.productPrice, { color: COLORS.primary }]}>${item.precio.toFixed(2)}</Text>
              
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

export default function CatalogoScreen() {
  const navigation = useNavigation();
  
  // ✅ CORRECCIÓN MAESTRA: Usamos los datos globales ya cargados
  const { products, categories, isLoading } = useData(); 

  // --- Estados Locales de UI ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({}); 

  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [qtyModalVisible, setQtyModalVisible] = useState(false);
  const [tempQty, setTempQty] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const bottomBarAnim = useRef(new Animated.Value(150)).current; 

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

  const addToCart = (id: string) => {
    updateCartQty(id, (cart[id] || 0) + 1);
  };

  const removeFromCart = (id: string) => {
    updateCartQty(id, (cart[id] || 0) - 1);
  };

  const handleManualQtySubmit = () => {
    if (editingProductId) {
        const qty = parseInt(tempQty, 10);
        if (!isNaN(qty)) {
            updateCartQty(editingProductId, qty);
        }
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
      return total + (product ? product.precio * qty : 0);
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catálogo</Text>
        
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
                            style={[
                                styles.chip, 
                                isActive && { backgroundColor: COLORS.primary, borderColor: COLORS.primary } 
                            ]}
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
             <Text style={styles.totalLabel}>Total Estimado:</Text>
             <Text style={styles.totalValue}>${getTotalPrice().toFixed(2)}</Text>
             <Text style={styles.totalItems}>{Object.values(cart).reduce((a, b) => a + b, 0)} unidades</Text>
         </View>
         <TouchableOpacity 
            style={[styles.checkoutButton, { backgroundColor: COLORS.primary }]} 
            onPress={handleContinue}
         >
             <Text style={styles.checkoutButtonText}>Seleccionar Cliente</Text>
             <Ionicons name="person-outline" size={18} color="white" />
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundStart },
  
  // HEADER
  header: { 
    paddingHorizontal: SIZES.medium, 
    paddingTop: (StatusBar.currentHeight || 0) + 10, 
    paddingBottom: 10, 
    backgroundColor: COLORS.backgroundEnd, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.glassBorder, 
    elevation: 2, 
    zIndex: 10 
  },
  headerTitle: { 
    fontSize: SIZES.h2, 
    fontWeight: 'bold', 
    color: COLORS.textPrimary, 
    marginBottom: 10 
  },
  
  // BUSCADOR
  searchBar: { 
    flexDirection: 'row', 
    backgroundColor: COLORS.backgroundStart, 
    borderRadius: SIZES.radius, 
    paddingHorizontal: SIZES.medium, 
    height: 50, 
    alignItems: 'center', 
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.body,
    color: COLORS.textPrimary,
    height: '100%'
  },

  chip: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: COLORS.backgroundEnd, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#e0e0e0', height: 32 },
  chipText: { color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  
  listContent: { padding: 8, paddingBottom: 100 },
  
  // TARJETA
  cardContainer: { flex: 1, margin: 6, maxWidth: '48%' }, 
  card: { backgroundColor: COLORS.backgroundEnd, borderRadius: 16, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, height: 250 },
  
  imageContainer: { height: 130, width: '100%', backgroundColor: '#f0f0f0', position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  placeholderImage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  badgeContainer: { position: 'absolute', top: 8, right: 8, borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, zIndex: 2 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  
  infoContainer: { padding: 10, flex: 1, justifyContent: 'space-between' },
  productName: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 4, height: 34 },
  productPrice: { fontSize: 15, fontWeight: 'bold' },
  
  // BOTONES
  addButton: { marginTop: 8, backgroundColor: '#f3f4f6', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: '#4b5563', fontWeight: '600', fontSize: 13 },
  
  qtyControls: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      marginTop: 8, 
      borderRadius: 8, 
      padding: 4,
      height: 36 
  },
  qtyBtn: { paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', height: '100%' },
  qtyNumberContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, marginHorizontal: 2, height: 28 },
  qtyText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
  emptyState: { alignItems: 'center', marginTop: 50 },
  
  // BARRA INFERIOR
  bottomBar: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: '#1f2937', borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 16, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  bottomBarInfo: { flex: 1 },
  totalLabel: { color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' },
  totalValue: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  totalItems: { color: '#d1d5db', fontSize: 12 },
  checkoutButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  checkoutButtonText: { color: 'white', fontWeight: 'bold', marginRight: 6, fontSize: 13 },

  // MODAL IMAGEN
  modalImageContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '80%' },
  closeImageBtn: { position: 'absolute', top: 40, right: 20, padding: 10, zIndex: 20 },

  // MODAL CANTIDAD
  modalQtyOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalQtyBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalQtyContent: { width: '80%', backgroundColor: 'white', borderRadius: 16, padding: 20, elevation: 5 },
  modalQtyTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: COLORS.textPrimary },
  qtyInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 24, textAlign: 'center', marginBottom: 20, color: COLORS.textPrimary },
  modalQtyButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  cancelBtn: { backgroundColor: '#f3f4f6' },
  confirmBtn: { backgroundColor: COLORS.primary || '#008080' },
  cancelBtnText: { color: '#666', fontWeight: '600' },
  confirmBtnText: { color: 'white', fontWeight: 'bold' },
});