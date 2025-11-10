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

// --- Importamos SIZES y COLORS del tema centralizado ---
import { COLORS, SIZES } from '../../styles/theme';

// --- Contexto y DB ---
import { auth } from '../../db/firebase-service'; // Importa la instancia NATIVA

// --- Navegación ---
import { LoginScreenProps } from '../navigation/AppNavigator';

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
            {/* STATUS BAR: Estilo oscuro para un look más moderno en el fondo claro */}
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundStart} />
            
            {/* GRADIENTE: Usamos el mismo color para ambos puntos para un fondo plano y limpio (Gray-50) */}
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundStart]} style={styles.background} />
            
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
                        {/* Ícono usando textSecondary para ser sutil */}
                        <Feather name="mail" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
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
                        {/* Ícono usando textSecondary para ser sutil */}
                        <Feather name="lock" size={SIZES.h3} color={COLORS.textSecondary} style={styles.inputIcon} />
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
                    <TouchableOpacity 
                        style={[styles.button, loading && styles.buttonDisabled]} 
                        onPress={handleLogin} 
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                {/* Nota: Para un buen UX, el spinner debe ser BLANCO en el botón primary (verde oscuro) */}
                                <ActivityIndicator size="small" color={COLORS.white} /> 
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

// --- ESTILOS MEJORADOS USANDO SIZES y la nueva paleta de COLORS ---
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        // Usamos backgroundEnd por si el gradiente es desactivado, aunque backgroundStart es el color principal
        backgroundColor: COLORS.backgroundStart, 
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
        paddingHorizontal: SIZES.large, // Usa la escala de 8 puntos
    },
    logo: { 
        width: 180, 
        height: 80, 
        resizeMode: 'contain', 
        marginBottom: SIZES.xl, // Espacio estandarizado
    },
    title: { 
        fontSize: SIZES.h1, // Usa h1 para el título principal
        fontWeight: 'bold', 
        color: COLORS.textPrimary, 
        marginBottom: SIZES.small, // 8 puntos de espacio
    },
    subtitle: { 
        fontSize: SIZES.body, // Usa body para el texto estándar
        color: COLORS.textSecondary, 
        marginBottom: SIZES.xl, // Espacio estandarizado antes del formulario
        lineHeight: SIZES.large, // Mejora la legibilidad (24)
    },
    formContainer: { 
        width: '100%' 
    },
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.backgroundEnd, // Fondo blanco limpio para inputs
        borderRadius: SIZES.radius, // 12 puntos de radio
        borderWidth: SIZES.borderWidth, 
        borderColor: COLORS.glassBorder, // Borde gris suave
        marginBottom: SIZES.medium, // 16 puntos de espacio
        paddingHorizontal: SIZES.medium, // 16 puntos de padding interno
        height: 52, // Altura estándar (aprox. 52, que es un múltiplo de 8 si contamos padding)
    },
    inputIcon: { 
        marginRight: SIZES.small // 8 puntos de espacio
    },
    input: { 
        flex: 1, 
        color: COLORS.textPrimary, 
        fontSize: SIZES.body, 
        height: '100%', 
    },
    button: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: COLORS.primary, // Verde Esmeralda
        padding: SIZES.medium, // 16 puntos
        borderRadius: SIZES.radius, // 12 puntos
        marginTop: SIZES.large, // 24 puntos de margen superior
        height: 52, // Misma altura que inputs
        // Sombra de marca sutil para un efecto "elevado" (UX: hace el botón más clickeable)
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    buttonDisabled: {
        backgroundColor: COLORS.disabled,
        shadowOpacity: 0, 
        elevation: 0,
    },
    buttonText: { 
        color: COLORS.white, // Blanco para alto contraste
        fontSize: SIZES.body, 
        fontWeight: 'bold', 
    },
    buttonTextLoading: { 
        color: COLORS.white, // Blanco para alto contraste
        fontSize: SIZES.body, 
        fontWeight: 'bold', 
        marginLeft: SIZES.small, // Espacio del spinner
    },
});

export default LoginScreen;