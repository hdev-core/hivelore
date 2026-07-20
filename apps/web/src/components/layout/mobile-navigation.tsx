'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { navigationLinks } from '@/components/layout/navigation-links';

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <Button
        aria-controls="mobile-navigation"
        aria-expanded={isOpen}
        aria-label="Open navigation menu"
        className="px-3"
        onClick={() => setIsOpen(true)}
        variant="outline"
      >
        Menu
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-background/95 p-4 backdrop-blur"
          role="dialog"
        >
          <div className="mx-auto flex max-w-sm flex-col gap-5 rounded-panel border border-border bg-surface p-4 shadow-elevated">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Navigation</p>
              <Button
                ref={closeButtonRef}
                aria-label="Close navigation menu"
                onClick={() => setIsOpen(false)}
                variant="ghost"
              >
                Close
              </Button>
            </div>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
