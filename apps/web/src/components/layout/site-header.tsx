import Link from 'next/link';
import { HiveBrand } from '@/components/hive-brand';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { DesktopNavigation } from '@/components/layout/desktop-navigation';
import { MobileNavigation } from '@/components/layout/mobile-navigation';
import { SearchInput } from '@/components/ui/search-input';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          className="flex shrink-0 items-center gap-2 rounded-control focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          href="/"
        >
          <HiveBrand className="h-8 w-9" />
          <span className="text-base font-semibold tracking-normal text-foreground">HiveLore</span>
        </Link>

        <DesktopNavigation />

        <div className="ml-auto hidden w-full max-w-xs lg:block">
          <SearchInput aria-label="Search placeholder" disabled placeholder="Search coming soon" />
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <ThemeSwitcher />
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            href="/login"
          >
            Sign in
          </Link>
        </div>

        <MobileNavigation />
      </div>
    </header>
  );
}
