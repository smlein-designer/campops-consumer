/**
 * Regression coverage for recommendation-explanation grounding (item 16 of
 * the Dataset Depth correction, 2026-09-04 — see
 * docs/implementation-decisions.md). The model may phrase copy, but every
 * factual claim in an explanation must trace back to a real evaluator
 * fact — never invented pet/family/water/distance/amenity/price/capacity/
 * availability claims.
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

run("A family-friendly explanation names only features the site actually has", () => {
  const site = CAMPSITES.find((c) => c.id === "huntsville-4")!; // nature_center, restrooms_nearby, easy_trails
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    destinationRegion: "Huntsville",
    hardRequirements: ["Family-friendly"],
  };
  const result = evaluateCampsites(intent);
  const candidate = result.candidates.find((c) => c.campsite.id === site.id);
  assert(!!candidate, "the Huntsville family-friendly site is a candidate");
  assert(
    !!candidate && /nature center/i.test(candidate.explanation),
    `explanation should name a real feature (nature center) — got: "${candidate?.explanation}"`,
  );
  assert(
    !!candidate && !/playground/i.test(candidate.explanation),
    "explanation must NOT claim a feature (playground) this site doesn't actually have",
  );
});

run("The price and distance facts in an explanation match the evaluator's own numbers", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    originZip: "78701",
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  assert(
    top.explanation.includes(`$${top.campsite.pricePerNight}/night`),
    `explanation's price must match the real pricePerNight — got: "${top.explanation}"`,
  );
  if (top.distanceFromOriginMiles !== null) {
    assert(
      top.explanation.includes(`${top.distanceFromOriginMiles} mi`),
      `explanation's distance must match the real computed distance — got: "${top.explanation}"`,
    );
  }
});

run("No explanation claims a distance fact when no origin ZIP is known", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  assert(top.distanceFromOriginMiles === null, "no origin ZIP means no distance value at all");
  assert(!/mi away/.test(top.explanation), "explanation must not mention a distance it doesn't actually have");
});

run("Preserved/compromise chips only ever name real evaluator checks (never model-invented facts)", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    travelingWithPets: true,
    guestCount: 6,
  };
  const result = evaluateCampsites(intent);
  for (const c of result.candidates) {
    const checkLabels = new Set(c.checks.map((chk) => chk.label));
    for (const label of c.preserved) {
      assert(checkLabels.has(label), `preserved label "${label}" must correspond to a real check`);
    }
  }
});

if (failures > 0) {
  console.error(`\n${failures} explanation-grounding check(s) failed.`);
  process.exit(1);
}
console.log("\nAll explanation-grounding checks passed.");
