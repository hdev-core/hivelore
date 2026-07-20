import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ErrorStateProps = {
  action?: ReactNode;
  message?: string;
  title?: string;
};

export function ErrorState({
  action,
  message = 'Something went wrong while preparing this area. Try again, or return to a stable page.',
  title = 'Unable to load this area',
}: ErrorStateProps) {
  return (
    <Alert className="space-y-4" role="alert" variant="danger">
      <div>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </div>
      {action ? <div>{action}</div> : null}
    </Alert>
  );
}
