import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/styles';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  isInvalid?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, className, isInvalid = false, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={isInvalid || props['aria-invalid'] || undefined}
      className={cn(
        'min-h-10 w-full rounded-control border bg-surface px-3 py-2 text-sm text-foreground shadow-soft transition-colors',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        isInvalid ? 'border-danger' : 'border-input-border',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);

Select.displayName = 'Select';
