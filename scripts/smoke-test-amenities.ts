/**
 * Regression coverage for amenity normalization (Dataset Depth correction,
 * 2026-09-04 — see docs/implementation-decisions.md). Amenities are now a
 * finite, canonical vocabulary (src/lib/amenities.ts); a free-text
 * requirement label is normalized to a canonical code before comparison,
 * so "bathroom" now genuinely matches a site's "restroom" amenity instead
 * of failing a raw substring comparison.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { normalizeAmenityLabel, AMENITY_CODES } from "../src/lib/amenities";
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

run("Every campsite amenity is a canonical AmenityCode", () => {
  const invalid = CAMPSITES.flatMap((c) =>
    c.amenities.filter((a) => !(AMENITY_CODES as readonly string[]).includes(a)),
  );
  assert(invalid.length === 0, `every amenity must be a canonical code — found: ${JSON.stringify(invalid)}`);
});

run("Alias normalization: bathroom/toilet variants map to 'restroom'", () => {
  for (const alias of ["bathroom", "bathrooms", "toilet", "toilets", "Restrooms"]) {
    assert(
      normalizeAmenityLabel(alias) === "restroom",
      `"${alias}" should normalize to "restroom" — got "${normalizeAmenityLabel(alias)}"`,
    );
  }
});

run("Alias normalization: showers/hookups/drinking water", () => {
  assert(normalizeAmenityLabel("showers") === "shower", "'showers' -> shower");
  assert(normalizeAmenityLabel("drinking water") === "potable_water", "'drinking water' -> potable_water");
  assert(normalizeAmenityLabel("hookups") === "electric_hookup", "'hookups' -> electric_hookup");
});

run("An unrecognized string normalizes to null, not a guessed code", () => {
  assert(normalizeAmenityLabel("a hammock stand") === null, "unrecognized amenity text returns null");
});

run("'bathroom/restroom' alias enforcement excludes sites that genuinely lack it", () => {
  const withRestroom = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["bathroom"],
  });
  const siteIdsWithRestroom = CAMPSITES.filter((c) => c.amenities.includes("restroom")).map((c) => c.id);
  assert(
    withRestroom.candidates.every((c) => siteIdsWithRestroom.includes(c.campsite.id)),
    "'bathroom' (normalized to restroom) must only match sites that actually list the restroom amenity",
  );
  assert(
    withRestroom.candidates.length > 0 && withRestroom.candidates.length < CAMPSITES.length,
    "the restroom requirement must genuinely filter (not trivially match everyone or no one)",
  );
});

run("'I need bathrooms and showers' resolves both, never 'Couldn't verify'", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["bathrooms", "showers"],
  };
  const result = evaluateCampsites(intent);
  const anyUnverifiable = result.candidates.some((c) =>
    c.checks.some(
      (chk) => (chk.label === "bathrooms" || chk.label === "showers") && chk.status === "unverifiable",
    ),
  );
  assert(!anyUnverifiable, "both normalized amenity requirements resolve deterministically");
});

if (failures > 0) {
  console.error(`\n${failures} amenity check(s) failed.`);
  process.exit(1);
}
console.log("\nAll amenity normalization checks passed.");
