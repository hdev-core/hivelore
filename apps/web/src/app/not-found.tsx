import Link from 'next/link';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <EmptyState
      action={
        <Link href="/foundation">
          <Button variant="outline">Open foundation preview</Button>
        </Link>
      }
      message="This foundation route does not exist yet. Use the shared preview while the full feature areas are still pending."
      mode="spacious"
      title="Page not found"
    />
  );
}
