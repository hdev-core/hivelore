'use client';

import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <ErrorState
      action={
        <Button onClick={reset} variant="danger">
          Try again
        </Button>
      }
      message="HiveLore could not render this foundation route. No internal error details are exposed here."
      title="Route preview failed"
    />
  );
}
