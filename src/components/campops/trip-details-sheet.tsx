import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TripRequirementsList,
} from "@/components/campops/trip-requirements-list";
import { text } from "@/lib/typography";
import type { TripIntent } from "@/lib/schemas";

/**
 * Mobile "Trip Details Expanded" bottom sheet (Handoff Spec 4.1 / Figma
 * "Intent & Search — Working (Trip Details Expanded) — Mobile", node
 * 54:356) — reached via `TripStatusBar`'s "View details" link. Shows the
 * same goal statement and the same `TripRequirementsList` the desktop Trip
 * Panel shows persistently; direct chip removal here goes through the
 * identical `onRemove` callback the desktop panel and the Candidate Card
 * both use — no separate mobile removal path.
 *
 * Reuses the shared Dialog primitive rather than a dedicated Sheet
 * component: same Popup element, just anchored to the bottom edge with
 * top-only rounding and a drag handle, matching Authorize Booking's
 * Desktop-dialog/Mobile-sheet pattern (Handoff Spec §5).
 */
export function TripDetailsSheet({
  open,
  onOpenChange,
  intent,
  onRemove,
  onViewActivity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: TripIntent;
  onRemove: (key: keyof TripIntent, value: string) => void;
  onViewActivity: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-auto bottom-0 left-0 max-h-[80vh] w-full max-w-full translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-xl rounded-b-none p-6 pb-8 lg:hidden"
      >
        <div className="mx-auto -mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-border" />
        <div className="flex items-center justify-between">
          <DialogTitle className={`${text.displayH3} text-card-foreground`}>
            Your trip
          </DialogTitle>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onViewActivity();
            }}
            className={`${text.bodySm} cursor-pointer text-muted-foreground underline`}
          >
            View activity
          </button>
        </div>
        {intent.goalStatement && (
          <p className={`${text.bodySm} text-muted-foreground`}>
            {intent.goalStatement}
          </p>
        )}
        <div className="h-px w-full bg-border" />
        <TripRequirementsList intent={intent} onRemove={onRemove} />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className={`${text.labelSm} cursor-pointer self-center text-muted-foreground underline`}
        >
          Done
        </button>
      </DialogContent>
    </Dialog>
  );
}
