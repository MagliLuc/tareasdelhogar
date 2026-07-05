import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { defaultPalette, highContrastPalette, Palette } from '@/lib/theme';

const STORAGE_KEY = 'settings.v1';

interface Settings {
  highContrast: boolean;
  textScale: number; // multiplicador dentro de la app (además del sistema)
}

interface SettingsContextValue extends Settings {
  setHighContrast: (v: boolean) => void;
  setTextScale: (v: number) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  highContrast: false,
  textScale: 1,
  setHighContrast: () => {},
  setTextScale: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ highContrast: false, textScale: 1 });

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
    }),
    [settings, update]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

/**
 * Tema activo según las preferencias de accesibilidad.
 *  - colors: paleta (estándar o alto contraste)
 *  - ts(n): tamaño de letra escalado por la preferencia de la app.
 *    El escalado del SISTEMA se aplica encima automáticamente
 *    (nunca desactivamos allowFontScaling).
 */
export function useTheme(): { colors: Palette; ts: (size: number) => number } {
  const { highContrast, textScale } = useSettings();
  return useMemo(
    () => ({
      colors: highContrast ? highContrastPalette : defaultPalette,
      ts: (size: number) => Math.round(size * textScale),
    }),
    [highContrast, textScale]
  );
}
