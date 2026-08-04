// src/screens/home.tsx

import { Feather } from '@expo/vector-icons';
import { Timestamp } from '@react-native-firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// --- Importaciones de Navegación ---
import { HomeScreenProps } from '../navigation/AppNavigator';

// --- Contextos y DB ---
import { Sale, useData, Vendor } from '../../context/DataContext';
import { auth } from '../../db/firebase-service';

// --- Estilos: Importamos el tema centralizado ---
import { COLORS } from '../../styles/theme';

const { width } = Dimensions.get('window');
const GRID_CARD_WIDTH = (width - 48 - 16) / 2; 

// --- COMPONENTE LOGO HEADER (Adaptado al Tema) ---
const NoarHeaderLogo = () => (
    <View style={styles.logoContainer}>
        {/* Isotipo */}
        <View style={styles.logoIconBox}>
            <Text style={styles.logoSymbol}>N</Text>
        </View>
        {/* Logotipo Textual */}
        <View>
            <Text style={styles.brandName}>
                NOAR <Text style={styles.brandSuffix}>ERP</Text>
            </Text>
            <Text style={styles.brandSlogan}>SISTEMA INTEGRAL</Text>
        </View>
    </View>
);

// --- INTERFACES ---
interface ToolCardProps {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    color: string;
    onPress: () => void;
}

// --- Estilos de Estado (Colores Pasteles) ---
const getStatusStyles = (status: Sale['estado']) => {
    switch (status) {
        case 'Pagada': return { bg: '#ECFDF5', text: '#059669', icon: 'check-circle' as const }; 
        case 'Adeuda': return { bg: '#FFFBEB', text: '#D97706', icon: 'alert-circle' as const }; 
        case 'Pendiente de Entrega': return { bg: '#F0F9FF', text: '#0284C7', icon: 'truck' as const }; 
        case 'Web: Pendiente': return { bg: '#FDF2F8', text: '#DB2777', icon: 'shopping-cart' as const }; 
        case 'Anulada': return { bg: '#FEF2F2', text: '#DC2626', icon: 'x-circle' as const }; 
        default: return { bg: '#F9FAFB', text: '#6B7280', icon: 'help-circle' as const }; 
    }
};

