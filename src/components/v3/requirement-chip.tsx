import { cn } from "@/lib/utils";

export type RequirementChipType = "mustHave" | "niceToHave" | "changed";

const typeClasses: Record<RequirementChipType, string> = {
  mustHave: "bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)]",
  niceToHave:
    "border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
  changed:
    "border border-[var(--color-border-attention-strong)] bg-[var(--color-bg-attention)] text-[var(--color-text-attention)]",
};

// Tapping a chip edits it — the `onClick` handler decides whether this
// renders as an actionable control.
export function RequirementChip({
  type,
  label,
  onClick,
}: {
  type: RequirementChipType;
  label: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-md px-3 text-label-m whitespace-nowrap",
        typeClasses[type],
        onClick && "cursor-pointer",
      )}
    >
      {label}
      {type === "changed" && <span className="opacity-70">· updated</span>}
    </Tag>
  );
}
