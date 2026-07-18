import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/styles';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isInvalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid = false, rows = 5, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={isInvalid || props['aria-invalid'] || undefined}
      className={cn(
        'w-full rounded-control border bg-surface px-3 py-2 text-sm leading-6 text-foreground shadow-soft transition-colors',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        isInvalid ? 'border-danger' : 'border-input-border',
        className,
      )}
      rows={rows}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
