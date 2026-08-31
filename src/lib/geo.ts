/**
 * Deterministic geographic evaluation (Search Truth correction, 2026-09-02
 * — see docs/implementation-decisions.md). Fixes a structural gap: CampOps
 * was correctly collecting an origin ZIP for "within an hour of my home"
 * style constraints, but had no actual capability to evaluate distance at
 * all, so every such hard requirement was permanently "unverifiable" —
 * which, per the constraint-integrity rule, can never count as "satisfied",
 * so every candidate silently failed regardless of the stated radius.
 *
 * This is explicitly a POC-scale DEMO approximation, not a real routing
 * engine, and is documented as such rather than presented as a precise
 * traffic-aware drive-time calculation:
 *
 *   origin ZIP -> bundled prefix-level centroid (NOT a full ZIP database)
 *   -> great-circle distance to the campsite's own real lat/lng
 *   -> deterministic road-distance/travel-time approximation
 *      (`ROAD_DISTANCE_FACTOR`, `AVERAGE_ROAD_SPEED_MPH` below)
 *
 * It is deterministic (identical inputs always produce identical outputs),
 * produces real variation across the expanded Texas dataset, and lets the
 * evaluator mark a distance constraint "satisfied" or "unsatisfied" instead
 * of permanently "unverifiable" — never an LLM call, never a live maps API.
 */

export type Coordinates = { lat: number; lng: number };

/**
 * Bundled, local ZIP-prefix centroid lookup — keyed by the first 3 digits
 * of a ZIP code, not a full 5-digit ZIP database (a lightweight local
 * solution suitable for this demo, per the agreed scope). Precision is
 * regional (a few miles to a few dozen miles), which is appropriate for a
 * "within N hours" comparison, not for turn-by-turn routing. Coverage is
 * intentionally limited to Texas-area prefixes the expanded dataset and its
 * demo scenarios actually exercise — an origin ZIP outside this table
 * returns `null` (honestly unverifiable), never a guessed coordinate.
 */
const ZIP_PREFIX_CENTROIDS: Record<string, Coordinates> = {
  // Austin / Central Texas
  "786": { lat: 30.6333, lng: -97.6779 }, // Georgetown / Round Rock
  "787": { lat: 30.2672, lng: -97.7431 }, // Austin
  "789": { lat: 30.1105, lng: -97.3151 }, // Bastrop
  // Hill Country
  "780": { lat: 29.9002, lng: -97.9383 }, // San Marcos
  "781": { lat: 29.7030, lng: -98.1245 }, // New Braunfels / Seguin
  "830": { lat: 30.2752, lng: -98.8722 }, // Fredericksburg / Kerrville area
  // San Antonio
  "782": { lat: 29.4241, lng: -98.4936 }, // San Antonio
  // Houston / Gulf
  "770": { lat: 29.7604, lng: -95.3698 }, // Houston
  "773": { lat: 29.7604, lng: -95.3698 },
  "775": { lat: 30.6188, lng: -95.4747 }, // Huntsville
  "776": { lat: 30.0802, lng: -94.1266 }, // Beaumont
  "774": { lat: 29.5518, lng: -95.0949 }, // Galveston / League City area
  // Dallas / North Texas
  "752": { lat: 32.7767, lng: -96.7970 }, // Dallas
  "753": { lat: 32.7767, lng: -96.7970 },
  "760": { lat: 32.7555, lng: -97.3308 }, // Fort Worth
  "761": { lat: 32.7555, lng: -97.3308 },
  "762": { lat: 33.3699, lng: -97.0058 }, // Denton / Pilot Point
  "764": { lat: 32.8779, lng: -98.4256 }, // Graford / Possum Kingdom
  // East Texas
  "756": { lat: 32.5007, lng: -94.7405 }, // Longview
  "757": { lat: 32.3513, lng: -95.3011 }, // Tyler
  "758": { lat: 31.6035, lng: -94.6555 }, // Nacogdoches
  "759": { lat: 31.3382, lng: -94.7291 }, // Lufkin
  // West Texas
  "796": { lat: 32.4487, lng: -99.7331 }, // Abilene
  "793": { lat: 33.5779, lng: -101.8552 }, // Lubbock
  "790": { lat: 35.1991, lng: -101.8313 }, // Amarillo / Canyon
  "791": { lat: 35.1991, lng: -101.8313 },
  "797": { lat: 31.8457, lng: -102.3676 }, // Midland/Odessa
  "798": { lat: 31.7619, lng: -106.4850 }, // El Paso
  "799": { lat: 31.7619, lng: -106.4850 },
};

