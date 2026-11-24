// Boat Dropped · No Water (Handoff Spec §4.1 node 36:1777) — the
// dependency rule's result is always said out loud, never silent.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { ApproveBar } from "@/components/v3/approve-bar";
import { Itinerary } from "@/components/v3/itinerary";
import { activityBookingPrice } from "@/lib/v3/money";
import { beginnerTrail, guidedHike, prairieFlats } from "@/lib/v3/fixtures";
import { photoSrc } from "@/lib/v3/photos";
import type { Booking } from "@/lib/v3/schemas";

const bookings: Booking[] = [
  {
    id: "b-campsite",
    kind: "campsite",
    refId: prairieFlats.id,
    title: `${prairieFlats.campgroundName} · ${prairieFlats.siteName}`,
    category: "Campsite · 2 nights",
    meta: "Open meadow · pets OK",
    photoKey: "meadow",
    day: "2027-04-16",
    price: prairieFlats.pricePerNight * 2 + prairieFlats.serviceFee,
    refundTerms: "Fully refundable until Apr 14",
    dependsOn: [],
    status: "held",
    holdId: "hold-campsite",
  },
  {
    id: "b-trail-ride",
    kind: "activity",
    refId: beginnerTrail.id,
    title: beginnerTrail.name,
    category: "Horseback",
    provider: "Hill Country Trail Rides",
    meta: "4 riders · beginner trail",
    photoKey: "ride",
    day: "2027-04-17",
    time: "10:00-12:00",
    price: activityBookingPrice(beginnerTrail, 4),
    refundTerms: beginnerTrail.refundTerms,
    dependsOn: ["b-campsite"],
    status: "held",
    holdId: "hold-trail-ride",
  },
  {
    id: "b-guide",
    kind: "activity",
    refId: guidedHike.id,
    title: guidedHike.name,
    category: "Guided hike",
    provider: "Granite Ridge Outfitters",
    meta: "Group rate for 4",
    photoKey: "hike",
    day: "2027-04-18",
    time: "07:00-08:30",
    price: activityBookingPrice(guidedHike, 4),
    refundTerms: guidedHike.refundTerms,
    dependsOn: ["b-campsite"],
    status: "held",
    holdId: "hold-guide",
  },
];

export default function BoatDroppedPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      hero={
        <TripHero
          size="large"
          status="Trip · Planning"
          title="Hill Country Weekend"
          photo={photoSrc(prairieFlats.photoKey ?? "meadow")}
          facts={["Apr 16-18", "3 bookings", "$410"]}
        />
      }
      agent={{ state: "waiting", title: "Waiting on you", detail: "The pontoon no longer fits" }}
      thread={[
        { from: "user", message: "Switch the campsite to Prairie Flats instead." },
        { from: "agent", message: "Prairie Flats has no water access, so the pontoon no longer fits — I released that hold." },
        { from: "agent", message: "The trail ride and guided hike don't depend on water, so those are still held." },
      ]}
      approveBar={<ApproveBar amount="$410 total" summary="Nothing charged yet" />}
    >
      <Itinerary bookings={bookings} photoByBookingId={{ "b-campsite": photoSrc(prairieFlats.photoKey ?? "meadow") }} />
    </TripShell>
  );
}
