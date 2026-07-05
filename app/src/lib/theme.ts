// Paletas de la app. La activa se elige vía useTheme() según la
// preferencia de alto contraste del usuario (SettingsProvider).

export interface Palette {
  primary: string;
  primaryDark: string;
  background: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  danger: string;
  success: string;
}

// Paleta estándar (cumple contraste WCAG AA sobre sus fondos)
export const defaultPalette: Palette = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#475569',
  border: '#CBD5E1',
  danger: '#DC2626',
  success: '#15803D',
};

// Alto contraste: negro sobre blanco, bordes fuertes, colores oscuros
export const highContrastPalette: Palette = {
  primary: '#1E3A8A',
  primaryDark: '#172554',
  background: '#FFFFFF',
  card: '#FFFFFF',
  text: '#000000',
  textMuted: '#1F2937',
  border: '#000000',
  danger: '#991B1B',
  success: '#14532D',
};

// Compatibilidad con pantallas que aún no usan useTheme()
export const colors = defaultPalette;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// Opciones de tamaño de letra dentro de la app (se suman al
// escalado del sistema, que siempre se respeta)
export const TEXT_SCALES = [
  { label: 'Normal', value: 1 },
  { label: 'Grande', value: 1.15 },
  { label: 'Muy grande', value: 1.3 },
] as const;
