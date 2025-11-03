// src/screens/LoginScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Quitamos la importación de router/expo-router
import { signInWithEmailAndPassword } from 'firebase/auth'; // Añadimos signOut por si acaso
import React, { useState } from 'react';
// 🔥 CAMBIO: Añadimos 'Image'
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- Contexto y DB ---
// import { useData } from '../../context/DataContext'; // Ya no necesitamos syncData aquí
import { auth } from '../../db/firebase-service'; // Ajusta la ruta

// --- Navegación ---\
// Importamos el tipo de props que definimos en AuthNavigator
// 🔥 CORRECCIÓN: Usamos el tipo del AppNavigator ya que Login está allí
import { LoginScreenProps } from '../navigation/AppNavigator';

// --- Estilos ---
import { COLORS } from '../../styles/theme'; // Ajusta la ruta

// Usamos el tipo importado para las props
const LoginScreen = ({ navigation }: LoginScreenProps) => { // <-- Corregido a LoginScreenProps de AppNav
    // const { syncData } = useData(); // Ya no se necesita aquí
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false); // Solo para el proceso de login manual
    const [loadingMessage, setLoadingMessage] = useState(''); // Mensaje

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert("Campos incompletos", "Por favor, ingrese su email y contraseña.");
            return;
        }

        setLoading(true);
        setLoadingMessage('Iniciando sesión...');

        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
            // La navegación ahora la maneja el observer en AppNavigator
            // No necesitamos llamar a syncData() aquí, se hace post-login en AppNavigator
            
            // Damos un breve momento para que el observer de AppNavigator reaccione
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
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : -100} // Ajuste fino
        >
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundEnd} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />

            {/* ======== 🔥 INICIO: LOGO AÑADIDO ======== */}
            <Image
                source={require('../../assets/images/icon_login.png')}
                style={styles.logo}
            />
            {/* ======== 🔥 FIN: LOGO AÑADIDO ======== */}

            <Text style={styles.title}>Bienvenido</Text>
            <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

            <View style={styles.formContainer}>
                {/* Email Input */}
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
                        // onSubmitEditing={() => passwordInputRef.current?.focus()} // Necesitaríamos un ref
                    />
                </View>

                {/* Password Input */}
                <View style={styles.inputContainer}>
                    <Feather name="lock" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                        // ref={passwordInputRef} // Necesitaríamos un ref
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

                {/* Login Button */}
                <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                    {loading ? (
                        <><ActivityIndicator size="small" color={COLORS.primaryDark} /><Text style={styles.buttonTextLoading}>{loadingMessage}</Text></>
                    ) : (
                        <Text style={styles.buttonText}>Iniciar Sesión</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white, padding: 20 },
    background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
    
    // ======== 🔥 INICIO: ESTILO DEL LOGO ========
    logo: {
        width: 220, // Ancho del logo
        height: 100, // Alto del logo
        resizeMode: 'contain', // Asegura que se vea bien sin deformarse
        marginBottom: 15, // Espacio antes del título
    },
    // ======== 🔥 FIN: ESTILO DEL LOGO ========

    title: { fontSize: 48, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: 10 },
    subtitle: { fontSize: 18, color: COLORS.textSecondary, marginBottom: 40 },
    formContainer: { width: '100%' },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.glass, // Fondo semi-transparente
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        marginBottom: 15,
        paddingHorizontal: 15,
        height: 55, // Altura fija
    },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 16,
        height: '100%', // Ocupa la altura del contenedor
    },
    button: {
        flexDirection: 'row', // Para alinear spinner y texto
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.primary,
        padding: 15,
        borderRadius: 12,
        marginTop: 10,
        height: 55, // Altura fija
    },
    buttonText: {
        color: COLORS.primaryDark,
        fontSize: 18,
        fontWeight: 'bold',
    },
    buttonTextLoading: { // Estilo para el texto cuando está cargando
        color: COLORS.primaryDark,
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 10, // Espacio entre spinner y texto
    },
});

export default LoginScreen;