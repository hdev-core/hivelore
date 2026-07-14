import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/styles";

type AlertVariant = "info" | "success" | "warning" | "danger";

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
};

const variantClasses: Record<AlertVariant, string> = {
  info: "border-border bg-muted text-foreground",
  success: "border-success/50 bg-success/10 text-foreground",
  warning: "border-warning/50 bg-warning/15 text-foreground",
  danger: "border-danger/50 bg-danger/10 text-foreground",
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, role, variant = "info", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-panel border p-4 text-sm leading-6",
        variantClasses[variant],
        className,
      )}
      role={role ?? (variant === "danger" || variant === "warning" ? "alert" : "status")}
      {...props}
    />
  ),
);

Alert.displayName = "Alert";

export function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("mb-1 font-semibold tracking-normal", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-muted-foreground", className)} {...props} />;
}
