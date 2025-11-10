// src/screens/EditClientScreen.tsx
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
// 🔥 CAMBIO: Ya no necesitamos useEffect
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Toast from 'react-native-toast-message';

// --- Navegación ---
// 🔥 CAMBIO: Ya no necesitamos useRoute
import { EditClientScreenProps } from '../navigation/AppNavigator';

// --- Contexto, DB, Tipos --
// 🔥 CAMBIO: Importamos 'Client' y también 'Rubro'
import { Rubro, useData, Zone } from '../../context/DataContext';
import { COLORS } from '../../styles/theme';

interface LocationCoords { latitude: number; longitude: number; }

// --- Componente Modal Selector de Zona (Con corrección de bug) ---
const ZoneSelectorModal = React.memo(({ visible, onClose, zones, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    zones: Zone[];
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}) => {
    
    // --- ¡NUEVO! Añadimos la opción por defecto para que coincida con add-client ---
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
            {/* --- ¡CORRECCIÓN! Era selectedId === selectedId, ahora es item.id === selectedId --- */}
            {item.id === selectedId && <Feather name="check" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                    <Text style={styles.modalTitle}>Seleccionar Zona</Text>
                    <FlatList
                        data={dataWithDefaultOption} // Usamos la data con la opción por defecto
                        keyExtractor={(item) => item.id || 'default'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={styles.separatorModal} />}
                        style={{ width: '100%' }}
                    />
                    <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                        <Text style={styles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});
// --- Fin Modal Zona ---


// --- ¡NUEVO! Componente Modal Selector de Rubro ---
const RubroSelectorModal = React.memo(({ visible, onClose, rubros, selectedId, onSelect }: {
    visible: boolean;
    onClose: () => void;
    rubros: Rubro[]; // <-- Tipo Rubro
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}) => {
    
    const dataWithDefaultOption: Rubro[] = useMemo(() => [
        { id: '', nombre: 'Seleccionar Rubro (Opcional)', metaSemanal: 0 },
        ...rubros
    ], [rubros]);

    const renderItem = useCallback(({ item }: { item: Rubro }) => (
        <TouchableOpacity
            style={styles.modalItem}
            onPress={() => { onSelect(item.id); onClose(); }}
        >
            <Text style={[styles.modalItemText, item.id === selectedId ? { fontWeight: 'bold', color: COLORS.primary } : {}]}>{item.nombre}</Text>
            {/* --- ¡CORRECCIÓN! Aplicada aquí también --- */}
            {item.id === selectedId && <Feather name="check" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
    ), [selectedId, onSelect, onClose]);

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                    <Text style={styles.modalTitle}>Seleccionar Rubro</Text>
                    <FlatList
                        data={dataWithDefaultOption}
                        keyExtractor={(item) => item.id || 'default'}
                        renderItem={renderItem}
                        ItemSeparatorComponent={() => <View style={styles.separatorModal} />}
                        style={{ width: '100%' }}
                    />
                    <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                        <Text style={styles.modalCloseText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
});
// --- Fin Modal Rubro ---


// ======================================================
// --- INICIO DE CAMBIOS PRINCIPALES ---
// ======================================================
const EditClientScreen = ({ navigation, route }: EditClientScreenProps) => {

    // 🔥 CAMBIO 1: Obtenemos el cliente DIRECTAMENTE de los parámetros
    const { client } = route.params;

    // 🔥 CAMBIO: Obtenemos 'isOffline' del contexto
    const { zones, rubros, updateClient, isOffline } = useData();

    // 🔥 CAMBIO 2: Inicializamos el estado del formulario CON los datos del cliente
    const [formData, setFormData] = useState({
        nombre: client?.nombre || '',
        nombreCompleto: client?.nombreCompleto || '',
        direccion: client?.direccion || '',
        telefono: client?.telefono || '',
        email: client?.email || '',
        barrio: client?.barrio || '',
        localidad: client?.localidad || '',
        zonaId: client?.zonaId || '',
        arca: client?.arca || false,
        // --- ¡NUEVO! ---
        rubroId: client?.rubroId || '', // Añadimos rubroId al estado
    });

    // Estados para UI
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false);
    const [isMapModalVisible, setIsMapModalVisible] = useState(false);
    // --- ¡NUEVO! ---
    const [isRubroModalVisible, setIsRubroModalVisible] = useState(false); // Estado para el modal de rubro
    
    // 🔥 CAMBIO 3: Inicializamos las coordenadas CON las del cliente
    const [location, setLocation] = useState<LocationCoords | null>(
        client?.location ? client.location : null
    );
    const [mapRegion, setMapRegion] = useState(() => ({ // Región inicial del mapa
        latitude: client?.location?.latitude || -34.603722, // Default CABA
        longitude: client?.location?.longitude || -58.381592, // Default CABA
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    }));


    // 🔥 CAMBIO 4: Eliminamos los dos 'useEffect' (ya no son necesarios)
    
    // --- Lógica de UI (sin cambios) ---
    const handleInputChange = (field: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const selectedZoneName = useMemo(() => {
        // 🔥 AÑADIMOS ESTA LÍNEA DE DEFENSA
        if (!zones) return 'Seleccionar zona *';
        
        return zones.find(z => z.id === formData.zonaId)?.nombre || 'Seleccionar zona *';
    }, [formData.zonaId, zones]);

    // --- ¡NUEVO! Lógica para Rubros ---
    const rubrosOrdenados = useMemo(() => {
        const safeRubros = Array.isArray(rubros) ? rubros : [];
        return [...safeRubros].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [rubros]);

    const selectedRubroName = useMemo(() => {
        const safeRubros = Array.isArray(rubros) ? rubros : [];
        const selectedRubro = safeRubros.find(r => r.id === formData.rubroId);
        return selectedRubro ? selectedRubro.nombre : 'Seleccionar Rubro (Opcional)';
    }, [formData.rubroId, rubros]);
    // --- FIN NUEVA LÓGICA ---


    // --- Lógica de Ubicación (sin cambios) ---
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
            setMapRegion(prev => ({ ...prev, ...coords })); // Centra el mapa en la nueva ubicación
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


    // --- Lógica de Guardado (CORREGIDA PARA OFFLINE) ---
    const handleSave = async () => {
        if (!formData.nombre) {
            Alert.alert("Campo Requerido", "El nombre del cliente es obligatorio.");
            return;
        }
        if (!formData.zonaId) {
            Alert.alert("Campo Requerido", "La zona es obligatoria.");
            return;
        }

        setIsSubmitting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const updatedClientData = {
            ...formData, // Esto ya incluye nombre, zonaId, rubroId, etc.
            location: location, // Añadimos la ubicación
            // Normalizamos campos opcionales
            nombreCompleto: formData.nombreCompleto || formData.nombre,
            telefono: formData.telefono || '',
            email: formData.email || '',
            barrio: formData.barrio || '',
            localidad: formData.localidad || '',
            direccion: formData.direccion || '',
            arca: formData.arca,
            rubroId: formData.rubroId || '', // Aseguramos que rubroId esté
        };

        try {
            // --- INICIO DE LA CORRECCIÓN OFFLINE ---
            if (isOffline) {
                // MODO OFFLINE: Disparar la actualización sin await
                updateClient(client.id, updatedClientData)
                    .catch(err => {
                        console.error("Error en actualización de cliente offline:", err);
                    });
                
                // Actualización Optimista Inmediata de UI
                Toast.show({
                    type: 'success',
                    text1: 'Cliente Guardado (Offline)',
                    text2: `Se sincronizará al conectar.`,
                    position: 'bottom'
                });

            } else {
                // MODO ONLINE: Esperar confirmación
                await updateClient(client.id, updatedClientData);

                Toast.show({
                    type: 'success',
                    text1: 'Cliente Actualizado',
                    text2: `Se guardaron los datos de ${formData.nombre}.`,
                    position: 'bottom'
                });
            }
            
            // Navega de regreso en ambos casos inmediatamente
            navigation.goBack();

        } catch (error: any) {
            console.error("Error al actualizar cliente:", error);
            Alert.alert("Error", "No se pudo actualizar el cliente: " + error.message);
            setIsSubmitting(false);
        }
    };


    // ======================================================
    // --- RENDERIZADO ---
    // ======================================================

    // 🔥 CAMBIO 6: El 'Loader' ahora solo comprueba si 'client' existe
    if (!client) {
// ... (JSX del loader de error sin cambios) ...
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.danger} />
                <Text style={styles.loaderText}>Error: Cliente no encontrado</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonError}>
                    <Text style={styles.backButtonErrorText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundStart} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Feather name="x" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Editar Cliente</Text>
                <View style={styles.headerButton} />
            </View>

            <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContentContainer} keyboardShouldPersistTaps="handled">
                <Text style={styles.sectionTitle}>Información Principal</Text>
                {/* Nombre (Alias) */}
                <View style={styles.inputContainer}>
                    <Feather name="user" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Nombre (Alias) *"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.nombre}
                        onChangeText={(val) => handleInputChange('nombre', val)}
                    />
                </View>
                {/* Nombre Completo / Razón Social */}
                <View style={styles.inputContainer}>
                    <Feather name="briefcase" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
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
                    <Feather name="map" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsZoneModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: formData.zonaId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedZoneName}
                        </Text>
                        <Feather name="chevron-down" size={20} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
                
                {/* --- ¡NUEVO! Rubro --- */}
                <View style={styles.pickerContainer}>
                    <Feather name="briefcase" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsRubroModalVisible(true); }}
                    >
                        <Text style={[styles.pickerButtonText, { color: formData.rubroId ? COLORS.textPrimary : COLORS.textSecondary }]}>
                            {selectedRubroName}
                        </Text>
                        <Feather name="chevron-down" size={20} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
                {/* --- FIN NUEVO RUBRO --- */}

                <Text style={styles.sectionTitle}>Ubicación</Text>
                {/* Dirección */}
                <View style={styles.inputContainer}>
                    <Feather name="map-pin" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Dirección"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.direccion}
                        onChangeText={(val) => handleInputChange('direccion', val)}
                    />
                </View>
                {/* Barrio */}
                <View style={styles.inputContainer}>
                    <Feather name="navigation" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Barrio"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.barrio}
                        onChangeText={(val) => handleInputChange('barrio', val)}
                    />
                </View>
                {/* Localidad */}
                <View style={styles.inputContainer}>
                    <Feather name="compass" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Localidad"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.localidad}
                        onChangeText={(val) => handleInputChange('localidad', val)}
                    />
                </View>

                {/* Botón de Geolocalización */}
                <TouchableOpacity style={styles.locationButton} onPress={handleLocationPress}>
                    <Feather name="globe" size={20} color={COLORS.primary} />
                    <Text style={styles.locationButtonText}>
                        {location ? "Actualizar Ubicación" : "Obtener Ubicación Actual"}
                    </Text>
                </TouchableOpacity>
                {location && (
                    <Text style={styles.coordsText}>
                        Coords: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </Text>
                )}


                <Text style={styles.sectionTitle}>Contacto</Text>
                {/* Teléfono */}
                <View style={styles.inputContainer}>
                    <Feather name="phone" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Teléfono"
                        placeholderTextColor={COLORS.textSecondary}
                        value={formData.telefono}
                        onChangeText={(val) => handleInputChange('telefono', val)}
                        keyboardType="phone-pad"
                    />
                </View>
                {/* Email */}
                <View style={styles.inputContainer}>
                    <Feather name="mail" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
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
                   {/* ✅ NUEVO CAMPO: Facturación ARCA */}
                <View style={[styles.inputContainer, styles.arcaSwitchContainer]}>
                    <Feather name="book-open" size={20} color={COLORS.primary} style={styles.inputIcon} />
                    <Text style={styles.arcaLabel}>Cliente requiere Factura ARCA</Text>
                    <Switch
                        trackColor={{ false: COLORS.textSecondary, true: COLORS.primary }}
                        thumbColor={formData.arca ? COLORS.primaryDark : COLORS.textPrimary}
                        onValueChange={(val) => setFormData(prev => ({ ...prev, arca: val }))} // <-- Setear directamente el booleano
                        value={formData.arca}
                    />
                </View>

            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.button, isSubmitting && styles.buttonDisabled]}
                    onPress={handleSave}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color={COLORS.primaryDark} />
                    ) : (
                        <Text style={styles.buttonText}>Guardar Cambios</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Modales */}
            <ZoneSelectorModal
                visible={isZoneModalVisible}
                onClose={() => setIsZoneModalVisible(false)}
                zones={zones}
                selectedId={formData.zonaId}
                onSelect={(id) => {
                    handleInputChange('zonaId', id);
                    setIsZoneModalVisible(false);
                }}
            />
            
            {/* --- ¡NUEVO! Modal de Rubro --- */}
            <RubroSelectorModal
                visible={isRubroModalVisible}
                onClose={() => setIsRubroModalVisible(false)}
                rubros={rubrosOrdenados}
                selectedId={formData.rubroId}
                onSelect={(id) => {
                    handleInputChange('rubroId', id);
                    setIsRubroModalVisible(false);
                }}
            />
            {/* --- FIN NUEVO MODAL --- */}

            <Modal visible={isMapModalVisible} animationType="slide" onRequestClose={() => setIsMapModalVisible(false)}>
                <View style={styles.mapContainer}>
                    <MapView
                        provider={PROVIDER_GOOGLE}
                        style={styles.map}
                        initialRegion={mapRegion}
                        onRegionChangeComplete={setMapRegion}
                    >
                        <Marker coordinate={mapRegion} draggable />
                    </MapView>
                    <View style={styles.mapControls}>
                        <TouchableOpacity
                            style={[styles.button, { marginBottom: 10 }]}
                            onPress={() => onMapConfirm(mapRegion)}
                        >
                            <Text style={styles.buttonText}>Confirmar Ubicación</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.textSecondary }]}
                            onPress={() => setIsMapModalVisible(false)}
                        >
                            <Text style={[styles.buttonText, { color: COLORS.textPrimary }]}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};
