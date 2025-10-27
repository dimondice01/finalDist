// src/screens/LoginScreen.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Quitamos la importación de router/expo-router
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'; // Añadimos signOut por si acaso
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- Contexto y DB ---
// import { useData } from '../../context/DataContext'; // Ya no necesitamos syncData aquí
import { auth } from '../../db/firebase-service'; // Ajusta la ruta

// --- Navegación ---
// Importamos el tipo de props que definimos en AuthNavigator
import { LoginScreenProps } from '../navigation/AuthNavigator'; // <--- Usamos el tipo del AuthNavigator

// --- Estilos ---
import { COLORS } from '../../styles/theme'; // Ajusta la ruta

// Usamos el tipo importado para las props
const LoginScreen = ({ navigation }: LoginScreenProps) => {
    // const { syncData } = useData(); // Ya no se necesita aquí
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false); // Solo para el proceso de login manual
    const [loadingMessage, setLoadingMessage] = useState(''); // Mensaje específico del login

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Por favor, ingrese email y contraseña.');
            return;
        }
        setLoading(true);
        setLoadingMessage('Autenticando...'); // Mensaje mientras se autentica

        try {
            // 1. INICIAMOS SESIÓN
            await signInWithEmailAndPassword(auth, email.trim(), password);
            
            // --- PASO CRUCIAL ELIMINADO ---
            // Eliminamos la llamada a navigation.reset().
            // Al ser exitoso, onAuthStateChanged en RootNavigator se disparará
            // y RootNavigator será el que haga la navegación a 'Home' o 'Driver'.
            // No necesitamos hacer nada más aquí.

        } catch (error: any) {
            console.error("Login Failed:", error.message, error.code);
            let message = 'Credenciales incorrectas o problema de red.';
            if (error.code === 'auth/network-request-failed') {
                message = 'Error de red. Revisa tu conexión.';
            } else if (error.message && error.message.includes("Datos de usuario no encontrados.")) {
                message = "No se encontraron los datos asociados a este usuario.";
                signOut(auth); // Forzamos el cierre si no hay datos de vendedor.
            }
            Alert.alert('Error de Inicio de Sesión', message);
            setLoading(false); // Solo reseteamos el loading si hay error
            setLoadingMessage('');
        }
    };

    // El resto del componente de presentación (return) no cambia...
    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={[COLORS.backgroundStart, COLORS.backgroundEnd]} style={styles.background} />
            <Feather name="key" size={60} color={COLORS.primary} />
            <Text style={styles.title}>La Llave</Text>
            <Text style={styles.subtitle}>Acceso de Personal</Text>

            <View style={styles.formContainer}>
                <View style={styles.inputContainer}>
                    <Feather name="at-sign" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} editable={!loading} />
                </View>
                <View style={styles.inputContainer}>
                    <Feather name="lock" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor={COLORS.textSecondary} secureTextEntry value={password} onChangeText={setPassword} editable={!loading} />
                </View>

                <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
                    {loading ? (
                        <><ActivityIndicator color={COLORS.primaryDark} /><Text style={styles.loadingText}>{loadingMessage}</Text></>
                    ) : (
                        <Text style={styles.buttonText}>Iniciar Sesión</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.backgroundEnd, padding: 20 },
    background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
    title: { fontSize: 48, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: 10 },
    subtitle: { fontSize: 18, color: COLORS.textSecondary, marginBottom: 40 },
    formContainer: { width: '100%' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: 15, borderWidth: 1, borderColor: COLORS.glassBorder, paddingHorizontal: 15, marginBottom: 15, height: 58 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: COLORS.textPrimary, fontSize: 16 },
    button: { marginTop: 10, backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
    buttonDisabled: { backgroundColor: COLORS.disabled },
    buttonText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 18 },
    loadingText: { color: COLORS.primaryDark, fontWeight: 'bold', fontSize: 16 }, // Para el spinner del botón
});

export default LoginScreen;