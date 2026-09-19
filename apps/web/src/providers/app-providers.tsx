'use client';

import type { ReactNode } from 'react';
import { AuthSessionProvider } from '@/providers/auth-session-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider } from '@/providers/theme-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthSessionProvider>
        <QueryProvider>{children}</QueryProvider>
      </AuthSessionProvider>
    </ThemeProvider>
  );
}
