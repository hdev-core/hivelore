import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/styles';

type LoadingStateProps = {
  message?: string;
  mode?: 'page' | 'contained';
  presentation?: 'spinner' | 'skeleton';
};

export function LoadingState({
  message = 'Loading preview content',
  mode = 'contained',
  presentation = 'spinner',
}: LoadingStateProps) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'grid place-items-center rounded-panel border border-border bg-surface text-center text-muted-foreground',
        mode === 'page' ? 'min-h-[50vh] p-8' : 'min-h-40 p-6',
      )}
      role="status"
    >
      {presentation === 'skeleton' ? (
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : (
        <div className="grid justify-items-center gap-3">
          <Spinner size={mode === 'page' ? 'lg' : 'md'} />
          <span className="text-sm font-medium">{message}</span>
        </div>
      )}
    </div>
  );
}
