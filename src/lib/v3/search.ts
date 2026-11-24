import { CAMPSITES } from "@/lib/campsites";
import { computeDateRange, type DateRange } from "@/lib/dates";
import { evaluateCampsites } from "@/lib/evaluate";
import { coordinatesForZip, estimatedTravelTimeHours } from "@/lib/geo";
import { normalizeDestinationRegion } from "@/lib/geography";
import { EMPTY_TRIP_INTENT, type Campsite, type ConstraintCheck, type EvaluationResult } from "@/lib/schemas";
import { activityTypesRequested } from "@/lib/v3/activity-match";
import { weekendOptions } from "@/lib/v3/trip-dates";
import { activityOfType } from "@/lib/v3/providers";
import type { Trip, TripRequirement, V3TripIntent } from "@/lib/v3/schemas";

/**
 * The one campsite search v3 uses. It reuses v2's deterministic evaluator
 * (Build Brief §3 "extend, do not restart") for everything v2 already
 * understood — capacity, pets, destination, dates, nightly budget, free-text
 * requirements — and adds the trip-level checks v3 introduced: drive time
 * from a named origin, a whole-trip budget, and whether a requested activity
 * is really offered near each site.
 */

// A city the user names as their starting point, mapped to a ZIP in the same
// bundled centroid table v2's distance maths already uses.
const CITY_ZIPS: Record<string, string> = {
  austin: "78701",
  "round rock": "78664",
  georgetown: "78626",
  bastrop: "78602",
  "san marcos": "78666",
  "new braunfels": "78130",
  fredericksburg: "78624",
  kerrville: "78028",
  "san antonio": "78201",
  houston: "77001",
  galveston: "77550",
  dallas: "75201",
  "fort worth": "76101",
  denton: "76201",
  tyler: "75701",
  lubbock: "79401",
  amarillo: "79101",
  midland: "79701",
  "el paso": "79901",
};

/** The origin as a ZIP the distance maths can use, or null if unknown. */
export function originZip(intent: V3TripIntent): string | null {
  const origin = intent.origin.trim().toLowerCase();
  if (!origin) return null;
  const zip = /^\d{5}$/.test(origin) ? origin : CITY_ZIPS[origin.replace(/,?\s*(tx|texas)$/, "")];
  return zip && coordinatesForZip(zip) ? zip : null;
}

export function partySize(intent: V3TripIntent): number {
  return intent.adults + intent.children;
}

/** The confirmed stay, or null until the user has given real dates. */
export function tripRange(intent: V3TripIntent): DateRange | null {
  return intent.checkIn && intent.checkOut ? computeDateRange(intent.checkIn, intent.checkOut) : null;
}

/**
 * Dates to search with: the confirmed stay, or — when the user has only
 * given a month — the first weekend CampOps offered, clearly an assumption.
 */
export function searchDates(intent: V3TripIntent): { checkIn: string; checkOut: string; assumed: boolean } | null {
  if (tripRange(intent)) return { checkIn: intent.checkIn, checkOut: intent.checkOut, assumed: false };
  const first = weekendOptions(intent.dateHint)[0];
  return first?.checkIn && first.checkOut ? { checkIn: first.checkIn, checkOut: first.checkOut, assumed: true } : null;
}

/** Estimated drive time from the user's origin to a campsite, in hours. */
export function driveHours(intent: V3TripIntent, campsite: Campsite): number | null {
  const zip = originZip(intent);
  const origin = zip ? coordinatesForZip(zip) : null;
  if (!origin) return null;
  return estimatedTravelTimeHours(origin, { lat: campsite.latitude, lng: campsite.longitude });
}

