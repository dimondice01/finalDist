// src/screens/EditClientScreen.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { EditClientScreenProps } from '../navigation/AppNavigator';

// --- Contexto, DB, Tipos --
// ✅ Agregamos PriceList a los imports
import { Client, PriceList, Rubro, useData, Zone } from '../../context/DataContext';
import { COLORS, SIZES } from '../../styles/theme';

interface LocationCoords { latitude: number; longitude: number; }

// --- CONSTANTES AFIP ---
type DocumentType = 'DNI' | 'CUIT' | 'CUIL' | 'PAS' | 'SC';
const DOCUMENT_TYPES: { id: DocumentType; nombre: string; }[] = [
    { id: 'SC', nombre: 'Consumidor Final (SC)' },
    { id: 'DNI', nombre: 'DNI' },
    { id: 'CUIT', nombre: 'CUIT' },
    { id: 'CUIL', nombre: 'CUIL' },
    { id: 'PAS', nombre: 'Pasaporte' },
];

// ✅ CONSTANTE NUEVA: Condiciones IVA
const CONDICIONES_IVA = [
    { id: 'CF', nombre: 'Consumidor Final' },
    { id: 'MT', nombre: 'Monotributo' },
    { id: 'RI', nombre: 'Responsable Inscripto' },
    { id: 'EX', nombre: 'Exento' },
];

// --- Estilos de Modal (Auxiliar) ---
const modalStyles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { width: '85%', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder },
    modalHeader: { paddingVertical: SIZES.medium, borderBottomWidth: SIZES.borderWidth, borderBottomColor: COLORS.glassBorder, alignItems: 'center' },
    modalTitle: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textTransform: 'uppercase' },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SIZES.medium },
    modalItemText: { fontSize: SIZES.body, color: COLORS.textPrimary },
    separatorModal: { height: SIZES.borderWidth, backgroundColor: COLORS.glassBorder, marginHorizontal: SIZES.small },
    modalCloseButton: { marginTop: SIZES.large, padding: SIZES.medium, backgroundColor: COLORS.primary, borderRadius: SIZES.radius, alignItems: 'center', marginHorizontal: SIZES.medium, marginBottom: SIZES.medium },
    modalCloseText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
});

// --- Componente Modal Selector de Tipo de Documento ---
const DocumentTypeSelectorModal = React.memo(({ visible, onClose, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    selectedId: DocumentType;
    onSelect: (id: DocumentType) => void;
}) => {
    const renderItem = useCallback(({ item }: { item: { id: DocumentType, nombre: string } }) => (
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.id); onClose(); }}>
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}><Text style={modalStyles.modalTitle}>TIPO DE DOCUMENTO *</Text></View>
                    <FlatList data={DOCUMENT_TYPES} keyExtractor={(item) => item.id} renderItem={renderItem} ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />} contentContainerStyle={{ paddingHorizontal: SIZES.medium }} />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}><Text style={modalStyles.modalCloseText}>Cerrar</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

// --- Componente Modal Selector de Zona ---
const ZoneSelectorModal = React.memo(({ visible, onClose, zones, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    zones: Zone[];
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: Zone[] = useMemo(() => [{ id: '', nombre: 'Seleccionar Zona *' }, ...zones], [zones]);
    const renderItem = useCallback(({ item }: { item: Zone }) => (
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.id); onClose(); }}>
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {item.id === selectedId && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}><Text style={modalStyles.modalTitle}>SELECCIONAR ZONA *</Text></View>
                    <FlatList data={dataWithDefaultOption} keyExtractor={(item) => item.id || 'default'} renderItem={renderItem} ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />} contentContainerStyle={{ paddingHorizontal: SIZES.medium }} />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}><Text style={modalStyles.modalCloseText}>Cerrar</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

// --- Componente Modal Selector de Rubro ---
const RubroSelectorModal = React.memo(({ visible, onClose, rubros, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    rubros: Rubro[]; 
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: Rubro[] = useMemo(() => [{ id: '', nombre: 'Seleccionar Rubro (Opcional)', metaSemanal: 0 }, ...rubros], [rubros]);
    const renderItem = useCallback(({ item }: { item: Rubro }) => (
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.id); onClose(); }}>
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {item.id === selectedId && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}><Text style={modalStyles.modalTitle}>SELECCIONAR RUBRO</Text></View>
                    <FlatList data={dataWithDefaultOption} keyExtractor={(item) => item.id || 'default'} renderItem={renderItem} ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />} contentContainerStyle={{ paddingHorizontal: SIZES.medium }} />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}><Text style={modalStyles.modalCloseText}>Cerrar</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

