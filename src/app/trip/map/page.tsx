// Trip Plan · On the Map (Handoff Spec §4.1 node 12:443) — same plan as a
// static illustrated map with Map Pins; the map never becomes the start
// screen.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { ApproveBar } from "@/components/v3/approve-bar";
import { SegmentedControl } from "@/components/v3/segmented-control";
import { MapPin } from "@/components/v3/map-pin";
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

export default function TripMapPage() {
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
      <div className="flex items-center justify-between">
        <h2 className="text-heading-m text-[var(--color-text-primary)]">Your itinerary</h2>
        <SegmentedControl options={["By day", "On the map"]} selected="On the map" />
      </div>
      <div className="relative h-72 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--forest-100)]">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 30% 40%, var(--lake-100) 0%, transparent 40%)" }} />
        <div className="absolute top-10 left-12">
          <MapPin status="held" place="Pine Hollow" detail="Site 14 · held" />
        </div>
        <div className="absolute top-28 left-48">
          <MapPin status="held" place="Hill Country Trail Rides" detail="Sat 10:00-12:00" />
        </div>
        <div className="absolute top-44 left-20">
          <MapPin status="needsOk" place="Lakeshore Marina" detail="Pontoon · needs OK" />
        </div>
        <div className="absolute top-16 left-80">
          <MapPin status="held" place="Granite Ridge Outfitters" detail="Sun 7:00-8:30" />
        </div>
      </div>
      <Itinerary bookings={GOLDEN_PATH_BOOKINGS} photoByBookingId={GOLDEN_PATH_PHOTO_BY_BOOKING} />
    </TripShell>
  );
}
