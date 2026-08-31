/**
 * Regression coverage for structured water access (Dataset Depth
 * correction, 2026-09-04 — see docs/implementation-decisions.md). Replaces
 * `nearWater: boolean` with `{nearby, directAccess, type}` so "near water",
 * "waterfront", "lakeside", "near a river", and "beach access" are
 * genuinely different claims, not synonyms.
 *
 * Includes a real bug found during live verification: a combined phrase
 * like "waterfront on a lake" was checked via the FIRST matching branch
 * only (directAccess, from "waterfront"), never cross-checking the water
 * TYPE ("lake") at all — so a directly-accessible RIVER site incorrectly
 * satisfied a lake-specific waterfront request.
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

run("Every campsite has a structured waterAccess object", () => {
  const bad = CAMPSITES.filter(
    (c) => typeof c.waterAccess?.nearby !== "boolean" || typeof c.waterAccess?.type !== "string",
  );
  assert(bad.length === 0, "every record must carry a structured waterAccess value");
});

run("'Near water' matches any nearby water, regardless of type", () => {
  const result = evaluateCampsites({ ...EMPTY_TRIP_INTENT, hardRequirements: ["Near water"] });
  assert(
    result.candidates.every((c) => c.campsite.waterAccess.nearby),
    "every matching candidate must have waterAccess.nearby true",
  );
  const types = new Set(result.candidates.map((c) => c.campsite.waterAccess.type));
  assert(types.size > 1, "'near water' should match multiple distinct water types (not just one)");
});

run("'Waterfront' (no type) requires direct access, any water type", () => {
  const result = evaluateCampsites({ ...EMPTY_TRIP_INTENT, hardRequirements: ["Waterfront"] });
  assert(
    result.candidates.every((c) => c.campsite.waterAccess.directAccess),
    "every matching candidate must have direct water access",
  );
});

run("'Lakeside' requires type lake AND proximity, not merely direct access to any water", () => {
  const result = evaluateCampsites({ ...EMPTY_TRIP_INTENT, hardRequirements: ["Lakeside"] });
  assert(
    result.candidates.every((c) => c.campsite.waterAccess.type === "lake"),
    "every matching candidate must actually be a lake site",
  );
});

run("'Near a river' requires type river, not a lake or creek", () => {
  const result = evaluateCampsites({ ...EMPTY_TRIP_INTENT, hardRequirements: ["Near a river"] });
  assert(
    result.candidates.every((c) => c.campsite.waterAccess.type === "river"),
    "every matching candidate must actually be a river site",
  );
});

run("'Beach access' requires type beach specifically", () => {
  const result = evaluateCampsites({ ...EMPTY_TRIP_INTENT, hardRequirements: ["Beach access"] });
  assert(
    result.candidates.every((c) => c.campsite.waterAccess.type === "beach"),
    "every matching candidate must actually have beach-type water access",
  );
});

// The exact reproduced bug: a directly-accessible RIVER site
// (pedernales-falls-6) must NOT satisfy a lake-specific waterfront request.
run("'Waterfront on a lake' requires BOTH direct access AND type lake — a river site must not qualify", () => {
  const riverSite = CAMPSITES.find((c) => c.id === "pedernales-falls-6")!;
  assert(
    riverSite.waterAccess.type === "river" && riverSite.waterAccess.directAccess,
    "setup: pedernales-falls-6 must be a direct-access RIVER site for this test to be meaningful",
  );
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["Waterfront on a lake"],
  });
  assert(
    !result.candidates.some((c) => c.campsite.id === riverSite.id),
    "a direct-access river site must NOT satisfy a combined 'waterfront on a lake' requirement",
  );
  assert(
    result.candidates.every(
      (c) => c.campsite.waterAccess.type === "lake" && c.campsite.waterAccess.directAccess,
    ),
    "every candidate that DOES qualify must genuinely be both lake-type and direct-access",
  );
});

// Type-specific tests requested for the live prompt pass (item 20: "Find me
// a waterfront site on a lake" / "I want to camp near a river").
const intents: [string, TripIntent][] = [
  ["waterfront lake", { ...EMPTY_TRIP_INTENT, hardRequirements: ["Waterfront on a lake"] }],
  ["near a river", { ...EMPTY_TRIP_INTENT, hardRequirements: ["Near a river"] }],
];
run("Waterfront-lake and near-river searches produce genuinely different candidate sets", () => {
  const [lakeIds, riverIds] = intents.map(([, intent]) =>
    evaluateCampsites(intent).candidates.map((c) => c.campsite.id),
  );
  const overlap = lakeIds.filter((id) => riverIds.includes(id));
  assert(overlap.length === 0, "lake-type and river-type results must not overlap");
});

if (failures > 0) {
  console.error(`\n${failures} water-access check(s) failed.`);
  process.exit(1);
}
console.log("\nAll water-access checks passed.");
