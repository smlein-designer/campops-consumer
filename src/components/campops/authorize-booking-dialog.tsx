import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SummaryRow } from "@/components/campops/summary-row";
import { text } from "@/lib/typography";
import type { Reservation } from "@/lib/schemas";

/**
 * Authorize Booking (Handoff Spec §5 exemplar / Figma node 30:90) — the
 * single highest-risk seam in the flow. Every value shown here is read
 * directly off the current Reservation, never re-derived or LLM-generated.
 * The commit button names the actual action and amount, never "Confirm".
 *
 * Responsive Behavior (Handoff Spec §5): Desktop (≥1024px here) — centered
 * modal, radius/md all corners. Mobile (<1024px here) — bottom sheet
 * anchored to the viewport edge, radius/xl top corners only, drag handle.
 * Same content and Popup element either way — only position/corners/width
 * change, via responsive Tailwind variants on the one DialogContent.
 */
export function AuthorizeBookingDialog({
  reservation,
  onCancel,
  onAuthorize,
}: {
  reservation: Reservation;
  onCancel: () => void;
  onAuthorize: () => void;
}) {
  const open =
    reservation.status === "ready_for_authorization" ||
    reservation.status === "authorizing";
  const isAuthorizing = reservation.status === "authorizing";
  const { campsite } = reservation;
  const amount = reservation.total.toFixed(2);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[480px] gap-4 rounded-md p-6 max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-w-full max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-xl max-lg:rounded-b-none max-lg:pb-8 lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2"
      >
        {/* Drag handle — decorative, mobile-only (Figma node 31:125). */}
        <div className="mx-auto -mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-border lg:hidden" />
        <DialogTitle className={`${text.displayH3} text-card-foreground`}>
          Confirm your reservation
        </DialogTitle>
        <p className={`${text.bodyBase} text-card-foreground`}>
          You&rsquo;re about to reserve {campsite.siteName} at{" "}
          {campsite.campgroundName} for {reservation.checkIn} –{" "}
          {reservation.checkOut}. This will charge your saved payment method $
          {amount} now.
        </p>
        <div className="h-px w-full bg-border" />
        <SummaryRow
          label="Site"
          value={`${campsite.siteName}, ${campsite.campgroundName}`}
        />
        <SummaryRow label="Dates" value={reservation.dates} />
        <SummaryRow label="Amount to charge" value={`$${amount}`} />
        <SummaryRow
          label="Payment method"
          value={reservation.paymentMethodLabel ?? ""}
        />
        <p className={`${text.labelSm} text-destructive`}>
          Non-refundable after Sept 1. This action cannot be undone once
          authorized.
        </p>
        <div className="flex items-center justify-end gap-6">
          <Button variant="outline" onClick={onCancel} disabled={isAuthorizing}>
            Cancel
          </Button>
          <Button onClick={onAuthorize} disabled={isAuthorizing}>
            {isAuthorizing
              ? "Reserving…"
              : `Reserve ${campsite.siteName} — $${amount}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
