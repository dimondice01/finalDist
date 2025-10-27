// Paleta de colores de vanguardia: Azul Índigo (Deep Blue) con Acentos Neón/Amarillo.

export const COLORS = {
  // --- FONDOS (Limpios, Fríos, Oscuros para legibilidad en Dark Mode) ---
  // Adoptamos un fondo oscuro/gris muy sutil para simular un "modo oscuro" elegante, 
  // incluso si la app se usa principalmente en modo claro.
  backgroundStart: '#fffbfbff', // Gris muy claro, casi blanco (Vanguardia - Gray-50)
  backgroundEnd: '#ffffffff',   // Gris más claro (Vanguardia - Gray-200)
  
  // --- COLOR PRINCIPAL (Azul Índigo Profundo para Profesionalismo) ---
  primary: '#770707ff',       // Índigo Profundo (Tailwind 'indigo-600') - Base de Marca
    
  // Contraste Primario: Amarillo Neón para texto/íconos sobre el color primario.
  primaryDark: '#facbd1ff',   // Amarillo/Verde Neón (Tailwind 'yellow-200') - Máximo Contraste
  
  // --- TEXTO (Alto Contraste y Legibilidad) ---
  textPrimary: '#111827',    // Gris Oscuro/Casi Negro (Vanguardia - Gray-900)
  textSecondary: '#6B7280',   // Gris medio para subtítulos (Vanguardia - Gray-500)
  
  // Blanco 
  white: '#FFFFFF',
  
  // --- COMPONENTES ---
  // Componentes "Glass": Utilizaremos el fondo semi-transparente, pero más oscuro para que resalte.
  glass: 'rgba(247, 248, 237, 0.9)', // Blanco casi opaco
  glassBorder: '#9b9b9bff', // Borde gris suave (Vanguardia - Gray-300)
  
  // --- COLORES DE ESTADO (Acentos de Vanguardia) ---
  success: '#2ad485ff',       // Verde (Tailwind 'emerald-500') - Se mantiene, es excelente.
  warning: '#F59E0B',       // Ámbar/Naranja - Se mantiene, estándar en warnings.
  danger: '#EF4444',        // Rojo - Se mantiene, estándar en errores.
  error: '#EF4444',         // Alias para 'danger'
  disabled: '#D1D5DB',      // Gris (Vanguardia - Gray-300)
};


// --- AÑADIDO: Definiciones de SIZES (Corregido y Limpio) ---
export const SIZES = {
  // Espaciado y Paddings
  small: 10,
  medium: 16,
  large: 20,

  // Tamaños de Fuente
  fontSizeSmall: 12,
  fontSizeMedium: 16,
  fontSizeLarge: 20,
  
  // Bordes
  radius: 12,
};

// --- AÑADIDO: Definiciones de FONT ---
export const FONT = {
  regular: 'System', 
  medium: 'System',  
  bold: 'System',    
};