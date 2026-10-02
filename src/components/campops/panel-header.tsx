import { Activity } from "lucide-react";
import { Badge, type BadgeSeverity } from "@/components/campops/badge";
import { IconAction } from "@/components/campops/icon-action";
import { text } from "@/lib/typography";

/**
 * CampOps DS "Panel Header": a Display/H3 title with an optional status
 * Badge beneath it.
 *
 * Pages v2 places the badge here on desktop only — on mobile the same
 * status lives in the Mobile Status Bar — hence `badgeClassName`.
 *
 * Activity: the current DS has moved Activity to the Mobile Status Bar and
 * no longer draws it in this component. The desktop Trip Panel keeps its
 * Activity action here (pending design confirmation — see the delta
 * report), so `onViewActivity` is optional: pass it only where an Activity
 * action belongs. When shown it keeps the earlier DS contract — 44×44
 * target, 32px white circle, 20px icon, accessible name "View activity" +
 * tooltip on hover/focus — and `activityOnDesktopOnly` hides it below lg,
 * where Activity is in the Mobile Status Bar.
 */
export function PanelHeader({
  title,
  badge,
  badgeClassName = "",
  activityOnDesktopOnly = false,
  onViewActivity,
}: {
  title: string;
  badge?: { label: string; severity: BadgeSeverity; working?: boolean };
  badgeClassName?: string;
  activityOnDesktopOnly?: boolean;
  onViewActivity?: () => void;
}) {
  return (
    <div className="flex w-full items-start justify-between">
      <div className="flex min-w-0 flex-col items-start gap-1">
        <h2 className={`${text.displayH3} text-card-foreground`}>{title}</h2>
        {badge && (
          <div className={badgeClassName}>
            <Badge
              label={badge.label}
              severity={badge.severity}
              working={badge.working}
            />
          </div>
        )}
      </div>
      {onViewActivity && (
        <div className={activityOnDesktopOnly ? "hidden lg:block" : ""}>
          <IconAction label="View activity" onClick={onViewActivity}>
            <span className="flex size-8 items-center justify-center rounded-full bg-card text-foreground">
              <Activity className="size-5" aria-hidden />
            </span>
          </IconAction>
        </div>
      )}
    </div>
  );
}
