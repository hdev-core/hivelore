'use client';

import { useTheme } from '@/providers/theme-provider';

export function ThemeSwitcher() {
  const { resolvedTheme, setPreference } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      aria-label={label}
      className="theme-toggle"
      onClick={() => setPreference(nextTheme)}
      title={label}
      type="button"
    >
      <span className="sr-only">{label}</span>
      {isDark ? (
        <svg aria-hidden="true" className="theme-toggle__icon" viewBox="0 0 24 24">
          <path
            d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.36-6.36 1.42-1.42M4.22 19.78l1.42-1.42m0-12.72L4.22 4.22m15.56 15.56-1.42-1.42M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" className="theme-toggle__icon" viewBox="0 0 24 24">
          <path d="M21 14.2A7.5 7.5 0 0 1 9.8 3a8.8 8.8 0 1 0 11.2 11.2Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
