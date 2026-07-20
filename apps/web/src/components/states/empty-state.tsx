import type { ReactNode } from 'react';
import { cn } from '@/lib/styles';

type EmptyStateProps = {
  action?: ReactNode;
  icon?: ReactNode;
  message: string;
  mode?: 'contained' | 'spacious';
  title: string;
};

export function EmptyState({ action, icon, message, mode = 'contained', title }: EmptyStateProps) {
  return (
    <section
      className={cn(
        'grid justify-items-center rounded-panel border border-dashed border-border bg-surface text-center',
        mode === 'spacious' ? 'gap-4 px-6 py-12' : 'gap-3 p-6',
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-normal text-foreground">{title}</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
