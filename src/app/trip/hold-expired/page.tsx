// Hold Expired + Suggestion (Handoff Spec §4.1 node 12:263 / §4.2 node
// 36:2468) — re-hold happens without asking if within permission; the
// suggestion appears at a pause, never in the Needs You slot.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { ApproveBar } from "@/components/v3/approve-bar";
import { Itinerary } from "@/components/v3/itinerary";
import { SuggestionCard } from "@/components/v3/suggestion-card";
import {
  GOLDEN_PATH_APPROVE_BAR,
  GOLDEN_PATH_BOOKINGS,
  GOLDEN_PATH_PHOTO_BY_BOOKING,
  GOLDEN_PATH_TRIP_HERO,
  kayaks,
} from "@/lib/v3/fixtures";
import { photoSrc } from "@/lib/v3/photos";
import type { Booking } from "@/lib/v3/schemas";

const bookings: Booking[] = GOLDEN_PATH_BOOKINGS.map((b) =>
  b.id === "b-trail-ride" ? { ...b, status: "searching" as const, changeNote: undefined } : b,
);

export default function HoldExpiredPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      hero={
        <TripHero size="large" status="Trip · Planning" title="Hill Country Weekend" {...GOLDEN_PATH_TRIP_HERO} />
      }
      agent={{ state: "working", title: "Working", detail: "Re-holding the trail ride" }}
      thread={[
        { from: "agent", message: "Your trail ride hold ran out at 9:52." },
        {
          from: "agent",
          message: "The 10:00 slot is still open and within your $300 rule, so I'm holding it again. Nothing to do.",
        },
      ]}
      approveBar={<ApproveBar {...GOLDEN_PATH_APPROVE_BAR} />}
    >
      <Itinerary bookings={bookings} photoByBookingId={GOLDEN_PATH_PHOTO_BY_BOOKING} />
      <SuggestionCard
        title={kayaks.name}
        reason="Pairs well with your lakeside site."
        source="Offered by Lakeshore Marina"
        photo={photoSrc(kayaks.photoKey ?? "kayaks")}
      />
    </TripShell>
  );
}
