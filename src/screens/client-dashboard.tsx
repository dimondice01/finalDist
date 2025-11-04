// src/screens/ClientDashboardScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // <-- ¡AÑADIDO!
// Quitamos import { router, useLocalSearchParams } from 'expo-router';
import { deleteDoc, doc } from 'firebase/firestore';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList, // <-- Importado
    Linking // <-- Importado
    ,


    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { ClientDashboardScreenProps } from '../navigation/AppNavigator'; // <-- Importamos los tipos

// --- Contexto, DB, Tipos, Estilos ---
// --- ¡CAMBIO! Importamos 'Rubro' ---
import { Client, Rubro, Sale, useData } from '../../context/DataContext'; // Asegura la ruta
import { db } from '../../db/firebase-service'; // Asegura la ruta
import { COLORS } from '../../styles/theme'; // Asegura la ruta

// --- Funciones de ayuda (del original) ---
const formatCurrency = (value?: number): string => {
    const numericValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    return `$${numericValue.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// --- ¡NUEVO! Función helper para obtener el Lunes de esta semana ---
const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay(); // Domingo = 0, Lunes = 1, ...
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajusta para Lunes
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0); // Setea a medianoche
    return monday;
};
// --- FIN NUEVO HELPER ---

const getStatusColor = (estado?: Sale['estado']): string => {
    switch (estado) {
        case 'Pagada': return COLORS.success;
        case 'Adeuda': return COLORS.warning;
        case 'Pendiente de Entrega': return COLORS.textSecondary;
        case 'Repartiendo': return COLORS.warning;
        case 'Anulada': return COLORS.danger;
        default: return COLORS.textSecondary;
    }
};

const getStatusIcon = (estado?: Sale['estado']): keyof typeof Feather.glyphMap => {
    switch (estado) {
        case 'Pagada': return 'check-circle';
        case 'Adeuda': return 'alert-circle';
        case 'Pendiente de Entrega': return 'clock';
        case 'Repartiendo': return 'truck';
        case 'Anulada': return 'x-circle';
        default: return 'help-circle';
    }
};

const formatDate = (dateInput: Sale['fecha'] | undefined): string => {
    if (!dateInput) return 'Fecha desconocida';
    try {
        let date: Date;
        if (dateInput instanceof Date) {
            date = dateInput;
        } else if (typeof (dateInput as { seconds: number })?.seconds === 'number') {
            const timestampMillis = (dateInput as { seconds: number }).seconds * 1000;
            if (isNaN(timestampMillis)) throw new Error('Timestamp seconds inválido');
            date = new Date(timestampMillis);
        } else {
            // console.warn("Formato de fecha inesperado en formatDate:", dateInput);
            return 'Fecha inválida';
        }

        if (isNaN(date.getTime())) {
            return 'Fecha inválida';
        }
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        // console.error("Error formateando fecha:", dateInput, e);
        return "Error fecha";
    }
};

// --- ¡NUEVO! Widget de Meta Semanal ---
const WeeklyGoalWidget = memo(({ goalInfo }: {
    goalInfo: {
        rubro: Rubro | undefined;
        totalSold: number;
        percentage: number;
    }
}) => {
    const { rubro, totalSold, percentage } = goalInfo;

    // Si el cliente no tiene rubro, o la meta es 0, no mostramos nada.
    if (!rubro || !rubro.metaSemanal || rubro.metaSemanal <= 0) {
        return null;
    }

    return (
        <View style={styles.goalCard}>
            <Text style={styles.goalTitle}>Meta Semanal ({rubro.nombre})</Text>
            
            <View style={styles.goalAmountContainer}>
                <Text style={styles.goalAmountSold}>{formatCurrency(totalSold)}</Text>
                <Text style={styles.goalAmountTarget}>/ {formatCurrency(rubro.metaSemanal)}</Text>
            </View>

            <View style={styles.progressBarBackground}>
                <LinearGradient
                    colors={[COLORS.primary, COLORS.secondary || COLORS.primary]} // Agregamos fallback por si accent no existe
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressBarFill, { width: `${percentage}%` }]}
                />
            </View>
        </View>
    );
});
// --- FIN NUEVO WIDGET ---

// --- Componente Memoizado para SaleCard (CORREGIDO) ---
const SaleCard = memo(({ item, onEdit, onDelete, onNavigate }: {
    item: Sale;
    onEdit: (saleId: string, clientId: string) => void;
    onDelete: (saleId: string) => void;
    onNavigate: (saleId: string) => void;
}) => {
    if (!item || !item.id) return null;

    const color = getStatusColor(item.estado);
    const isPending = item.estado === 'Pendiente de Entrega';
    const isAnulada = item.estado === 'Anulada';

    // --- INICIO DE CORRECCIÓN: Lógica de Icono y Título por TIPO ---
    let icon: keyof typeof Feather.glyphMap;
    let iconColor: string;
    let title: string;
    const formattedDate = formatDate(item.fecha);

    if (isAnulada) {
        icon = 'x-circle';
        iconColor = COLORS.danger; // Usamos 'danger'
        title = `Anulada - ${formattedDate}`;
    } else if (item.tipo === 'reposicion') {
        icon = 'truck';
        iconColor = COLORS.warning; // Color para reposición
        title = `Reposición - ${formattedDate}`;
    } else if (item.tipo === 'devolucion') {
        icon = 'refresh-ccw';
        iconColor = COLORS.warning; // Color para devolución
        title = `Devolución - ${formattedDate}`;
    } else {
        // Es una 'venta' normal o 'undefined' (antiguas)
        icon = getStatusIcon(item.estado); // Usamos el icono de estado
        iconColor = color; // Usamos el color de estado
        title = `Venta - ${formattedDate}`;
    }
    // --- FIN DE CORRECCIÓN ---


    const handleNavigate = useCallback(() => onNavigate(item.id), [item.id, onNavigate]);
    const handleEdit = useCallback((e: any) => {
        e.stopPropagation();
        onEdit(item.id, item.clienteId);
    }, [item.id, item.clienteId, onEdit]);
    const handleDelete = useCallback((e: any) => {
        e.stopPropagation();
        onDelete(item.id);
    }, [item.id, onDelete]);

    return (
        <TouchableOpacity
            style={[styles.saleCard, isAnulada && styles.anuladaCard]}
            onPress={handleNavigate}
            activeOpacity={0.8}
        >
            <View style={[styles.statusIcon, { backgroundColor: `${iconColor}30` }]}>
                <Feather name={icon} size={24} color={iconColor} />
            </View>

            <View style={styles.saleInfo}>
                <Text style={styles.saleDate}>{title}</Text> {/* <-- Título dinámico */}
                <Text style={styles.saleTotal}>{formatCurrency(item.totalVenta)}</Text>
                <Text style={[styles.saleStatus, { color: color }]}>{item.estado || 'Desconocido'}</Text>
            </View>

            <View style={styles.actionButtonsContainer}>
                {isPending ? (
                    <View style={styles.actionButtonsGroup}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleEdit}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Feather name="edit" size={22} color={COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleDelete}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Feather name="trash-2" size={22} color={COLORS.danger || '#E53E3E'} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <Feather name="chevron-right" size={24} color={COLORS.textSecondary} />
                )}
            </View>
        </TouchableOpacity>
    );
});
// --- Fin Componente Memoizado ---


const ClientDashboardScreen = ({ navigation, route }: ClientDashboardScreenProps) => {
    // --- Obtener parámetros de route.params ---
    const { clientId } = route.params; 
    
    // --- ¡CAMBIO! Obtenemos 'rubros' ---
    const { clients, sales, rubros, isLoading: isDataLoading, refreshAllData } = useData();
    const [isDeleting, setIsDeleting] = useState(false);

    // Variable 'client' (con 't') es la correcta en este archivo
    const client: Client | undefined = useMemo(() => {
        const allClientsArray = Array.isArray(clients) ? clients : [];
        return allClientsArray.find(c => c && c.id === clientId);
    }, [clients, clientId]);

    const clientSales: Sale[] = useMemo(() => {
        const allSalesArray = Array.isArray(sales) ? sales : [];
        if (!allSalesArray || !clientId) return [];

        // Función auxiliar para obtener timestamp (ya definida arriba, pero la repetimos por contexto)
        const getTimestamp = (sale: Sale): number => {
            if (!sale || !sale.fecha) return 0;
            if (sale.fecha instanceof Date) {
                const time = sale.fecha.getTime();
                return !isNaN(time) ? time : 0;
            }
            if (typeof (sale.fecha as { seconds: number })?.seconds === 'number') {
                const timestampMillis = (sale.fecha as { seconds: number }).seconds * 1000;
                return !isNaN(timestampMillis) ? timestampMillis : 0;
            }
            return 0;
        };

        return allSalesArray
            .filter(s => s && s.id && s.clienteId === clientId && getTimestamp(s) > 0)
            .sort((a, b) => getTimestamp(b) - getTimestamp(a));
    }, [sales, clientId]);

    // --- ¡NUEVA LÓGICA! Cálculo de la Meta Semanal ---
    const weeklyGoalInfo = useMemo(() => {
        // 1. Encontrar el rubro del cliente
        const clientRubro = (Array.isArray(rubros) ? rubros : []).find(r => r.id === client?.rubroId); // Usamos client?.rubroId
        
        if (!clientRubro) {
            return { rubro: undefined, totalSold: 0, percentage: 0 };
        }

        // 2. Obtener la meta
        const metaSemanal = clientRubro.metaSemanal || 0;

        // 3. Calcular las ventas de esta semana (desde el lunes a las 00:00)
        const lastMonday = getMonday(new Date());
        
        const salesThisWeek = clientSales.filter(sale => {
            // No contar ventas anuladas
            if (sale.estado === 'Anulada') return false;
            
            // Convertir la fecha de la venta (Date o Timestamp) a Date
            let saleDate: Date;
            if (sale.fecha instanceof Date) {
                saleDate = sale.fecha;
            } else if (sale.fecha && typeof (sale.fecha as { seconds: number }).seconds === 'number') {
                saleDate = new Date((sale.fecha as { seconds: number }).seconds * 1000);
            } else {
                return false; // Si no tiene fecha válida, no la contamos
            }
            
            // Comparar
            return saleDate >= lastMonday;
        });

        // 4. Sumar el total vendido
        const totalSoldThisWeek = salesThisWeek.reduce((sum, sale) => sum + sale.totalVenta, 0);

        // 5. Calcular porcentaje
        const percentage = (metaSemanal > 0) ? (totalSoldThisWeek / metaSemanal) * 100 : 0;
        
        return {
            rubro: clientRubro,
            totalSold: totalSoldThisWeek,
            // Aseguramos que el porcentaje no pase de 100 (para la barra)
            percentage: Math.min(100, Math.max(0, percentage)), 
        };

    }, [client?.rubroId, rubros, clientSales]); // Usamos client?.rubroId
    // --- FIN NUEVA LÓGICA ---


    const handleDeleteSale = useCallback(async (saleId: string) => {
        if (isDeleting || !saleId) return;

        Alert.alert(
            "Confirmar Eliminación",
            "¿Está seguro de que desea eliminar esta venta pendiente? Esta acción no se puede deshacer.",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar", style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            const saleRef = doc(db, 'ventas', saleId);
                            await deleteDoc(saleRef);
                            Toast.show({ type: 'success', text1: 'Venta Eliminada', position: 'bottom' });
                            await refreshAllData();
                        } catch (error) {
                            console.error("Error al eliminar la venta:", error);
                            Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar la venta.', position: 'bottom' });
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    }, [isDeleting, refreshAllData]);

    // --- Handlers de Navegación (CORREGIDOS para que coincidan con AppNavigator) ---
    const navigateToSaleDetail = useCallback((saleId: string) => {
        if (!client) return;
        // CORRECCIÓN: 'SaleDetail' SÍ espera 'clientName' según AppNavigator.tsx
        navigation.navigate('SaleDetail', { 
            saleId: saleId, 
            clientName: client.nombreCompleto || client.nombre 
        });
    }, [navigation, client]);

    const navigateToEditSale = useCallback((saleId: string, currentClientId: string) => {
        if (!client) return;
        // CORRECCIÓN: 'CreateSale' espera 'cliente' (objeto) y 'clientId' (string)
        // (Basado en el AppNavigator.tsx que enviaste)
        navigation.navigate('CreateSale', {
            cliente: client, // <-- Pasamos el objeto 'client' (con 't') como parámetro 'cliente' (con 'e')
            clientId: client.id, // <-- Pasamos el 'clientId'
            saleId: saleId, 
            isEditing: 'true' 
        });
    }, [navigation, client]);

    const navigateToNewSale = useCallback(() => {
        if (!client) return;
        // CORRECCIÓN: 'CreateSale' espera 'cliente' (objeto) y 'clientId' (string)
        navigation.navigate('CreateSale', { 
            cliente: client, 
            clientId: client.id,
            isReposicion: false, 
            isDevolucion: false 
        });
    }, [navigation, client]);
    
    // --- NUEVO: Handler para Devolución ---
    const navigateToNewDevolucion = useCallback(() => {
        if (!client) return; 
        navigation.navigate('CreateSale', { 
            cliente: client, 
            clientId: client.id,
            isReposicion: false, 
            isDevolucion: true 
        });
    }, [navigation, client]);


    const navigateToEditClient = useCallback(() => {
        if (!client) return;
        // CORRECCIÓN: 'EditClient' espera el objeto 'client' (con 't')
        // (Tu AppNavigator dice 'clientId: string', 
        // pero el 'EditClient' espera el objeto. 
        // Pasamos el objeto, que es lo que EditClientScreen necesita.)
        navigation.navigate('EditClient', { 
            client: client 
        });
    }, [navigation, client]);
    
    const navigateToClientDebts = useCallback(() => {
        if (!client) return;
        // CORRECCIÓN: 'ClientDebts' espera 'clientId' y 'clientName'
        navigation.navigate('ClientDebts', { 
            clientId: client.id,
            clientName: client.nombreCompleto || client.nombre
        });
    }, [navigation, client]);
    
    // --- Handlers de Contacto (Movidos aquí desde el original) ---
    const handleCall = () => {
        if (client?.telefono) {
            const phoneNumber = Platform.OS === 'android' ? `tel:${client.telefono}` : `telprompt:${client.telefono}`;
            Linking.openURL(phoneNumber).catch(() => Alert.alert("Error", "No se pudo realizar la llamada."));
        } else {
            Alert.alert("Sin Teléfono", "Este cliente no tiene un teléfono registrado.");
        }
    };
    const handleWhatsApp = () => {
        if (client?.telefono) {
            const cleanPhone = client.telefono.replace(/[^0-9]/g, '');
            const phoneWithPrefix = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone}`;
            const whatsappUrl = `whatsapp://send?phone=${phoneWithPrefix}`;
            Linking.openURL(whatsappUrl).catch(() => Alert.alert("Error", "No se pudo abrir WhatsApp. Asegúrate de tenerlo instalado."));
        } else {
            Alert.alert("Sin Teléfono", "Este cliente no tiene un teléfono registrado.");
        }
    };

    // --- RenderItem memoizado ---
    const renderSaleCard = useCallback(({ item }: { item: Sale }) => (
        <SaleCard
            item={item}
            onNavigate={navigateToSaleDetail}
            onEdit={navigateToEditSale}
            onDelete={handleDeleteSale}
        />
    ), [navigateToSaleDetail, navigateToEditSale, handleDeleteSale]);


    if (isDataLoading && !client) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!isDataLoading && !client) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                        <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.emptyContainer}>
                    <Feather name="user-x" size={48} color={COLORS.textSecondary} />
                    <Text style={styles.title}>Cliente no encontrado</Text>
                    <Text style={styles.subtitle}>No se pudo cargar la información del cliente.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            <FlatList
                ListHeaderComponent={
                    <>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                                <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={navigateToEditClient} style={styles.headerButton}>
                                <Feather name="edit" size={24} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoContainer}>
                            <View style={styles.avatar}>
                                <Feather name="user" size={40} color={COLORS.primary} />
                            </View>
                            <Text style={styles.title} numberOfLines={2}>{client?.nombreCompleto || client?.nombre || 'Cliente'}</Text>
                            {client?.direccion && <Text style={styles.subtitle}><Feather name="map-pin" size={14} /> {client.direccion}</Text>}
                            {/* --- Botones de Contacto (Añadidos para que coincida con el layout original) --- */}
                            {client?.telefono && (
                                <View style={styles.contactActions}>
                                    <TouchableOpacity onPress={handleCall} style={styles.contactButton}>
                                        <Feather name="phone" size={14} color={COLORS.primary} /> 
                                        <Text style={styles.contactButtonText}>{client.telefono}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleWhatsApp} style={styles.contactButton}>
                                        <Feather name="message-circle" size={14} color={COLORS.success} /> 
                                        <Text style={styles.contactButtonText}>WhatsApp</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* --- ¡AQUÍ ESTÁ EL WIDGET! --- */}
                        <WeeklyGoalWidget goalInfo={weeklyGoalInfo} />
                        {/* --- FIN WIDGET --- */}

                        {/* --- CONTENEDOR DE ACCIONES MODIFICADO --- */}
                        <View style={styles.actionsContainer}>
                            <TouchableOpacity
                                style={styles.mainActionButton}
                                onPress={navigateToNewSale}
                            >
                                <Feather name="plus-circle" size={22} color={COLORS.primaryDark} />
                                <Text style={styles.mainActionButtonText}>Nueva Venta</Text>
                            </TouchableOpacity>
                            
                            {/* Fila secundaria con 2 botones (Reposición y Devolución) */}
                            <View style={styles.secondaryActionsRow}>
                                
                                <TouchableOpacity
                                    style={[styles.secondaryActionButton, { flex: 1, backgroundColor: `${COLORS.warning}30` }]}
                                    onPress={navigateToNewDevolucion}
                                >
                                    <Feather name="refresh-ccw" size={20} color={COLORS.warning} />
                                    <Text style={[styles.secondaryActionButtonText, { color: COLORS.warning }]}>Devolución</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Botón de Saldos (como estaba) */}
                            <TouchableOpacity
                                style={[styles.secondaryActionButton, { backgroundColor: COLORS.glass }]}
                                onPress={navigateToClientDebts}
                            >
                                <Feather name="dollar-sign" size={20} color={COLORS.primary} />
                                <Text style={styles.secondaryActionButtonText}>Ver Saldos</Text>
                            </TouchableOpacity>

                        </View>
                        {/* --- FIN CONTENEDOR DE ACCIONES --- */}

                        <Text style={styles.listHeader}>Historial de Ventas</Text>
                    </>
                }
                data={clientSales}
                renderItem={renderSaleCard}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="file-text" size={32} color={COLORS.textSecondary} />
                        <Text style={styles.emptyText}>Este cliente aún no tiene ventas registradas.</Text>
                    </View>
                }
                ListFooterComponent={<View style={{ height: 40 }} />}
                // Optimizaciones de FlatList
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={11}
            />
        </View>
    );
};

