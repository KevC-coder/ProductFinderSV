import { useState } from 'react';

/** Modo claro por defecto (preferente según la guía); oscuro y "sistema" son opcionales. */
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'pf-theme';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // sin almacenamiento: el tema vale solo para esta sesión
    }
    setThemeState(t);
  };
  return [theme, setTheme];
}
