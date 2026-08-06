'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const STORAGE_KEY = 'hivelore-theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function applyTheme(preference: ThemePreference) {
  const resolvedTheme = preference === 'system' ? resolveSystemTheme() : preference;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

function readPreference(): ThemePreference {
  let stored: string | null = null;

  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }

  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPreference);
    } catch {
      // Theme still updates for this session if localStorage is unavailable.
    }

    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference));
  }, []);

  useEffect(() => {
    const storedPreference = readPreference();
    setPreferenceState(storedPreference);
    setResolvedTheme(applyTheme(storedPreference));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = () => {
      setResolvedTheme(applyTheme(preference));
    };

    const handleStorageChange = () => {
      const nextPreference = readPreference();
      setPreferenceState(nextPreference);
      setResolvedTheme(applyTheme(nextPreference));
    };

    media.addEventListener('change', handleSystemChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      media.removeEventListener('change', handleSystemChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [preference]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return value;
}
