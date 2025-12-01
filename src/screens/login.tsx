import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// --- Importaciones del Proyecto ---
import { auth } from '../../db/firebase-service';
import { LoginScreenProps } from '../navigation/AppNavigator';

// --- COLORES DE MARCA (NOAR ERP) ---
const BRAND = {
    dark: '#0F172A',   // Slate 900
    primary: '#FBBF24', // Amber 400 (La N)
    accent: '#D97706', // Amber 600 (ERP)
    gray: '#94A3B8',   // Slate 400
    bg: '#F8FAFC',     // Slate 50
    white: '#FFFFFF',
    error: '#EF4444'
};

// --- COMPONENTE LOGO NATIVO (NOAR ERP) ---
const NoarLogoLogin = () => (
  <View style={styles.logoContainer}>
      {/* Icono Cuadrado con Sombra */}
      <View style={styles.logoIconBox}>
          <Text style={styles.logoSymbol}>N</Text>
      </View>
      
      {/* Texto Corporativo */}
      <View style={styles.brandContainer}>
          <Text style={styles.brandName}>
              NOAR <Text style={styles.brandSuffix}>ERP</Text>
          </Text>
          <Text style={styles.brandSlogan}>SISTEMA INTEGRAL</Text>
      </View>
  </View>
);

const LoginScreen = ({ navigation }: LoginScreenProps) => { 
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false); 
    const [errorMsg, setErrorMsg] = useState('');

    const handleLogin = async () => {
        setErrorMsg('');
        if (!email || !password) {
            setErrorMsg("Por favor, completa todos los campos.");
            return;
        }

        setLoading(true);
        try {
            await auth.signInWithEmailAndPassword(email.trim(), password);
            // La navegación es automática gracias al AuthListener en App.tsx
        } catch (error: any) {
            setLoading(false);
            console.error("Login Error:", error.code);
            
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                setErrorMsg("Credenciales incorrectas.");
            } else if (error.code === 'auth/too-many-requests') {
                setErrorMsg("Demasiados intentos. Espera un momento.");
            } else if (error.code === 'auth/network-request-failed') {
                setErrorMsg("Sin conexión a internet.");
            } else {
                setErrorMsg("Error al iniciar sesión.");
            }
        }
    };

    return (
        <KeyboardAvoidingView 
            style={styles.container} 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <StatusBar barStyle="dark-content" backgroundColor={BRAND.bg} />
            
            <View style={styles.content}>
                {/* Logo */}
                <NoarLogoLogin />

                {/* Títulos */}
                <View style={styles.headerText}>
                    <Text style={styles.title}>Bienvenido</Text>
                    <Text style={styles.subtitle}>Inicia sesión para operar</Text>
                </View>

                {/* Formulario */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>USUARIO</Text>
                        <View style={styles.inputWrapper}>
                            <Feather name="user" size={20} color={BRAND.gray} style={{ marginRight: 10 }} />
                            <TextInput
                                style={styles.input}
                                placeholder="ej: vendedor@noar.com"
                                placeholderTextColor={BRAND.gray}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>CONTRASEÑA</Text>
                        <View style={styles.inputWrapper}>
                            <Feather name="lock" size={20} color={BRAND.gray} style={{ marginRight: 10 }} />
                            <TextInput
                                style={styles.input}
                                placeholder="••••••••"
                                placeholderTextColor={BRAND.gray}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                            />
                        </View>
                    </View>

                    {errorMsg ? (
                        <View style={styles.errorBox}>
                            <Feather name="alert-triangle" size={16} color={BRAND.error} />
                            <Text style={styles.errorText}>{errorMsg}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity 
                        style={styles.button} 
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.9}
                    >
                        {loading ? (
                            <ActivityIndicator color={BRAND.white} />
                        ) : (
                            <Text style={styles.buttonText}>Ingresar</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>© 2025 Noar ERP Systems</Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: BRAND.bg },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
    
    // Estilos Logo
    logoContainer: { alignItems: 'center', marginBottom: 40 },
    logoIconBox: {
        width: 80, height: 80,
        backgroundColor: BRAND.dark,
        borderRadius: 24,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 20,
        // Sombra suave estilo Apple
        shadowColor: BRAND.dark, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20,
        elevation: 10,
    },
    logoSymbol: { fontSize: 40, fontWeight: '900', color: BRAND.primary },
    brandContainer: { alignItems: 'center' },
    brandName: { fontSize: 28, fontWeight: '900', color: BRAND.dark, letterSpacing: -1 },
    brandSuffix: { fontSize: 28, fontWeight: '300', color: BRAND.accent },
    brandSlogan: { fontSize: 10, fontWeight: '700', color: BRAND.gray, letterSpacing: 4, marginTop: 5 },

    // Textos
    headerText: { alignItems: 'center', marginBottom: 30 },
    title: { fontSize: 24, fontWeight: '800', color: '#1E293B', marginBottom: 5 },
    subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500' },

    // Formulario
    form: { width: '100%' },
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 11, fontWeight: '800', color: BRAND.gray, marginBottom: 8, paddingLeft: 4 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: BRAND.white,
        borderRadius: 16,
        borderWidth: 1, borderColor: '#E2E8F0',
        height: 56, paddingHorizontal: 16,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    input: { flex: 1, fontSize: 16, fontWeight: '600', color: '#334155' },

    // Botón
    button: {
        height: 56,
        backgroundColor: BRAND.dark,
        borderRadius: 16,
        justifyContent: 'center', alignItems: 'center',
        marginTop: 10,
        shadowColor: BRAND.dark, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 8,
    },
    buttonText: { color: BRAND.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

    // Error
    errorBox: { 
        flexDirection: 'row', alignItems: 'center', gap: 8, 
        backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, 
        padding: 12, borderRadius: 12, marginBottom: 20 
    },
    errorText: { color: BRAND.error, fontSize: 14, fontWeight: '600' },

    // Footer
    footer: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', alignSelf: 'center' },
    footerText: { fontSize: 12, color: '#CBD5E1', fontWeight: '600' }
});

export default LoginScreen;