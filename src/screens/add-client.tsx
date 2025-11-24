// src/screens/add-client.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

// --- SDK NATIVO (v9 Modular) ---
import {
    addDoc,
    collection,
    serverTimestamp
} from '@react-native-firebase/firestore';

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

import { AddClientScreenProps } from '../navigation/AppNavigator';
// ✅ Importamos PriceList
import { PriceList, Rubro, useData, Zone } from '../../context/DataContext';
import { auth, dbContainer } from '../../db/firebase-service';
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

// --- MODALES ---

// 1. Tipo Documento
const DocumentTypeSelectorModal = ({ visible, onClose, selectedId, onSelect }: {
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
};

// 2. Zona
const ZoneSelectorModal = ({ visible, onClose, zones, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    zones: Zone[];
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: Zone[] = useMemo(() => [{ id: '', nombre: 'Seleccionar Zona *' }, ...zones], [zones]);
    const renderItem = useCallback(({ item }: { item: Zone }) => (
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.id); onClose(); }}>
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
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
};

// 3. Rubro
const RubroSelectorModal = ({ visible, onClose, rubros, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    rubros: Rubro[]; 
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: Rubro[] = useMemo(() => [{ id: '', nombre: 'Seleccionar Rubro (Opcional)', metaSemanal: 0 }, ...rubros], [rubros]);
    const renderItem = useCallback(({ item }: { item: Rubro }) => ( 
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.id); onClose(); }}>
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
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
};

// ✅ 4. NUEVO: Modal Lista de Precios
const PriceListSelectorModal = ({ visible, onClose, lists, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    lists: PriceList[]; 
    selectedId: string;
    onSelect: (id: string) => void; // Aquí pasamos el NOMBRE de la lista como ID (según lógica web)
}) => {
    // En la Web guardamos el NOMBRE de la lista (ej: "Mayorista") como referencia
    const dataWithDefaultOption: PriceList[] = useMemo(() => [
        { id: '', nombre: 'Precio Base (General)' }, 
        ...lists
    ], [lists]);

    const renderItem = useCallback(({ item }: { item: PriceList }) => ( 
        <TouchableOpacity style={modalStyles.modalItem} onPress={() => { onSelect(item.nombre === 'Precio Base (General)' ? '' : item.nombre); onClose(); }}>
            {/* Usamos item.nombre como identificador si no es el default */}
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
};


const AddClientScreen = ({ navigation }: AddClientScreenProps) => {
    const [nombre, setNombre] = useState('');
    const [direccion, setDireccion] = useState('');
    const [barrio, setBarrio] = useState('');
    const [localidad, setLocalidad] = useState('');
    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');
    const [zonaId, setZonaId] = useState('');
    const [rubroId, setRubroId] = useState('');
    
    // ✅ NUEVO ESTADO: Lista de precios
    const [listaPreciosAsignada, setListaPreciosAsignada] = useState(''); 

    const [isArca, setIsArca] = useState(false);
    const [tipoDocumento, setTipoDocumento] = useState<DocumentType>('SC'); 
    const [numeroDocumento, setNumeroDocumento] = useState('');
    
    const [location, setLocation] = useState<LocationCoords | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // ✅ Extraemos priceLists
    const { availableZones, vendors, refreshAllData, rubros, priceLists, isOffline } = useData();
    const currentUser = auth.currentUser;
    
    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [tempRegion, setTempRegion] = useState({ latitude: -29.4134, longitude: -66.8569, latitudeDelta: 0.0922, longitudeDelta: 0.0421 });
    const [locationLoading, setLocationLoading] = useState(false);
    
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false); 
    const [isRubroModalVisible, setIsRubroModalVisible] = useState(false);
    const [isDocumentTypeModalVisible, setIsDocumentTypeModalVisible] = useState(false);
    // ✅ Modal lista
    const [isPriceListModalVisible, setIsPriceListModalVisible] = useState(false);

    // --- Memos ---
    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        return vendors.find((v: any) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    const zonasDelVendedor = useMemo(() => {
        if (!currentVendedor || !currentVendedor.zonasAsignadas || !availableZones) return [];
        const zonaIds = currentVendedor.zonasAsignadas;
        return availableZones.filter(z => z && z.id && zonaIds.includes(z.id)).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [currentVendedor, availableZones]);

    const rubrosOrdenados = useMemo(() => {
        const safeRubros = Array.isArray(rubros) ? rubros : [];
        return [...safeRubros].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [rubros]);

    const selectedZoneName = useMemo(() => {
        const selectedZone = zonasDelVendedor.find(z => z.id === zonaId);
        return selectedZone ? selectedZone.nombre : 'Seleccionar Zona *';
    }, [zonaId, zonasDelVendedor]);

    const selectedRubroName = useMemo(() => {
        const safeRubros = Array.isArray(rubros) ? rubros : [];
        const selectedRubro = safeRubros.find(r => r.id === rubroId);
        return selectedRubro ? selectedRubro.nombre : 'Seleccionar Rubro (Opcional)';
    }, [rubroId, rubros]);

    const selectedDocumentTypeName = useMemo(() => {
        const selectedType = DOCUMENT_TYPES.find(d => d.id === tipoDocumento);
        return selectedType ? selectedType.nombre : 'Seleccionar Tipo Doc *';
    }, [tipoDocumento]);

    // ✅ Memo Nombre Lista
    const selectedPriceListName = useMemo(() => {
        return listaPreciosAsignada || 'Precio Base (General)';
    }, [listaPreciosAsignada]);


    // --- Callbacks ---
    const handleLocation = useCallback(async () => {
        setLocationLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Se necesita permiso de ubicación.');
            setLocationLoading(false); return;
        }
        try {
            let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setTempRegion(prev => ({ ...prev, ...coords })); 
            setLocation(coords); 
            setMapModalVisible(true); 
        } catch (error) {
            console.error(error); Alert.alert('Error', 'No se pudo obtener ubicación.');
        } finally { setLocationLoading(false); }
    }, []); 

    const handleConfirmLocation = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMapModalVisible(false);
    }, []);

    // --- SAVE ---
    const handleSubmit = useCallback(async () => {
        if (!nombre.trim() || !zonaId) { Alert.alert('Datos Incompletos', 'Nombre y Zona son obligatorios.'); return; }
        if (isArca && (tipoDocumento === 'SC' || !numeroDocumento.trim())) { Alert.alert('Datos AFIP', 'Complete Tipo y Número de Documento.'); return; }
        if (isSubmitting) return;

        setIsSubmitting(true);
        Haptics.notificationAsync('success' as any); 

        const db = dbContainer.instance;
        if (!db) { Alert.alert('Error', 'DB no inicializada.'); setIsSubmitting(false); return; }

        const finalTipoDocumento = isArca ? tipoDocumento : 'SC';
        const finalNumeroDocumento = isArca ? numeroDocumento.trim() : '';

        try {
            const newClientData = {
                nombre: nombre.trim(),
                nombreCompleto: nombre.trim(),
                direccion: direccion.trim(),
                barrio: barrio.trim(),
                localidad: localidad.trim(),
                telefono: telefono.trim(),
                email: email.trim().toLowerCase(),
                zonaId,
                rubroId: rubroId || '', 
                location: location || null,
                vendedorAsignadoId: currentUser?.uid,
                
                requiereFacturaAfip: isArca, 
                tipoDocumento: finalTipoDocumento, 
                numeroDocumento: finalNumeroDocumento,
                
                // ✅ GUARDAMOS LA LISTA
                listaPreciosAsignada: listaPreciosAsignada || '',

                fechaCreacion: serverTimestamp(),
            };

            const clientesCollectionRef = collection(db, 'clientes');

            if (isOffline) {
                addDoc(clientesCollectionRef, newClientData).catch(err => console.error("Error offline:", err));
            } else {
                await addDoc(clientesCollectionRef, newClientData);
                await refreshAllData();
            }
            
            Toast.show({ type: 'success', text1: isOffline ? 'Guardado (Offline)' : 'Cliente Creado' });
            navigation.goBack(); 

        } catch (error) {
            console.error(error); Haptics.notificationAsync('error' as any); Alert.alert('Error', 'Falló la creación.'); setIsSubmitting(false); 
        }
    }, [
        nombre, zonaId, rubroId, direccion, barrio, localidad, telefono, email, 
        location, currentUser, isSubmitting, refreshAllData, navigation, isOffline, isArca,
        tipoDocumento, numeroDocumento, listaPreciosAsignada // ✅ Dependencia añadida
    ]);


    // --- RENDER ---
    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={SIZES.large} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>NUEVO CLIENTE</Text>
                <View style={styles.headerButton} />
            </View>

            <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
                <View style={styles.inputGroup}>
                    <Feather name="user" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Nombre o Razón Social *" placeholderTextColor={COLORS.textSecondary} value={nombre} onChangeText={setNombre} autoCapitalize="words" />
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="map-pin" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Dirección" placeholderTextColor={COLORS.textSecondary} value={direccion} onChangeText={setDireccion} autoCapitalize="words" />
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="navigation" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Barrio" placeholderTextColor={COLORS.textSecondary} value={barrio} onChangeText={setBarrio} autoCapitalize="words" />
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="map" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Localidad" placeholderTextColor={COLORS.textSecondary} value={localidad} onChangeText={setLocalidad} autoCapitalize="words" />
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="phone" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Teléfono" placeholderTextColor={COLORS.textSecondary} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="mail" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                </View>

                {/* Selector Zona */}
                <View style={styles.pickerContainer}>
                    <Feather name="compass" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity style={styles.pickerButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}>
                        <Text style={[styles.pickerButtonText, { color: zonaId ? COLORS.textPrimary : COLORS.textSecondary }]}>{selectedZoneName}</Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {/* Selector Rubro */}
                <View style={styles.pickerContainer}>
                    <Feather name="briefcase" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity style={styles.pickerButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsRubroModalVisible(true); }}>
                        <Text style={[styles.pickerButtonText, { color: rubroId ? COLORS.textPrimary : COLORS.textSecondary }]}>{selectedRubroName}</Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {/* ✅ NUEVO: Selector Lista de Precios */}
                <View style={styles.pickerContainer}>
                    <Feather name="tag" size={SIZES.h3} color={COLORS.secondary} style={styles.inputIcon} />
                    <TouchableOpacity style={styles.pickerButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsPriceListModalVisible(true); }}>
                        <Text style={[styles.pickerButtonText, { color: listaPreciosAsignada ? COLORS.secondary : COLORS.textSecondary, fontWeight: listaPreciosAsignada ? 'bold' : 'normal' }]}>
                            {selectedPriceListName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.secondary} />
                    </TouchableOpacity>
                </View>
                
                {/* ARCA Switch */}
                <View style={[styles.inputGroup, styles.arcaSwitchContainer]}>
                    <Feather name="book-open" size={SIZES.h3} color={COLORS.primary} style={styles.inputIcon} />
                    <Text style={styles.arcaLabel}>Cliente requiere Factura ARCA</Text>
                    <Switch trackColor={{ false: COLORS.textSecondary, true: COLORS.primary }} thumbColor={isArca ? COLORS.backgroundEnd : COLORS.glassBorder} onValueChange={setIsArca} value={isArca} />
                </View>

                {isArca && (
                    <>
                        <View style={styles.pickerContainer}>
                            <Feather name="file-text" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TouchableOpacity style={styles.pickerButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsDocumentTypeModalVisible(true); }}>
                                <Text style={[styles.pickerButtonText, { color: tipoDocumento !== 'SC' ? COLORS.textPrimary : COLORS.textSecondary }]}>{selectedDocumentTypeName}</Text>
                                <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.inputGroup}>
                            <Feather name="hash" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TextInput style={styles.input} placeholder="Número Documento/CUIT *" placeholderTextColor={COLORS.textSecondary} value={numeroDocumento} onChangeText={setNumeroDocumento} keyboardType={tipoDocumento === 'CUIT' || tipoDocumento === 'CUIL' ? 'number-pad' : 'default'} />
                        </View>
                    </>
                )}
                
                <TouchableOpacity style={styles.locationButton} onPress={handleLocation} disabled={locationLoading}>
                    {locationLoading ? (<ActivityIndicator color={COLORS.backgroundEnd} />) : (<Feather name={location ? "check-circle" : "crosshair"} size={SIZES.h3} color={COLORS.backgroundEnd} />)}
                    <Text style={styles.locationButtonText}>{location ? 'Ubicación Guardada' : 'Capturar Ubicación GPS'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, (isSubmitting || !nombre.trim() || !zonaId || (isArca && (tipoDocumento === 'SC' || !numeroDocumento.trim()))) && styles.buttonDisabled]} onPress={handleSubmit} disabled={isSubmitting || !nombre.trim() || !zonaId || (isArca && (tipoDocumento === 'SC' || !numeroDocumento.trim()))}>
                    {isSubmitting ? (<ActivityIndicator color={COLORS.white} />) : (<Text style={styles.buttonText}>{isOffline ? 'GUARDAR (OFFLINE)' : 'GUARDAR CLIENTE'}</Text>)}
                </TouchableOpacity>
            </ScrollView>

            <Modal visible={mapModalVisible} animationType="slide" onRequestClose={() => setMapModalVisible(false)}>
                <View style={styles.mapContainer}>
                    <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
                    <MapView provider={PROVIDER_GOOGLE} style={styles.map} region={tempRegion} onRegionChangeComplete={(region) => { setTempRegion(region); setLocation({ latitude: region.latitude, longitude: region.longitude }); }} showsUserLocation>
                        {location && <Marker coordinate={location} draggable onDragEnd={(e) => { setLocation(e.nativeEvent.coordinate); setTempRegion(prev => ({ ...prev, ...e.nativeEvent.coordinate })); }} />}
                    </MapView>
                    <View style={styles.mapControls}>
                        <Text style={styles.mapInstructions}>Mueva el mapa hasta que el marcador esté en la ubicación exacta.</Text>
                        <TouchableOpacity style={styles.button} onPress={handleConfirmLocation}><Text style={styles.buttonText}>Confirmar Ubicación</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.mapCancelButton} onPress={() => setMapModalVisible(false)}><Text style={styles.mapCancelButtonText}>Cancelar</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <ZoneSelectorModal visible={isZoneModalVisible} onClose={() => setIsZoneModalVisible(false)} zones={zonasDelVendedor} selectedId={zonaId} onSelect={setZonaId} />
            <RubroSelectorModal visible={isRubroModalVisible} onClose={() => setIsRubroModalVisible(false)} rubros={rubrosOrdenados} selectedId={rubroId} onSelect={setRubroId} />
            <DocumentTypeSelectorModal visible={isDocumentTypeModalVisible} onClose={() => setIsDocumentTypeModalVisible(false)} selectedId={tipoDocumento} onSelect={setTipoDocumento} />
            
            {/* ✅ NUEVO: Modal de Precio */}
            <PriceListSelectorModal visible={isPriceListModalVisible} onClose={() => setIsPriceListModalVisible(false)} lists={priceLists} selectedId={listaPreciosAsignada} onSelect={setListaPreciosAsignada} />
        </KeyboardAvoidingView>
    );
};

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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: (StatusBar.currentHeight || 0) + SIZES.small, paddingBottom: SIZES.medium, paddingHorizontal: SIZES.small, backgroundColor: COLORS.backgroundStart },
    headerButton: { padding: SIZES.small, width: 48 },
    title: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center', textTransform: 'uppercase' },
    formContainer: { flex: 1, paddingHorizontal: SIZES.large },
    formContent: { paddingBottom: SIZES.xl },
    inputGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, paddingHorizontal: SIZES.medium, marginBottom: SIZES.medium, height: 52 },
    inputIcon: { marginRight: SIZES.medium },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body, height: '100%' },
    pickerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, borderRadius: SIZES.radius, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, paddingLeft: SIZES.medium, marginBottom: SIZES.medium, height: 52 },
    pickerButton: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: SIZES.medium, height: '100%' },
    pickerButtonText: { fontSize: SIZES.body },
    arcaSwitchContainer: { justifyContent: 'space-between', paddingRight: SIZES.medium, backgroundColor: COLORS.backgroundEnd, borderWidth: SIZES.borderWidth, borderColor: COLORS.glassBorder, marginBottom: SIZES.medium },
    arcaLabel: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.body },
    locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.small, paddingVertical: SIZES.medium, borderRadius: SIZES.radius, backgroundColor: COLORS.primary, marginBottom: SIZES.large, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    locationButtonText: { color: COLORS.white, fontSize: SIZES.body, fontWeight: 'bold' },
    button: { backgroundColor: COLORS.primary, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center', height: 56, justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 8 },
    buttonDisabled: { backgroundColor: COLORS.disabled, shadowOpacity: 0.1, elevation: 2 },
    buttonText: { color: COLORS.white, fontSize: SIZES.h3, fontWeight: 'bold', textTransform: 'uppercase' },
    mapContainer: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    map: { ...StyleSheet.absoluteFillObject },
    mapControls: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.backgroundEnd, padding: SIZES.large, paddingBottom: Platform.OS === 'ios' ? SIZES.xl : SIZES.large, borderTopLeftRadius: SIZES.radius, borderTopRightRadius: SIZES.radius, gap: SIZES.medium },
    mapInstructions: { color: COLORS.textSecondary, textAlign: 'center', fontSize: SIZES.caption, marginBottom: SIZES.small },
    mapCancelButton: { marginTop: SIZES.small, alignItems: 'center' },
    mapCancelButtonText: { color: COLORS.textSecondary, fontSize: SIZES.body, fontWeight: '500' }
});

export default AddClientScreen;