import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'gold';

const STORAGE_KEY = 'credibas-theme';
const THEME_COLORS: Record<ThemeMode, string> = {
  dark: '#101817',
  gold: '#f2f6ef',
};

interface ThemeContextValue {
  mode: ThemeMode;
  isGold: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'gold' ? 'gold' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;

  if (mode === 'gold') root.setAttribute('data-theme', 'gold');
  else root.removeAttribute('data-theme');

  const themeColor = document.getElementById('theme-color-meta');
  if (themeColor) themeColor.setAttribute('content', THEME_COLORS[mode]);

  const colorScheme = document.head.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (colorScheme) colorScheme.setAttribute('content', mode === 'gold' ? 'light dark' : 'dark light');
}

/**
 * Modo oro: paleta opcional #D4AF37 + #17211F sobre fondo claro.
 * Se guarda solo en el navegador y puede desactivarse en cualquier momento.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    applyTheme(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* Modo privado sin almacenamiento: se aplica solo en esta sesión. */
    }
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => (current === 'gold' ? 'dark' : 'gold'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isGold: mode === 'gold', setMode, toggle }),
    [mode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
}
