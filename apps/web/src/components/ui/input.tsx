import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/styles';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  isInvalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, isInvalid = false, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={isInvalid || props['aria-invalid'] || undefined}
      className={cn(
        'min-h-10 w-full rounded-control border bg-surface px-3 py-2 text-sm text-foreground shadow-soft transition-colors',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        isInvalid ? 'border-danger' : 'border-input-border',
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
