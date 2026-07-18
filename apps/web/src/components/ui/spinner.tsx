import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/styles';

type SpinnerProps = ComponentPropsWithoutRef<'span'> & {
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'size-4 border-2',
  md: 'size-5 border-2',
  lg: 'size-7 border-[3px]',
};

export function Spinner({ className, size = 'md', ...props }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent',
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
