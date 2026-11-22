// Trip Plan (Handoff Spec §4.1 node 4:2 / §4.2 node 6:24) — the golden-path
// main view. Static mock state only (Build Order stage 4); the agent loop
// wires this up for real in a later stage.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { ApproveBar } from "@/components/v3/approve-bar";
import { Itinerary } from "@/components/v3/itinerary";
import {
  GOLDEN_PATH_AGENT_WAITING,
  GOLDEN_PATH_APPROVE_BAR,
  GOLDEN_PATH_BOOKINGS,
  GOLDEN_PATH_NEEDS_YOU,
  GOLDEN_PATH_PHOTO_BY_BOOKING,
  GOLDEN_PATH_THREAD,
  GOLDEN_PATH_TRIP_HERO,
} from "@/lib/v3/fixtures";

export default function TripPlanPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      hero={
        <TripHero size="large" status="Trip · Planning" title="Hill Country Weekend" {...GOLDEN_PATH_TRIP_HERO} />
      }
      agent={GOLDEN_PATH_AGENT_WAITING}
      needsYou={GOLDEN_PATH_NEEDS_YOU}
      thread={GOLDEN_PATH_THREAD}
      approveBar={<ApproveBar {...GOLDEN_PATH_APPROVE_BAR} />}
    >
      <Itinerary bookings={GOLDEN_PATH_BOOKINGS} photoByBookingId={GOLDEN_PATH_PHOTO_BY_BOOKING} />
    </TripShell>
  );
}