// ✅ --- Componente Modal Selector de Lista de Precios ---
const PriceListSelectorModal = React.memo(({ visible, onClose, lists, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    lists: PriceList[]; 
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: PriceList[] = useMemo(() => [
        { id: '', nombre: 'Precio Base (General)' }, 
        ...lists
    ], [lists]);

    const renderItem = useCallback(({ item }: { item: PriceList }) => ( 
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.nombre === 'Precio Base (General)' ? '' : item.nombre); onClose(); }}>
            <Text style={[modalStyles.modalItemText, (item.nombre === selectedId || (selectedId === '' && item.id === '')) ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>
                {item.nombre}
            </Text>
            {(item.nombre === selectedId || (selectedId === '' && item.id === '')) && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}><Text style={modalStyles.modalTitle}>LISTA DE PRECIOS</Text></View>
                    <FlatList data={dataWithDefaultOption} keyExtractor={(item) => item.id || item.nombre} renderItem={renderItem} ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />} contentContainerStyle={{ paddingHorizontal: SIZES.medium }} />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}><Text style={modalStyles.modalCloseText}>Cerrar</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

// ✅ NUEVO MODAL: Condición IVA
const FiscalConditionSelectorModal = React.memo(({ visible, onClose, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const renderItem = useCallback(({ item }: { item: { id: string, nombre: string } }) => (
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.id); onClose(); }}>
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}><Text style={modalStyles.modalTitle}>CONDICIÓN IVA *</Text></View>
                    <FlatList data={CONDICIONES_IVA} keyExtractor={(item) => item.id} renderItem={renderItem} ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />} contentContainerStyle={{ paddingHorizontal: SIZES.medium }} />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}><Text style={modalStyles.modalCloseText}>Cerrar</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

// ✅ NUEVO MODAL: Información Detallada del Cliente
const ClientInfoModal = React.memo(({ visible, onClose, clientData }: {
    visible: boolean;
    onClose: () => void;
    clientData: any;
}) => {
    const InfoRow = ({ label, value, icon }: { label: string, value: string, icon: string }) => (
        <View style={infoModalStyles.infoRow}>
            <View style={infoModalStyles.iconCircle}>
                <Feather name={icon as any} size={14} color={COLORS.primary} />
            </View>
            <View style={infoModalStyles.textCol}>
                <Text style={infoModalStyles.label}>{label}</Text>
                <Text style={infoModalStyles.value}>{value || '---'}</Text>
            </View>
        </View>
    );

    return (
        <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={infoModalStyles.overlay}>
                <View style={infoModalStyles.content}>
                    <View style={infoModalStyles.header}>
                        <Text style={infoModalStyles.title}>RESUMEN DE CLIENTE</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={24} color={COLORS.textPrimary} />
                        </TouchableOpacity>
                    </View>
                    
                    <ScrollView contentContainerStyle={infoModalStyles.scroll}>
                        <View style={infoModalStyles.section}>
                            <Text style={infoModalStyles.sectionTitle}>Identidad</Text>
                            <InfoRow label="Nombre" value={clientData.nombre} icon="user" />
                            <InfoRow label="Razón Social" value={clientData.nombreCompleto} icon="briefcase" />
                            <InfoRow label="Documento" value={`${clientData.tipoDocumento} ${clientData.numeroDocumento}`} icon="file-text" />
                        </View>

                        <View style={infoModalStyles.section}>
                            <Text style={infoModalStyles.sectionTitle}>Fiscal y Comercial</Text>
                            <InfoRow label="Condición IVA" value={CONDICIONES_IVA.find(c => c.id === clientData.condicionIva)?.nombre || 'Consumidor Final'} icon="award" />
                            <InfoRow label="Lista de Precios" value={clientData.listaPreciosAsignada || 'Precio Base (General)'} icon="dollar-sign" />
                            <InfoRow label="Factura AFIP" value={clientData.isArca ? 'Habilitada' : 'No requerida'} icon="book-open" />
                        </View>

                        <View style={infoModalStyles.section}>
                            <Text style={infoModalStyles.sectionTitle}>Contacto</Text>
                            <InfoRow label="Teléfono" value={clientData.telefono} icon="phone" />
                            <InfoRow label="Email" value={clientData.email} icon="mail" />
                        </View>

                        <View style={infoModalStyles.section}>
                            <Text style={infoModalStyles.sectionTitle}>Ubicación</Text>
                            <InfoRow label="Dirección" value={clientData.direccion} icon="map-pin" />
                            <InfoRow label="Barrio/Localidad" value={`${clientData.barrio || ''}, ${clientData.localidad || ''}`} icon="navigation" />
                            <InfoRow label="GPS" value={clientData.location ? `${clientData.location.latitude.toFixed(5)}, ${clientData.location.longitude.toFixed(5)}` : 'No capturada'} icon="crosshair" />
                        </View>
                    </ScrollView>

                    <TouchableOpacity onPress={onClose} style={infoModalStyles.closeBtn}>
                        <Text style={infoModalStyles.closeBtnText}>CERRAR</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});

const infoModalStyles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    content: { backgroundColor: COLORS.backgroundEnd, borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '85%', padding: SIZES.large },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.large, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, paddingBottom: SIZES.medium },
    title: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.primary },
    scroll: { paddingBottom: 40 },
    section: { marginBottom: SIZES.large, backgroundColor: COLORS.backgroundStart, borderRadius: 15, padding: SIZES.medium },
    sectionTitle: { fontSize: 12, color: COLORS.textSecondary, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: SIZES.medium, letterSpacing: 1 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.medium },
    iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0, 122, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.medium },
    textCol: { flex: 1 },
    label: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase' },
    value: { fontSize: 15, color: COLORS.textPrimary, fontWeight: '600' },
    closeBtn: { backgroundColor: COLORS.primary, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center', marginTop: SIZES.small },
    closeBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 }
});


