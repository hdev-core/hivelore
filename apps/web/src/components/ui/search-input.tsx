import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/styles';

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  isInvalid?: boolean;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, isInvalid = false, placeholder = 'Search...', ...props }, ref) => (
    <div className="relative">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      <input
        ref={ref}
        aria-invalid={isInvalid || props['aria-invalid'] || undefined}
        className={cn(
          'min-h-10 w-full rounded-control border bg-surface py-2 pl-10 pr-3 text-sm text-foreground shadow-soft transition-colors',
          'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
          'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          isInvalid ? 'border-danger' : 'border-input-border',
          className,
        )}
        placeholder={placeholder}
        type="search"
        {...props}
      />
    </div>
  ),
);

SearchInput.displayName = 'SearchInput';
