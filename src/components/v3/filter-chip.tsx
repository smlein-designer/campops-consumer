import { cn } from "@/lib/utils";

export function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-label-s whitespace-nowrap",
        selected
          ? "border-transparent bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)]"
          : "border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]",
      )}
    >
      {label}
    </button>
  );
}
