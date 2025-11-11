// Paleta de colores: Base Gris Cálido (Cálido/Neutro) con Teal Profundo (Contraste Frío/Marca).
// Estética: Elegante, Profesional, Contraste de Temperatura.
// Estandarización de SIZES con 8-Point Grid.

export const COLORS = {
  // --- FONDOS BASE (Cálidos, Suaves y Neutros) ---
  // Un gris muy claro con un matiz beige, muy cómodo para la vista.
  backgroundStart: '#F9F7F5', // Gris Cálido Muy Claro (Near Beige) - Fondo Principal
  backgroundEnd: '#FFFFFF',   // Blanco Puro - Para tarjetas y componentes elevados (Limpieza)
  
  // --- COLOR PRINCIPAL (Teal Profundo para profesionalismo) ---
  primary: '#008080',         // Teal Profundo / Petróleo (Deep Teal) - Base de Marca y CTAs
  secondary:  "#006666",      // Teal más oscuro y serio
  
  // Acento/Highlighter: Un Coral Cálido para inyectar un punto focal vibrante.
  accent: '#FF6B6B',          // Coral/Salmón Brillante - Máximo Contraste de Acción
  
  // --- TEXTO (Alto Contraste Cálido) ---
  textPrimary: '#333333',     // Gris Carbón Cálido (Charcoal) - Lectura principal
  textSecondary: '#757575',   // Gris medio cálido - Subtítulos, información secundaria
  
  // Blanco 
  white: '#FFFFFF',
  
  // --- COMPONENTES ---
  cardBackground: '#FFFFFF', 
  cardOverlay: 'rgba(240, 240, 240, 0.9)', // Gris muy claro semi-transparente
  glassBorder: '#DEDEDE',     // Borde gris claro y sutil
  
  // --- COLORES DE ESTADO (Coherentes y accesibles) ---
  success: '#4CAF50',         // Verde
  warning: '#FFC107',         // Amarillo/Ámbar
  danger: '#F44336',          // Rojo
  error: '#F44336',           // Alias para 'danger'
  disabled: '#E8E8E8',        // Gris claro para elementos inactivos
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
  h1: 32,    
  h2: 24,    
  h3: 20,    
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
  medium: 'System',  
  bold: 'System',    
};