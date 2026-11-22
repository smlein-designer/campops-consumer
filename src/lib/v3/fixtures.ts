import { CAMPSITES } from "@/lib/campsites";
import { ACTIVITIES } from "@/lib/v3/providers";
import { activityBookingPrice } from "@/lib/v3/money";
import { photoSrc } from "@/lib/v3/photos";
import type { Booking, TripPlanStep, TripRequirement } from "@/lib/v3/schemas";

/**
 * Static demo fixtures for Stage 4 (static screens, Build Brief §8.4) — no
 * agent wiring yet. Each screen's page imports the scenario it needs; the
 * golden path (`GOLDEN_PATH_*`) is shared across every screen built on the
 * Trip Plan layout so the plan, totals, and photos agree everywhere.
 */

export const pineHollow = CAMPSITES.find((c) => c.id === "pine-hollow-14")!;
export const cedarPoint = CAMPSITES.find((c) => c.id === "cedar-point-3")!;
export const liveOakBend = CAMPSITES.find((c) => c.id === "live-oak-bend-7")!;
export const prairieFlats = CAMPSITES.find((c) => c.id === "prairie-flats-22")!;
export const ridgeview = CAMPSITES.find((c) => c.id === "ridgeview-31")!;

export const pontoon = ACTIVITIES.find((a) => a.id === "lakeshore-pontoon")!;
export const kayaks = ACTIVITIES.find((a) => a.id === "lakeshore-kayaks")!;
export const beginnerTrail = ACTIVITIES.find((a) => a.id === "hcr-beginner-trail")!;
export const guidedHike = ACTIVITIES.find((a) => a.id === "granite-ridge-guided-hike")!;

export const GOLDEN_PATH_PARTY_SIZE = 4;

export const GOLDEN_PATH_REQUIREMENTS: TripRequirement[] = [
  { id: "r-waterfront", label: "Waterfront", tier: "must", source: "you said", changed: false },
  { id: "r-dogs", label: "Dogs OK", tier: "must", source: "you said", changed: false },
  { id: "r-drive", label: "Within 2 hours of Austin", tier: "nice", source: "you said", changed: false },
  { id: "r-budget", label: "Budget $300", tier: "nice", source: "you said", changed: false },
];

export const GOLDEN_PATH_PLAN: TripPlanStep[] = [
  { id: "step-campsite", label: "Find a campsite", detail: "Pine Hollow, Site 14 — held", status: "done" },
  { id: "step-activities", label: "Plan activities", detail: "One item needs your OK", status: "active" },
  { id: "step-review", label: "Review and approve", detail: "", status: "pending" },
];

export const GOLDEN_PATH_BOOKINGS: Booking[] = [
  {
    id: "b-campsite",
    kind: "campsite",
    refId: pineHollow.id,
    title: `${pineHollow.campgroundName} · ${pineHollow.siteName}`,
    day: "Apr 16-18",
    price: pineHollow.pricePerNight * 2 + pineHollow.serviceFee,
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
    day: "Sat",
    time: "10:00-12:00",
    price: activityBookingPrice(beginnerTrail, GOLDEN_PATH_PARTY_SIZE),
    refundTerms: beginnerTrail.refundTerms,
    dependsOn: ["b-campsite"],
    status: "held",
    holdId: "hold-trail-ride",
  },
  {
    id: "b-pontoon",
    kind: "activity",
    refId: pontoon.id,
    title: pontoon.name,
    day: "Sun",
    time: "9:00-1:00",
    price: activityBookingPrice(pontoon, GOLDEN_PATH_PARTY_SIZE),
    refundTerms: pontoon.refundTerms,
    dependsOn: ["b-campsite"],
    status: "changed_needs_ok",
    holdId: "hold-pontoon",
    changeNote: "Moved from Saturday for weather. You kept Sunday.",
  },
  {
    id: "b-guide",
    kind: "activity",
    refId: guidedHike.id,
    title: guidedHike.name,
    day: "Sun",
    time: "7:00-8:30",
    price: activityBookingPrice(guidedHike, GOLDEN_PATH_PARTY_SIZE),
    refundTerms: guidedHike.refundTerms,
    dependsOn: ["b-campsite"],
    status: "held",
    holdId: "hold-guide",
  },
];

export const GOLDEN_PATH_TRIP_HERO = {
  photo: photoSrc(pineHollow.photoKey ?? "campsite"),
  facts: ["Apr 16-18", "4 bookings", "$642"],
};

export const GOLDEN_PATH_PHOTO_BY_BOOKING: Record<string, string> = {
  "b-campsite": photoSrc(pineHollow.photoKey ?? "campsite"),
};

export const GOLDEN_PATH_THREAD = [
  { from: "agent" as const, message: "I held Pine Hollow, Site 14, the trail ride, and the guided hike." },
  {
    from: "agent" as const,
    message: "Storms are 70% likely Saturday 2-6pm, right when the pontoon was booked.",
  },
  {
    from: "agent" as const,
    message: "I found a Sunday 9:00-1:00 slot at the same price. Keep Sunday, or see other options?",
  },
];

export const GOLDEN_PATH_NEEDS_YOU = {
  eyebrow: "Storms 70% likely Sat 2-6pm",
  message: "The pontoon slot moves to Sunday 9:00-1:00, same price. Keep Sunday?",
  primary: { label: "Keep Sunday" },
  secondary: { label: "Other options" },
};

export const GOLDEN_PATH_AGENT_WAITING = {
  state: "waiting" as const,
  title: "Waiting on you",
  detail: "One item needs a decision",
};

export const GOLDEN_PATH_AGENT_WORKING = {
  state: "working" as const,
  title: "Working",
  detail: "Checking water access for the pontoon",
};

export const GOLDEN_PATH_APPROVE_BAR = { amount: "$642 total", summary: "Nothing charged yet" };
