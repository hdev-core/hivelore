import { type ReactNode } from 'react';
import { MainContainer } from '@/components/layout/main-container';
import { SiteHeader } from '@/components/layout/site-header';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-elevated"
        href="#main-content"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <MainContainer>{children}</MainContainer>
      </main>
    </div>
  );
}