/** Looks up a bundled regional centroid for a user-stated ZIP. Returns null (never a guess) if the ZIP's prefix isn't in the bundled table. */
export function coordinatesForZip(zip: string): Coordinates | null {
  const prefix = zip.trim().slice(0, 3);
  return ZIP_PREFIX_CENTROIDS[prefix] ?? null;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const EARTH_RADIUS_MILES = 3958.8;

/** Straight-line (great-circle) distance in miles between two coordinates. */
export function greatCircleMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Documented demo approximation (not a real routing engine): actual road
 * distance is typically longer than a straight line, and rural/mixed
 * highway driving in Texas averages meaningfully under highway top speed
 * once stops, towns, and non-interstate stretches are accounted for. These
 * two constants are the entirety of that approximation — deterministic,
 * simple, and documented, not a black box.
 */
export const ROAD_DISTANCE_FACTOR = 1.3;
export const AVERAGE_ROAD_SPEED_MPH = 50;

export function estimatedRoadMiles(a: Coordinates, b: Coordinates): number {
  return greatCircleMiles(a, b) * ROAD_DISTANCE_FACTOR;
}

export function estimatedTravelTimeHours(a: Coordinates, b: Coordinates): number {
  return estimatedRoadMiles(a, b) / AVERAGE_ROAD_SPEED_MPH;
}

/**
 * The ONE function that produces a user-relative distance value anywhere in
 * this app (Dataset Depth correction, 2026-09-04 — see
 * docs/implementation-decisions.md). There is no separate, origin-
 * independent distance field on a Campsite record to compete with this —
 * every distance a user sees is either this value or nothing. Returns null
 * (never a fabricated number) when there's no origin ZIP, or it falls
 * outside the bundled centroid table's coverage.
 */
export function distanceFromOriginMiles(
  originZip: string | null,
  destination: Coordinates,
): number | null {
  if (!originZip) return null;
  const origin = coordinatesForZip(originZip);
  if (!origin) return null;
  return Math.round(estimatedRoadMiles(origin, destination));
}

export type DistanceBudget =
  | { kind: "hours"; value: number }
  | { kind: "miles"; value: number };

const WORD_TO_NUMBER: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

/**
 * Parses the numeric travel budget out of a distance/travel-time
 * requirement label ("within an hour of my home", "less than 2 hours from
 * me", "within 50 miles of my house"). Deliberately a plain, deterministic
 * text parse — same rationale as `isOriginRelativeDistanceLabel` in
 * prerequisites.ts: this must reach the same answer for the same text every
 * time. Returns null when no explicit numeric/word budget is recognized —
 * that stays "unverifiable", never a guessed default radius.
 */
export function parseDistanceBudget(label: string): DistanceBudget | null {
  const l = label.toLowerCase();

  if (/\bhalf\s+an?\s+hour\b/.test(l)) return { kind: "hours", value: 0.5 };

  let m = l.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/);
  if (m) return { kind: "hours", value: parseFloat(m[1]) };

  m = l.match(/\b(a|an|one|two|three|four|five|six)\b\s*(?:hour|hr)s?\b/);
  if (m) return { kind: "hours", value: WORD_TO_NUMBER[m[1]] ?? 1 };

  m = l.match(/(\d+(?:\.\d+)?)\s*(?:minute|min)s?\b/);
  if (m) return { kind: "hours", value: parseFloat(m[1]) / 60 };

  m = l.match(/(\d+(?:\.\d+)?)\s*(?:mile|mi)s?\b/);
  if (m) return { kind: "miles", value: parseFloat(m[1]) };

  m = l.match(/\b(a|an|one|two|three|four|five|six)\b\s*(?:mile|mi)s?\b/);
  if (m) return { kind: "miles", value: WORD_TO_NUMBER[m[1]] ?? 1 };

  return null;
}
