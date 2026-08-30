import { Button } from "@/components/ui/button";
import { SummaryRow } from "@/components/campops/summary-row";
import { text } from "@/lib/typography";
import type { Reservation } from "@/lib/schemas";

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "reserved";
}) {
  return (
    <div
      className={`shrink-0 rounded-full px-2 py-0.5 ${
        tone === "reserved"
          ? "bg-primary text-primary-foreground"
          : "bg-neutral-soft text-foreground"
      }`}
    >
      <span className={`${text.caption} font-semibold`}>{label}</span>
    </div>
  );
}

/**
 * Reservation Review / Missing Info / Booking Confirmed (Handoff Spec 4.3,
 * Figma nodes 8:258 / 35:237 / 32:129). One component switches its content
 * by `reservation.status` rather than three separate files, since they
 * share the same page shell and card layout closely enough to make that a
 * reasonable simplification — see docs/implementation-decisions.md.
 *
 * Desktop only for this slice, per agreed scope.
 */
export function ReservationReview({
  reservation,
  missingFields,
  onReserveAttempt,
  onAddPaymentMethod,
}: {
  reservation: Reservation;
  missingFields: string[];
  onReserveAttempt: () => void;
  onAddPaymentMethod: () => void;
}) {
  const { campsite } = reservation;
  const reserveLabel = `Reserve ${campsite.siteName} — $${reservation.total.toFixed(2)}`;
  const isIncomplete = reservation.status === "incomplete";
  const isReserved = reservation.status === "reserved";
  const missingPayment = missingFields.includes("Payment method");
  const missingGuests = missingFields.includes("Guest count");

  if (isReserved) {
    return (
      <div className="mx-auto flex w-[560px] flex-col items-start gap-6 pt-24">
        <p className={`${text.bodySm} text-muted-foreground`}>
          Your trip · {campsite.campgroundName}
        </p>
        <div className="flex w-full items-center justify-between">
          <p className={`${text.displayH3} text-foreground`}>
            You&rsquo;re all set
          </p>
          <Badge label="Reserved" tone="reserved" />
        </div>
        <p className={`${text.bodySm} text-muted-foreground`}>
          Your reservation is confirmed and your payment method was charged $
          {reservation.total.toFixed(2)}. A confirmation email is on its way.
        </p>
        <div className="flex w-full flex-col items-start gap-4 rounded-md border border-border bg-card p-6">
          <p className={`${text.labelLg} text-card-foreground`}>
            {campsite.siteName} · {campsite.campgroundName}
          </p>
          <SummaryRow
            label="Confirmation number"
            value={reservation.confirmationNumber ?? ""}
          />
          <SummaryRow label="Dates" value={reservation.dates} />
          <SummaryRow label="Guests" value={String(reservation.guestCount)} />
          <SummaryRow
            label="Amount charged"
            value={`$${reservation.total.toFixed(2)}`}
          />
          <SummaryRow
            label="Payment method"
            value={reservation.paymentMethodLabel ?? ""}
          />
          <div className="h-px w-full bg-border" />
          <p className={`${text.bodySm} text-muted-foreground`}>
            {reservation.cancellationPolicy}
          </p>
        </div>
        {/* No separate details page exists in this slice — inert placeholder. */}
        <Button disabled>View reservation details</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-[560px] flex-col items-start gap-6 pt-24">
      <p className={`${text.bodySm} text-muted-foreground`}>
        Your trip · {campsite.campgroundName}
      </p>
      <div className="flex w-full items-center justify-between">
        <p className={`${text.displayH3} text-foreground`}>
          Review your reservation
        </p>
        <Badge label="Staged · Not yet booked" tone="neutral" />
      </div>

      {/* Required Handoff Spec line — persistent, not conditional. */}
      <p className={`${text.bodySm} text-muted-foreground`}>
        No payment has been made and nothing has been booked yet.
      </p>

      {isIncomplete && (
        <div className="w-full rounded-sm bg-destructive-soft p-4">
          <p className={`${text.labelSm} text-destructive`}>
            Add a payment method to reserve this site. You won&rsquo;t be
            charged until you authorize the booking.
          </p>
        </div>
      )}

      <div className="flex w-full flex-col items-start gap-4 rounded-md border border-border bg-card p-6">
        <p className={`${text.labelLg} text-card-foreground`}>
          {campsite.siteName} · {campsite.campgroundName}
        </p>
        <SummaryRow label="Dates" value={reservation.dates} />
        <SummaryRow
          label="Guests"
          value={
            reservation.guestCount !== null
              ? String(reservation.guestCount)
              : "Not set"
          }
          missing={isIncomplete && missingGuests}
        />
        <SummaryRow label="Site type" value={campsite.siteType} />
        <SummaryRow
          label="Nightly rate"
          value={`$${reservation.nightlyRate.toFixed(2)} × ${reservation.nights} night${
            reservation.nights === 1 ? "" : "s"
          }`}
        />
        <SummaryRow
          label="Service fee"
          value={`$${reservation.serviceFee.toFixed(2)}`}
        />
        {isIncomplete && missingPayment && (
          <SummaryRow label="Payment method" value="Not added" missing />
        )}
        <div className="h-px w-full bg-border" />
        <SummaryRow
          label="Total due today if authorized"
          value={`$${reservation.total.toFixed(2)}`}
        />
        <p className={`${text.bodySm} text-muted-foreground`}>
          {reservation.cancellationPolicy}
        </p>
      </div>

      <div className="flex w-full items-center gap-2">
        {isIncomplete && missingPayment ? (
          <Button variant="outline" onClick={onAddPaymentMethod}>
            Add payment method
          </Button>
        ) : (
          // No edit-fields form exists in this slice — inert rather than
          // implying functionality that isn't built.
          <Button variant="outline" disabled>
            Edit reservation
          </Button>
        )}
        <div className="flex-1" />
        {/* Never preemptively disabled — an attempt with missing info produces
            the Missing Info state above rather than being blocked here. */}
        <Button onClick={onReserveAttempt}>{reserveLabel}</Button>
      </div>

      {/* Cancellation is consequential and requires its own confirmation
          flow, which is out of scope for this slice — inert rather than
          functional until that flow is intentionally implemented (never
          an immediate, unconfirmed discard). See docs/implementation-decisions.md. */}
      <span
        className={`${text.labelSm} cursor-not-allowed text-muted-foreground opacity-60`}
      >
        Cancel reservation
      </span>
    </div>
  );
}
