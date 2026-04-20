import * as Location from 'expo-location';
import { Alert } from 'react-native';

export interface LocationData {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: string;
    isHighAccuracy: boolean;
}

const ACCURACY_THRESHOLD = 50; // metros

export const locationService = {
    /**
     * Verifica si se tienen los permisos necesarios.
     */
    async checkPermissions(): Promise<boolean> {
        const { status } = await Location.getForegroundPermissionsAsync();
        return status === 'granted';
    },

    /**
     * Solicita permisos de ubicación.
     */
    async requestPermissions(): Promise<boolean> {
        const { status } = await Location.requestForegroundPermissionsAsync();
        return status === 'granted';
    },

    /**
     * Obtiene la ubicación actual con validación de precisión.
     * Si la precisión es baja (>50m), intenta reintentar hasta 3 veces.
     */
    async getMandatoryLocation(): Promise<LocationData> {
        // 1. Verificar si el servicio está habilitado
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
            throw new Error('GPS_DISABLED');
        }

        // 2. Verificar permisos
        const hasPermission = await this.checkPermissions();
        if (!hasPermission) {
            const granted = await this.requestPermissions();
            if (!granted) throw new Error('PERMISSION_DENIED');
        }

        let location: Location.LocationObject | null = null;
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts <= maxAttempts) {
            try {
                // Pedimos alta precisión (Balanced o High)
                location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 5000,
                });

                // Si la precisión es buena, salimos del bucle
                if (location.coords.accuracy && location.coords.accuracy <= ACCURACY_THRESHOLD) {
                    break;
                }
            } catch (e) {
                console.warn(`Intento ${attempts + 1} de obtener ubicación falló`, e);
            }
            attempts++;
        }

        if (!location) {
            throw new Error('LOCATION_TIMEOUT');
        }

        const isHighAccuracy = (location.coords.accuracy || 999) <= ACCURACY_THRESHOLD;

        return {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            accuracy: location.coords.accuracy || 0,
            timestamp: new Date(location.timestamp).toISOString(),
            isHighAccuracy
        };
    }
};