// ======================================================
// --- FIN DE CAMBIOS PRINCIPALES ---
// ======================================================


// Estilos
const styles = StyleSheet.create({
// ... (Estilos sin cambios) ...
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
    loaderText: { fontSize: 16, color: COLORS.danger, fontWeight: 'bold' }, // <-- Color rojo para error
    backButtonError: { marginTop: 20, backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 25, borderRadius: 25 },
    backButtonErrorText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: (StatusBar.currentHeight || 0) + 10, paddingBottom: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
    headerButton: { padding: 10, width: 44 },
    title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
    formContainer: { flex: 1 },
    formContentContainer: { paddingHorizontal: 20, paddingBottom: 20 },
    sectionTitle: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600', textTransform: 'uppercase', marginTop: 25, marginBottom: 10, marginLeft: 5 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, height: 50, marginBottom: 15 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16, height: '100%' },
    pickerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder, paddingLeft: 15, justifyContent: 'center', height: 50, marginBottom: 15 },
    pickerButton: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 12, height: '100%' },
    pickerButtonText: { fontSize: 16 },
    footer: { padding: 20, borderTopWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: COLORS.glass },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)' },
    modalContent: { width: '85%', backgroundColor: COLORS.backgroundEnd, borderRadius: 15, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder, maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: COLORS.textPrimary },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
    modalItemText: { fontSize: 16, color: COLORS.textPrimary },
    separatorModal: { height: 1, backgroundColor: COLORS.glassBorder },
    modalCloseButton: { marginTop: 15, padding: 12, backgroundColor: COLORS.disabled, borderRadius: 12, alignItems: 'center', width: '100%' },
    modalCloseText: { color: COLORS.primaryDark, fontWeight: 'bold' },
arcaSwitchContainer: {
        justifyContent: 'space-between',
        paddingRight: 15,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        marginBottom: 15,
    },
    arcaLabel: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 16,
    },
    locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 15, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}20`, marginBottom: 10, marginTop: 5 },
    locationButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
    coordsText: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 14, fontStyle: 'italic' },
    button: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
    buttonDisabled: { backgroundColor: COLORS.disabled },
    buttonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold' },
    mapContainer: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },
    mapControls: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.backgroundEnd, padding: 20, paddingTop: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
});

export default EditClientScreen;