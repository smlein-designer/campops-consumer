/**
 * Regression coverage for date-specific availability (Dataset Depth
 * correction, 2026-09-04 — see docs/implementation-decisions.md). Replaces
 * the shared, static `datesAvailable` string every record used to carry
 * with a real `unavailableRanges` check against the ACTUAL requested dates.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { CAMPSITES } from "../src/lib/campsites";
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

run("No campsite record carries a static datesAvailable/nights/distanceMiles field", () => {
  const stale = CAMPSITES.filter(
    (c) =>
      "datesAvailable" in c || "nights" in c || "distanceMiles" in c || "petFriendly" in c,
  );
  assert(
    stale.length === 0,
    `no record should carry these removed inventory fields — found on: ${stale.map((c) => c.id).join(", ")}`,
  );
});

run("Some records have genuine date-specific unavailable windows", () => {
  const withRanges = CAMPSITES.filter((c) => c.unavailableRanges.length > 0);
  assert(withRanges.length > 0, "at least one record has a real unavailableRanges entry");
});

// lakeview-11 is authored with unavailableRanges: [{ start: "2026-09-05", end: "2026-09-08" }]
const TEST_SITE_ID = "lakeview-11";

run("The same site is available for one date range and unavailable for another", () => {
  const unavailableWindow: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    checkIn: "Sept 5",
    checkOut: "Sept 7",
  };
  const availableWindow: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    checkIn: "Oct 10",
    checkOut: "Oct 12",
  };
  const resultUnavailable = evaluateCampsites(unavailableWindow);
  const resultAvailable = evaluateCampsites(availableWindow);
  assert(
    !resultUnavailable.candidates.some((c) => c.campsite.id === TEST_SITE_ID),
    `${TEST_SITE_ID} must be excluded (or no_match) for a date range overlapping its unavailableRanges`,
  );
  assert(
    resultAvailable.candidates.some((c) => c.campsite.id === TEST_SITE_ID),
    `${TEST_SITE_ID} must be available for a date range outside its unavailableRanges`,
  );
});

run("An exploratory search (no dates) never applies a date-range availability check", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT };
  const result = evaluateCampsites(intent);
  const anyDateCheck = result.candidates.some((c) =>
    c.checks.some((chk) => chk.label === "Available for your dates"),
  );
  assert(!anyDateCheck, "no dates means nothing to check availability against — never fabricated");
});

run("An unresolvable date phrase does not apply a fabricated availability check", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    checkIn: "sometime next month",
    checkOut: "a bit later",
  };
  const result = evaluateCampsites(intent);
  const anyDateCheck = result.candidates.some((c) =>
    c.checks.some((chk) => chk.label === "Available for your dates"),
  );
  assert(!anyDateCheck, "an unresolvable date pair must not be silently evaluated as a real range");
});

if (failures > 0) {
  console.error(`\n${failures} availability-range check(s) failed.`);
  process.exit(1);
}
console.log("\nAll availability-range checks passed.");
