// src/screens/promotions.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// --- INICIO DE CAMBIOS: Importamos hooks ---
import React, { useCallback, useMemo } from 'react';
// --- FIN DE CAMBIOS ---
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Navegación ---
import { PromotionsScreenProps } from '../navigation/AppNavigator';

// --- Contexto y Estilos ---
import { Promotion, useData } from '../../context/DataContext';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';


// --- Función auxiliar para Estilos e Iconos Dinámicos ---
const getPromoDetails = (tipo: Promotion['tipo']) => {
    switch (tipo) {
        case 'precio_especial':
            return { 
                icon: 'dollar-sign' as keyof typeof Feather.glyphMap, 
                color: COLORS.success, // Verde
                label: 'Precio Especial' 
            };
        case 'LLEVA_X_PAGA_Y':
            return { 
                icon: 'gift' as keyof typeof Feather.glyphMap, 
                color: COLORS.primary, // Primario (Verde Esmeralda)
                label: 'Lleva X, Paga Y' 
            };
        case 'DESCUENTO_POR_CANTIDAD':
            return { 
                icon: 'percent' as keyof typeof Feather.glyphMap, 
                color: COLORS.warning, // Naranja
                label: 'Descuento por Cantidad' 
            };
        default:
            return { 
                icon: 'tag' as keyof typeof Feather.glyphMap, 
                color: COLORS.textSecondary, // Gris
                label: tipo // Muestra el tipo si no se reconoce
            };
    }
};
// --- FIN de la función auxiliar ---


const PromotionsScreen = ({ navigation }: PromotionsScreenProps) => {
    const { promotions, isLoading } = useData();

    // Filtramos las promociones para solo mostrar las válidas
    const activePromotions = useMemo(() => 
        promotions.filter(p => p.nombre && p.tipo), 
    [promotions]);
    
    
    if (isLoading && activePromotions.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>Cargando promociones...</Text>
            </View>
        );
    }

    // --- RenderItem optimizado con useCallback ---
    const renderPromoItem = useCallback(({ item }: { item: Promotion }) => {
        // Obtenemos los detalles dinámicos
        const { icon, color, label } = getPromoDetails(item.tipo);
        
        return (
            <View style={styles.promoCard}>
                <View style={[styles.promoIconContainer, { backgroundColor: `${color}20` }]}> 
                    <Feather name={icon} size={SIZES.h3} color={color} />
                </View>
                <View style={styles.promoTextContainer}>
                    {/* Título: SIZES.body (16) */}
                    <Text style={styles.promoTitle}>{item.nombre}</Text>
                    {/* Subtítulo: SIZES.caption (14) */}
                    <Text style={[styles.promoSubtitle, { color: color }]}>{label}</Text>
                    {/* Descripción: SIZES.xsmallText (12) */}
                    <Text style={styles.promoDescription}>
                        <Text>Aplica a {item.productoIds?.length || 0} producto(s)</Text>
                        {item.clienteIds && item.clienteIds.length > 0 ? <Text> y {item.clienteIds.length} cliente(s)</Text> : <Text></Text>}.
                    </Text>
                </View>
            </View>
        );
    }, []);
    // --- FIN de RenderItem ---

    return (
        <View style={styles.container}>
            {/* Usamos dark-content para el fondo claro */}
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} /> 
             {/* Usamos backgroundStart en ambos puntos para un fondo plano y limpio */}
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
            
            {/* --- HEADER MEJORADO --- */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    {/* Usamos SIZES.large (24) */}
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                {/* Usamos SIZES.h2 (24) o SIZES.h3 (20) para títulos. Usaré H2 para prominencia. */}
                <Text style={styles.title}>PROMOCIONES ACTIVAS</Text>
                <View style={styles.headerButton} /> {/* Placeholder para centrar el título */}
            </View>

            <FlatList
                data={activePromotions}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                         {/* Usamos SIZES.h1 (32) para iconos grandes */}
                        <Feather name="tag" size={SIZES.h1} color={COLORS.textSecondary} /> 
                        <Text style={styles.emptyText}>No hay promociones activas en este momento.</Text>
                    </View>
                }
                renderItem={renderPromoItem} 
            />
        </View>
    );
};

// --- ESTILOS MEJORADOS (USANDO SIZES SEMÁNTICOS) ---
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: COLORS.backgroundStart // Fondo gris claro principal
    },
    background: { 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: '100%' 
    },
    loadingContainer: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: COLORS.backgroundStart 
    },
    loaderText: {
        fontSize: SIZES.body,
        color: COLORS.textSecondary,
        marginTop: SIZES.medium,
    },
    // --- ESTILO DE HEADER ESTANDARIZADO ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.medium,
        paddingBottom: SIZES.medium, 
        paddingHorizontal: SIZES.small, 
        backgroundColor: COLORS.backgroundEnd, // Fondo blanco para destacarse
        borderBottomWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
    },
    headerButton: { 
        padding: SIZES.small,
        width: SIZES.xl, // 32px
        alignItems: 'center',
    },
    title: { 
        fontSize: SIZES.h3, // 20px
        fontWeight: 'bold', 
        color: COLORS.textPrimary,
        textTransform: 'uppercase', 
    },
    // --- FIN DE HEADER ---
    listContentContainer: { 
        paddingHorizontal: SIZES.large, 
        paddingTop: SIZES.medium, 
        paddingBottom: SIZES.xl, 
    },
    emptyContainer: { 
        alignItems: 'center', 
        paddingTop: SIZES.xl * 2,
        gap: SIZES.medium, 
    },
    emptyText: { 
        fontSize: SIZES.body, // 16px
        color: COLORS.textSecondary, 
        textAlign: 'center' 
    },
    // --- ESTILO DE TARJETA MEJORADO ---
    promoCard: {
        backgroundColor: COLORS.backgroundEnd, // Fondo blanco
        borderRadius: SIZES.radius, 
        padding: SIZES.medium, 
        marginBottom: SIZES.medium, 
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    promoIconContainer: {
        width: SIZES.xxl + SIZES.xsmall, // 44px
        height: SIZES.xxl + SIZES.xsmall,
        borderRadius: SIZES.radiusSmall, // Cuadrado redondeado (8px)
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SIZES.medium, 
    },
    promoTextContainer: {
        flex: 1,
    },
    promoTitle: { 
        fontSize: SIZES.body, // 16px
        fontWeight: '700', 
        color: COLORS.textPrimary,
        marginBottom: SIZES.xsmall / 2, 
    },
    promoSubtitle: { 
        fontSize: SIZES.caption, // 14px
        fontWeight: 'bold',
        marginBottom: SIZES.xsmall / 2,
        textTransform: 'uppercase', 
    },
    promoDescription: { 
        fontSize: SIZES.xsmallText, // 12px
        color: COLORS.textSecondary,
        lineHeight: SIZES.medium, 
    },
});

export default PromotionsScreen;