// ======================================================
// --- COMPONENTE PRINCIPAL ---
// ======================================================
const EditClientScreen = ({ navigation, route }: EditClientScreenProps) => {

    const { clientId } = route.params;
    // ✅ Extraemos priceLists del hook
    const { clients, zones, rubros, priceLists, updateClient, isOffline } = useData();

    const initialClient = useMemo(() => clients.find(c => c.id === clientId) as (Client & { requiereFacturaAfip?: boolean, tipoDocumento?: DocumentType, numeroDocumento?: string, condicionIva?: string }) | undefined, [clients, clientId]);

    if (!initialClient) {
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.danger} />
                <Text style={styles.loaderText}>Error: Cliente con ID {clientId} no encontrado.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonError}>
                    <Text style={styles.backButtonErrorText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }
    
    // --- Estados Iniciales ---
    const [formData, setFormData] = useState({
        nombre: initialClient.nombre || '',
        nombreCompleto: initialClient.nombreCompleto || '',
        direccion: initialClient.direccion || '',
        telefono: initialClient.telefono || '',
        email: initialClient.email || '',
        barrio: initialClient.barrio || '',
        localidad: initialClient.localidad || '',
        zonaId: initialClient.zonaId || '',
        rubroId: initialClient.rubroId || '',
        // ✅ Lista Precios
        listaPreciosAsignada: initialClient.listaPreciosAsignada || '', 
        // AFIP
        isArca: initialClient.requiereFacturaAfip !== undefined ? initialClient.requiereFacturaAfip : (initialClient.arca || false), 
        tipoDocumento: initialClient.tipoDocumento || 'SC' as DocumentType,
        numeroDocumento: initialClient.numeroDocumento || '',
        condicionIva: initialClient.condicionIva || 'CF',
    });

    // Estados UI
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false);
    const [isRubroModalVisible, setIsRubroModalVisible] = useState(false);
    const [isMapModalVisible, setIsMapModalVisible] = useState(false);
    const [isDocumentTypeModalVisible, setIsDocumentTypeModalVisible] = useState(false);
    // ✅ Modal Lista Precios
    const [isPriceListModalVisible, setIsPriceListModalVisible] = useState(false);
    const [isFiscalModalVisible, setIsFiscalModalVisible] = useState(false);
    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    
    const [location, setLocation] = useState<LocationCoords | null>(
        initialClient.location ? initialClient.location : null
    );
    const [mapRegion, setMapRegion] = useState(() => ({ 
        latitude: initialClient.location?.latitude || -34.603722, 
        longitude: initialClient.location?.longitude || -58.381592, 
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    }));
    
    const handleInputChange = (field: keyof typeof formData, value: string | boolean | DocumentType) => {
        setFormData(prev => ({ 
            ...prev, 
            [field]: value 
        }));
    };

    // --- MEMOS ---
    const zonasDelVendedor = useMemo(() => {
        const safeZones = Array.isArray(zones) ? zones : [];
        return [...safeZones].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [zones]);
    
    const selectedZoneName = useMemo(() => {
        return zonasDelVendedor.find(z => z.id === formData.zonaId)?.nombre || 'Seleccionar zona *';
    }, [formData.zonaId, zonasDelVendedor]);

    const rubrosOrdenados = useMemo(() => {
        const safeRubros = Array.isArray(rubros) ? rubros : [];
        return [...safeRubros].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [rubros]);

    const selectedRubroName = useMemo(() => {
        const selectedRubro = rubrosOrdenados.find(r => r.id === formData.rubroId);
        return selectedRubro ? selectedRubro.nombre : 'Seleccionar Rubro (Opcional)';
    }, [formData.rubroId, rubrosOrdenados]);

    const selectedDocumentTypeName = useMemo(() => {
        const selectedType = DOCUMENT_TYPES.find(d => d.id === formData.tipoDocumento);
        return selectedType ? selectedType.nombre : 'Seleccionar Tipo Doc *';
    }, [formData.tipoDocumento]);

    // ✅ Nombre de Lista Seleccionada
    const selectedPriceListName = useMemo(() => {
        return formData.listaPreciosAsignada || 'Precio Base (General)';
    }, [formData.listaPreciosAsignada]);


    // --- HANDLERS ---
    const handleLocationPress = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert("Permiso Denegado", "Se necesita permiso de ubicación para obtener la geolocalización.");
            return;
        }
        try {
            const currentPosition = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const coords = {
                latitude: currentPosition.coords.latitude,
                longitude: currentPosition.coords.longitude,
            };
            setLocation(coords);
            setMapRegion(prev => ({ ...prev, ...coords }));
            setIsMapModalVisible(true);
            Toast.show({ type: 'success', text1: 'Ubicación Obtenida', position: 'bottom' });
        } catch (error) {
            Alert.alert("Error de Ubicación", "No se pudo obtener la ubicación.");
        }
    };

    const onMapConfirm = (coords: LocationCoords) => {
        setLocation(coords);
        setIsMapModalVisible(false);
    };
    
    const handleRegionChangeComplete = (region: typeof mapRegion) => {
        setMapRegion(region);
    };

    const handleOpenInfo = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setIsInfoModalVisible(true);
    };

    const handleSave = async () => {
        if (!formData.nombre || !formData.zonaId || !formData.telefono.trim()) { 
            Alert.alert("Campos Requeridos", "Nombre, Zona y Teléfono son obligatorios."); 
            return; 
        }
        if (formData.isArca && (formData.tipoDocumento === 'SC' || !formData.numeroDocumento.trim())) {
            Alert.alert('Datos Incompletos AFIP', 'Para facturación ARCA, debe seleccionar un Tipo de Documento válido (no SC) e ingresar el Número de Documento/CUIT.');
            return;
        }

        setIsSubmitting(true);
        Haptics.notificationAsync('success' as any); 

        const finalTipoDocumento = formData.isArca ? formData.tipoDocumento : 'SC';
        const finalNumeroDocumento = formData.isArca ? formData.numeroDocumento.trim() : '';
        const finalCondicionIva = formData.isArca ? formData.condicionIva : 'CF';

        const updatedClientData = {
            ...formData, 
            location: location, 
            
            nombreCompleto: formData.nombreCompleto || formData.nombre,
            telefono: formData.telefono || '',
            email: formData.email || '',
            barrio: formData.barrio || '',
            localidad: formData.localidad || '',
            direccion: formData.direccion || '',
            rubroId: formData.rubroId || '',
            // ✅ Guardamos Lista
            listaPreciosAsignada: formData.listaPreciosAsignada || '',
            
            requiereFacturaAfip: formData.isArca, 
            tipoDocumento: finalTipoDocumento,
            numeroDocumento: finalNumeroDocumento,
            condicionIva: finalCondicionIva,
            arca: formData.isArca, 
        };

        try {
            await updateClient(initialClient.id, updatedClientData);
            Toast.show({
                type: 'success',
                text1: isOffline ? 'Cliente Guardado (Offline)' : 'Cliente Actualizado',
                text2: isOffline ? `Se sincronizará al conectar.` : `Se guardaron los datos de ${formData.nombre}.`,
                position: 'bottom'
            });
            navigation.goBack();
        } catch (error: any) {
            console.error("Error al actualizar cliente:", error);
            Alert.alert("Error", "No se pudo actualizar el cliente: " + error.message);
        } finally {
             setIsSubmitting(false);
        }
    };


    // ======================================================
    // --- RENDERIZADO ---
    // ======================================================

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>EDITAR CLIENTE</Text>
                <View style={styles.headerButton} />
            </View>

            <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContentContainer} keyboardShouldPersistTaps="handled">
                
                {/* 🛡️ BOTÓN DE INFORMACIÓN COMPLETA */}
                <TouchableOpacity style={styles.infoSummaryBtn} onPress={handleOpenInfo}>
                    <View style={styles.infoSummaryLeft}>
                        <Feather name="info" size={20} color={COLORS.white} />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.infoSummaryTitle}>VER INFORMACIÓN COMPLETA</Text>
                            <Text style={styles.infoSummarySub}>Consulta todos los datos cargados del cliente</Text>
                        </View>
                    </View>
                    <Feather name="chevron-right" size={20} color={COLORS.white} />
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>INFORMACIÓN PRINCIPAL</Text>
                
                <View style={styles.inputContainer}>
                    <Feather name="user" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Nombre (Alias) *"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.nombre}
                        onChangeText={(val) => handleInputChange('nombre', val)}
                        autoCapitalize="words"
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Feather name="briefcase" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Nombre Completo / Razón Social"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.nombreCompleto}
                        onChangeText={(val) => handleInputChange('nombreCompleto', val)}
                    />
                </View>

                {/* Zona */}
                <View style={styles.pickerContainer}>
                    <Feather name="map" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: formData.zonaId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedZoneName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
                
                {/* Rubro */}
                <View style={styles.pickerContainer}>
                    <Feather name="tag" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsRubroModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: formData.rubroId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedRubroName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {/* ✅ SELECTOR LISTA DE PRECIOS (OPCIONAL) */}
                <View style={styles.pickerContainer}>
                    <Feather name="dollar-sign" size={SIZES.h3} color={COLORS.secondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsPriceListModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: formData.listaPreciosAsignada ? COLORS.secondary : COLORS.textSecondary, fontWeight: formData.listaPreciosAsignada ? 'bold' : 'normal' }]}>
                            {selectedPriceListName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.secondary} />
                    </TouchableOpacity>
                </View>

                {/* ARCA SWITCH */}
                <View style={[styles.inputContainer, styles.arcaSwitchContainer]}>
                    <Feather name="book-open" size={SIZES.h3} color={COLORS.primary} style={styles.inputIcon} />
                    <Text style={styles.arcaLabel}>Cliente requiere Factura ARCA</Text>
                    <Switch
                        trackColor={{ false: COLORS.textSecondary, true: COLORS.primary }}
                        thumbColor={formData.isArca ? COLORS.backgroundEnd : COLORS.glassBorder}
                        onValueChange={(val) => handleInputChange('isArca', val)}
                        value={formData.isArca as boolean}
                    />
                </View>

                {formData.isArca && (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: SIZES.small }]}>DATOS TRIBUTARIOS (AFIP)</Text>
                        <View style={styles.pickerContainer}>
                            <Feather name="file-text" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TouchableOpacity
                                style={styles.pickerButton}
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsDocumentTypeModalVisible(true); }}
                            >
                                <Text style={[styles.pickerButtonText, { color: formData.tipoDocumento !== 'SC' ? COLORS.textPrimary : COLORS.textSecondary }]}>
                                    {selectedDocumentTypeName}
                                </Text>
                                <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.inputContainer}>
                            <Feather name="hash" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TextInput 
                                style={styles.input} 
                                placeholder="Número Documento/CUIT *" 
                                placeholderTextColor={COLORS.textSecondary} 
                                value={formData.numeroDocumento} 
                                onChangeText={(val) => handleInputChange('numeroDocumento', val)}
                                keyboardType={formData.tipoDocumento === 'CUIT' || formData.tipoDocumento === 'CUIL' ? 'number-pad' : 'default'}
                            />
                        </View>

                        {/* ✅ Nueva Condición IVA */}
                        <View style={styles.pickerContainer}>
                            <Feather name="award" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TouchableOpacity
                                style={styles.pickerButton}
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsFiscalModalVisible(true); }}
                            >
                                <Text style={[styles.pickerButtonText, { color: COLORS.textPrimary }]}>
                                    {CONDICIONES_IVA.find(c => c.id === formData.condicionIva)?.nombre || 'Consumidor Final'}
                                </Text>
                                <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
                
                <Text style={styles.sectionTitle}>CONTACTO Y UBICACIÓN</Text>
                
                <View style={styles.inputContainer}>
                    <Feather name="map-pin" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Dirección"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.direccion}
                        onChangeText={(val) => handleInputChange('direccion', val)}
                        autoCapitalize="words"
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Feather name="navigation" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Barrio"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.barrio}
                        onChangeText={(val) => handleInputChange('barrio', val)}
                        autoCapitalize="words"
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Feather name="compass" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Localidad"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.localidad}
                        onChangeText={(val) => handleInputChange('localidad', val)}
                        autoCapitalize="words"
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Feather name="phone" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Teléfono * (Obligatorio)"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.telefono}
                        onChangeText={(val) => handleInputChange('telefono', val)}
                        keyboardType="phone-pad"
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Feather name="mail" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.email}
                        onChangeText={(val) => handleInputChange('email', val)}
                        keyboardType="email-address"
                        autoCapitalize='none'
                    />
                </View>

                <TouchableOpacity style={styles.locationButton} onPress={handleLocationPress}>
                    <Feather name="map" size={SIZES.h3} color={COLORS.white} />
                    <Text style={styles.locationButtonText}>
                        {location ? "Actualizar/Mover Ubicación" : "Capturar Ubicación GPS"}
                    </Text>
                </TouchableOpacity>
                {location && (
                    <Text style={styles.coordsText}>
                        Coords: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </Text>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.button, (isSubmitting || !formData.nombre || !formData.zonaId || !formData.telefono.trim() || (formData.isArca && (formData.tipoDocumento === 'SC' || !formData.numeroDocumento.trim()))) && styles.buttonDisabled]}
                    onPress={handleSave}
                    disabled={isSubmitting || !formData.nombre || !formData.zonaId || !formData.telefono.trim() || (formData.isArca && (formData.tipoDocumento === 'SC' || !formData.numeroDocumento.trim()))}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color={COLORS.white} />
                    ) : (
                        <Text style={styles.buttonText}>
                            {isOffline ? 'GUARDAR (OFFLINE)' : 'GUARDAR CAMBIOS'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Modales */}
            <ZoneSelectorModal visible={isZoneModalVisible} onClose={() => setIsZoneModalVisible(false)} zones={zonasDelVendedor} selectedId={formData.zonaId} onSelect={(id) => handleInputChange('zonaId', id)} />
            <RubroSelectorModal visible={isRubroModalVisible} onClose={() => setIsRubroModalVisible(false)} rubros={rubrosOrdenados} selectedId={formData.rubroId} onSelect={(id) => handleInputChange('rubroId', id)} />
            <DocumentTypeSelectorModal visible={isDocumentTypeModalVisible} onClose={() => setIsDocumentTypeModalVisible(false)} selectedId={formData.tipoDocumento} onSelect={(id) => handleInputChange('tipoDocumento', id)} />
            
            {/* ✅ Modal Lista */}
            <PriceListSelectorModal visible={isPriceListModalVisible} onClose={() => setIsPriceListModalVisible(false)} lists={priceLists} selectedId={formData.listaPreciosAsignada} onSelect={(id) => handleInputChange('listaPreciosAsignada', id)} />

            {/* ✅ Modal Fiscal */}
            <FiscalConditionSelectorModal visible={isFiscalModalVisible} onClose={() => setIsFiscalModalVisible(false)} selectedId={formData.condicionIva} onSelect={(id: string) => handleInputChange('condicionIva', id)} />

            {/* ✅ Modal Info */}
            <ClientInfoModal visible={isInfoModalVisible} onClose={() => setIsInfoModalVisible(false)} clientData={formData} />

            {/* Modal Mapa */}
            <Modal visible={isMapModalVisible} animationType="slide" onRequestClose={() => setIsMapModalVisible(false)}>
                <View style={styles.mapContainer}>
                    <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
                    <MapView provider={PROVIDER_GOOGLE} style={styles.map} region={mapRegion} onRegionChangeComplete={handleRegionChangeComplete} showsUserLocation>
                        <Marker coordinate={mapRegion} draggable />
                    </MapView>
                    <View style={styles.mapControls}>
                        <Text style={styles.mapInstructions}>Mueva el mapa hasta que el marcador esté en la ubicación exacta.</Text>
                        <TouchableOpacity style={styles.button} onPress={() => onMapConfirm({ latitude: mapRegion.latitude, longitude: mapRegion.longitude })}>
                            <Text style={styles.buttonText}>Confirmar Ubicación</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.mapCancelButton} onPress={() => setIsMapModalVisible(false)}>
                            <Text style={styles.mapCancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SIZES.medium, backgroundColor: COLORS.backgroundStart },
    loaderText: { fontSize: SIZES.body, color: COLORS.danger, fontWeight: 'bold' },
    backButtonError: { marginTop: SIZES.large, backgroundColor: COLORS.primary, paddingVertical: SIZES.small, paddingHorizontal: SIZES.large, borderRadius: SIZES.radius },
    backButtonErrorText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: (StatusBar.currentHeight || 0) + SIZES.small, paddingBottom: SIZES.medium, paddingHorizontal: SIZES.small, backgroundColor: COLORS.backgroundStart, borderBottomWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder },
    headerButton: { padding: SIZES.small, width: 48 },
    title: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', textTransform: 'uppercase' },
    formContainer: { flex: 1 },
    formContentContainer: { paddingHorizontal: SIZES.large, paddingBottom: SIZES.xl * 2, paddingTop: SIZES.medium },
    sectionTitle: { fontSize: SIZES.caption, color: COLORS.textSecondary, fontWeight: '700', textTransform: 'uppercase', marginTop: SIZES.large, marginBottom: SIZES.small, marginLeft: SIZES.xsmall },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, paddingHorizontal: SIZES.medium, marginBottom: SIZES.medium, height: 52 },
    inputIcon: { marginRight: SIZES.medium },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body, height: '100%' },
    pickerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, paddingLeft: SIZES.medium, marginBottom: SIZES.medium, height: 52 },
    pickerButton: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: SIZES.medium, height: '100%' },
    pickerButtonText: { fontSize: SIZES.body },
    arcaSwitchContainer: { justifyContent: 'space-between', paddingRight: SIZES.medium, backgroundColor: COLORS.backgroundEnd, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, marginBottom: SIZES.large },
    arcaLabel: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body },
    locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.small, paddingVertical: SIZES.medium, borderRadius: SIZES.radius, backgroundColor: COLORS.primary, marginBottom: SIZES.large, height: 56, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    locationButtonText: { color: COLORS.white, fontSize: SIZES.body, fontWeight: 'bold', textTransform: 'uppercase' },
    coordsText: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.large, fontSize: SIZES.caption, fontStyle: 'italic' },
    footer: { padding: SIZES.large, borderTopWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, backgroundColor: COLORS.backgroundEnd, paddingBottom: Platform.OS === 'ios' ? SIZES.xl : SIZES.large },
    button: { backgroundColor: COLORS.primary, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center', height: 56, justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 8 },
    buttonDisabled: { backgroundColor: COLORS.disabled, shadowOpacity: 0.1, elevation: 2 },
    buttonText: { color: COLORS.white, fontSize: SIZES.h3, fontWeight: 'bold', textTransform: 'uppercase' },
    mapContainer: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },
    mapControls: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.backgroundEnd, padding: SIZES.large, borderTopLeftRadius: SIZES.radius, borderTopRightRadius: SIZES.radius, gap: SIZES.medium, paddingBottom: Platform.OS === 'ios' ? SIZES.xl : SIZES.large },
    mapInstructions: { color: COLORS.textSecondary, textAlign: 'center', fontSize: SIZES.caption, marginBottom: SIZES.small },
    mapCancelButton: { marginTop: SIZES.small, alignItems: 'center' },
    mapCancelButtonText: { color: COLORS.textSecondary, fontSize: SIZES.body, fontWeight: '500' },

    // 🛡️ Estilos Botón Resumen
    infoSummaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.primary,
        padding: SIZES.medium,
        borderRadius: SIZES.radius,
        marginBottom: SIZES.large,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6
    },
    infoSummaryLeft: { flexDirection: 'row', alignItems: 'center' },
    infoSummaryTitle: { color: COLORS.white, fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
    infoSummarySub: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 2 }
});

export default EditClientScreen;