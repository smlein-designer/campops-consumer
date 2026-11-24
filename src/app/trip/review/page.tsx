"use client";

// Review and Approve (Handoff Spec §4.1 node 10:112 / §4.2 node 11:54) —
// one review for the whole trip, any item removable, explicit authorization
// before any simulated charge. Client Component only because the demo
// wires inline onRemove handlers.
import { TopNav } from "@/components/v3/top-nav";
import { ReviewLineItem } from "@/components/v3/review-line-item";
import { SummaryRow } from "@/components/v3/summary-row";
import { CommitNote } from "@/components/v3/commit-note";
import { Button } from "@/components/v3/button";
import { bookingKindLabel } from "@/lib/v3/booking-display";
import { GOLDEN_PATH_BOOKINGS } from "@/lib/v3/fixtures";
import { tripTotal } from "@/lib/v3/money";

export default function ReviewAndApprovePage() {
  const total = tripTotal(GOLDEN_PATH_BOOKINGS);
  return (
    <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
      <div className="sticky top-0 z-30 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
        <TopNav active="Trips" chargeStatus="Nothing charged yet" />
      </div>
      <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
        <div className="space-y-2">
          <h1 className="text-heading-l text-[var(--color-text-primary)]">Review and approve</h1>
          <CommitNote message="Approving books every item below and charges your Visa ending 4242. Nothing happens until you approve." />
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-2">
          {GOLDEN_PATH_BOOKINGS.map((booking) => (
            <ReviewLineItem
              key={booking.id}
              title={`${bookingKindLabel(booking.kind)} · ${booking.title}`}
              when={`${booking.day}${booking.time ? ` · ${booking.time}` : ""}`}
              terms={booking.refundTerms}
              flag={booking.changeNote}
              amount={`$${booking.price}`}
              onRemove={() => {}}
            />
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
          <SummaryRow label="Payment method" value="Visa ending 4242" />
          <SummaryRow label="Total" value={`$${total}`} />
        </div>

        <CommitNote message="When you book: every held item is charged to the card above, and you'll see confirmation details for each." />

        <Button
          variant="primary"
          size="large"
          label={`Book ${GOLDEN_PATH_BOOKINGS.length} items · charge $${total}`}
          className="w-full"
        />
      </div>
    </div>
  );
}
