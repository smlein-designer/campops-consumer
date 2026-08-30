/**
 * Regression guard against the class of bug found during the
 * constraint-integrity slice: a structured TripIntent field that carries
 * deterministic constraint meaning but is never actually enforced by
 * evaluateCampsites (see docs/implementation-decisions.md, "guestCount was
 * never enforced as a hard capacity constraint").
 *
 * For each such field, this asserts that a value guaranteed to violate every
 * site in the dataset actually produces "no_match" — proving the evaluator
 * is reading the field at all, not silently ignoring it. This is a coverage
 * check, not a correctness suite: correctness of the matching logic itself
 * is covered by scripts/smoke-test-evaluate.ts.
 *
 * When a new TripIntent field gains deterministic constraint meaning (e.g.
 * checkIn/checkOut once date-range matching against datesAvailable is
 * implemented), add a case here.
 */
import { CAMPSITES } from "../src/lib/campsites";
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

// --- guestCount -> capacity -----------------------------------------------
{
  const impossibleGuestCount =
    Math.max(...CAMPSITES.map((c) => c.capacity)) + 1;
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    guestCount: impossibleGuestCount,
  });
  assert(
    result.kind === "no_match",
    `guestCount (${impossibleGuestCount}, exceeding every site's capacity, with EMPTY hardRequirements) must be enforced — got kind="${result.kind}"`,
  );
}

// --- (add future structured-field checks below this line) ----------------

if (failures > 0) {
  console.error(`\n${failures} structured-field regression check(s) failed.`);
  process.exit(1);
}
console.log("\nAll structured-field regression checks passed.");
