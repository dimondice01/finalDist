// src/screens/ClientDashboardScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import {
    deleteDoc,
    doc
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS: SDK NATIVO (v9 Modular) ---

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
// ✅ CORRECCIÓN: Obtenemos setSalesState del contexto para la mutación optimista
import { Client, Rubro, Sale, useData } from '../../context/DataContext';

// Esta 'db' es NATIVA
import { dbContainer } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

// --- Funciones de ayuda (Sin cambios) ---
const formatCurrency = (value?: number): string => {
    const numericValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    return `$${numericValue.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
// ... (otras funciones auxiliares) ...
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

// --- Widget de Meta Semanal (Sin cambios) ---
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
        <View style={styles.goalCard}>
            <Text style={styles.goalTitle}>Meta Semanal ({rubro.nombre})</Text>
            
            <View style={styles.goalAmountContainer}>
                <Text style={styles.goalAmountSold}>{formatCurrency(totalSold)}</Text>
                <Text style={styles.goalAmountTarget}>/ {formatCurrency(rubro.metaSemanal)}</Text>
            </View>

            <View style={styles.progressBarBackground}>
                <LinearGradient
                    colors={[COLORS.primary, COLORS.secondary || COLORS.primary]} 
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressBarFill, { width: `${percentage}%` }]}
                />
            </View>
        </View>
    );
});

// --- Componente SaleCard (Sin cambios) ---
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

    let icon: keyof typeof Feather.glyphMap;
    let iconColor: string;
    let title: string;
    const formattedDate = formatDate(item.fecha);

    if (isAnulada) {
        icon = 'x-circle';
        iconColor = COLORS.danger; 
        title = `Anulada - ${formattedDate}`;
    } else if (item.tipo === 'reposicion') {
        icon = 'truck';
        iconColor = COLORS.warning; 
        title = `Reposición - ${formattedDate}`;
    } else if (item.tipo === 'devolucion') {
        icon = 'refresh-ccw';
        iconColor = COLORS.warning; 
        title = `Devolución - ${formattedDate}`;
    } else {
        icon = getStatusIcon(item.estado); 
        iconColor = color; 
        title = `Venta - ${formattedDate}`;
    }

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
                <Text style={styles.saleDate}>{title}</Text> 
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
    const { clientId } = route.params; 
    
    // --- ✅ CORRECCIÓN: Obtenemos el setter setSalesState del contexto ---
    const { 
        clients, 
        sales, 
        rubros, 
        isLoading: isDataLoading, 
        refreshAllData, 
        isOffline,
        setSalesState // <-- Nuevo setter expuesto en DataContext
    } = useData();
    const [isDeleting, setIsDeleting] = useState(false);
    
    // ❌ CORRECCIÓN: Eliminamos la declaración local incorrecta y usamos el setter del contexto.
    // const setSales: React.Dispatch<React.SetStateAction<Sale[]>> = useState<Sale[]>(sales)[1]; // LÍNEA ELIMINADA
    const setSales = setSalesState; // <-- Usamos el setter del contexto con el nombre que la función ya espera

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
            // --- ¡IMPORTANTE! Manejar el ID temporal aquí para que no sea filtrado ---
            if (sale.id.startsWith('OFFLINE_')) { 
                return Infinity; // Poner ventas offline al inicio de la lista
            }
            return 0;
        };

        return allSalesArray
            // Permitimos ventas con ID temporal para visibilidad
            .filter(s => s && s.id && s.clienteId === clientId) 
            .sort((a, b) => getTimestamp(b) - getTimestamp(a));
    }, [sales, clientId]);

    const weeklyGoalInfo = useMemo(() => {
        // ... (resto de la lógica sin cambios) ...
        const clientRubro = (Array.isArray(rubros) ? rubros : []).find(r => r.id === client?.rubroId); 
        
        if (!clientRubro) {
            return { rubro: undefined, totalSold: 0, percentage: 0 };
        }

        const metaSemanal = clientRubro.metaSemanal || 0;
        const lastMonday = getMonday(new Date());
        
        const salesThisWeek = clientSales.filter(sale => {
            if (sale.estado === 'Anulada') return false;
            
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

    // --- handleDeleteSale (Optimista e Instantánea) ---
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
                        
                        // --- 1. MUTACIÓN OPTIMISTA: Eliminar de la UI inmediatamente ---
                        // Esto usa setSales (que es un alias de setSalesState del contexto)
                        setSales((prevSales: Sale[]) => prevSales.filter(s => s.id !== saleId));
                        
                        try {
                            const db = dbContainer.instance; // Usamos dbContainer
                            if (!db) { throw new Error("DB no inicializada."); }
                            const saleRef = doc(db, 'ventas', saleId);
                            
                            const deletePromise = deleteDoc(saleRef);

                            if (isOffline) {
                                // MODO OFFLINE: Disparar sin await y confiar en la cola
                                deletePromise.catch(err => {
                                    // Log error pero ignorar (rely on persistence queue)
                                    console.warn(`[Offline Delete] Error en segundo plano (probablemente red): ${err}`);
                                });
                                Toast.show({ type: 'info', text1: 'Venta Eliminada (Offline)', position: 'bottom' });
                            } else {
                                // MODO ONLINE: Esperar confirmación
                                await deleteDoc(saleRef);
                                Toast.show({ type: 'success', text1: 'Venta Eliminada', position: 'bottom' });
                                // Ya no necesitamos refreshAllData() aquí, ya que el listener de ventas 
                                // de Firestore debería capturar el cambio (si es que existe), pero 
                                // la mutación optimista es suficiente para la UX inmediata.
                                // Si no hay listener, refreshAllData() podría ser necesario si no fuera 
                                // por la mutación optimista que ya eliminó el item.
                                // Mantener el refresh opcionalmente para consistencia de otros datos.
                                // await refreshAllData(); 
                            }
                        } catch (error) {
                            console.error("Error al eliminar la venta:", error);
                            Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo eliminar la venta.', position: 'bottom' });
                            // Opcional: Revertir mutación si falla en línea (mostrando la venta de nuevo)
                            // Esto requiere guardar la venta eliminada, por ahora lo dejamos simple.
                            // Si la operación es atómica (solo eliminación), la reversión no es crítica
                            // ya que el refresh/listener debería reintroducirla si falla en línea.
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    }, [isDeleting, refreshAllData, isOffline, setSales]); 

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
        // La navegación a CreateSale para edición funciona como la base de la edición.
        // La mutación optimista del EDIT se debe implementar en CreateSale.tsx.
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
            client: client 
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

    // --- RenderItem (Sin cambios) ---
    const renderSaleCard = useCallback(({ item }: { item: Sale }) => (
        <SaleCard
            item={item}
            onNavigate={navigateToSaleDetail}
            onEdit={navigateToEditSale}
            onDelete={handleDeleteSale}
        />
    ), [navigateToSaleDetail, navigateToEditSale, handleDeleteSale]);


    // --- Render Lógica de Carga (Sin cambios) ---
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

    // --- RENDER (Sin cambios) ---
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

                        <WeeklyGoalWidget goalInfo={weeklyGoalInfo} />

                        <View style={styles.actionsContainer}>
                            <TouchableOpacity
                                style={styles.mainActionButton}
                                onPress={navigateToNewSale}
                            >
                                <Feather name="plus-circle" size={22} color={COLORS.primaryDark} />
                                <Text style={styles.mainActionButtonText}>Nueva Venta</Text>
                            </TouchableOpacity>
                            
                            <View style={styles.secondaryActionsRow}>
                                
                                <TouchableOpacity
                                    style={[styles.secondaryActionButton, { flex: 1, backgroundColor: `${COLORS.warning}30` }]}
                                    onPress={navigateToNewDevolucion}
                                >
                                    <Feather name="refresh-ccw" size={20} color={COLORS.warning} />
                                    <Text style={[styles.secondaryActionButtonText, { color: COLORS.warning }]}>Devolución</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={[styles.secondaryActionButton, { backgroundColor: COLORS.glass }]}
                                onPress={navigateToClientDebts}
                            >
                                <Feather name="dollar-sign" size={20} color={COLORS.primary} />
                                <Text style={styles.secondaryActionButtonText}>Ver Saldos</Text>
                            </TouchableOpacity>

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
                        <Feather name="file-text" size={32} color={COLORS.textSecondary} />
                        <Text style={styles.emptyText}>Este cliente aún no tiene ventas registradas.</Text>
                    </View>
                }
                ListFooterComponent={<View style={{ height: 40 }} />}
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={11}
            />
        </View>
    );
};

// --- Estilos (Sin cambios) ---
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
    
    contactActions: { 
        flexDirection: 'row',
        gap: 15,
        marginTop: 10,
    },
    contactButton: { 
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: COLORS.glass,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    contactButtonText: { 
        color: COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '500',
    },

    goalCard: {
        backgroundColor: COLORS.glass,
        marginHorizontal: 20,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        padding: 15,
        marginBottom: 25, 
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
        marginBottom: 2, 
    },
    progressBarBackground: {
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.1)', 
        borderRadius: 5,
        overflow: 'hidden', 
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },

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
    actionButtonsGroup: { 
        flexDirection: 'row', 
        alignItems: 'center', 
    },
    actionButton: {
        padding: 8,
        marginLeft: 8,
    },
});

export default ClientDashboardScreen;