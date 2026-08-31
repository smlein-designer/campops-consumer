/**
 * Structured-field enforcement guard (standing rule, item 17 of the Dataset
 * Depth correction, 2026-09-04 — see docs/implementation-decisions.md).
 * We've now found this exact bug class twice (guestCount, pet-friendliness):
 * a structured campsite field existing with no real enforcement path, so a
 * matching user requirement silently resolves to "Couldn't verify" instead
 * of a real satisfied/unsatisfied result. This guard fails the build the
 * moment a new Campsite field is added without being named in
 * `evaluate.ts`'s `ENFORCED_CAMPSITE_FIELDS` (or this script's own
 * `DESCRIPTIVE_ONLY_FIELDS` allowlist, for fields that are genuinely just
 * display/identity facts with nothing to search or rank on).
 */
import { ENFORCED_CAMPSITE_FIELDS } from "../src/lib/evaluate";
import { CAMPSITES } from "../src/lib/campsites";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

/**
 * Fields that are genuinely display/identity facts only — nothing a user
 * requirement could ever search/rank on. Adding a field here is itself a
 * product claim ("this will never need enforcement") and should be made
 * deliberately, not as a way to silence this guard.
 */
const DESCRIPTIVE_ONLY_FIELDS = new Set([
  "id",
  "siteName",
  "description",
  "address",
  "zip",
  "state",
]);

const campsiteKeys = Object.keys(CAMPSITES[0]);
const enforced = new Set<string>(ENFORCED_CAMPSITE_FIELDS);

console.log(`\n=== Every Campsite field is either enforced or explicitly descriptive-only ===`);
for (const key of campsiteKeys) {
  assert(
    enforced.has(key) || DESCRIPTIVE_ONLY_FIELDS.has(key),
    `"${key}" must appear in ENFORCED_CAMPSITE_FIELDS (evaluate.ts) or DESCRIPTIVE_ONLY_FIELDS (this script) — a structured field cannot silently exist with no enforcement path`,
  );
}

console.log(`\n=== ENFORCED_CAMPSITE_FIELDS names only real Campsite fields ===`);
for (const field of ENFORCED_CAMPSITE_FIELDS) {
  assert(campsiteKeys.includes(field), `"${field}" in ENFORCED_CAMPSITE_FIELDS must be a real Campsite field (stale entry?)`);
}

console.log(`\n=== No field is claimed both enforced and descriptive-only ===`);
for (const field of ENFORCED_CAMPSITE_FIELDS) {
  assert(!DESCRIPTIVE_ONLY_FIELDS.has(field), `"${field}" cannot be both enforced and descriptive-only`);
}

if (failures > 0) {
  console.error(`\n${failures} field-enforcement check(s) failed.`);
  process.exit(1);
}
console.log("\nAll structured-field enforcement guard checks passed.");
