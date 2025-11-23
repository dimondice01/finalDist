// src/screens/promotions.tsx
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { PromotionsScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Promotion, useData } from '../../context/DataContext';
import { COLORS, SIZES } from '../../styles/theme';

// --- Función auxiliar para Estilos e Iconos Dinámicos ---
const getPromoDetails = (tipo: string) => {
    switch (tipo) {
        case 'precio_especial':
            return { 
                icon: 'dollar-sign' as keyof typeof Feather.glyphMap, 
                color: COLORS.success, 
                label: 'Precio Especial' 
            };
        case 'LLEVA_X_PAGA_Y':
            return { 
                icon: 'gift' as keyof typeof Feather.glyphMap, 
                color: COLORS.primary, 
                label: 'Ofertón' // Etiqueta más comercial
            };
        case 'DESCUENTO_POR_CANTIDAD':
            return { 
                icon: 'percent' as keyof typeof Feather.glyphMap, 
                color: COLORS.warning, 
                label: 'Descuento Volúmen' 
            };
        default:
            return { 
                icon: 'tag' as keyof typeof Feather.glyphMap, 
                color: COLORS.textSecondary, 
                label: 'Promoción' 
            };
    }
};

const PromotionsScreen = ({ navigation }: PromotionsScreenProps) => {
    const { promotions, isLoading } = useData();

    // Filtramos activas
    const activePromotions = useMemo(() => 
        promotions.filter(p => p.estado === 'activa'), 
    [promotions]);
    
    if (isLoading && activePromotions.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>Cargando promociones...</Text>
            </View>
        );
    }

    const renderPromoItem = useCallback(({ item }: { item: Promotion & { productoNombre?: string } }) => {
        const { icon, color, label } = getPromoDetails(item.tipo);
        
        // --- Lógica para extraer la "Oferta Matemática" ---
        let offerBadge = null;
        if (item.tipo === 'LLEVA_X_PAGA_Y' && item.condicion?.cantidadMinima && item.beneficio?.cantidadAPagar) {
            offerBadge = `${item.condicion.cantidadMinima}x${item.beneficio.cantidadAPagar}`;
        } else if (item.tipo === 'DESCUENTO_POR_CANTIDAD' && item.beneficio?.porcentaje) {
            offerBadge = `-${item.beneficio.porcentaje}%`;
        }

        return (
            <View style={styles.promoCard}>
                {/* ICONO LATERAL */}
                <View style={[styles.promoIconContainer, { backgroundColor: `${color}15` }]}> 
                    <Feather name={icon} size={24} color={color} />
                    {offerBadge && (
                         <View style={[styles.badgePill, { backgroundColor: color }]}>
                             <Text style={styles.badgeText}>{offerBadge}</Text>
                         </View>
                    )}
                </View>

                {/* CONTENIDO TEXTUAL */}
                <View style={styles.promoTextContainer}>
                    {/* Título de la Promo */}
                    <Text style={styles.promoTitle}>{item.nombre}</Text>
                    
                    {/* Producto Afectado (Si existe en DB) */}
                    {item.productoNombre && (
                        <Text style={styles.productName} numberOfLines={1}>
                           <Feather name="box" size={12} color={COLORS.textSecondary} /> {item.productoNombre}
                        </Text>
                    )}

                    {/* Descripción Humana (Prioridad 1) */}
                    {item.descripcion ? (
                        <Text style={styles.promoDescription}>{item.descripcion}</Text>
                    ) : (
                        // Fallback si no hay descripción
                        <Text style={styles.promoDescription}>
                            Aplica a {item.productoIds?.length || 0} producto(s).
                        </Text>
                    )}
                    
                    {/* Etiqueta de Tipo */}
                    <View style={styles.metaRow}>
                        <Text style={[styles.promoTypeLabel, { color: color }]}>{label}</Text>
                        {item.condicion?.cantidadMinima && (
                            <Text style={styles.minQtyText}>Mínimo: {item.condicion.cantidadMinima} u.</Text>
                        )}
                    </View>
                </View>
            </View>
        );
    }, []);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
            
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>PROMOCIONES</Text>
                <View style={styles.headerButton} /> 
            </View>

            <FlatList
                data={activePromotions}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="tag" size={48} color={COLORS.disabled} /> 
                        <Text style={styles.emptyText}>No hay promociones activas.</Text>
                    </View>
                }
                renderItem={renderPromoItem} 
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundStart },
    loaderText: { fontSize: SIZES.body, color: COLORS.textSecondary, marginTop: SIZES.medium },
    
    // Header
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 10,
        paddingBottom: 15, 
        paddingHorizontal: 15, 
        backgroundColor: COLORS.backgroundEnd, 
        borderBottomWidth: 1,
        borderColor: COLORS.glassBorder,
        elevation: 2,
    },
    headerButton: { width: 40, alignItems: 'center' },
    title: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
    
    listContentContainer: { padding: 15, paddingBottom: 40 },
    
    // Tarjeta
    promoCard: {
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: 12, 
        padding: 12, 
        marginBottom: 12, 
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        flexDirection: 'row',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    promoIconContainer: {
        width: 60, 
        borderRadius: 8, 
        justifyContent: 'center', 
        alignItems: 'center',
        marginRight: 12,
        position: 'relative', // Para el badge absoluto
    },
    badgePill: {
        position: 'absolute',
        bottom: 4,
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    promoTextContainer: { flex: 1, justifyContent: 'center' },
    
    promoTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 4 },
    productName: { fontSize: 13, color: COLORS.textPrimary, marginBottom: 4, fontWeight: '500' },
    promoDescription: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8, lineHeight: 18 },
    
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    promoTypeLabel: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
    minQtyText: { fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic' },

    emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 15 },
    emptyText: { fontSize: 16, color: COLORS.textSecondary },
});

export default PromotionsScreen;