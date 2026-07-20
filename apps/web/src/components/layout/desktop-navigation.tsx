import Link from 'next/link';
import { navigationLinks } from '@/components/layout/navigation-links';

export function DesktopNavigation() {
  return (
    <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
      {navigationLinks.map((link) => (
        <Link
          key={link.label}
          className="rounded-control px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          href={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
