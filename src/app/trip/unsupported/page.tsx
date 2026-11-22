// Unsupported Request (Handoff Spec §4.1 node 31:1523) — the agent declines
// briefly, says what it covers, and points back to the open weather item.
// Nothing in the plan changes.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { ApproveBar } from "@/components/v3/approve-bar";
import { Itinerary } from "@/components/v3/itinerary";
import {
  GOLDEN_PATH_APPROVE_BAR,
  GOLDEN_PATH_BOOKINGS,
  GOLDEN_PATH_NEEDS_YOU,
  GOLDEN_PATH_PHOTO_BY_BOOKING,
  GOLDEN_PATH_TRIP_HERO,
} from "@/lib/v3/fixtures";

export default function UnsupportedRequestPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      hero={
        <TripHero size="large" status="Trip · Planning" title="Hill Country Weekend" {...GOLDEN_PATH_TRIP_HERO} />
      }
      agent={{ state: "waiting", title: "Waiting on you", detail: "One item needs a decision" }}
      needsYou={GOLDEN_PATH_NEEDS_YOU}
      thread={[
        { from: "user", message: "Can you also book my flight and a hotel for the night before?" },
        {
          from: "agent",
          message: "I can't book flights or hotels — CampOps only covers the campsite and nearby activities.",
        },
        { from: "agent", message: "There's still the Sunday pontoon time waiting on your OK, above." },
      ]}
      approveBar={<ApproveBar {...GOLDEN_PATH_APPROVE_BAR} />}
    >
      <Itinerary bookings={GOLDEN_PATH_BOOKINGS} photoByBookingId={GOLDEN_PATH_PHOTO_BY_BOOKING} />
    </TripShell>
  );
}
