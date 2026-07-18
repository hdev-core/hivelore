'use client';

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/styles';

type TabsContextValue = {
  baseId: string;
  value: string;
  setValue: (value: string) => void;
};

type TabsProps = HTMLAttributes<HTMLDivElement> & {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

type TabsContentProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error('Tabs components must be used within Tabs.');
  }

  return context;
}

export function Tabs({
  children,
  className,
  defaultValue,
  onValueChange,
  value,
  ...props
}: TabsProps) {
  const generatedId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const selectedValue = value ?? internalValue;

  const context = useMemo<TabsContextValue>(
    () => ({
      baseId: generatedId,
      value: selectedValue,
      setValue: (nextValue) => {
        if (value === undefined) {
          setInternalValue(nextValue);
        }
        onValueChange?.(nextValue);
      },
    }),
    [generatedId, onValueChange, selectedValue, value],
  );

  return (
    <TabsContext.Provider value={context}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { setValue } = useTabs();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const triggers = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const currentIndex = triggers.indexOf(document.activeElement as HTMLButtonElement);

    if (currentIndex === -1) {
      return;
    }

    event.preventDefault();

    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? triggers.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % triggers.length
            : (currentIndex - 1 + triggers.length) % triggers.length;

    const nextTrigger = triggers[nextIndex];

    if (!nextTrigger) {
      return;
    }

    nextTrigger.focus();
    setValue(nextTrigger.dataset.value ?? '');
  };

  return (
    <div
      className={cn('flex flex-wrap gap-1 border-b border-border', className)}
      onKeyDown={handleKeyDown}
      role="tablist"
      {...props}
    >
      {children}
    </div>
  );
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ children, className, disabled, type = 'button', value, ...props }, ref) => {
    const { baseId, setValue, value: selectedValue } = useTabs();
    const isSelected = selectedValue === value;

    return (
      <button
        ref={ref}
        {...props}
        aria-controls={`${baseId}-panel-${value}`}
        aria-selected={isSelected}
        className={cn(
          'min-h-10 border-b-2 px-3 text-sm font-semibold transition-colors',
          'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          'disabled:cursor-not-allowed disabled:opacity-55',
          isSelected
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
          className,
        )}
        data-value={value}
        disabled={disabled}
        id={`${baseId}-tab-${value}`}
        onClick={(event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) {
            setValue(value);
          }
        }}
        role="tab"
        tabIndex={isSelected ? 0 : -1}
        type={type}
      >
        {children}
      </button>
    );
  },
);

TabsTrigger.displayName = 'TabsTrigger';

export function TabsContent({ children, className, value, ...props }: TabsContentProps) {
  const { baseId, value: selectedValue } = useTabs();
  const isSelected = selectedValue === value;

  if (!isSelected) {
    return null;
  }

  return (
    <div
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cn('pt-4', className)}
      id={`${baseId}-panel-${value}`}
      role="tabpanel"
      tabIndex={0}
      {...props}
    >
      {children as ReactNode}
    </div>
  );
}
