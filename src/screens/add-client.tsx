// src/screens/AddClientScreen.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

// --- INICIO DE CAMBIOS: SDK NATIVO (v9 Modular) ---
import {
    addDoc,
    collection,
    serverTimestamp
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

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
    Switch, // ✅ IMPORTAR SWITCH
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { AddClientScreenProps } from '../navigation/AppNavigator';

// --- Contexto, DB, Tipos ---
import { Rubro, useData, Zone } from '../../context/DataContext';

// --- ¡¡CORRECCIÓN DE IMPORTACIÓN!! ---
import { auth, dbContainer } from '../../db/firebase-service';
// ✅ Importamos SIZES y COLORS
import { COLORS, SIZES } from '../../styles/theme';

interface LocationCoords { latitude: number; longitude: number; }

// --- CONSTANTES AFIP (NUEVO) ---
type DocumentType = 'DNI' | 'CUIT' | 'CUIL' | 'PAS' | 'SC';
const DOCUMENT_TYPES: { id: DocumentType; nombre: string; }[] = [
    { id: 'SC', nombre: 'Consumidor Final (SC)' },
    { id: 'DNI', nombre: 'DNI' },
    { id: 'CUIT', nombre: 'CUIT' },
    { id: 'CUIL', nombre: 'CUIL' },
    { id: 'PAS', nombre: 'Pasaporte' },
];
// --- FIN CONSTANTES AFIP ---


// --- Componente Modal Selector de Tipo de Documento (NUEVO) ---
const DocumentTypeSelectorModal = ({ visible, onClose, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    selectedId: DocumentType;
    onSelect: (id: DocumentType) => void;
}) => {
    const renderItem = useCallback(({ item }: { item: { id: DocumentType, nombre: string } }) => (
        <TouchableOpacity
            style={modalStyles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}>
                        <Text style={modalStyles.modalTitle}>TIPO DE DOCUMENTO *</Text>
                    </View>
                    <FlatList
                        data={DOCUMENT_TYPES}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: SIZES.medium }}
                    />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}>
                        <Text style={modalStyles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN Componente Modal Selector de Tipo de Documento ---


// --- Componente Modal Selector de Zona (Estilizado) ---
const ZoneSelectorModal = ({ visible, onClose, zones, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    zones: Zone[];
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: Zone[] = useMemo(() => [
        { id: '', nombre: 'Seleccionar Zona *' },
        ...zones
    ], [zones]);

    const renderItem = useCallback(({ item }: { item: Zone }) => (
        <TouchableOpacity
            style={modalStyles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}>
                        <Text style={modalStyles.modalTitle}>SELECCIONAR ZONA *</Text>
                    </View>
                    <FlatList
                        data={dataWithDefaultOption}
                        keyExtractor={(item) => item.id || 'default'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: SIZES.medium }}
                    />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}>
                        <Text style={modalStyles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN Componente Modal Selector de Zona ---


// --- Componente Modal Selector de Rubro (Estilizado) ---
const RubroSelectorModal = ({ visible, onClose, rubros, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    rubros: Rubro[]; 
    selectedId: string;
    onSelect: (id: string) => void;
}) => {
    const dataWithDefaultOption: Rubro[] = useMemo(() => [
        { id: '', nombre: 'Seleccionar Rubro (Opcional)', metaSemanal: 0 }, 
        ...rubros
    ], [rubros]);

    const renderItem = useCallback(({ item }: { item: Rubro }) => ( 
        <TouchableOpacity
            style={modalStyles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[modalStyles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={SIZES.h3} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.modalOverlay}>
                <View style={[modalStyles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={modalStyles.modalHeader}>
                        <Text style={modalStyles.modalTitle}>SELECCIONAR RUBRO</Text>
                    </View>
                    <FlatList
                        data={dataWithDefaultOption}
                        keyExtractor={(item) => item.id || 'default'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={modalStyles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: SIZES.medium }}
                    />
                    <TouchableOpacity onPress={onClose} style={modalStyles.modalCloseButton}>
                        <Text style={modalStyles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN Componente Modal Selector de Rubro ---


const AddClientScreen = ({ navigation }: AddClientScreenProps) => {
    // --- Estados (ACTUALIZADOS para incluir AFIP) ---
    const [nombre, setNombre] = useState('');
    const [direccion, setDireccion] = useState('');
    const [barrio, setBarrio] = useState('');
    const [localidad, setLocalidad] = useState('');
    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');
    const [zonaId, setZonaId] = useState('');
    const [rubroId, setRubroId] = useState('');
    const [isArca, setIsArca] = useState(false); // Facturación ARCA -> requiereFacturaAfip
    
    // ✅ NUEVOS ESTADOS AFIP
    const [tipoDocumento, setTipoDocumento] = useState<DocumentType>('SC'); 
    const [numeroDocumento, setNumeroDocumento] = useState('');
    const [isDocumentTypeModalVisible, setIsDocumentTypeModalVisible] = useState(false);

    const [location, setLocation] = useState<LocationCoords | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { availableZones, vendors, refreshAllData, rubros, isOffline } = useData();
    const currentUser = auth.currentUser;
    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [tempRegion, setTempRegion] = useState({
        latitude: -29.4134, 
        longitude: -66.8569,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    });
    const [locationLoading, setLocationLoading] = useState(false);
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false); 
    const [isRubroModalVisible, setIsRubroModalVisible] = useState(false);

    // --- Memos (ACTUALIZADO para incluir Documento) ---
    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        return vendors.find((v: any) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    const zonasDelVendedor = useMemo(() => {
        if (!currentVendedor || !currentVendedor.zonasAsignadas || !availableZones) return [];
        const zonaIds = currentVendedor.zonasAsignadas;
        return availableZones
            .filter(z => z && z.id && zonaIds.includes(z.id)) 
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
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
    // --- FIN Memos ---

    // --- Callbacks (handleLocation, handleConfirmLocation sin cambios) ---
    const handleLocation = useCallback(async () => {
        setLocationLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Se necesita permiso de ubicación para esta función.');
            setLocationLoading(false);
            return;
        }
        try {
            let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setTempRegion(prev => ({ ...prev, ...coords })); 
            setLocation(coords); 
            setMapModalVisible(true); 
        } catch (error) {
            console.error("Error obteniendo ubicación:", error);
            Alert.alert('Error de Ubicación', 'No se pudo obtener la ubicación actual.');
        } finally {
            setLocationLoading(false);
        }
    }, [tempRegion]); 

    const handleConfirmLocation = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMapModalVisible(false);
    }, []);

    // --- handleSubmit (MODIFICADO para incluir CAMPOS AFIP y Validación) ---
    const handleSubmit = useCallback(async () => {
        if (!nombre.trim() || !zonaId) {
            Alert.alert('Datos Incompletos', 'El nombre y la zona son obligatorios.');
            return;
        }
        // ✅ NUEVA VALIDACIÓN AFIP (Punto 1: validación)
        if (isArca && (tipoDocumento === 'SC' || !numeroDocumento.trim())) {
            Alert.alert('Datos Incompletos AFIP', 'Para facturación ARCA, debe seleccionar un Tipo de Documento válido (no SC) e ingresar el Número de Documento/CUIT.');
            return;
        }

        if (isSubmitting) return;

        setIsSubmitting(true);
        Haptics.notificationAsync('success' as any); // ✅ CORREGIDO: Usando string literal

        const db = dbContainer.instance;
        if (!db) {
            console.error("AddClientScreen: DB no está lista.");
            Alert.alert('Error', 'La base de datos no está inicializada. Intente reiniciar la app.');
            setIsSubmitting(false);
            return;
        }

        // ✅ LÓGICA AFIP: Si no requiere factura, forzamos SC/vacío
        const finalTipoDocumento = isArca ? tipoDocumento : 'SC';
        const finalNumeroDocumento = isArca ? numeroDocumento.trim() : '';

        try {
            // ✅ DATOS DEL CLIENTE CON CAMPOS AFIP (Punto 1: campos nuevos)
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
                
                requiereFacturaAfip: isArca, // ✅ Reemplaza/Aclara el campo 'arca' original
                tipoDocumento: finalTipoDocumento, // ✅ Nuevo campo
                numeroDocumento: finalNumeroDocumento, // ✅ Nuevo campo
                // NOTA: El campo 'arca' original ha sido efectivamente reemplazado/renombrado en la lógica por requiereFacturaAfip

                fechaCreacion: serverTimestamp(),
            };

            const clientesCollectionRef = collection(db, 'clientes');

            if (isOffline) {
                console.log("Modo Offline: Creando cliente localmente.");
                addDoc(clientesCollectionRef, newClientData).catch(err => {
                    console.error("Error en la escritura de cliente en segundo plano:", err);
                });
            } else {
                console.log("Modo Online: Creando cliente en Firestore.");
                await addDoc(clientesCollectionRef, newClientData);
                await refreshAllData();
            }
            
            Toast.show({
                type: 'success',
                text1: isOffline ? 'Cliente Guardado (Offline)' : 'Cliente Creado',
                text2: isOffline 
                    ? `${nombre.trim()} se sincronizará al conectar.` 
                    : `${nombre.trim()} ha sido agregado.`,
                position: 'bottom',
                visibilityTime: 3000
            });

            navigation.goBack(); 

        } catch (error) {
            console.error("Error al crear el cliente:", error);
            Haptics.notificationAsync('error' as any); // ✅ CORREGIDO: Usando string literal
            Alert.alert('Error', 'No se pudo crear el cliente. Inténtalo de nuevo.');
            setIsSubmitting(false); 
        }
    }, [
        nombre, zonaId, rubroId, direccion, barrio, localidad, telefono, email, 
        location, currentUser, isSubmitting, refreshAllData, navigation, isOffline, isArca,
        tipoDocumento, numeroDocumento // ✅ NUEVAS DEPENDENCIAS
    ]);
// --- FIN de handleSubmit ---


    // Callbacks de Mapa (Sin cambios)
    const handleMapModalClose = useCallback(() => {
        setMapModalVisible(false);
    }, []);

    const handleRegionChangeComplete = useCallback((region: typeof tempRegion) => {
        setTempRegion(region);
        setLocation({ latitude: region.latitude, longitude: region.longitude });
    }, []);

    const handleMarkerDragEnd = useCallback((e: any) => {
        const newCoords = e.nativeEvent.coordinate;
        setLocation(newCoords);
        setTempRegion(prev => ({ ...prev, ...newCoords }));
    }, []);


    // --- RENDER EJECUTIVO ---
    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />

            {/* HEADER */}
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

                {/* Selector de Zona */}
                <View style={styles.pickerContainer}>
                    <Feather name="compass" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: zonaId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedZoneName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {/* Selector de Rubro */}
                <View style={styles.pickerContainer}>
                    <Feather name="briefcase" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsRubroModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: rubroId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedRubroName}
                        </Text>
                        <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
                
                {/* CAMPO: Facturación ARCA / requiereFacturaAfip */}
                <View style={[styles.inputGroup, styles.arcaSwitchContainer]}>
                    <Feather name="book-open" size={SIZES.h3} color={COLORS.primary} style={styles.inputIcon} />
                    <Text style={styles.arcaLabel}>Cliente requiere Factura ARCA</Text>
                    <Switch
                        trackColor={{ false: COLORS.textSecondary, true: COLORS.primary }}
                        thumbColor={isArca ? COLORS.backgroundEnd : COLORS.glassBorder} // Uso de backgroundEnd para el thumb blanco
                        onValueChange={setIsArca}
                        value={isArca}
                    />
                </View>

                {/* ✅ NUEVOS CAMPOS AFIP (CONDICIONALES a isArca) */}
                {isArca && (
                    <>
                        {/* Selector Tipo Documento */}
                        <View style={styles.pickerContainer}>
                            <Feather name="file-text" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TouchableOpacity
                                style={styles.pickerButton}
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsDocumentTypeModalVisible(true); }}
                            >
                                <Text style={[styles.pickerButtonText, { color: tipoDocumento !== 'SC' ? COLORS.textPrimary : COLORS.textSecondary }]}>
                                    {selectedDocumentTypeName}
                                </Text>
                                <Feather name="chevron-down" size={SIZES.h3} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                        
                        {/* Input Número Documento */}
                        <View style={styles.inputGroup}>
                            <Feather name="hash" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
                            <TextInput 
                                style={styles.input} 
                                placeholder="Número Documento/CUIT *" 
                                placeholderTextColor={COLORS.textSecondary} 
                                value={numeroDocumento} 
                                onChangeText={setNumeroDocumento} 
                                keyboardType={tipoDocumento === 'CUIT' || tipoDocumento === 'CUIL' ? 'number-pad' : 'default'}
                            />
                        </View>
                    </>
                )}
                
                {/* Botón de Ubicación */}
                <TouchableOpacity style={styles.locationButton} onPress={handleLocation} disabled={locationLoading}>
                    {locationLoading ? (<ActivityIndicator color={COLORS.backgroundEnd} />) : (<Feather name={location ? "check-circle" : "crosshair"} size={SIZES.h3} color={COLORS.backgroundEnd} />)}
                    {/* ✅ CORREGIDO: Color de texto blanco sobre botón primario */}
                    <Text style={styles.locationButtonText}>{location ? 'Ubicación Guardada' : 'Capturar Ubicación GPS'}</Text>
                </TouchableOpacity>

                {/* Botón de Guardar */}
                {/* VALIDACION AÑADIDA: El botón se deshabilita si es ARCA y faltan datos de documento */}
                <TouchableOpacity style={[styles.button, (isSubmitting || !nombre.trim() || !zonaId || (isArca && (tipoDocumento === 'SC' || !numeroDocumento.trim()))) && styles.buttonDisabled]} 
                    onPress={handleSubmit} 
                    disabled={isSubmitting || !nombre.trim() || !zonaId || (isArca && (tipoDocumento === 'SC' || !numeroDocumento.trim()))}
                >
                    {isSubmitting ? (<ActivityIndicator color={COLORS.white} />) 
                    : (<Text style={styles.buttonText}>{isOffline ? 'GUARDAR (OFFLINE)' : 'GUARDAR CLIENTE'}</Text>)}
                </TouchableOpacity>
            </ScrollView>

            {/* Modal del Mapa */}
            <Modal
                visible={mapModalVisible}
                animationType="slide"
                onRequestClose={handleMapModalClose} 
            >
                <View style={styles.mapContainer}>
                    {/* ✅ CORREGIDO: StatusBar para el modal */}
                    <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundEnd} />
                    <MapView
                    provider={PROVIDER_GOOGLE}
                        style={styles.map}
                        region={tempRegion}
                        onRegionChangeComplete={handleRegionChangeComplete}
                        showsUserLocation
                    >
                        {location && (
                            <Marker
                                coordinate={location}
                                draggable
                                onDragEnd={handleMarkerDragEnd} 
                            />
                        )}
                    </MapView>
                    <View style={styles.mapControls}>
                        {/* ✅ CORREGIDO: Texto envuelto */}
                        <Text style={styles.mapInstructions}>
                            Mueva el mapa hasta que el marcador esté en la ubicación exacta.
                        </Text>
                        <TouchableOpacity style={styles.button} onPress={handleConfirmLocation}>
                             {/* ✅ CORREGIDO: Texto envuelto */}
                             <Text style={styles.buttonText}>Confirmar Ubicación</Text>
                        </TouchableOpacity>
                         {/* ✅ CORREGIDO: Se usa un estilo limpio sin background para Cancelar */}
                        <TouchableOpacity style={styles.mapCancelButton} onPress={handleMapModalClose}>
                             <Text style={styles.mapCancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal de Zona */}
            <ZoneSelectorModal
                visible={isZoneModalVisible}
                onClose={() => setIsZoneModalVisible(false)}
                zones={zonasDelVendedor}
                selectedId={zonaId}
                onSelect={setZonaId}
            />

            {/* Modal de Rubro */}
            <RubroSelectorModal
                visible={isRubroModalVisible}
                onClose={() => setIsRubroModalVisible(false)}
                rubros={rubrosOrdenados}
                selectedId={rubroId}
                onSelect={setRubroId}
            />
            
            {/* ✅ Modal de Tipo de Documento */}
            <DocumentTypeSelectorModal
                visible={isDocumentTypeModalVisible}
                onClose={() => setIsDocumentTypeModalVisible(false)}
                selectedId={tipoDocumento}
                onSelect={setTipoDocumento}
            />
        </KeyboardAvoidingView>
    );
};

// --- Estilos de Componentes Auxiliares (Modal) ---
const modalStyles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { 
        width: '85%', 
        backgroundColor: COLORS.backgroundEnd, 
        borderRadius: SIZES.radius, 
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder 
    },
    modalHeader: { 
        paddingVertical: SIZES.medium, 
        borderBottomWidth: SIZES.borderWidth, 
        borderBottomColor: COLORS.glassBorder, 
        alignItems: 'center' 
    },
    modalTitle: { fontSize: SIZES.h3, fontWeight: 'bold', color: COLORS.textPrimary, textTransform: 'uppercase' },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SIZES.medium },
    modalItemText: { fontSize: SIZES.body, color: COLORS.textPrimary },
    separatorModal: { height: SIZES.borderWidth, backgroundColor: COLORS.glassBorder, marginHorizontal: SIZES.small },
    modalCloseButton: { 
        marginTop: SIZES.large, 
        padding: SIZES.medium, 
        backgroundColor: COLORS.primary, // Botón de acción destacado
        borderRadius: SIZES.radius, 
        alignItems: 'center',
        marginHorizontal: SIZES.medium,
        marginBottom: SIZES.medium,
    },
    modalCloseText: { color: COLORS.white, fontWeight: 'bold', fontSize: SIZES.body, textTransform: 'uppercase' },
});


// --- Estilos de Pantalla (Ejecutivos) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundStart },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    
    // HEADER
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + SIZES.small,
        paddingBottom: SIZES.medium,
        paddingHorizontal: SIZES.small,
        backgroundColor: COLORS.backgroundStart,
    },
    headerButton: { padding: SIZES.small, width: 48 },
    title: {
        fontSize: SIZES.h3,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    
    // FORMULARIO
    formContainer: {
        flex: 1,
        paddingHorizontal: SIZES.large,
    },
    formContent: {
        paddingBottom: SIZES.xl,
    },
    inputGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd, // Fondo blanco
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: SIZES.medium,
        marginBottom: SIZES.medium,
        height: 52, // Altura estándar
    },
    inputIcon: { marginRight: SIZES.medium },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
        height: '100%'
    },
    
    // PICKER SELECTOR (Botones)
    pickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundEnd,
        borderRadius: SIZES.radius,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        paddingLeft: SIZES.medium, 
        marginBottom: SIZES.medium,
        height: 52
    },
    pickerButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: SIZES.medium,
        height: '100%',
    },
    pickerButtonText: {
        fontSize: SIZES.body,
    },
    
    // ARCA SWITCH
    arcaSwitchContainer: {
        justifyContent: 'space-between',
        paddingRight: SIZES.medium,
        backgroundColor: COLORS.backgroundEnd,
        borderWidth: SIZES.borderWidth,
        borderColor: COLORS.glassBorder,
        marginBottom: SIZES.medium,
    },
    arcaLabel: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: SIZES.body,
    },
    
    // BOTONES DE ACCIÓN
    locationButton: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: SIZES.small, 
        paddingVertical: SIZES.medium, 
        borderRadius: SIZES.radius, 
        backgroundColor: COLORS.primary, // Usamos el color primario para el fondo
        marginBottom: SIZES.large, 
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    locationButtonText: { 
        color: COLORS.white, // Texto blanco sobre fondo primario
        fontSize: SIZES.body, 
        fontWeight: 'bold' 
    },
    button: { 
        backgroundColor: COLORS.primary, 
        padding: SIZES.medium, 
        borderRadius: SIZES.radius, 
        alignItems: 'center',
        height: 56,
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 8,
    },
    buttonDisabled: { 
        backgroundColor: COLORS.disabled,
        shadowOpacity: 0.1,
        elevation: 2, 
    }, 
    buttonText: { 
        color: COLORS.white, // Texto blanco
        fontSize: SIZES.h3, 
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    
    // MODAL DE MAPA
    mapContainer: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    map: { ...StyleSheet.absoluteFillObject },
    mapControls: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        backgroundColor: COLORS.backgroundEnd, 
        padding: SIZES.large, 
        paddingBottom: Platform.OS === 'ios' ? SIZES.xl : SIZES.large, 
        borderTopLeftRadius: SIZES.radius, 
        borderTopRightRadius: SIZES.radius, 
        gap: SIZES.medium 
    },
    mapInstructions: { 
        color: COLORS.textSecondary, 
        textAlign: 'center', 
        fontSize: SIZES.caption, 
        marginBottom: SIZES.small 
    },
    mapCancelButton: {
        marginTop: SIZES.small,
        alignItems: 'center',
    },
    mapCancelButtonText: {
        color: COLORS.textSecondary,
        fontSize: SIZES.body,
        fontWeight: '500',
    }
});

export default AddClientScreen;