import { cn } from "@/lib/utils";

export type MapPinStatus = "base" | "held" | "needsOk" | "searching";

// Dot color matches booking status (Handoff Spec §3).
const pinColors: Record<MapPinStatus, string> = {
  base: "bg-[var(--stone-600)]",
  held: "bg-[var(--color-status-working)]",
  needsOk: "bg-[var(--color-status-attention)]",
  searching: "bg-[var(--lake-700)]",
};

export function MapPin({
  status,
  place,
  detail,
}: {
  status: MapPinStatus;
  place: string;
  detail: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] py-1 pr-3 pl-1.5">
      <span className={cn("h-3 w-3 shrink-0 rounded-full", pinColors[status])} />
      <div className="leading-tight">
        <p className="text-label-s text-[var(--color-text-primary)]">{place}</p>
        <p className="text-caption text-[var(--color-text-tertiary)]">{detail}</p>
      </div>
    </div>
  );
}
