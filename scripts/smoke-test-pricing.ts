/**
 * Regression coverage for derived nights/pricing and budget enforcement
 * (Dataset Depth correction, 2026-09-04 — see docs/implementation-decisions.md).
 * `nights` is never a campsite property — it's derived from the ACTUAL
 * requested checkIn/checkOut at both search-time (budget checks) and
 * staging-time (`stageReservation`).
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { computeDateRange } from "../src/lib/dates";
import { stageReservation } from "../src/lib/reservation";
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

run("computeDateRange derives real nights from checkIn/checkOut", () => {
  const range = computeDateRange("Sept 12", "Sept 14");
  assert(range !== null, "resolves a valid range");
  assert(range?.nights === 2, `Sept 12 -> Sept 14 is 2 nights — got ${range?.nights}`);
});

run("Nightly-rate budget filters on pricePerNight directly, regardless of dates", () => {
  const cheapSite = CAMPSITES.reduce((min, c) => (c.pricePerNight < min.pricePerNight ? c : min));
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    budget: { maxPerNight: cheapSite.pricePerNight, maxTotal: null },
  };
  const result = evaluateCampsites(intent);
  assert(
    result.candidates.every((c) => c.campsite.pricePerNight <= cheapSite.pricePerNight),
    "every candidate's nightly rate must be within the stated per-night budget",
  );
});

run("Total-stay budget uses the ACTUAL requested nights, not pricePerNight alone", () => {
  const site = CAMPSITES.find((c) => c.id === "pedernales-falls-6")!; // $90/night + $12 fee
  // 1 night: total = 90 + 12 = 102. A $150 total budget should include it for
  // a 1-night stay but EXCLUDE it for a stay long enough to exceed $150.
  const shortStay: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    checkIn: "Nov 1",
    checkOut: "Nov 2", // 1 night
    budget: { maxTotal: 150, maxPerNight: null },
    destinationRegion: "Johnson City",
  };
  const longStay: TripIntent = {
    ...shortStay,
    checkIn: "Nov 1",
    checkOut: "Nov 5", // 4 nights: 90*4 + 12 = 372, exceeds $150
  };
  const shortResult = evaluateCampsites(shortStay);
  const longResult = evaluateCampsites(longStay);
  const shortCandidate = shortResult.candidates.find((c) => c.campsite.id === site.id);
  const longCandidate = longResult.candidates.find((c) => c.campsite.id === site.id);
  assert(
    !!shortCandidate && shortCandidate.matchType !== "no_match",
    "a 1-night stay at $90/night + $12 fee ($102 total) fits a $150 total budget",
  );
  // A no_match evaluation still surfaces every evaluated site for
  // transparency (per evaluateCampsites' documented "closest available
  // sites" behavior), so the site is still IN the list — what must change
  // is its matchType, confirming the budget check itself failed it.
  assert(
    !!longCandidate && longCandidate.matchType === "no_match",
    "the SAME site over a 4-night stay ($372 total) must fail the same $150 total budget — nights matter",
  );
  assert(
    !!longCandidate?.compromises.some((m) => /total stay under \$150/i.test(m)),
    `the failing compromise reason should name the total-stay budget — got: ${JSON.stringify(longCandidate?.compromises)}`,
  );
});

run("A total-stay budget with no resolvable dates stays honestly unverifiable", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    budget: { maxTotal: 300, maxPerNight: null },
  };
  const result = evaluateCampsites(intent);
  const anyUnverifiable = result.candidates.some((c) =>
    c.checks.some(
      (chk) => chk.label === "Total stay under $300" && chk.status === "unverifiable",
    ),
  );
  assert(
    anyUnverifiable,
    "without concrete dates, a total-stay budget cannot compute a real total — must stay unverifiable, never guessed",
  );
});

run("stageReservation derives nights/total from the actual dates, never a campsite property", () => {
  const site = CAMPSITES.find((c) => c.id === "blue-ridge-14")!;
  const { reservation } = stageReservation(site, 4, "Dec 1", "Dec 4");
  const expectedNights = computeDateRange("Dec 1", "Dec 4")!.nights;
  assert(reservation.nights === expectedNights, `expected ${expectedNights} nights — got ${reservation.nights}`);
  const expectedTotal = Math.round((site.pricePerNight * expectedNights + site.serviceFee) * 100) / 100;
  assert(reservation.total === expectedTotal, `expected total $${expectedTotal} — got $${reservation.total}`);
});

if (failures > 0) {
  console.error(`\n${failures} pricing check(s) failed.`);
  process.exit(1);
}
console.log("\nAll pricing checks passed.");
