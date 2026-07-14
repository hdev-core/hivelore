import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/styles";
import { Spinner } from "@/components/ui/spinner";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "hive";

type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
  secondary:
    "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline:
    "border-border bg-surface text-foreground hover:bg-muted",
  ghost:
    "border-transparent bg-transparent text-foreground hover:bg-muted",
  danger:
    "border-danger bg-danger text-danger-foreground hover:bg-danger/90",
  hive:
    "border-[var(--hive-red)] bg-[var(--hive-red)] text-white hover:bg-[color-mix(in_srgb,var(--hive-red)_88%,black)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      isLoading = false,
      leftIcon,
      loadingLabel = "Loading",
      rightIcon,
      size = "md",
      type = "button",
      variant = "primary",
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-control border font-semibold transition-colors",
          "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        disabled={isDisabled}
        type={type}
        {...props}
      >
        {isLoading ? <Spinner size="sm" /> : leftIcon}
        <span>{isLoading ? loadingLabel : children}</span>
        {!isLoading ? rightIcon : null}
      </button>
    );
  },
);

Button.displayName = "Button";
