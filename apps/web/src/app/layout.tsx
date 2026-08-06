import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { AppShell } from '@/components/layout/app-shell';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';
import '@/components/editor/editor.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'HiveLore',
  description: 'Collaborative worldbuilding platform built on Hive.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