// --- Estilos (Modificados para el nuevo layout de botones y contacto) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + 10,
        paddingBottom: 10,
        paddingHorizontal: 10,
        backgroundColor: 'transparent',
    },
    headerButton: { padding: 10, width: 44, alignItems: 'center' },

    infoContainer: { paddingHorizontal: 20, alignItems: 'center', marginBottom: 25 },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.glass, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: COLORS.glassBorder },
    title: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 5 },
    
    contactActions: { // <-- NUEVO (Para botones de contacto)
        flexDirection: 'row',
        gap: 15,
        marginTop: 10,
    },
    contactButton: { // <-- NUEVO
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: COLORS.glass,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    contactButtonText: { // <-- NUEVO
        color: COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '500',
    },

    // --- ¡NUEVOS ESTILOS! ---
    goalCard: {
        backgroundColor: COLORS.glass,
        marginHorizontal: 20,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        padding: 15,
        marginBottom: 25, // Separación
    },
    goalTitle: {
        color: COLORS.textSecondary,
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    goalAmountContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 10,
    },
    goalAmountSold: {
        color: COLORS.textPrimary,
        fontSize: 22,
        fontWeight: 'bold',
    },
    goalAmountTarget: {
        color: COLORS.textSecondary,
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 5,
        marginBottom: 2, // Alinear con la base del monto vendido
    },
    progressBarBackground: {
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.1)', // Fondo más claro
        borderRadius: 5,
        overflow: 'hidden', 
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },
    // --- FIN NUEVOS ESTILOS ---

    actionsContainer: { paddingHorizontal: 20, marginBottom: 30, gap: 15 },
    secondaryActionsRow: { flexDirection: 'row', gap: 15 },
    mainActionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: COLORS.primary, padding: 15, borderRadius: 15 },
    mainActionButtonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 18 },
    secondaryActionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: COLORS.glass, padding: 15, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder },
    secondaryActionButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 16 },

    listHeader: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, paddingHorizontal: 20, marginBottom: 10 },
    listContentContainer: { paddingBottom: 20 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, marginTop: 30, gap: 10 },
    emptyText: { color: COLORS.textSecondary, textAlign: 'center', fontStyle: 'italic', fontSize: 15 },

    saleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        padding: 15,
        borderRadius: 12,
        marginBottom: 10,
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: COLORS.glassBorder
    },
    anuladaCard: { opacity: 0.6, backgroundColor: 'rgba(255, 255, 255, 0.05)'},
    statusIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    saleInfo: { flex: 1, marginRight: 10 },
    saleDate: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 2 },
    saleTotal: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '600' },
    saleStatus: { fontSize: 14, fontWeight: '500', marginTop: 3 },

    actionButtonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    actionButtonsGroup: { // <-- Estilo del original
        flexDirection: 'row', 
        alignItems: 'center', 
    },
    actionButton: {
        padding: 8,
        marginLeft: 8,
    },
});

export default ClientDashboardScreen;