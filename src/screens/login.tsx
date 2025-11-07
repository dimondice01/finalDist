// src/screens/LoginScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// --- Contexto y DB ---
import { auth } from '../../db/firebase-service'; // Importa la instancia NATIVA

// --- Navegación ---
import { LoginScreenProps } from '../navigation/AppNavigator';

// --- Estilos ---
import { COLORS } from '../../styles/theme';

const LoginScreen = ({ navigation }: LoginScreenProps) => { 
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false); 
    const [loadingMessage, setLoadingMessage] = useState(''); 

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert("Campos incompletos", "Por favor, ingrese su email y contraseña.");
            return;
        }

        setLoading(true);
        setLoadingMessage('Iniciando sesión...');

        try {
            // --- ¡Esto ya es correcto! Usa la instancia nativa ---
            await auth.signInWithEmailAndPassword(email.trim(), password);
            
            setTimeout(() => {
                setLoading(false);
            }, 1000); 

        } catch (error: any) {
            setLoading(false);
            console.error("Error en handleLogin:", error.code, error.message);
            
            let friendlyMessage = "Ocurrió un error inesperado.";
            if (error.code === 'auth/user-not-found' || 
                error.code === 'auth/wrong-password' || 
                error.code === 'auth/invalid-credential') {
                friendlyMessage = "Email o contraseña incorrectos.";
            } else if (error.code === 'auth/invalid-email') {
                friendlyMessage = "El formato del email no es válido.";
            } else if (error.code === 'auth/network-request-failed') {
                friendlyMessage = "Error de red. Revisa tu conexión a internet.";
            }
            
            Alert.alert("Error de autenticación", friendlyMessage);
        }
    };

    return (
        <KeyboardAvoidingView 
            style={styles.container} 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : -100} 
        >
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundEnd} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            
            {/* --- CONTENIDO CENTRADO --- */}
            <View style={styles.contentContainer}>
                <Image
                    source={require('../../assets/images/icon_login.png')}
                    style={styles.logo}
                />
                <Text style={styles.title}>Bienvenido</Text>
                <Text style={styles.subtitle}>Inicia sesión para continuar</Text>
                
                <View style={styles.formContainer}>
                    <View style={styles.inputContainer}>
                        <Feather name="mail" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor={COLORS.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="next"
                        />
                    </View>
                    <View style={styles.inputContainer}>
                        <Feather name="lock" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Contraseña"
                            placeholderTextColor={COLORS.textSecondary}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="go"
                            onSubmitEditing={handleLogin}
                        />
                    </View>
                    <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
                        {loading ? (
                            <>
                                <ActivityIndicator size="small" color={COLORS.primaryDark} />
                                <Text style={styles.buttonTextLoading}>{loadingMessage}</Text>
                            </>
                        ) : (
                            <Text style={styles.buttonText}>Iniciar Sesión</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
};

// --- ESTILOS MEJORADOS ---
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: COLORS.white, // Color base por si el gradiente falla
    },
    background: { 
        position: 'absolute', 
        left: 0, 
        right: 0, 
        top: 0, 
        height: '100%' 
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center', // Centra todo el contenido
        alignItems: 'center',
        paddingHorizontal: 25, // Padding horizontal
    },
    logo: { 
        width: 180, // Más pequeño
        height: 80, // Más pequeño
        resizeMode: 'contain', 
        marginBottom: 20, // Espacio reducido
    },
    title: { 
        fontSize: 40, // Más pequeño y legible
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        marginBottom: 8, // Menos espacio
    },
    subtitle: { 
        fontSize: 17, // Ligeramente más pequeño
        color: COLORS.textSecondary, 
        marginBottom: 40, // Mantiene el espacio
        lineHeight: 24, // Mejora legibilidad
    },
    formContainer: { 
        width: '100%' 
    },
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.glass, 
        borderRadius: 15, // Más redondeado
        borderWidth: 1, 
        borderColor: COLORS.glassBorder, 
        marginBottom: 15, 
        paddingHorizontal: 15, 
        height: 52, // Más estándar
    },
    inputIcon: { 
        marginRight: 10 
    },
    input: { 
        flex: 1, 
        color: COLORS.textPrimary, 
        fontSize: 16, 
        height: '100%', 
    },
    button: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: COLORS.primary, 
        padding: 15, 
        borderRadius: 15, // Más redondeado
        marginTop: 20, // Más espacio antes del botón
        height: 52, // Misma altura que inputs
        // Sombra sutil
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    buttonDisabled: {
        backgroundColor: COLORS.disabled,
        shadowOpacity: 0, // Sin sombra si está deshabilitado
        elevation: 0,
    },
    buttonText: { 
        color: COLORS.primaryDark, 
        fontSize: 18, 
        fontWeight: 'bold', 
    },
    buttonTextLoading: { 
        color: COLORS.primaryDark, 
        fontSize: 18, 
        fontWeight: 'bold', 
        marginLeft: 12, // Espacio del spinner
    },
});

export default LoginScreen;