import { Drawer } from "@base-ui/react/drawer";
import { TripRequirementsList } from "@/components/campops/trip-requirements-list";
import { text } from "@/lib/typography";
import type { TripIntent } from "@/lib/schemas";

/**
 * Mobile "Your Trip" bottom sheet (Pages v2 "Trip Details Sheet").
 *
 * Collapsed by default: only the grab bar is visible, sitting under the
 * floating composer as persistent foreground UI. It expands by swiping up
 * on the grab bar (Base UI Drawer's SwipeArea) or by tapping/activating it
 * (keyboard included); it collapses by swiping down, tapping the grab bar
 * again, tapping the scrim, or Escape. The scrim's opacity tracks the drag
 * progress (`--drawer-swipe-progress`) so the tint arrives progressively
 * with the sheet rather than as an abrupt state change.
 *
 * `changed` renders the collapsed grab bar in its green "trip changed,
 * not yet seen" state — the caller clears it when the sheet is opened.
 *
 * Shows the same goal statement and `TripRequirementsList` the desktop
 * Trip Panel shows persistently; chip removal here goes through the
 * identical `onRemove` callback — no separate mobile removal path.
 * Desktop never renders any of this (`lg:hidden`).
 */
export function TripDetailsSheet({
  open,
  onOpenChange,
  changed,
  intent,
  onRemove,
  onViewActivity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changed: boolean;
  intent: TripIntent;
  onRemove: (key: keyof TripIntent, value: string) => void;
  onViewActivity: () => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {/* Collapsed grab bar. The button is the accessible, keyboard-operable
          control; Base UI's SwipeArea (aria-hidden by design, so it must not
          wrap the button) sits transparently on top of it to catch swipe-up
          gestures and taps. */}
      <button
        type="button"
        aria-label={
          changed ? "Your trip was updated — show trip details" : "Show trip details"
        }
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
        className="fixed inset-x-0 bottom-0 z-30 flex h-9 w-full cursor-pointer items-start justify-center rounded-t-xl bg-card pt-4 shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1),0_-2px_8px_rgb(0_0_0/0.06)] focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        <span
          className={`h-1 w-9 rounded-full transition-colors ${changed ? "bg-primary" : "bg-border"}`}
        />
      </button>
      <Drawer.SwipeArea
        onClick={() => onOpenChange(true)}
        className="fixed inset-x-0 bottom-0 z-30 h-9 cursor-pointer lg:hidden"
      />

      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-x-0 top-14 bottom-0 z-40 bg-scrim opacity-[calc(1_-_var(--drawer-swipe-progress))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 lg:hidden" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end lg:hidden">
          <Drawer.Popup className="flex max-h-[85dvh] w-full translate-y-[var(--drawer-swipe-movement-y)] flex-col rounded-t-xl bg-card shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] transition-transform duration-300 ease-out outline-none data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:duration-0">
            <Drawer.Close
              aria-label="Hide trip details"
              className="flex h-9 w-full shrink-0 cursor-pointer items-start justify-center pt-4 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="h-1 w-9 rounded-full bg-border" />
            </Drawer.Close>
            <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
              <div className="flex items-center justify-between gap-4">
                <Drawer.Title className={`${text.displayH3} text-card-foreground`}>
                  Your trip
                </Drawer.Title>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onViewActivity();
                  }}
                  className={`${text.bodySm} cursor-pointer whitespace-nowrap text-muted-foreground underline`}
                >
                  View activity
                </button>
              </div>
              {intent.goalStatement && (
                <p className={`${text.bodySm} text-muted-foreground`}>
                  &ldquo;{intent.goalStatement}&rdquo;
                </p>
              )}
              <div className="h-px w-full shrink-0 bg-border" />
              <TripRequirementsList intent={intent} onRemove={onRemove} />
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
