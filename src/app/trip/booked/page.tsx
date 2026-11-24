// Booking Confirmed (Handoff Spec §4.1 node 36:1286 / §4.2 node 36:2564) —
// the post-approval state. No Needs You, no suggestions, no timers.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { Itinerary } from "@/components/v3/itinerary";
import {
  GOLDEN_PATH_BOOKINGS,
  GOLDEN_PATH_PHOTO_BY_BOOKING,
  GOLDEN_PATH_TRIP_HERO,
} from "@/lib/v3/fixtures";
import type { Booking } from "@/lib/v3/schemas";

const bookings: Booking[] = GOLDEN_PATH_BOOKINGS.map((b) => ({
  ...b,
  status: "approved" as const,
  holdId: null,
  changeNote: undefined,
}));

export default function BookingConfirmedPage() {
  return (
    <TripShell
      chargeStatus="Booked · $642 charged"
      hero={
        <TripHero size="large" status="Trip plan · booked" title="Lake weekend, Hill Country" {...GOLDEN_PATH_TRIP_HERO} />
      }
      agent={{ state: "working", title: "Trip booked", detail: "Every item is confirmed" }}
      thread={[{ from: "agent", message: "You're all set — every item is confirmed and charged to your Visa ending 4242." }]}
      approveBar={
        <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--color-bg-inverse)] px-5 py-4">
          <p className="text-label-l text-[var(--color-text-on-inverse)]">
            4 bookings confirmed · charged to Visa ending 4242
          </p>
          <button type="button" className="text-label-m text-white underline-offset-2 hover:underline">
            View confirmations
          </button>
        </div>
      }
    >
      <Itinerary title="Your bookings" bookings={bookings} photoByBookingId={GOLDEN_PATH_PHOTO_BY_BOOKING} />
    </TripShell>
  );
}
