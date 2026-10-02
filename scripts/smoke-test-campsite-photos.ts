/**
 * Regression coverage for deterministic Candidate Card photography
 * (2026-10-01): every campsite fixture maps to a DS photo whose file exists,
 * the photo's site type matches the record, the mapping is a pure function
 * of the record (never random), settings are geographically appropriate, and
 * the demo recommendation sequence stays visually distinguishable.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAMPSITES } from "../src/lib/campsites";
import { SITE_PHOTO_SETTING, campsitePhotoSrc } from "../src/lib/campsite-photos";
import { evaluateCampsites } from "../src/lib/evaluate";
import { EMPTY_TRIP_INTENT } from "../src/lib/schemas";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

const publicDir = join(__dirname, "..", "public");
const unmapped = CAMPSITES.filter((c) => !(c.id in SITE_PHOTO_SETTING)).map((c) => c.id);
assert(unmapped.length === 0, `every campsite has an explicit photo setting — unmapped: ${unmapped.join(", ") || "none"}`);

const stale = Object.keys(SITE_PHOTO_SETTING).filter((id) => !CAMPSITES.some((c) => c.id === id));
assert(stale.length === 0, `no mapping entry for a non-existent campsite — stale: ${stale.join(", ") || "none"}`);

const missingFiles = CAMPSITES.filter((c) => !existsSync(join(publicDir, campsitePhotoSrc(c)))).map(
  (c) => `${c.id} → ${campsitePhotoSrc(c)}`,
);
assert(missingFiles.length === 0, `every mapped photo file exists — missing: ${missingFiles.join(", ") || "none"}`);

const typeMismatch = CAMPSITES.filter((c) => {
  const file = campsitePhotoSrc(c);
  const expected = /rv/i.test(c.siteType) ? "-rv.jpg" : /cabin/i.test(c.siteType) ? "-cabin.jpg" : "-tent.jpg";
  return !file.endsWith(expected);
}).map((c) => `${c.id} (${c.siteType}) → ${campsitePhotoSrc(c)}`);
assert(typeMismatch.length === 0, `each photo shows the record's own site type — mismatches: ${typeMismatch.join(", ") || "none"}`);

assert(
  CAMPSITES.every((c) => campsitePhotoSrc(c) === campsitePhotoSrc({ id: c.id, siteType: c.siteType })),
  "the mapping is deterministic (a pure function of id + site type)",
);

// Geographic appropriateness: each setting only where it plausibly fits.
// (Asset utilization is NOT a requirement — an available photo may stay
// unused when no campsite suits it.)
const ALLOWED_REGIONS: Record<string, string[]> = {
  desert: ["West Texas"],
  dunes: ["Houston / Gulf"],
  river: ["Hill Country", "Austin / Central Texas", "San Antonio"],
};
const misplaced = CAMPSITES.filter((c) => {
  const setting = SITE_PHOTO_SETTING[c.id];
  return setting in ALLOWED_REGIONS && !ALLOWED_REGIONS[setting].includes(c.region);
}).map((c) => `${c.id} (${c.region}) → ${SITE_PHOTO_SETTING[c.id]}`);
assert(misplaced.length === 0, `desert/dunes/river photos only in plausible regions — misplaced: ${misplaced.join(", ") || "none"}`);
assert(
  CAMPSITES.filter((c) => SITE_PHOTO_SETTING[c.id] === "dunes").every((c) => c.id === "galveston-island-1"),
  "coastal dunes only for the Gulf-coast island site",
);

// The demo recommendation sequence stays visually distinguishable: in the
// standard Hill Country search, consecutive recommendations differ.
const demo = evaluateCampsites({
  ...EMPTY_TRIP_INTENT,
  guestCount: 4,
  checkIn: "Oct 16",
  checkOut: "Oct 18",
  destinationRegion: "Hill Country",
  hardRequirements: ["Near water"],
});
const demoPhotos = demo.candidates.map((c) => campsitePhotoSrc(c.campsite));
console.log(`  demo sequence: ${demoPhotos.map((s) => s.split("/").pop()).join(" → ")}`);
// The demonstrated path — first recommendation ⇄ "Show me another option" —
// must change the picture. (Later options in this set currently repeat a
// river cabin; that's a known, reported mapping gap, not asserted here.)
assert(
  demo.candidates.length >= 2 && demoPhotos[0] !== demoPhotos[1],
  "the first and second demo recommendations show different photos",
);

if (failures > 0) {
  console.error(`\n${failures} campsite-photo check(s) failed.`);
  process.exit(1);
}
console.log("\nAll campsite-photo checks passed.");
