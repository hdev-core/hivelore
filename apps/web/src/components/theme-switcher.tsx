'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/providers/theme-provider';

const themeOptions = [
  {
    icon: (
      <svg className="h-full w-full" viewBox="0 0 24 24">
        <path
          d="M4 5.5h16m-2 0v9a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-9m6 3v7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
    label: 'Use system theme',
    value: 'system',
  },
  {
    icon: (
      <svg className="h-full w-full" viewBox="0 0 24 24">
        <path
          d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.36-6.36 1.42-1.42M4.22 19.78l1.42-1.42m0-12.72L4.22 4.22m15.56 15.56-1.42-1.42M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
    label: 'Use light theme',
    value: 'light',
  },
  {
    icon: (
      <svg className="h-full w-full" viewBox="0 0 24 24">
        <path d="M21 14.2A7.5 7.5 0 0 1 9.8 3a8.8 8.8 0 1 0 11.2 11.2Z" fill="currentColor" />
      </svg>
    ),
    label: 'Use dark theme',
    value: 'dark',
  },
] as const;

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <div aria-label="Theme preference" className="theme-toggle" role="group">
      {themeOptions.map((option) => {
        const isActive = hasMounted && preference === option.value;

        return (
          <button
            aria-label={option.label}
            aria-pressed={isActive}
            className="theme-toggle__button"
            key={option.value}
            onClick={() => {
              if (hasMounted) {
                setPreference(option.value);
              }
            }}
            title={option.label}
            type="button"
          >
            <span className="sr-only">{option.label}</span>
            <span aria-hidden="true" className="theme-toggle__icon">
              {option.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
