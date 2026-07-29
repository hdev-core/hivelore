import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <section className="grid justify-items-center gap-4 rounded-panel border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Page not found</h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          This foundation route does not exist yet. Use the shared preview while the full feature
          areas are still pending.
        </p>
      </div>
      <div>
        <Link href="/foundation">
          <Button variant="outline">Open foundation preview</Button>
        </Link>
      </div>
    </section>
  );
}
