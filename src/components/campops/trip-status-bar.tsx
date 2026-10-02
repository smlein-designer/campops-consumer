import { Activity, LayoutList } from "lucide-react";
import { Badge, type BadgeSeverity } from "@/components/campops/badge";
import { IconAction } from "@/components/campops/icon-action";

/**
 * CampOps DS "Mobile Status Bar": the live trip status Badge on the left,
 * and on the right two icon actions (44×44 targets, 24px icons, 4px apart):
 *  - "View trip details" (+ tooltip on hover/focus) — opens the Your Trip
 *    bottom sheet;
 *  - "View activity" (+ tooltip on hover/focus) — opens the Activity page.
 * Accessible names and tooltips follow the DS annotations. The status
 * itself is always the caller's real runtime state — never Figma's example
 * copy. `lg:hidden` — desktop shows the status and Activity in the Trip
 * Panel's Panel Header instead.
 */
export function TripStatusBar({
  status,
  onViewDetails,
  onViewActivity,
}: {
  status: { label: string; severity: BadgeSeverity; working?: boolean };
  onViewDetails: () => void;
  onViewActivity: () => void;
}) {
  return (
    <div className="flex h-11 w-full shrink-0 items-center justify-between gap-4 border-b border-border bg-card pr-1 pl-4 lg:hidden">
      <div className="min-w-0 overflow-hidden">
        <Badge
          label={status.label}
          severity={status.severity}
          working={status.working}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconAction label="View trip details" onClick={onViewDetails}>
          <LayoutList className="size-6 text-muted-foreground" aria-hidden />
        </IconAction>
        <IconAction label="View activity" onClick={onViewActivity}>
          <Activity className="size-6 text-muted-foreground" aria-hidden />
        </IconAction>
      </div>
    </div>
  );
}
