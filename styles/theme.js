// Paleta de colores: Verde Esmeralda (Éxito) con Base de Grises Cálidos (Profesionalismo y UX).
// Escalado de 8 Puntos (8-Point Grid) para todos los SIZES.

export const COLORS = {
  // --- FONDOS BASE (Limpios, Cálidos, Suaves) ---
  // Ideal para modos Claro/Gris tenue.
  backgroundStart: '#F9FAFB', // Gris extra-claro (Gray-50) - Fondo Principal de Pantalla
  backgroundEnd: '#FFFFFF',   // Blanco Puro - Para tarjetas y componentes elevados (Efecto de "profundidad")
  
  // --- COLOR PRINCIPAL (Verde Esmeralda para Foco y Éxito) ---
  primary: '#059669',       // Esmeralda Profundo (Tailwind 'emerald-600') - Base de Marca y CTAs principales
  secondary:  "#047857",    // Esmeralda Más Oscuro (Tailwind 'emerald-700') - Detalles activos y fondos de barra.
  
  // Acento/Highlighter: Un color frío y contrastante para íconos o estados muy activos (ej: notificaciones).
  accent: '#06B6D4',         // Azul Cian (Tailwind 'cyan-500') - Máximo Contraste 
  
  // --- TEXTO (Alto Contraste y Legibilidad) ---
  textPrimary: '#1F2937',    // Gris Oscuro Caliente (Gray-800) - Lectura principal
  textSecondary: '#6B7280',   // Gris medio (Gray-500) - Subtítulos, información secundaria
  
  // Blanco 
  white: '#FFFFFF',
  
  // --- COMPONENTES ---
  // Superposiciones modernas: ligeramente gris y transparente.
  cardBackground: '#FFFFFF', // Fondo de tarjetas/contenedores (Usamos backgroundEnd, pero alias para claridad)
  cardOverlay: 'rgba(243, 244, 246, 0.9)', // Gris muy claro semi-transparente
  glassBorder: '#E5E7EB', // Borde gris muy suave (Gray-200) - Delimitación sutil
  
  // --- COLORES DE ESTADO (Standard y Accesibles) ---
  success: '#10B981',       // Verde (Manteniendo el estándar claro)
  warning: '#F59E0B',       // Ámbar/Naranja
  danger: '#EF4444',        // Rojo
  error: '#EF4444',         // Alias para 'danger'
  disabled: '#E5E7EB',      // Gris (Gray-200) para elementos inactivos
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

  // Tamaños de Fuente (Escala modular para jerarquía, ajustado a la escala de 8 puntos si es posible)
  h1: 32,    // Extra Grande para títulos de pantalla
  h2: 24,    // Grande para subtítulos importantes
  h3: 20,    // Medio-Grande para encabezados de sección
  body: 16,  // Estándar para cuerpo de texto y párrafos
  caption: 14, // Pequeño para notas y metadatos
  xsmallText: 12, // Extra Pequeño para etiquetas discretas
  
  // Bordes y Radios
  radius: 12, // Radio estándar, esquinas ligeramente redondeadas
  radiusSmall: 8, // Radio para botones y elementos pequeños
  borderWidth: 1, // Grosor de borde estándar
};

// --- FONT (Placeholder listo para fuentes personalizadas) ---
export const FONT = {
  regular: 'System', 
  medium: 'System',  
  bold: 'System',    
};