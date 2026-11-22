import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "inverse" | "ghost" | "attention";
export type ButtonSize = "default" | "large";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)] hover:opacity-90",
  secondary:
    "border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]",
  inverse: "bg-[var(--white)] text-[var(--ink-900)] hover:opacity-90",
  ghost: "bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]",
  attention: "bg-[var(--ember-500)] text-[var(--white)] hover:opacity-90",
};

// 44px min height (Handoff Spec 7, Component table).
const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-4 text-label-m",
  large: "h-12 px-5 text-label-l",
};

export function Button({
  variant = "primary",
  size = "default",
  label,
  className,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg whitespace-nowrap transition-opacity disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {label}
    </button>
  );
}
