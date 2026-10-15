import React, { createContext, useContext, useEffect, useState } from 'react';
import { applyAccentColor } from '@/lib/theme-accent';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const THEME_STORAGE_KEY = 'melo.theme.preference';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  effectiveTheme: 'dark',
  setTheme: () => {},
});

export function applyAppWallpaper(bg: string) {
  const root = document.getElementById('root') || document.body;
  if (bg) {
    const bgVal = bg.startsWith('data:') || bg.startsWith('http') || bg.startsWith('blob:') ? `url(${bg})` : bg;
    root.style.backgroundImage = bgVal;
    root.style.backgroundSize = 'cover';
    root.style.backgroundAttachment = 'fixed';
    root.style.backgroundPosition = 'center';
    document.body.style.backgroundImage = '';
    document.documentElement.classList.add('has-custom-wallpaper');
  } else {
    root.style.backgroundImage = '';
    document.body.style.backgroundImage = '';
    document.documentElement.classList.remove('has-custom-wallpaper');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('lagg.theme.preference');
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'system';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    if (theme === 'light') return 'light';
    if (theme === 'dark') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    try { applyAccentColor(localStorage.getItem('tuga.accent') || '#0A84FF'); } catch { applyAccentColor('#0A84FF'); }
    try { applyAppWallpaper(localStorage.getItem('melo.appBg') || ''); } catch { /* Armazenamento local indisponível. */ }
    try {
      root.classList.toggle('melo-compact', localStorage.getItem('melo.compact') === 'true');
      root.classList.toggle('melo-reduced-motion', localStorage.getItem('melo.reduceMotion') === 'true');
      const font = Number(localStorage.getItem('melo.fontSize') || 16);
      const corner = Number(localStorage.getItem('melo.corner') || 14);
      if (Number.isFinite(font)) root.style.fontSize = `${Math.max(14, Math.min(18, font))}px`;
      if (Number.isFinite(corner)) root.style.setProperty('--radius', `${Math.max(8, Math.min(22, corner))}px`);
    } catch { /* Preferências locais indisponíveis. */ }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let resolved: 'light' | 'dark' = 'dark';
      if (theme === 'system') {
        resolved = mediaQuery.matches ? 'dark' : 'light';
      } else {
        resolved = theme;
      }

      setEffectiveTheme(resolved);

      if (resolved === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme();

    const handler = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // ignore
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
