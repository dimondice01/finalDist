// src/screens/client-dashboard.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { ClientDashboardScreenProps } from '../navigation/AppNavigator';

// --- Contexto, DB, Tipos, Estilos ---
import { Client, Rubro, Sale, useData } from '../../context/DataContext';

// ✅ CORRECCIÓN: Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

// --- Funciones de ayuda (Sin cambios en lógica) ---
const formatCurrency = (value?: number): string => {
    const numericValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    return `$${numericValue.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0); 
    return monday;
};

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
            return 'Fecha inválida';
        }

        if (isNaN(date.getTime())) {
            return 'Fecha inválida';
        }
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return "Error fecha";
    }
};


// --- Componente WeeklyGoalWidget (Rediseñado) ---
const WeeklyGoalWidget = memo(({ goalInfo }: {
    goalInfo: {
        rubro: Rubro | undefined;
        totalSold: number;
        percentage: number;
    }
}) => {
    const { rubro, totalSold, percentage } = goalInfo;

    if (!rubro || !rubro.metaSemanal || rubro.metaSemanal <= 0) {
        return null;
    }

    return (
        <View style={goalStyles.goalCard}>
            <Text style={goalStyles.goalTitle}>META SEMANAL ({rubro.nombre?.toUpperCase()})</Text>
            
            <View style={goalStyles.goalAmountContainer}>
                <Text style={goalStyles.goalAmountSold}>{formatCurrency(totalSold)}</Text>
                <Text style={goalStyles.goalAmountTarget}>/ {formatCurrency(rubro.metaSemanal)}</Text>
            </View>

            <View style={goalStyles.progressBarBackground}>
                {/* Usamos el gradiente de Primary a Secondary para un efecto premium */}
                <LinearGradient
                    colors={[COLORS.primary, COLORS.secondary]} 
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[goalStyles.progressBarFill, { width: `${percentage}%` }]}
                />
            </View>
            <Text style={goalStyles.percentageText}>{Math.round(percentage)}% completado</Text>
        </View>
    );
});


// --- Componente SaleCard (CORREGIDO PARA COBROS) ---
const SaleCard = memo(({ item, onEdit, onDelete, onNavigate, isOffline }: {
    item: Sale;
    onEdit: (saleId: string, clientId: string) => void;
    onDelete: (saleId: string) => void;
    onNavigate: (saleId: string) => void;
    isOffline: boolean;
}) => {
    if (!item || !item.id) return null;

    const color = getStatusColor(item.estado);
    const isPending = item.estado === 'Pendiente de Entrega';
    const isAnulada = item.estado === 'Anulada';
    const isCobranza = item.tipo === 'cobranza'; // <--- DETECCIÓN

    let icon: keyof typeof Feather.glyphMap;
    let iconColor: string;
    let title: string;
    const formattedDate = formatDate(item.fecha);

    // Lógica de visualización según el tipo
    if (isCobranza) {
        icon = 'download'; // Icono de "Entrada de dinero"
        iconColor = '#8B5CF6'; // Violeta distintivo para cobros
        title = `COBRO - ${formattedDate}`;
    } else if (isAnulada) {
        icon = 'x-circle';
        iconColor = COLORS.danger; 
        title = `ANULADA - ${formattedDate}`;
    } else if (item.tipo === 'reposicion') {
        icon = 'truck';
        iconColor = COLORS.warning; 
        title = `REPOSICIÓN - ${formattedDate}`;
    } else if (item.tipo === 'devolucion') {
        icon = 'refresh-ccw';
        iconColor = COLORS.warning; 
        title = `DEVOLUCIÓN - ${formattedDate}`;
    } else {
        icon = getStatusIcon(item.estado); 
        iconColor = color; 
        title = `VENTA - ${formattedDate}`;
    }

    // Determinamos el monto a mostrar: Si es cobro, usamos el pago efectivo; si no, el total de venta
    const amountToShow = isCobranza ? (item.pagoEfectivo || item.montoCobrado || 0) : item.totalVenta;

    const handleNavigate = useCallback(() => onNavigate(item.id), [item.id, onNavigate]);
    
    const handleEdit = useCallback((e: any) => {
        e.stopPropagation();
        if (isOffline) {
            Toast.show({
                type: 'info',
                text1: 'Edición Bloqueada',
                text2: 'La edición de ventas solo está disponible en modo online.',
                position: 'bottom',
                visibilityTime: 3000
            });
            return; 
        }
        onEdit(item.id, item.clienteId);
    }, [item.id, item.clienteId, onEdit, isOffline]);

    const handleDelete = useCallback((e: any) => {
        e.stopPropagation();
        onDelete(item.id);
    }, [item.id, onDelete]);

    return (
        <TouchableOpacity
            style={[saleCardStyles.saleCard, isAnulada && saleCardStyles.anuladaCard]}
            onPress={handleNavigate}
            activeOpacity={0.8}
        >
            {/* Ícono de Estado */}
            <View style={[saleCardStyles.statusIcon, { backgroundColor: `${iconColor}20`, borderColor: `${iconColor}50` }]}>
                <Feather name={icon} size={SIZES.h3} color={iconColor} />
            </View>

            <View style={saleCardStyles.saleInfo}>
                <Text style={saleCardStyles.saleDate}>{title}</Text> 
                {/* Mostramos el monto correcto según si es cobro o venta */}
                <Text style={[saleCardStyles.saleTotal, isCobranza && { color: iconColor }]}>
                    {formatCurrency(amountToShow)}
                </Text>
                <Text style={[saleCardStyles.saleStatus, { color: color }]}>
                    {isCobranza ? 'Pago Registrado' : (item.estado || 'Desconocido')}
                </Text>
            </View>

            <View style={saleCardStyles.actionButtonsContainer}>
                {isPending && !isCobranza ? ( // Solo permitimos editar/borrar si es venta pendiente
                    <View style={saleCardStyles.actionButtonsGroup}>
                        <TouchableOpacity
                            style={[saleCardStyles.actionButton, isOffline && saleCardStyles.actionButtonDisabled]}
                            onPress={handleEdit}
                            hitSlop={{ top: SIZES.small, bottom: SIZES.small, left: SIZES.small, right: SIZES.small }}
                            disabled={isOffline}
                        >
                            <Feather name="edit" size={SIZES.h3} color={isOffline ? COLORS.textSecondary : COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={saleCardStyles.actionButton}
                            onPress={handleDelete}
                            hitSlop={{ top: SIZES.small, bottom: SIZES.small, left: SIZES.small, right: SIZES.small }}
                        >
                            <Feather name="trash-2" size={SIZES.h3} color={COLORS.danger} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <Feather name="chevron-right" size={SIZES.h3} color={COLORS.textSecondary} />
                )}
            </View>
        </TouchableOpacity>
    );
});


const ClientDashboardScreen = ({ navigation, route }: ClientDashboardScreenProps) => {
    const { clientId } = route.params; 
    
    const { 
        clients, 
        sales, 
        rubros, 
        isLoading: isDataLoading, 
        isOffline,
        setSalesState,
        deleteSaleAndRevertStock
    } = useData();
    const [isDeleting, setIsDeleting] = useState(false);
    
    const client: Client | undefined = useMemo(() => {
        const allClientsArray = Array.isArray(clients) ? clients : [];
        return allClientsArray.find(c => c && c.id === clientId);
    }, [clients, clientId]);

    const clientSales: Sale[] = useMemo(() => {
        const allSalesArray = Array.isArray(sales) ? sales : [];
        if (!allSalesArray || !clientId) return [];

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
            if (sale.id.startsWith('OFFLINE_')) { 
                return Infinity;
            }
            return 0;
        };

        return allSalesArray
            .filter(s => s && s.id && s.clienteId === clientId) 
            .sort((a, b) => getTimestamp(b) - getTimestamp(a));
    }, [sales, clientId]);

    const weeklyGoalInfo = useMemo(() => {
        const clientRubro = (Array.isArray(rubros) ? rubros : []).find(r => r.id === client?.rubroId); 
        
        if (!clientRubro) {
            return { rubro: undefined, totalSold: 0, percentage: 0 };
        }

        const metaSemanal = clientRubro.metaSemanal || 0;
        const lastMonday = getMonday(new Date());
        
        const salesThisWeek = clientSales.filter(sale => {
            if (sale.estado === 'Anulada') return false;
            if (sale.tipo === 'cobranza') return false; // No contamos cobros de deuda vieja para la meta semanal de venta
            
            let saleDate: Date;
            if (sale.fecha instanceof Date) {
                saleDate = sale.fecha;
            } else if (sale.fecha && typeof (sale.fecha as { seconds: number }).seconds === 'number') {
                saleDate = new Date((sale.fecha as { seconds: number }).seconds * 1000);
            } else {
                return false; 
            }
            return saleDate >= lastMonday;
        });

        const totalSoldThisWeek = salesThisWeek.reduce((sum, sale) => sum + sale.totalVenta, 0);
        const percentage = (metaSemanal > 0) ? (totalSoldThisWeek / metaSemanal) * 100 : 0;
        
        return {
            rubro: clientRubro,
            totalSold: totalSoldThisWeek,
            percentage: Math.min(100, Math.max(0, percentage)), 
        };

    }, [client?.rubroId, rubros, clientSales]); 

    const handleDeleteSale = useCallback(async (saleId: string) => {
        if (isDeleting || !saleId) return;

        const saleToDelete = sales.find(s => s.id === saleId);
        if (!saleToDelete) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Venta no encontrada para eliminación.', position: 'bottom' });
            return;
        }

        Alert.alert(
            "Confirmar Eliminación",
            "¿Está seguro de que desea eliminar esta venta pendiente? Esta acción no se puede deshacer.",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar", style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        
                        // 1. MUTACIÓN OPTIMISTA
                        setSalesState((prevSales: Sale[]) => prevSales.filter(s => s.id !== saleId));
                        
                        try {
                            // 2. Eliminación remota y reintegración de stock local
                            await deleteSaleAndRevertStock(saleId, saleToDelete.items); 

                            Toast.show({ type: 'success', text1: 'Venta Eliminada', position: 'bottom' });

                        } catch (error) {
                            console.error("Error al eliminar la venta:", error);
                            Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar la venta.', position: 'bottom' });
                            
                            // 3. Rollback
                            setSalesState((prevSales: Sale[]) => [...prevSales, saleToDelete]); 
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    }, [isDeleting, sales, isOffline, setSalesState, deleteSaleAndRevertStock]); 

    // --- Handlers de Navegación (Sin cambios) ---
    const navigateToSaleDetail = useCallback((saleId: string) => {
        if (!client) return;
        navigation.navigate('SaleDetail', { 
            saleId: saleId, 
            clientName: client.nombreCompleto || client.nombre 
        });
    }, [navigation, client]);

    const navigateToEditSale = useCallback((saleId: string, currentClientId: string) => {
        if (!client) return;
        navigation.navigate('CreateSale', {
            cliente: client, 
            clientId: client.id, 
            saleId: saleId, 
            isEditing: 'true' 
        });
    }, [navigation, client]);

    const navigateToNewSale = useCallback(() => {
        if (!client) return;
        navigation.navigate('CreateSale', { 
            cliente: client, 
            clientId: client.id,
            isReposicion: false, 
            isDevolucion: false 
        });
    }, [navigation, client]);
    
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
        navigation.navigate('EditClient', { 
            clientId: client.id
        });
    }, [navigation, client]);
    
    const navigateToClientDebts = useCallback(() => {
        if (!client) return;
        navigation.navigate('ClientDebts', { 
            clientId: client.id,
            clientName: client.nombreCompleto || client.nombre
        });
    }, [navigation, client]);
    
    // --- Handlers de Contacto (Sin cambios) ---
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

    const renderSaleCard = useCallback(({ item }: { item: Sale }) => (
        <SaleCard
            item={item}
            onNavigate={navigateToSaleDetail}
            onEdit={navigateToEditSale}
            onDelete={handleDeleteSale}
            isOffline={isOffline}
        />
    ), [navigateToSaleDetail, navigateToEditSale, handleDeleteSale, isOffline]);


    // --- Render Lógica de Carga (Sin cambios) ---
    if (isDataLoading && !client) {
        return (
            <View style={styles.loadingContainer}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!isDataLoading && !client) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                        <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.emptyContainer}>
                    <Feather name="user-x" size={SIZES.h1} color={COLORS.disabled} />
                    <Text style={styles.title}>Cliente no encontrado</Text>
                    <Text style={styles.subtitle}>No se pudo cargar la información del cliente.</Text>
                </View>
            </View>
        );
    }

    // --- RENDER PRINCIPAL ---
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            <FlatList
                ListHeaderComponent={
                    <>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                                <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={navigateToEditClient} style={styles.headerButton}>
                                <Feather name="edit" size={SIZES.h3} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoContainer}>
                            <View style={styles.avatar}>
                                <Feather name="user" size={SIZES.h1} color={COLORS.primary} />
                            </View>
                            <Text style={styles.title} numberOfLines={2}>{client?.nombreCompleto || client?.nombre || 'Cliente'}</Text>
                            {client?.direccion && <Text style={styles.subtitle}><Feather name="map-pin" size={SIZES.caption} /> {client.direccion}</Text>}
                            {client?.telefono && (
                                <View style={styles.contactActions}>
                                    <TouchableOpacity onPress={handleCall} style={styles.contactButton}>
                                        <Feather name="phone" size={SIZES.caption} color={COLORS.primary} /> 
                                        <Text style={styles.contactButtonText}>{client.telefono}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleWhatsApp} style={styles.contactButton}>
                                        <Feather name="message-circle" size={SIZES.caption} color={COLORS.success} /> 
                                        <Text style={styles.contactButtonText}>WhatsApp</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        <WeeklyGoalWidget goalInfo={weeklyGoalInfo} />

                        <View style={styles.actionsContainer}>
                            <TouchableOpacity
                                style={styles.mainActionButton}
                                onPress={navigateToNewSale}
                            >
                                <Feather name="plus-circle" size={SIZES.h3} color={COLORS.white} />
                                <Text style={styles.mainActionButtonText}>Nueva Venta</Text>
                            </TouchableOpacity>
                            
                            <View style={styles.secondaryActionsRow}>
                                <TouchableOpacity
                                    style={[styles.secondaryActionButton, { flex: 1, backgroundColor: COLORS.backgroundEnd, borderColor: COLORS.glassBorder }]}
                                    onPress={navigateToNewDevolucion}
                                >
                                    <Feather name="refresh-ccw" size={SIZES.h3} color={COLORS.warning} />
                                    <Text style={[styles.secondaryActionButtonText, { color: COLORS.warning }]}>Devolución</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity
                                    style={[styles.secondaryActionButton, { flex: 1, backgroundColor: COLORS.backgroundEnd, borderColor: COLORS.glassBorder }]}
                                    onPress={navigateToClientDebts}
                                >
                                    <Feather name="dollar-sign" size={SIZES.h3} color={COLORS.primary} />
                                    <Text style={styles.secondaryActionButtonText}>Ver Saldos</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.listHeader}>Historial de Ventas</Text>
                    </>
                }
                data={clientSales}
                renderItem={renderSaleCard}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="file-text" size={SIZES.h2} color={COLORS.disabled} />
                        <Text style={styles.emptyText}>Este cliente aún no tiene ventas registradas.</Text>
                    </View>
                }
                ListFooterComponent={<View style={{ height: SIZES.large }} />}
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={11}
            />
        </View>
    );
};

// --- Estilos de Componentes Auxiliares ---
const goalStyles = StyleSheet.create({
    goalCard: {
        backgroundColor: COLORS.backgroundEnd,
        marginHorizontal: SIZES.large,
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        padding: SIZES.medium,
        marginBottom: SIZES.large, 
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    goalTitle: {
        color: COLORS.textSecondary,
        fontSize: SIZES.caption,
        fontWeight: '700',
        marginBottom: SIZES.small,
        textTransform: 'uppercase',
    },
    goalAmountContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: SIZES.small,
    },
    goalAmountSold: {
        color: COLORS.textPrimary,
        fontSize: SIZES.h2,
        fontWeight: 'bold',
    },
    goalAmountTarget: {
        color: COLORS.textSecondary,
        fontSize: SIZES.h3,
        fontWeight: '500',
        marginLeft: SIZES.xsmall,
        marginBottom: SIZES.xsmall / 2, 
    },
    progressBarBackground: {
        height: SIZES.small,
        backgroundColor: COLORS.glassBorder, 
        borderRadius: SIZES.xsmall,
        overflow: 'hidden', 
        marginBottom: SIZES.xsmall,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: SIZES.xsmall,
    },
    percentageText: {
        fontSize: SIZES.caption,
        color: COLORS.textSecondary,
        textAlign: 'right',
        fontWeight: '500',
    }
});

const saleCardStyles = StyleSheet.create({
    saleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd,
        padding: SIZES.medium,
        borderRadius: SIZES.radius,
        marginBottom: SIZES.small,
        marginHorizontal: SIZES.large,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.textPrimary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    anuladaCard: { opacity: 0.5, backgroundColor: COLORS.backgroundStart },
    statusIcon: { 
        width: 48, // Grande
        height: 48,
        borderRadius: SIZES.radiusSmall, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginRight: SIZES.medium,
        borderWidth: 1,
    },
    saleInfo: { flex: 1, marginRight: SIZES.small },
    saleDate: { 
        color: COLORS.textSecondary, 
        fontSize: SIZES.caption, 
        marginBottom: SIZES.xsmall / 2,
        fontWeight: '500'
    },
    saleTotal: { 
        color: COLORS.textPrimary, 
        fontSize: SIZES.h3, // Número dominante
        fontWeight: 'bold' 
    },
    saleStatus: { fontSize: SIZES.caption, fontWeight: '600', marginTop: SIZES.xsmall / 2 },

    actionButtonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    actionButtonsGroup: { 
        flexDirection: 'row', 
        alignItems: 'center', 
    },
    actionButton: {
        padding: SIZES.xsmall,
        marginLeft: SIZES.small,
    },
    actionButtonDisabled: {
        opacity: 0.4,
    },
});


// --- Estilos principales de la pantalla ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.small,
        paddingBottom: SIZES.small,
        paddingHorizontal: SIZES.small,
        backgroundColor: 'transparent',
    },
    headerButton: { 
        padding: SIZES.small, 
        width: 48, 
        alignItems: 'center' 
    },

    infoContainer: { 
        paddingHorizontal: SIZES.large, 
        alignItems: 'center', 
        marginBottom: SIZES.large 
    },
    avatar: { 
        width: 96, 
        height: 96, 
        borderRadius: 48, 
        backgroundColor: COLORS.backgroundEnd, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: SIZES.medium, 
        borderWidth: 2, 
        borderColor: COLORS.glassBorder 
    },
    title: { 
        fontSize: SIZES.h1, // Título dominante
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        textAlign: 'center', 
        marginBottom: SIZES.xsmall 
    },
    subtitle: { 
        fontSize: SIZES.body, 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        marginBottom: SIZES.small 
    },
    
    contactActions: { 
        flexDirection: 'row',
        gap: SIZES.medium,
        marginTop: SIZES.small,
    },
    contactButton: { 
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZES.xsmall,
        backgroundColor: COLORS.backgroundEnd,
        paddingHorizontal: SIZES.small,
        paddingVertical: SIZES.xsmall,
        borderRadius: SIZES.radiusSmall,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
    },
    contactButtonText: { 
        color: COLORS.textPrimary,
        fontSize: SIZES.caption,
        fontWeight: '500',
    },

    actionsContainer: { 
        paddingHorizontal: SIZES.large, 
        marginBottom: SIZES.large, 
        gap: SIZES.medium 
    },
    secondaryActionsRow: { 
        flexDirection: 'row', 
        gap: SIZES.medium 
    },
    mainActionButton: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: SIZES.small, 
        backgroundColor: COLORS.primary, 
        padding: SIZES.medium, 
        borderRadius: SIZES.radius, 
        height: 52, // Altura estándar
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    mainActionButtonText: { 
        color: COLORS.white, 
        fontWeight: 'bold', 
        fontSize: SIZES.body 
    },
    secondaryActionButton: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: SIZES.small, 
        padding: SIZES.medium, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth,
        height: 52,
    },
    secondaryActionButtonText: { 
        color: COLORS.textPrimary, 
        fontWeight: 'bold', 
        fontSize: SIZES.body 
    },

    listHeader: { 
        fontSize: SIZES.h3, 
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        paddingHorizontal: SIZES.large, 
        marginBottom: SIZES.medium 
    },
    listContentContainer: { 
        paddingBottom: SIZES.medium 
    },
    emptyContainer: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: SIZES.xl, 
        marginTop: SIZES.large, 
        gap: SIZES.medium 
    },
    emptyText: { 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        fontStyle: 'italic', 
        fontSize: SIZES.body 
    },
});

export default ClientDashboardScreen;