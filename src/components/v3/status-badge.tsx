import { cn } from "@/lib/utils";

export type StatusBadgeStatus = "held" | "needsOk" | "working" | "expired" | "info" | "approved";

// Figma node 2:35. Colour is always paired with words.
const statusClasses: Record<StatusBadgeStatus, string> = {
  held: "bg-[var(--color-bg-held)] text-[var(--color-text-held)]",
  needsOk: "bg-[var(--color-bg-attention-strong)] text-[var(--color-text-attention)]",
  working: "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]",
  expired: "bg-[var(--color-bg-attention-strong)] text-[var(--color-text-attention)]",
  info: "bg-[var(--color-bg-info)] text-[var(--color-text-info)]",
  approved: "bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)]",
};

export function StatusBadge({ status, label }: { status: StatusBadgeStatus; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[4px] px-2 py-1 text-label-s whitespace-nowrap",
        statusClasses[status],
      )}
    >
      {label}
    </span>
  );
}