const HomeScreen = ({ navigation }: HomeScreenProps) => { 
    const { sales, vendors, isLoading: isDataLoading, refreshAllData } = useData();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const currentVendedor = useMemo(() => {
        const currentUser = auth.currentUser;
        if (!currentUser || !vendors || vendors.length === 0) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid || v.id === currentUser.uid);
    }, [vendors]);

    // --- Lógica de Ventas Recientes ---
    const recentSales = useMemo(() => {
        const getDate = (sale: Sale) => {
            const fecha = sale.fecha;
            if (!fecha) return 0;
            if (fecha instanceof Date) return fecha.getTime();
            if (fecha instanceof Timestamp) return fecha.toMillis();
            // @ts-ignore
            if (fecha.seconds) return fecha.seconds * 1000;
            return 0;
        };
        return sales
            // Cobros legacy que quedaron guardados como venta (antes de separar la colección
            // cobranzas) no son ventas reales, no deben aparecer como "Venta Reciente".
            .filter(s => s.tipo !== 'cobranza' && (s.tipo as string) !== 'cobro' && !s.ventaOriginalId)
            .sort((a, b) => getDate(b) - getDate(a))
            .slice(0, 5);
    }, [sales]);

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try { await refreshAllData(); } 
        catch (error) { console.error("Error refresh:", error); } 
        finally { setIsRefreshing(false); }
    }, [refreshAllData]);

    const handleLogout = async () => {
        Alert.alert("Cerrar Sesión", "¿Estás seguro?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Salir", style: "destructive", onPress: async () => {
                setIsLoggingOut(true);
                try { await auth.signOut(); } catch (e) { setIsLoggingOut(false); }
            }},
        ]);
    };

    const formatCurrency = (value: number) => `$${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const formatDate = (date: Sale['fecha']) => {
        try {
            let d: Date;
            if (date instanceof Date) d = date;
            else if (date instanceof Timestamp) d = date.toDate();
            // @ts-ignore
            else d = new Date((date?.seconds || 0) * 1000);
            if (isNaN(d.getTime())) return 'Pendiente';
            return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' });
        } catch (e) { return "-"; }
    };

    if (isDataLoading || isLoggingOut) { 
        return (
            <View style={styles.fullScreenLoader}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }
    
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
            
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
            >
                {/* --- HEADER CON LOGO GRANDE --- */}
                <View style={styles.header}>
                    <View>
                        {/* LOGO PRINCIPAL */}
                        <NoarHeaderLogo />
                        
                        {/* NOMBRE DEL VENDEDOR (Pequeño) */}
                        <Text style={styles.greeting}>
                            Hola, <Text style={styles.userName}>{currentVendedor?.nombreCompleto?.split(' ')[0] || 'Vendedor'}</Text>
                        </Text>
                    </View>

                    <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                        <Feather name="power" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* --- MI CARTERA --- */}
                <TouchableOpacity activeOpacity={0.95} onPress={() => navigation.navigate('ClientList')} style={styles.mainCardContainer}>
                    <LinearGradient
                        colors={[COLORS.textPrimary, '#1e293b']} // Usamos textPrimary para mantener la identidad oscura
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.mainCardGradient}
                    >
                        <View style={styles.mainCardContent}>
                            <View style={styles.iconCircle}><Feather name="users" size={22} color={COLORS.textPrimary} /></View>
                            <View>
                                <Text style={styles.mainCardTitle}>Mis Clientes</Text>
                                <Text style={styles.mainCardSubtitle}>Gestionar cartera</Text>
                            </View>
                        </View>
                        <View style={styles.arrowCircle}><Feather name="chevron-right" size={20} color="#FFF" /></View>
                    </LinearGradient>
                </TouchableOpacity>

                {/* --- ACCESOS RÁPIDOS --- */}
                <Text style={styles.sectionHeader}>Herramientas</Text>
                <View style={styles.toolsGrid}>
                    <ToolCard icon="grid" title="Catálogo" color="#6366F1" onPress={() => navigation.navigate('Catalogo')} />
                    <ToolCard icon="user-plus" title="Nuevo Cliente" color="#10B981" onPress={() => navigation.navigate('AddClient')} />
                    <ToolCard icon="map" title="Ruta" color="#F59E0B" onPress={() => navigation.navigate('ClientMap')} />
                    <ToolCard icon="bar-chart-2" title="Reportes" color="#EC4899" onPress={() => navigation.navigate('Reports')} />
                    <ToolCard icon="star" title="Promociones" color={COLORS.primary} onPress={() => navigation.navigate('Promotions')} />
                </View>

                {/* --- ÚLTIMAS VENTAS --- */}
                <View style={styles.recentSectionHeader}>
                    <Text style={styles.sectionHeader}>Últimas Ventas</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Reports')}>
                        <Text style={styles.seeAllText}>Ver todas</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    horizontal
                    data={recentSales}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.id || Math.random().toString()}
                    contentContainerStyle={styles.recentListContent}
                    ListEmptyComponent={
                        <View style={styles.emptyState}><Text style={styles.emptyStateText}>Sin actividad reciente.</Text></View>
                    }
                    renderItem={({ item }) => {
                        const statusStyle = getStatusStyles(item.estado);
                        const clientNameDisplay = item.clientName || item.clienteNombre || 'Cliente desconocido';
                        
                        return (
                            <TouchableOpacity 
                                activeOpacity={0.9}
                                style={styles.saleCard}
                                onPress={() => navigation.navigate('SaleDetail', { saleId: item.id, clientName: clientNameDisplay })}
                            >
                                <View>
                                    <Text style={styles.saleDate}>{formatDate(item.fecha)}</Text>
                                    <Text style={styles.saleAmount}>{formatCurrency(item.totalVenta)}</Text>
                                    <Text style={styles.saleClient} numberOfLines={1}>{clientNameDisplay}</Text>
                                </View>
                                
                                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                                    <Feather name={statusStyle.icon} size={10} color={statusStyle.text} />
                                    <Text style={[styles.statusText, { color: statusStyle.text }]} numberOfLines={1}>
                                        {item.estado}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />

                <View style={{ height: 100 }} /> 
            </ScrollView>
            
            {/* --- FAB --- */}
            <TouchableOpacity activeOpacity={0.9} style={styles.fabContainer} onPress={() => navigation.navigate('SelectClientForSale')}>
                <View style={[styles.fabContent, { backgroundColor: COLORS.textPrimary }]}> 
                    <Feather name="plus" size={24} color="white" />
                    <Text style={styles.fabText}>Nueva Venta</Text>
                </View>
            </TouchableOpacity>

        </View>
    );
};

const ToolCard = ({ icon, title, color, onPress }: ToolCardProps) => (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.toolCardWrapper}>
        <View style={[styles.toolIconContainer, { backgroundColor: color + '15' }]}> 
            <Feather name={icon} size={24} color={color} />
        </View>
        <Text style={styles.toolCardTitle}>{title}</Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    scrollContent: { paddingBottom: 100 },
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    
    // --- HEADER STYLES ---
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: (StatusBar.currentHeight || 20) + 16, paddingBottom: 20, backgroundColor: '#F8FAFC' },
    
    // Logo Styles
    logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    logoIconBox: { width: 28, height: 28, backgroundColor: COLORS.textPrimary, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    logoSymbol: { color: COLORS.primary, fontSize: 16, fontWeight: '900' },
    brandName: { fontSize: 20, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -0.5, lineHeight: 22 },
    brandSuffix: { fontWeight: '300', color: COLORS.primary }, // Usamos Primary del tema como acento
    brandSlogan: { fontSize: 8, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 2, textTransform: 'uppercase' },

    // Greeting Styles
    greeting: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', marginTop: 2 },
    userName: { fontWeight: '700', color: COLORS.textPrimary },

    logoutButton: { padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },

    // --- CARDS ---
    mainCardContainer: { marginHorizontal: 24, marginBottom: 32, borderRadius: 24, shadowColor: COLORS.textPrimary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8, backgroundColor: '#fff' },
    mainCardGradient: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderRadius: 24, height: 110 },
    mainCardContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconCircle: { backgroundColor: 'rgba(255,255,255,0.95)', width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    arrowCircle: { backgroundColor: 'rgba(255,255,255,0.15)', width: 32, height: 32, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
    mainCardTitle: { color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 2 },
    mainCardSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },

    sectionHeader: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 24, marginBottom: 16 },
    recentSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24, marginTop: 24, marginBottom: 16 },
    seeAllText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

    toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, justifyContent: 'space-between', gap: 12, marginBottom: 32 },
    toolCardWrapper: { width: GRID_CARD_WIDTH, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, alignItems: 'flex-start', justifyContent: 'space-between', height: 110, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, marginBottom: 4 },
    toolIconContainer: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    toolCardTitle: { color: '#334155', fontWeight: '700', fontSize: 14 },

    recentListContent: { paddingLeft: 24, paddingRight: 10 },
    saleCard: { backgroundColor: '#FFFFFF', width: 150, height: 150, marginRight: 14, borderRadius: 20, padding: 14, justifyContent: 'space-between', shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9' },
    
    saleDate: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
    saleAmount: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
    saleClient: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', gap: 4 },
    statusText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
    
    emptyState: { marginLeft: 24, padding: 20 },
    emptyStateText: { color: '#94A3B8', fontStyle: 'italic' },

    fabContainer: { position: 'absolute', bottom: 30, alignSelf: 'center', shadowColor: COLORS.textPrimary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8, borderRadius: 30 },
    fabContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 30 },
    fabText: { color: 'white', fontWeight: '800', fontSize: 16, marginLeft: 8 },
});

export default HomeScreen;