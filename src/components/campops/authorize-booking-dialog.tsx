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
 * Desktop dialog only for this slice; the mobile bottom-sheet variant is
 * deferred along with the rest of responsive parity.
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
        className="max-w-[480px] gap-4 p-6"
      >
        <DialogTitle className={`${text.displayH3} text-card-foreground`}>
          Confirm your reservation
        </DialogTitle>
        <p className={`${text.bodyBase} text-card-foreground`}>
          You&rsquo;re about to reserve {campsite.siteName} at{" "}
          {campsite.campgroundName} for {campsite.datesAvailable}. This will
          charge your saved payment method ${amount} now.
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
