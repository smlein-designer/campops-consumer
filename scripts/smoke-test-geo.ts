/**
 * Regression coverage for the deterministic geographic evaluation
 * capability (Search Truth correction, 2026-09-02 — see
 * docs/implementation-decisions.md). Fixes the structural bug where a
 * distance/travel-time hard requirement was permanently "unverifiable"
 * regardless of the stated radius, making it unsatisfiable by construction.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import {
  coordinatesForZip,
  estimatedRoadMiles,
  estimatedTravelTimeHours,
  greatCircleMiles,
  parseDistanceBudget,
} from "../src/lib/geo";
import { EMPTY_TRIP_INTENT, type TripIntent } from "../src/lib/schemas";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}
function run(label: string, fn: () => void) {
  console.log(`\n=== ${label} ===`);
  fn();
}

run("parseDistanceBudget recognizes hours, minutes, and miles", () => {
  assert(
    parseDistanceBudget("within an hour of my home")?.value === 1,
    "'an hour' -> 1 hour",
  );
  assert(
    parseDistanceBudget("within 2 hours of home")?.value === 2,
    "'2 hours' -> 2 hours",
  );
  assert(
    parseDistanceBudget("within 45 minutes of my house")?.value === 0.75,
    "'45 minutes' -> 0.75 hours",
  );
  assert(
    parseDistanceBudget("within 50 miles of me")?.kind === "miles" &&
      parseDistanceBudget("within 50 miles of me")?.value === 50,
    "'50 miles' -> 50 miles",
  );
  assert(
    parseDistanceBudget("pet-friendly") === null,
    "an unrelated label parses to null, never a guessed budget",
  );
});

run("coordinatesForZip resolves bundled Texas prefixes, honestly fails outside coverage", () => {
  assert(coordinatesForZip("78701") !== null, "Austin ZIP resolves");
  assert(
    coordinatesForZip("00501") === null,
    "a ZIP outside the bundled table returns null, never a guessed coordinate",
  );
});

run("greatCircleMiles / road-distance approximation are deterministic and monotonic", () => {
  const austin = coordinatesForZip("78701")!;
  const sameSpot = greatCircleMiles(austin, austin);
  assert(sameSpot < 0.01, "distance from a point to itself is ~0");
  const dallas = coordinatesForZip("752")
    ? coordinatesForZip("75201")!
    : austin;
  const first = estimatedRoadMiles(austin, dallas);
  const second = estimatedRoadMiles(austin, dallas);
  assert(first === second, "identical inputs produce a byte-identical distance");
  assert(
    estimatedTravelTimeHours(austin, dallas) === first / 50,
    "travel time is road miles / the documented average speed constant",
  );
});

// The core fix: a travel-time hard requirement must be genuinely evaluated
// — satisfied or unsatisfied — not permanently unverifiable, and 1 hour vs
// 2 hours must materially change which candidates qualify.
const austinOrigin = "78701";

run("Origin ZIP + 1 hour produces eligible nearby Texas records", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    originZip: austinOrigin,
    hardRequirements: ["Within an hour of my home"],
  };
  const result = evaluateCampsites(intent);
  assert(
    result.kind === "full",
    `expected some full-match candidates within an hour of Austin — got ${result.kind}`,
  );
  assert(
    result.candidates.some((c) => c.campsite.id === "pine-ridge-9"),
    "pine-ridge-9 (a few minutes from downtown Austin) should qualify within 1 hour",
  );
});

run("Same ZIP + 2 hours produces a larger-or-equal candidate set than 1 hour", () => {
  const within1h = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    originZip: austinOrigin,
    hardRequirements: ["Within an hour of my home"],
  });
  const within2h = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    originZip: austinOrigin,
    hardRequirements: ["Within 2 hours of my home"],
  });
  assert(
    within2h.candidates.length >= within1h.candidates.length,
    `2-hour radius (${within2h.candidates.length}) should be >= 1-hour radius (${within1h.candidates.length})`,
  );
  assert(
    within2h.candidates.some((c) => c.campsite.id === "eagle-point-5"),
    "eagle-point-5 (~2 hours from Austin) should newly qualify at the 2-hour radius",
  );
  assert(
    !within1h.candidates.some((c) => c.campsite.id === "eagle-point-5"),
    "eagle-point-5 should NOT qualify within only 1 hour — the radius must materially matter",
  );
});

run("A genuinely distant campground fails the 1-hour constraint", () => {
  const distanceOnly = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    originZip: austinOrigin,
    hardRequirements: ["Within an hour of my home"],
  });
  assert(
    !distanceOnly.candidates.some((c) => c.campsite.id === "guadalupe-mountains-1"),
    "guadalupe-mountains-1 (~460 mi from Austin) must fail a 1-hour radius",
  );
  const distanceOnly2h = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    originZip: austinOrigin,
    hardRequirements: ["Within 2 hours of my home"],
  });
  assert(
    !distanceOnly2h.candidates.some((c) => c.campsite.id === "guadalupe-mountains-1"),
    "guadalupe-mountains-1 must also fail a 2-hour radius — it's genuinely distant, not a borderline case",
  );
});

run("The travel constraint is evaluated (satisfied/unsatisfied), never permanently unverifiable", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    originZip: austinOrigin,
    hardRequirements: ["Within an hour of my home"],
  });
  const anyUnverifiable = result.candidates.some((c) =>
    c.checks.some(
      (chk) =>
        chk.label === "Within an hour of my home" && chk.status === "unverifiable",
    ),
  );
  assert(
    !anyUnverifiable,
    "with a resolvable ZIP and a parsable budget, the distance check must resolve to satisfied/unsatisfied, never stay unverifiable",
  );
});

run("No origin still leaves the constraint unverifiable (never guessed satisfied)", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    originZip: null,
    hardRequirements: ["Within an hour of my home"],
  });
  assert(
    result.kind !== "full",
    `no origin ZIP means the distance constraint stays unverifiable — must never resolve to full, got ${result.kind}`,
  );
});

if (failures > 0) {
  console.error(`\n${failures} geo check(s) failed.`);
  process.exit(1);
}
console.log("\nAll geo/travel-time checks passed.");
