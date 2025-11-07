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
import { COLORS } from '../../styles/theme';


// --- ¡NUEVO! Función auxiliar para Estilos e Iconos Dinámicos ---
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
                color: COLORS.primary, // Amarillo
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
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    // --- ¡NUEVO! RenderItem optimizado con useCallback ---
    const renderPromoItem = useCallback(({ item }: { item: Promotion }) => {
        // Obtenemos los detalles dinámicos
        const { icon, color, label } = getPromoDetails(item.tipo);
        
        return (
            <View style={styles.promoCard}>
                <View style={[styles.promoIconContainer, { backgroundColor: `${color}20` }]}>
                    <Feather name={icon} size={24} color={color} />
                </View>
                <View style={styles.promoTextContainer}>
                    <Text style={styles.promoTitle}>{item.nombre}</Text>
                    <Text style={[styles.promoSubtitle, { color: color }]}>{label}</Text>
                    <Text style={styles.promoDescription}>
                        Aplica a {item.productoIds?.length || 0} producto(s)
                        {item.clienteIds && item.clienteIds.length > 0 ? ` y ${item.clienteIds.length} cliente(s)` : ''}.
                    </Text>
                </View>
            </View>
        );
    }, []);
    // --- FIN de RenderItem ---

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            {/* --- HEADER MEJORADO --- */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Promociones</Text>
                <View style={styles.headerButton} /> {/* Placeholder para centrar el título */}
            </View>

            <FlatList
                data={activePromotions}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="tag" size={48} color={COLORS.textSecondary} />
                        <Text style={styles.emptyText}>No hay promociones activas en este momento.</Text>
                    </View>
                }
                renderItem={renderPromoItem} // Usamos la función memoizada
            />
        </View>
    );
};

// --- ESTILOS MEJORADOS ---
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: COLORS.backgroundEnd 
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
        alignItems: 'center' 
    },
    // --- ESTILO DE HEADER ESTANDARIZADO ---
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingTop: (StatusBar.currentHeight || 0) + 20,
        paddingBottom: 20, 
        paddingHorizontal: 10 // Reducido para que el botón sea más accesible
    },
    headerButton: { 
        padding: 10,
        width: 44, // Ancho fijo para centrar bien el título
        alignItems: 'center',
    },
    title: { 
        fontSize: 22, // Tamaño más estándar
        fontWeight: 'bold', 
        color: COLORS.textPrimary 
    },
    // --- FIN DE HEADER ---
    listContentContainer: { 
        paddingHorizontal: 20, 
        paddingTop: 10, 
        paddingBottom: 40 // Más espacio al final
    },
    emptyContainer: { 
        alignItems: 'center', 
        paddingTop: 100, // Más centrado
        gap: 20 // Espacio entre icono y texto
    },
    emptyText: { 
        fontSize: 17, 
        color: COLORS.textSecondary, 
        textAlign: 'center' 
    },
    // --- ESTILO DE TARJETA MEJORADO ---
    promoCard: {
        backgroundColor: COLORS.glass,
        borderRadius: 16, // Más redondeado
        padding: 16,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        flexDirection: 'row',
        alignItems: 'center', // Alinea icono y texto
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    promoIconContainer: {
        width: 50, // Círculo perfecto
        height: 50,
        borderRadius: 25, // Círculo perfecto
        justifyContent: 'center', // Icono centrado
        alignItems: 'center',
        marginRight: 16,
        // El color de fondo se aplica dinámicamente
    },
    promoTextContainer: {
        flex: 1,
    },
    promoTitle: { // Título de la promo
        fontSize: 17, // Más legible
        fontWeight: '600', // Semi-bold
        color: COLORS.textPrimary,
        marginBottom: 4, // Espacio
    },
    promoSubtitle: { // Tipo de promo (ej. Precio Especial)
        fontSize: 14,
        fontWeight: 'bold',
        // El color se aplica dinámicamente
        marginBottom: 5,
    },
    promoDescription: { // Descripción (ej. Aplica a 5 productos)
        fontSize: 13,
        color: COLORS.textSecondary,
        lineHeight: 18, // Mejor espaciado de línea
    },
});

export default PromotionsScreen;