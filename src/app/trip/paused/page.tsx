// Paused (Handoff Spec §4.1 node 36:1921) — pause stops new actions, not
// timers; holds keep counting down.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { ApproveBar } from "@/components/v3/approve-bar";
import { Itinerary } from "@/components/v3/itinerary";
import {
  GOLDEN_PATH_APPROVE_BAR,
  GOLDEN_PATH_BOOKINGS,
  GOLDEN_PATH_PHOTO_BY_BOOKING,
  GOLDEN_PATH_TRIP_HERO,
} from "@/lib/v3/fixtures";

export default function PausedPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      hero={
        <TripHero size="large" status="Trip · Planning" title="Hill Country Weekend" {...GOLDEN_PATH_TRIP_HERO} />
      }
      agent={{ state: "paused", title: "Paused", detail: "No new actions until you resume" }}
      thread={[{ from: "agent", message: "Paused. Your holds keep counting down while you're away." }]}
      approveBar={<ApproveBar {...GOLDEN_PATH_APPROVE_BAR} />}
    >
      <Itinerary bookings={GOLDEN_PATH_BOOKINGS} photoByBookingId={GOLDEN_PATH_PHOTO_BY_BOOKING} />
    </TripShell>
  );
}
