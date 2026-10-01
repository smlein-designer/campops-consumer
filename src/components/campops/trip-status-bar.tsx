import { text } from "@/lib/typography";

/**
 * Mobile collapsed trip-status row (Handoff Spec 2.2/4.1's mobile "Working"
 * pattern / Figma node "Status Bar", e.g. Intent & Search — Working — Mobile
 * 51:254). Desktop shows the Trip Panel persistently alongside chat; mobile
 * has no room for that, so it collapses to this one-line status + a "View
 * details" link that opens the full Trip Details sheet
 * (`TripDetailsSheet`) — same underlying trip state either way, just a
 * different affordance for reaching it. `lg:hidden` — desktop never renders
 * this row at all.
 */
export function TripStatusBar({
  label,
  onViewDetails,
}: {
  label: string;
  onViewDetails: () => void;
}) {
  return (
    <div className="flex w-full shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-2 lg:hidden">
      <span className={`${text.labelSm} min-w-0 truncate text-card-foreground`}>
        {label}
      </span>
      <button
        type="button"
        onClick={onViewDetails}
        className={`${text.labelSm} shrink-0 cursor-pointer text-muted-foreground`}
      >
        View details ›
      </button>
    </div>
  );
}
