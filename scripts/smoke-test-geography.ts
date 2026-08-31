/**
 * Regression coverage for deterministic destination-phrase normalization
 * (Dataset Depth correction, 2026-09-04 — see docs/implementation-decisions.md).
 * "Prefer structured geography/aliases over model-generated geographic
 * truth" — filler words ("near", "around", "area") are stripped
 * deterministically before matching against the dataset's real
 * city/region names.
 */
import { normalizeDestinationRegion } from "../src/lib/geography";
import { evaluateCampsites } from "../src/lib/evaluate";
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

run("normalizeDestinationRegion strips common locational filler", () => {
  assert(normalizeDestinationRegion("near Austin") === "Austin", '"near Austin" -> "Austin"');
  assert(
    normalizeDestinationRegion("around Fredericksburg") === "Fredericksburg",
    '"around Fredericksburg" -> "Fredericksburg"',
  );
  assert(
    normalizeDestinationRegion("San Antonio area") === "San Antonio",
    '"San Antonio area" -> "San Antonio"',
  );
  assert(normalizeDestinationRegion("Hill Country") === "Hill Country", "no filler -> unchanged");
  assert(normalizeDestinationRegion("East Texas") === "East Texas", "no filler -> unchanged");
  assert(normalizeDestinationRegion(null) === null, "null stays null");
});

run("'near Austin' (normalized) matches Austin-area campsites", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    destinationRegion: normalizeDestinationRegion("near Austin"),
  };
  const result = evaluateCampsites(intent);
  assert(
    result.candidates.some((c) => c.campsite.city === "Austin"),
    "an Austin city record must qualify for a normalized 'near Austin' destination",
  );
});

run("'around Fredericksburg' (normalized) matches the Fredericksburg record", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    destinationRegion: normalizeDestinationRegion("around Fredericksburg"),
  };
  const result = evaluateCampsites(intent);
  assert(
    result.candidates.some((c) => c.campsite.city === "Fredericksburg"),
    "the Fredericksburg record must qualify",
  );
});

run("'Hill Country' matches every Hill Country region record", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    destinationRegion: normalizeDestinationRegion("Hill Country"),
  };
  const result = evaluateCampsites(intent);
  assert(
    result.candidates.every((c) => c.campsite.region === "Hill Country"),
    "every candidate returned for 'Hill Country' must actually be in that region",
  );
  assert(result.candidates.length > 1, "Hill Country has multiple qualifying records");
});

run("An unrelated destination correctly excludes everything (structural honesty, not a fabricated match)", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    destinationRegion: "Antarctica",
  };
  const result = evaluateCampsites(intent);
  assert(result.kind === "no_match", "no Texas record should match a destination that isn't in Texas");
});

if (failures > 0) {
  console.error(`\n${failures} geography check(s) failed.`);
  process.exit(1);
}
console.log("\nAll geography checks passed.");
