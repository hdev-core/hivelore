import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/styles';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'surface' | 'elevated' | 'muted';
};

const variantClasses = {
  surface: 'border-border bg-surface shadow-soft',
  elevated: 'border-border bg-surface-elevated shadow-elevated',
  muted: 'border-border bg-muted shadow-none',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'surface', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-panel border p-5 text-foreground', variantClasses[variant], className)}
      {...props}
    />
  ),
);

Card.displayName = 'Card';

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold tracking-normal', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-4', className)} {...props} />;
}
