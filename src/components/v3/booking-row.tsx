import { StatusBadge } from "@/components/v3/status-badge";

export function BookingRow({
  state,
  title,
  meta,
}: {
  state: "held" | "needsOk" | "working";
  title: string;
  meta: string;
}) {
  const badge = {
    held: { status: "held" as const, label: "Held" },
    needsOk: { status: "needsOk" as const, label: "Needs OK" },
    working: { status: "working" as const, label: "Working" },
  }[state];
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] py-3">
      <div className="min-w-0">
        <p className="truncate text-label-m text-[var(--color-text-primary)]">{title}</p>
        <p className="truncate text-body-s text-[var(--color-text-secondary)]">{meta}</p>
      </div>
      <StatusBadge status={badge.status} label={badge.label} />
    </div>
  );
}