export function formatDrive(hours: number): string {
  const totalMinutes = Math.round((hours * 60) / 5) * 5;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function driveLimitLabel(intent: V3TripIntent): string {
  return `Under ${intent.driveLimitHours} hrs from ${intent.origin || "you"}`;
}

export function tripBudgetLabel(intent: V3TripIntent): string {
  return `Within your $${intent.budgetTotalUsd} budget`;
}

/** Requirements that name an activity (a boat, a ride) rather than a
 * property of the campsite itself. */
export function isActivityRequirement(requirement: TripRequirement): boolean {
  return activityTypesRequested([requirement.label]).length > 0;
}

export function wantsIntermediateRide(intent: V3TripIntent): boolean {
  return intent.requirements.some((r) => /intermediate|advanced|experienced/i.test(r.label));
}

function tripChecks(intent: V3TripIntent, nights: number | null) {
  return (site: Campsite): ConstraintCheck[] => {
    const checks: ConstraintCheck[] = [];
    if (intent.driveLimitHours != null) {
      const hours = driveHours(intent, site);
      checks.push({
        label: driveLimitLabel(intent),
        tier: "hard",
        status: hours == null ? "unverifiable" : hours <= intent.driveLimitHours ? "satisfied" : "unsatisfied",
      });
    }
    if (intent.budgetTotalUsd != null) {
      checks.push({
        label: tripBudgetLabel(intent),
        tier: "hard",
        status:
          nights == null
            ? "unverifiable"
            : site.pricePerNight * nights + site.serviceFee <= intent.budgetTotalUsd
              ? "satisfied"
              : "unsatisfied",
      });
    }
    for (const requirement of intent.requirements) {
      const [type] = activityTypesRequested([requirement.label]);
      if (!type) continue;
      checks.push({
        label: requirement.label,
        tier: requirement.tier === "must" ? "hard" : "preference",
        status: activityOfType(site, type, wantsIntermediateRide(intent)) ? "satisfied" : "unsatisfied",
      });
    }
    return checks;
  };
}

/**
 * A site that meets none of what the user asked for is not an option while
 * other sites meet some of it, however it ranks. Only requests CampOps can
 * check on some site count: one it can't judge anywhere ("good vibes") never
 * narrows the list. When no site meets any of them, the list is left whole —
 * a missed nice-to-have stays optional, and a missed must-have already shows
 * as what each site misses.
 */
function withSomethingAsked(result: EvaluationResult, intent: V3TripIntent): EvaluationResult {
  const asked = new Set(intent.requirements.map((r) => r.label));
  const checks = result.candidates.flatMap((c) => c.checks);
  const checkable = new Set(checks.filter((c) => asked.has(c.label) && c.status !== "unverifiable").map((c) => c.label));
  const kept = result.candidates.filter((c) => c.checks.some((ch) => checkable.has(ch.label) && ch.status === "satisfied"));
  if (kept.length === 0 || kept.length === result.candidates.length) return result;
  return { ...result, candidates: kept.map((c, i) => ({ ...c, rank: i + 1 })) };
}

export function searchCampsites(trip: Pick<Trip, "intent" | "unavailableCampsiteIds">): EvaluationResult {
  return withSomethingAsked(evaluateAll(trip), trip.intent);
}

function evaluateAll(trip: Pick<Trip, "intent" | "unavailableCampsiteIds">): EvaluationResult {
  const { intent } = trip;
  const dates = searchDates(intent);
  const range = dates ? computeDateRange(dates.checkIn, dates.checkOut) : null;
  const siteRequirements = intent.requirements.filter((r) => !isActivityRequirement(r));
  const party = partySize(intent);
  return evaluateCampsites(
    {
      ...EMPTY_TRIP_INTENT,
      guestCount: party > 0 ? party : null,
      checkIn: dates?.checkIn ?? null,
      checkOut: dates?.checkOut ?? null,
      originZip: originZip(intent),
      destinationRegion: normalizeDestinationRegion(intent.destination || null),
      travelingWithPets: intent.pets > 0,
      petCount: intent.pets > 0 ? intent.pets : null,
      travelingWithChildren: intent.children > 0,
      childCount: intent.children > 0 ? intent.children : null,
      budget: intent.budgetPerNightUsd != null ? { maxTotal: null, maxPerNight: intent.budgetPerNightUsd } : null,
      hardRequirements: siteRequirements.filter((r) => r.tier === "must").map((r) => r.label),
      preferences: siteRequirements.filter((r) => r.tier === "nice").map((r) => r.label),
    },
    new Set(trip.unavailableCampsiteIds),
    tripChecks(intent, range?.nights ?? null),
  );
}

/**
 * The same checks run against ONE campsite — for a site the user picked
 * themselves, which may not be among the best matches.
 */
export function searchOne(trip: Pick<Trip, "intent" | "unavailableCampsiteIds">, campsiteId: string): EvaluationResult {
  const others = CAMPSITES.filter((c) => c.id !== campsiteId).map((c) => c.id);
  // The site is judged as it is, even when it meets none of the requests.
  return evaluateAll({ ...trip, unavailableCampsiteIds: [...trip.unavailableCampsiteIds, ...others] });
}

/** The must-haves a campsite misses for this trip. */
export function mustHavesMissed(trip: Pick<Trip, "intent" | "unavailableCampsiteIds">, campsiteId: string): string[] {
  const candidate = searchOne(trip, campsiteId).candidates[0];
  return candidate ? candidate.checks.filter((c) => c.tier === "hard" && c.status === "unsatisfied").map((c) => c.label) : [];
}

/** Every campsite still open to this trip, whether or not it fits. */
export function openCampsites(trip: Pick<Trip, "unavailableCampsiteIds">): Campsite[] {
  return CAMPSITES.filter((c) => c.available && !trip.unavailableCampsiteIds.includes(c.id));
}

/** How many campsites are in play for this search — for progress copy. */
export function campsitesInScope(trip: Pick<Trip, "unavailableCampsiteIds">): number {
  return openCampsites(trip).length;
}

export function campsiteById(id: string): Campsite | undefined {
  return CAMPSITES.find((c) => c.id === id);
}
