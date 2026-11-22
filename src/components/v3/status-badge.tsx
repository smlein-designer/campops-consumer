import { cn } from "@/lib/utils";

export type StatusBadgeStatus = "held" | "needsOk" | "working" | "expired" | "info" | "approved";

const statusClasses: Record<StatusBadgeStatus, string> = {
  held: "bg-[var(--color-bg-held)] text-[var(--color-text-held)]",
  needsOk: "bg-[var(--color-bg-attention-strong)] text-[var(--color-text-attention)]",
  working: "bg-[var(--color-bg-subtle)] text-[var(--stone-700)]",
  expired: "bg-[var(--color-bg-subtle)] text-[var(--stone-600)]",
  info: "bg-[var(--color-bg-info)] text-[var(--color-text-info)]",
  approved: "bg-[var(--color-bg-held)] text-[var(--color-text-held)]",
};

export function StatusBadge({ status, label }: { status: StatusBadgeStatus; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-label-s whitespace-nowrap",
        statusClasses[status],
      )}
    >
      {label}
    </span>
  );
}
