/**
 * Regression coverage for relative cancellation policy (Dataset Depth
 * correction, 2026-09-04 — see docs/implementation-decisions.md). Replaces
 * a literal, hard-coded cutoff date with a structured
 * `{freeUntilDaysBeforeCheckIn, latePenaltyNights}` resolved to display
 * copy relative to the ACTUAL reservation's check-in date.
 */
import { describeCancellationPolicy, stageReservation } from "../src/lib/reservation";
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
function run(label: string, fn: () => void) {
  console.log(`\n=== ${label} ===`);
  fn();
}

run("Every campsite has a structured cancellation policy, not a literal string", () => {
  const bad = CAMPSITES.filter(
    (c) =>
      typeof c.cancellationPolicy !== "object" ||
      typeof c.cancellationPolicy.freeUntilDaysBeforeCheckIn !== "number",
  );
  assert(bad.length === 0, `every record must carry a structured CancellationPolicy — found ${bad.length} bad`);
});

run("The cutoff date is derived from the ACTUAL check-in date, not a stale literal", () => {
  const policy = { freeUntilDaysBeforeCheckIn: 7, latePenaltyNights: 1 };
  const copyA = describeCancellationPolicy(policy, "2026-10-10");
  const copyB = describeCancellationPolicy(policy, "2026-12-25");
  assert(copyA !== copyB, "different check-in dates must produce different cutoff copy");
  assert(copyA.includes("Oct 3"), `7 days before Oct 10 is Oct 3 — got: "${copyA}"`);
  assert(copyB.includes("Dec 18"), `7 days before Dec 25 is Dec 18 — got: "${copyB}"`);
});

run("Reservation cancellation copy reflects the real staged check-in date", () => {
  const site = CAMPSITES.find((c) => c.id === "silver-creek-7")!; // freeUntilDaysBeforeCheckIn: 14
  const { reservation } = stageReservation(site, 4, "Jan 20", "Jan 22");
  assert(
    reservation.cancellationPolicy.includes("Jan 6"),
    `14 days before Jan 20 is Jan 6 — got: "${reservation.cancellationPolicy}"`,
  );
});

run("latePenaltyNights pluralization is grammatically correct", () => {
  const single = describeCancellationPolicy({ freeUntilDaysBeforeCheckIn: 7, latePenaltyNights: 1 }, "2026-10-10");
  const plural = describeCancellationPolicy({ freeUntilDaysBeforeCheckIn: 7, latePenaltyNights: 2 }, "2026-10-10");
  assert(single.includes("1 night is"), `expected "1 night is" — got: "${single}"`);
  assert(plural.includes("2 nights are"), `expected "2 nights are" — got: "${plural}"`);
});

if (failures > 0) {
  console.error(`\n${failures} cancellation-policy check(s) failed.`);
  process.exit(1);
}
console.log("\nAll cancellation-policy checks passed.");
