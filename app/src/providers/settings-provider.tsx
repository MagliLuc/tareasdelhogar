import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  darkHighContrastPalette,
  darkPalette,
  defaultPalette,
  highContrastPalette,
  Palette,
} from '@/lib/theme';

const STORAGE_KEY = 'settings.v1';

export type ThemeMode = 'system' | 'light' | 'dark';

interface Settings {
  highContrast: boolean;
  textScale: number; // multiplicador dentro de la app (además del sistema)
  themeMode: ThemeMode;
}

interface SettingsContextValue extends Settings {
  setHighContrast: (v: boolean) => void;
  setTextScale: (v: number) => void;
  setThemeMode: (v: ThemeMode) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  highContrast: false,
  textScale: 1,
  themeMode: 'system',
  setHighContrast: () => {},
  setTextScale: () => {},
  setThemeMode: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({
    highContrast: false,
    textScale: 1,
    themeMode: 'system',
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
        } catch {
          // preferencia corrupta: seguimos con los valores por defecto
        }
      }
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      ...settings,
      setHighContrast: (v: boolean) => update({ highContrast: v }),
      setTextScale: (v: number) => update({ textScale: v }),
      setThemeMode: (v: ThemeMode) => update({ themeMode: v }),
    }),
    [settings, update]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

/**
 * Tema activo según las preferencias de accesibilidad y modo noche.
 *  - colors: paleta (clara/oscura, normal/alto contraste)
 *  - dark: true si está en modo noche (para la barra de estado)
 *  - ts(n): tamaño de letra escalado por la preferencia de la app.
 *    El escalado del SISTEMA se aplica encima automáticamente.
 */
export function useTheme(): { colors: Palette; dark: boolean; ts: (size: number) => number } {
  const { highContrast, textScale, themeMode } = useSettings();
  const system = useColorScheme();
  const dark = themeMode === 'dark' || (themeMode === 'system' && system === 'dark');

  return useMemo(
    () => ({
      colors: dark
        ? highContrast
          ? darkHighContrastPalette
          : darkPalette
        : highContrast
          ? highContrastPalette
          : defaultPalette,
      dark,
      ts: (size: number) => Math.round(size * textScale),
    }),
    [dark, highContrast, textScale]
  );
}
