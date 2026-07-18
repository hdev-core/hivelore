import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/styles';

type BadgeVariant =
  | 'neutral'
  | 'draft'
  | 'proposal'
  | 'ai-warning'
  | 'under-review'
  | 'canon'
  | 'canon-approved'
  | 'rejected'
  | 'alternate-timeline'
  | 'archived'
  | 'ready-to-publish'
  | 'published-on-hive';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-surface text-foreground',
  draft: 'border-status-draft/40 bg-status-draft/10 text-status-draft',
  proposal: 'border-status-proposal/40 bg-status-proposal/10 text-status-proposal',
  'ai-warning': 'border-status-warning/50 bg-status-warning/15 text-status-warning',
  'under-review': 'border-status-review/40 bg-status-review/10 text-status-review',
  canon: 'border-canon bg-canon text-canon-foreground',
  'canon-approved': 'border-success bg-success text-success-foreground',
  rejected: 'border-status-rejected/50 bg-status-rejected/10 text-status-rejected',
  'alternate-timeline': 'border-status-alternate/50 bg-status-alternate/10 text-status-alternate',
  archived: 'border-status-archived/40 bg-status-archived/10 text-status-archived',
  'ready-to-publish': 'border-status-ready/50 bg-status-ready/10 text-status-ready',
  'published-on-hive': 'border-[var(--hive-red)] bg-[var(--hive-red)] text-white',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex min-h-6 items-center rounded-control border px-2 py-0.5 text-xs font-bold uppercase tracking-[0.08em]',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);

Badge.displayName = 'Badge';
