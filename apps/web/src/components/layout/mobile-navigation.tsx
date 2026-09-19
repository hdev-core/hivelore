'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { navigationLinks } from '@/components/layout/navigation-links';
import { SearchInput } from '@/components/ui/search-input';

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const menuButton = menuButtonRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
      menuButton?.focus();
    };
  }, [isOpen]);

  return (
    <div className="relative z-[90] ml-auto flex items-center gap-2 md:hidden">
      <div className="relative z-[90]">
        <ThemeSwitcher />
      </div>
      <Button
        ref={menuButtonRef}
        aria-controls="mobile-navigation"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        className="relative z-[90] h-10 w-10 px-0"
        onClick={() => setIsOpen((current) => !current)}
        variant="outline"
      >
        <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
        {isOpen ? (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="m6 6 12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        )}
      </Button>

      {isOpen ? (
        <>
          <button
            aria-label="Close navigation menu"
            className="mobile-navigation-backdrop motion-safe:animate-[mobile-overlay-in_160ms_ease-out]"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <div
            aria-modal="true"
            className="mobile-navigation-panel motion-safe:animate-[mobile-menu-in_180ms_ease-out]"
            onKeyDownCapture={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            role="dialog"
          >
            <nav aria-label="Mobile primary navigation" id="mobile-navigation">
              <ul className="grid gap-2">
                {navigationLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      className="block rounded-control px-3 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="grid gap-4 border-t border-border pt-4">
              <SearchInput
                aria-label="Search placeholder"
                disabled
                placeholder="Search coming soon"
              />
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href="/login"
                onClick={() => setIsOpen(false)}
              >
                Sign in
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
