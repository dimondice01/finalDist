// src/screens/EditClientScreen.tsx
import { Feather } from '@expo/vector-icons';
// ELIMINAMOS: import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
// Quitamos import { router, useLocalSearchParams } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
// Añadimos useCallback
import React, { useCallback, useEffect, useMemo, useState } from 'react';
// AÑADIMOS FlatList a las importaciones
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Toast from 'react-native-toast-message';

// --- Navegación ---
import { useRoute } from '@react-navigation/native'; // Para obtener los parámetros de la ruta
import { EditClientScreenProps } from '../navigation/AppNavigator'; // Asume la tipificación de props

// --- Contexto, DB, Tipos ---
import { useData, Zone } from '../../context/DataContext';
import { db } from '../../db/firebase-service';
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
    // Agregamos la opción "Seleccionar Zona *" al inicio
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


// Cambiamos la firma del componente para recibir navigation y usar useRoute
const EditClientScreen = ({ navigation }: EditClientScreenProps) => {
    // 1. OBTENER PARÁMETROS DE REACT NAVIGATION
    const route = useRoute();
    const { clientId } = route.params as { clientId: string }; // Obtenemos el ID del cliente de los params
    
    // Obtenemos los datos maestros desde nuestro almacén local
    const { clients, availableZones, refreshAllData } = useData();

    // Buscamos el cliente a editar en los datos locales (instantáneo)
    const clientToEdit = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

    // Estados del formulario, inicializados vacíos
    const [nombre, setNombre] = useState('');
    const [direccion, setDireccion] = useState('');
    const [barrio, setBarrio] = useState('');
    const [localidad, setLocalidad] = useState('');
    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');
    const [zonaId, setZonaId] = useState('');
    const [location, setLocation] = useState<LocationCoords | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Estados del Mapa
    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [tempRegion, setTempRegion] = useState({
        latitude: -29.4134, // Default: La Rioja, Argentina
        longitude: -66.8569,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    });
    const [locationLoading, setLocationLoading] = useState(false);
    // NUEVO ESTADO para el modal de zona
    const [isZoneModalVisible, setIsZoneModalVisible] = useState(false);


    // 2. EFECTO PARA POBLAR EL FORMULARIO
    useEffect(() => {
        if (clientToEdit) {
            setNombre(clientToEdit.nombre || '');
            setDireccion(clientToEdit.direccion || '');
            setBarrio(clientToEdit.barrio || '');
            setLocalidad(clientToEdit.localidad || '');
            setTelefono(clientToEdit.telefono || '');
            setEmail(clientToEdit.email || '');
            setZonaId(clientToEdit.zonaId || '');
            setLocation(clientToEdit.location || null);
            if (clientToEdit.location) {
                 setTempRegion(prev => ({ ...prev, latitude: clientToEdit.location!.latitude, longitude: clientToEdit.location!.longitude }));
            }
        } else if (clientId) {
            // Si no encuentra el cliente pero tiene ID, significa que algo falló o aún no carga.
            // Si los clients ya cargaron (se asume por clients.length), navegamos atrás.
            if (clients.length > 0) {
                 Toast.show({ type: 'error', text1: 'Error', text2: 'No se encontró el cliente para editar.', position: 'bottom' });
                 navigation.goBack(); // <-- CORRECCIÓN: Usa navigation.goBack()
            }
        }
    }, [clientToEdit, clientId, clients.length, navigation]); // Agregamos navigation a las dependencias

    // Zonas del Vendedor (simplemente las disponibles para edición)
    const zonasDisponibles = useMemo(() => {
        return availableZones.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [availableZones]);
    
    // Búsqueda del nombre de la zona seleccionada para mostrar en el botón
    const selectedZoneName = useMemo(() => {
        const selectedZone = zonasDisponibles.find(z => z.id === zonaId);
        return selectedZone ? selectedZone.nombre : 'Seleccionar Zona *';
    }, [zonaId, zonasDisponibles]);


    // 3. HANDLERS CON useCallBack
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
            Alert.alert('Error de Ubicación', 'No se pudo obtener la ubicación actual.');
        } finally {
            setLocationLoading(false);
        }
    }, []);

    const handleConfirmLocation = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMapModalVisible(false);
    }, []);

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

    const handleSubmit = useCallback(async () => {
        if (!nombre.trim() || !zonaId) {
            Alert.alert('Datos Incompletos', 'El nombre y la zona son obligatorios.');
            return;
        }
        if (isSubmitting || !clientId) return;

        setIsSubmitting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        try {
            const clientRef = doc(db, 'clientes', clientId);
            
            const updatedData = {
                nombre: nombre.trim(),
                nombreCompleto: nombre.trim(), // Aseguramos el nombre completo
                direccion: direccion.trim(),
                barrio: barrio.trim(),
                localidad: localidad.trim(),
                telefono: telefono.trim(),
                email: email.trim().toLowerCase(),
                zonaId,
                location: location || null,
                fechaUltimaEdicion: new Date(),
            };

            await updateDoc(clientRef, updatedData as any);
            await refreshAllData(); // Refresca los datos globales

            Toast.show({
                type: 'success',
                text1: 'Cliente Actualizado',
                text2: `${nombre.trim()} ha sido modificado.`,
                position: 'bottom',
                visibilityTime: 3000
            });

            navigation.goBack(); // <-- CORRECCIÓN: Usa navigation.goBack()

        } catch (error) {
            console.error("Error al actualizar el cliente:", error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Error', 'No se pudo actualizar el cliente. Revisa tu conexión.');
            setIsSubmitting(false);
        }
    }, [nombre, zonaId, direccion, barrio, localidad, telefono, email, location, isSubmitting, clientId, refreshAllData, navigation]);


    if (!clientToEdit && clientId) {
        // Muestra un loader mientras el useEffect revisa los datos y navega atrás
         return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loaderText}>Cargando datos del cliente...</Text>
            </View>
        );
    }
    
    if (!clientToEdit) {
        return (
            <View style={styles.fullScreenLoader}>
                <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={StyleSheet.absoluteFill} />
                <Feather name="alert-triangle" size={48} color={COLORS.danger} />
                <Text style={styles.loaderText}>Cliente no encontrado.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonError}>
                    <Text style={styles.backButtonErrorText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

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
                <Text style={styles.title}>Editar Cliente</Text>
                <View style={styles.headerButton} />{/* Espaciador */}
            </View>

            <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

                <View style={styles.inputGroup}>
                    <Feather name="user" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Nombre o Razón Social *" placeholderTextColor={COLORS.textSecondary} value={nombre} onChangeText={setNombre} autoCapitalize="words"/>
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


                {/* Botón de Ubicación */}
                <TouchableOpacity style={styles.locationButton} onPress={handleLocation} disabled={locationLoading}>
                    {locationLoading ? ( <ActivityIndicator color={COLORS.primary} /> ) : ( <Feather name={location ? "check-circle" : "crosshair"} size={22} color={COLORS.primary} /> )}
                    <Text style={styles.locationButtonText}>{location ? 'Ubicación Guardada' : 'Capturar Ubicación GPS'}</Text>
                </TouchableOpacity>
                {location && (
                    <Text style={styles.coordsText}>Coordenadas: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>
                )}

                {/* Botón de Guardar */}
                <TouchableOpacity style={[styles.button, (isSubmitting || !nombre.trim() || !zonaId) && styles.buttonDisabled]} onPress={handleSubmit} disabled={isSubmitting || !nombre.trim() || !zonaId}>
                    {isSubmitting ? ( <ActivityIndicator color={COLORS.primaryDark} /> ) : ( <Text style={styles.buttonText}>Guardar Cambios</Text> )}
                </TouchableOpacity>
            </ScrollView>

            {/* Modal del Mapa */}
            <Modal
                visible={mapModalVisible}
                animationType="slide"
                onRequestClose={handleMapModalClose}
            >
                <View style={styles.mapContainer}>
                    <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
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
                        <Text style={styles.mapInstructions}>
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
                zones={zonasDisponibles}
                selectedId={zonaId}
                onSelect={setZonaId}
            />
        </KeyboardAvoidingView>
    );
};


// --- Estilos ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundEnd },
    background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    fullScreenLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
    loaderText: { fontSize: 16, color: COLORS.textSecondary },
    backButtonError: { marginTop: 20, backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 25, borderRadius: 25 },
    backButtonErrorText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 },
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
        paddingLeft: 15,
        marginBottom: 15,
        height: 58
    },
    // Eliminado: picker: { ... }

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


    locationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 15, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}20`, marginBottom: 10, marginTop: 5 },
    locationButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
    coordsText: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 14, fontStyle: 'italic' },
    button: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
    buttonDisabled: { backgroundColor: COLORS.disabled },
    buttonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold' },
    mapContainer: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },
    mapControls: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.backgroundEnd, padding: 20, paddingBottom: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
    mapInstructions: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 15, marginBottom: 10 },
});

export default EditClientScreen;