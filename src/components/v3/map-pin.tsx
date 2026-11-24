import { cn } from "@/lib/utils";

export type MapPinStatus = "base" | "held" | "needsOk" | "searching";

// Figma Map Pin (node 12:443): a white-ringed dot colored by booking status,
// beside a small white label. Base camp is the larger brand-green dot.
const pinColors: Record<MapPinStatus, string> = {
  base: "bg-[var(--color-bg-brand)]",
  held: "bg-[var(--color-status-working)]",
  needsOk: "bg-[var(--color-status-attention)]",
  searching: "bg-[var(--color-bg-control-off)]",
};

export function MapPin({
  status,
  place,
  detail,
  labelSide = "right",
}: {
  status: MapPinStatus;
  place: string;
  detail: string;
  labelSide?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        labelSide === "left" && "flex-row-reverse",
      )}
    >
      <span
        className={cn(
          "shrink-0 rounded-full border-[3px] border-[var(--color-bg-surface)]",
          status === "base" ? "size-[22px]" : "size-[18px]",
          pinColors[status],
        )}
      />
      <div className="rounded-md bg-[var(--color-bg-surface)] px-2 py-1 whitespace-nowrap">
        <p className="text-label-s text-[var(--color-text-primary)]">{place}</p>
        <p className="text-caption text-[var(--color-text-secondary)]">
          {detail}
        </p>
      </div>
    </div>
  );
}
