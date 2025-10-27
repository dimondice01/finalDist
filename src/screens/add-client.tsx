// src/screens/AddClientScreen.tsx
import { Feather } from '@expo/vector-icons';
// ELIMINAMOS: import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
// Quitamos import { router } from 'expo-router';
import { addDoc, collection } from 'firebase/firestore';
// Añadimos useCallback
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList // AÑADIDO: FlatList
    ,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { AddClientScreenProps } from '../navigation/AppNavigator'; // Ajusta la ruta

// --- Contexto, DB, Tipos ---
// Asegúrate que las rutas sean correctas
import { Zone, useData } from '../../context/DataContext';
import { auth, db } from '../../db/firebase-service';
import { COLORS } from '../../styles/theme';

interface LocationCoords { latitude: number; longitude: number; }

// --- Componente Modal Selector de Zona (REEMPLAZO DEL PICKER) ---
const ZoneSelectorModal = ({ visible, onClose, zones, selectedId, onSelect }: { 
    visible: boolean; 
    onClose: () => void; 
    zones: Zone[]; 
    selectedId: string; 
    onSelect: (id: string) => void; 
}) => {
    // Agregamos la opción por defecto (Seleccionar Zona *)
    const dataWithDefaultOption: Zone[] = useMemo(() => [
        { id: '', nombre: 'Seleccionar Zona *' },
        ...zones
    ], [zones]);
    
    const renderItem = useCallback(({ item }: { item: Zone }) => (
        <TouchableOpacity
            style={styles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[styles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {selectedId === item.id && <Feather name="check" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%', padding: 0 }]}>
                    <View style={styles.modalHeader}>
                         <Text style={styles.modalTitle}>Seleccionar Zona *</Text>
                    </View>
                    <FlatList
                        data={dataWithDefaultOption}
                        keyExtractor={(item) => item.id || 'default'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={styles.separatorModal} />}
                        style={{ flexGrow: 0, width: '100%' }}
                        contentContainerStyle={{ paddingHorizontal: 20 }}
                    />
                    <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                        <Text style={styles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
// --- FIN Componente Modal Selector de Zona ---

// Usamos el tipo importado para las props
const AddClientScreen = ({ navigation }: AddClientScreenProps) => {
    const [nombre, setNombre] = useState('');
    const [direccion, setDireccion] = useState('');
    const [barrio, setBarrio] = useState('');
    const [localidad, setLocalidad] = useState('');
    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');
    const [zonaId, setZonaId] = useState('');
    const [location, setLocation] = useState<LocationCoords | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { availableZones, vendors, refreshAllData } = useData();
    const currentUser = auth.currentUser;

    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [tempRegion, setTempRegion] = useState({
        latitude: -29.4134, // La Rioja, Argentina (Ajustado)
        longitude: -66.8569,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    });
    const [locationLoading, setLocationLoading] = useState(false);
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false); // NUEVO ESTADO para el modal de zona

    // Lógica para obtener vendedor y zonas (sin cambios)
    const currentVendedor = useMemo(() => {
        if (!currentUser || !vendors) return null;
        // Buscamos por firebaseAuthUid
        return vendors.find((v: any) => v.firebaseAuthUid === currentUser.uid);
    }, [currentUser, vendors]);

    const zonasDelVendedor = useMemo(() => {
        if (!currentVendedor || !currentVendedor.zonasAsignadas || !availableZones) return [];
        const zonaIds = currentVendedor.zonasAsignadas;
        return availableZones
            .filter(z => z && z.id && zonaIds.includes(z.id)) // Añadido chequeo z && z.id
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [currentVendedor, availableZones]);
    
    // Búsqueda del nombre de la zona seleccionada para mostrar en el botón
    const selectedZoneName = useMemo(() => {
        const selectedZone = zonasDelVendedor.find(z => z.id === zonaId);
        return selectedZone ? selectedZone.nombre : 'Seleccionar Zona *';
    }, [zonaId, zonasDelVendedor]);


    // handleLocation con useCallback
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
            setTempRegion(prev => ({ ...prev, ...coords })); // Actualiza región temporal
            setLocation(coords); // Guarda la ubicación final
            setMapModalVisible(true); // Abre el modal
        } catch (error) {
            console.error("Error obteniendo ubicación:", error); // Loguear el error
            Alert.alert('Error de Ubicación', 'No se pudo obtener la ubicación actual.');
        } finally {
            setLocationLoading(false);
        }
    }, [tempRegion]); // tempRegion como dependencia por si se usa en el futuro

    // handleConfirmLocation con useCallback
    const handleConfirmLocation = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMapModalVisible(false); // Simplemente cierra el modal
    }, []);

    // handleSubmit con useCallback y navigation.goBack()
    const handleSubmit = useCallback(async () => {
        if (!nombre.trim() || !zonaId) {
            Alert.alert('Datos Incompletos', 'El nombre y la zona son obligatorios.');
            return;
        }
        if (isSubmitting) return;

        setIsSubmitting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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
                location: location || null,
                vendedorAsignadoId: currentUser?.uid,
                fechaCreacion: new Date(), // Firestore convertirá esto a Timestamp
            };

            await addDoc(collection(db, 'clientes'), newClientData);
            await refreshAllData(); // Refresca los datos globales

            Toast.show({
                type: 'success',
                text1: 'Cliente Creado',
                text2: `${nombre.trim()} ha sido agregado.`,
                position: 'bottom',
                visibilityTime: 3000
            });

            navigation.goBack(); // <-- CORRECCIÓN: Usa navigation.goBack()

        } catch (error) {
            console.error("Error al crear el cliente:", error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Error', 'No se pudo crear el cliente. Revisa tu conexión.');
            setIsSubmitting(false); // <-- Asegura resetear en caso de error
        }
        // No necesitamos finally aquí porque la navegación desmonta el componente
    }, [nombre, zonaId, direccion, barrio, localidad, telefono, email, location, currentUser, isSubmitting, refreshAllData, navigation]);

    // Función para manejar el cierre del modal del mapa
    const handleMapModalClose = useCallback(() => {
        setMapModalVisible(false);
    }, []);

    // Función para actualizar la región del mapa y la ubicación temporal
    const handleRegionChangeComplete = useCallback((region: typeof tempRegion) => {
        // Actualizamos la región visible del mapa
        setTempRegion(region);
        // Actualizamos la ubicación del marcador (donde el usuario soltó)
        setLocation({ latitude: region.latitude, longitude: region.longitude });
    }, []);

    // Función para cuando se termina de arrastrar el marcador
    const handleMarkerDragEnd = useCallback((e: any) => {
        const newCoords = e.nativeEvent.coordinate;
        setLocation(newCoords);
        // Opcional: Centrar el mapa en la nueva coordenada del marcador
        setTempRegion(prev => ({ ...prev, ...newCoords }));
    }, []);


    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            {/* Header adaptado */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Nuevo Cliente</Text>
                <View style={styles.headerButton} />{/* Espaciador */}
            </View>

            {/* ScrollView y Formulario */}
            <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

                <View style={styles.inputGroup}>
                    <Feather name="user" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Nombre o Razón Social *" placeholderTextColor={COLORS.textSecondary} value={nombre} onChangeText={setNombre} autoCapitalize="words"/>
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="map-pin" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Dirección" placeholderTextColor={COLORS.textSecondary} value={direccion} onChangeText={setDireccion} autoCapitalize="words"/>
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="navigation" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Barrio" placeholderTextColor={COLORS.textSecondary} value={barrio} onChangeText={setBarrio} autoCapitalize="words"/>
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="map" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Localidad" placeholderTextColor={COLORS.textSecondary} value={localidad} onChangeText={setLocalidad} autoCapitalize="words"/>
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="phone" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Teléfono" placeholderTextColor={COLORS.textSecondary} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad"/>
                </View>
                <View style={styles.inputGroup}>
                    <Feather name="mail" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
                </View>

                {/* REEMPLAZO DEL PICKER: Botón y Modal */}
                <View style={styles.pickerContainer}>
                    <Feather name="compass" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    {/* Botón que simula el Picker */}
                    <TouchableOpacity 
                        style={styles.pickerButton} 
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}
                    >
                         <Text style={[styles.pickerButtonText, { color: zonaId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedZoneName}
                         </Text>
                        <Feather name="chevron-down" size={20} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {/* Botón de Ubicación */}
                <TouchableOpacity style={styles.locationButton} onPress={handleLocation} disabled={locationLoading}>
                    {locationLoading ? ( <ActivityIndicator color={COLORS.primary} /> ) : ( <Feather name={location ? "check-circle" : "crosshair"} size={22} color={COLORS.primary} /> )}
                    <Text style={styles.locationButtonText}>{location ? 'Ubicación Guardada' : 'Capturar Ubicación GPS'}</Text>
                </TouchableOpacity>

                {/* Botón de Guardar */}
                <TouchableOpacity style={[styles.button, (isSubmitting || !nombre.trim() || !zonaId) && styles.buttonDisabled]} onPress={handleSubmit} disabled={isSubmitting || !nombre.trim() || !zonaId}>
                    {isSubmitting ? ( <ActivityIndicator color={COLORS.primaryDark} /> ) : ( <Text style={styles.buttonText}>Guardar Cliente</Text> )}
                </TouchableOpacity>
            </ScrollView>

            {/* Modal del Mapa (adaptado para usar callbacks) */}
            <Modal
                visible={mapModalVisible}
                animationType="slide"
                onRequestClose={handleMapModalClose} // Usar callback
            >
                <View style={styles.mapContainer}>
                    <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                    <MapView
                        provider={PROVIDER_GOOGLE}
                        style={styles.map}
                        // Usar region controlada por tempRegion
                        region={tempRegion}
                        // Actualizar region y location al mover el mapa
                        onRegionChangeComplete={handleRegionChangeComplete}
                        showsUserLocation
                        // followsUserLocation // Podría ser conflictivo con el drag
                    >
                        {/* Usar location para la posición del marcador */}
                        {location && (
                            <Marker
                                coordinate={location}
                                draggable
                                onDragEnd={handleMarkerDragEnd} // Usar callback
                            />
                        )}
                    </MapView>
                    {/* Overlay del marcador central (si prefieres mover mapa en lugar de marcador) */}
                    {/* <View style={styles.mapOverlay}>
                         <Feather name="plus" size={32} color={COLORS.danger} style={{ position: 'absolute' }} />
                    </View> */}
                    <View style={styles.mapControls}>
                        <Text style={styles.mapInstructions}>
                            {/* Ajusta instrucciones si usas marcador central */}
                             Mueva el mapa hasta que el marcador esté en la ubicación exacta.
                        </Text>
                         <TouchableOpacity style={styles.button} onPress={handleConfirmLocation}>
                            <Text style={styles.buttonText}>Confirmar Ubicación</Text>
                        </TouchableOpacity>
                         <TouchableOpacity style={{ ...styles.button, backgroundColor: 'transparent', marginTop: 10 }} onPress={handleMapModalClose}>
                            <Text style={{...styles.buttonText, color: COLORS.textSecondary }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* NUEVO MODAL DE SELECCIÓN DE ZONA */}
            <ZoneSelectorModal
                visible={isZoneModalVisible}
                onClose={() => setIsZoneModalVisible(false)}
                zones={zonasDelVendedor}
                selectedId={zonaId}
                onSelect={setZonaId}
            />
        </KeyboardAvoidingView>
    );
};

// --- Estilos (Ajustados para el nuevo selector y modal) ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: (StatusBar.currentHeight || 0) + 10,
        paddingBottom: 15,
        paddingHorizontal: 10,
        backgroundColor: 'transparent',
    },
    headerButton: { padding: 10, width: 44 },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
         // Quitamos flex: 1 para que el space-between funcione mejor con los botones de ancho fijo
    },
    formContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    inputGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        paddingHorizontal: 15,
        marginBottom: 15,
        height: 58,
    },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 16,
        height: '100%'
    },
    pickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        paddingLeft: 15, // Padding solo a la izquierda para el ícono
        marginBottom: 15,
        height: 58
    },
    // Eliminado: picker y pickerItemAndroid

    // NUEVOS ESTILOS PARA EL SELECTOR BASADO EN TOUCHABLE
    pickerButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 15,
        height: '100%',
    },
    pickerButtonText: {
        fontSize: 16,
    },
    // ESTILOS DEL MODAL DE ZONAS (NUEVOS)
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
    modalContent: { width: '85%', backgroundColor: COLORS.backgroundEnd, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalHeader: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, marginBottom: 10, alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
    modalItemText: { fontSize: 16, color: COLORS.textPrimary },
    separatorModal: { height: 1, backgroundColor: COLORS.glassBorder },
    modalCloseButton: { marginTop: 15, padding: 12, backgroundColor: COLORS.disabled, borderRadius: 12, alignItems: 'center' },
    modalCloseText: { color: COLORS.primaryDark, fontWeight: 'bold' },


    locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 15, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}20`, marginBottom: 20, marginTop: 5 },
    locationButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
    button: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
    buttonDisabled: { backgroundColor: COLORS.disabled }, // Usar color disabled
    buttonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold' },
    mapContainer: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },
    // mapOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10, pointerEvents: 'none' }, // Para marcador central
    mapControls: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.backgroundEnd, padding: 20, paddingBottom: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
    mapInstructions: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 15, marginBottom: 10 },
});

export default AddClientScreen;