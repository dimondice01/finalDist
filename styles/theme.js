// src/styles/theme.js

// Paleta de colores: Base Gris Cálido (Cálido/Neutro) con Teal Profundo (Contraste Frío/Marca).
// Estética: Elegante, Profesional, Contraste de Temperatura.
// Estandarización de SIZES con 8-Point Grid.

export const COLORS = {
  // --- FONDOS BASE (Cálidos, Suaves y Neutros) ---
  // Un gris muy claro con un matiz beige, muy cómodo para la vista.
  backgroundStart: '#F9F7F2', // Gris Cálido Muy Claro (Near Beige) - Fondo Principal (Ajustado para suavidad)
  backgroundEnd: '#FFFFFF',   // Blanco Puro - Para tarjetas y componentes elevados (Limpieza)
  
  // --- COLOR PRINCIPAL (Teal Profundo para profesionalismo) ---
  primary: '#0F4C5C',         // Teal Profundo / Petróleo (Deep Teal) - Base de Marca y CTAs
  secondary: "#136F63",       // Teal más vibrante para estados secundarios
  
  // Acento/Highlighter: Un Coral Cálido para inyectar un punto focal vibrante.
  accent: '#E07A5F',          // Coral/Terracota - Máximo Contraste de Acción (Botones flotantes, notificaciones)
  
  // --- TEXTO (Alto Contraste Cálido) ---
  textPrimary: '#2D3142',     // Gris Azulado Oscuro (Gunmetal) - Lectura principal, menos duro que el negro puro
  textSecondary: '#9CA3AF',   // Gris medio - Subtítulos, información secundaria
  
  // Blanco y Utilitarios
  white: '#FFFFFF',
  black: '#000000',
  gray: '#636363c6',
  
  // --- COMPONENTES ---
  cardBackground: '#FFFFFF', 
  cardOverlay: 'rgba(255, 255, 255, 0.95)', // Casi opaco para legibilidad sobre mapas
  glassBorder: '#E5E7EB',     // Borde gris muy claro y sutil (Tailwind Gray-200)
  
  // --- COLORES DE ESTADO (Coherentes y accesibles) ---
  success: '#10B981',         // Verde Esmeralda
  warning: '#F59E0B',         // Ámbar
  danger: '#EF4444',          // Rojo
  error: '#EF4444',           // Alias para 'danger'
  disabled: '#E5E7EB',        // Gris claro para elementos inactivos
  
  // --- EXTRAS (Para gradientes o sombras) ---
  shadow: '#9CA3AF',
};

// --- Estandarización de SIZES (Sistema de Escalado de 8 Puntos para UX/UI) ---
export const SIZES = {
  // Espaciado, Paddings, Margins (Múltiplos de 8)
  xsmall: 4,
  small: 8,
  medium: 16,
  large: 24,
  xl: 32,
  xxl: 40,

  // Tamaños de Fuente (Escala modular para jerarquía)
  h1: 30,    
  h2: 24,    
  h3: 20,    
  h4: 18,    // Añadido para subtítulos de secciones
  body: 16,  
  caption: 14, 
  xsmallText: 12, 
  
  // Bordes y Radios
  radius: 12, 
  radiusSmall: 8, 
  borderWidth: 1, 
};

// --- FONT (Placeholder listo para fuentes personalizadas) ---
export const FONT = {
  regular: 'System', 
  medium: 'System',  // En iOS suele ser font-weight 500
  bold: 'System',    // En iOS suele ser font-weight 700
};

const appTheme = { COLORS, SIZES, FONT };

export default appTheme;