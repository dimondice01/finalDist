// src/screens/LoginScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// --- INICIO DE CAMBIOS: SDK NATIVO ---
// ELIMINAMOS: import { signInWithEmailAndPassword } from 'firebase/auth';
// --- FIN DE CAMBIOS: SDK NATIVO ---

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- Contexto y DB ---
import { auth } from '../../db/firebase-service'; // Importa la instancia NATIVA

// --- Navegación ---
import { LoginScreenProps } from '../navigation/AppNavigator';

// --- Estilos ---
import { COLORS } from '../../styles/theme'; // Ajusta la ruta

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
            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            // Usamos el método DIRECTAMENTE de la instancia nativa 'auth'
            await auth.signInWithEmailAndPassword(email.trim(), password);
            // --- FIN DE CAMBIOS: SDK NATIVO ---
            
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

    // --- RENDER Y ESTILOS (Sin cambios) ---
    return (
        <KeyboardAvoidingView 
            style={styles.container} 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : -100} 
        >
            <StatusBar barStyle="light-content" backgroundColor={COLORS.backgroundEnd} />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
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
    logo: { width: 220, height: 100, resizeMode: 'contain', marginBottom: 15, },
    title: { fontSize: 48, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: 10 },
    subtitle: { fontSize: 18, color: COLORS.textSecondary, marginBottom: 40 },
    formContainer: { width: '100%' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 15, paddingHorizontal: 15, height: 55, },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16, height: '100%', },
    button: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, padding: 15, borderRadius: 12, marginTop: 10, height: 55, },
    buttonText: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold', },
    buttonTextLoading: { color: COLORS.primaryDark, fontSize: 18, fontWeight: 'bold', marginLeft: 10, },
});

export default LoginScreen;