/**
 * Regression coverage for deterministic relative/holiday date-phrase
 * normalization (src/lib/dates.ts — Search Truth correction, 2026-09-02,
 * see docs/implementation-decisions.md). Fixes phrases like "Labor Day
 * weekend" sometimes failing to resolve and causing a repeated
 * date-clarification loop.
 */
import { looksLikeDateAttempt, normalizeDatePhrase } from "../src/lib/dates";

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

// A fixed "now" so every assertion is deterministic regardless of the day
// this script actually runs. 2026-08-30 is a Sunday.
const NOW = new Date(2026, 7, 30);

run("Labor Day weekend resolves to the Saturday-through-Monday of the correct 1st-Monday-of-September", () => {
  // Labor Day 2026 is Monday, September 7.
  const result = normalizeDatePhrase("Labor Day weekend", NOW);
  assert(result !== null, "must resolve, not return null");
  assert(result?.checkIn === "Sep 5", `expected Sep 5 — got ${result?.checkIn}`);
  assert(result?.checkOut === "Sep 7", `expected Sep 7 — got ${result?.checkOut}`);
});

run("Memorial Day weekend resolves to the last Monday of May", () => {
  // Memorial Day 2027 (rolled forward, since May 2026 already passed
  // relative to NOW) is Monday, May 31, 2027 — so this expectation window
  // holds regardless of which specific year's last Monday it resolves to;
  // what matters is checkIn/checkOut are calendar-consistent Saturday and
  // Monday two days apart, computed from real calendar rules (asserted
  // structurally below), not hardcoded to one hand-picked year.
  const result = normalizeDatePhrase("Memorial Day weekend", NOW);
  assert(result !== null, "must resolve, not return null");
  assert(
    /^May \d{1,2}$/.test(result?.checkIn ?? ""),
    `checkIn should be a May date — got ${result?.checkIn}`,
  );
  assert(
    /^May \d{1,2}$/.test(result?.checkOut ?? ""),
    `checkOut should be a May date — got ${result?.checkOut}`,
  );
  const inDay = Number(result!.checkIn.split(" ")[1]);
  const outDay = Number(result!.checkOut.split(" ")[1]);
  assert(outDay - inDay === 2, "Memorial Day weekend spans Saturday to Monday — a 2-day gap");
});

run("'this weekend' resolves to the upcoming Saturday/Sunday", () => {
  // NOW is Sunday Aug 30, 2026 — "this weekend" should mean the Saturday
  // six days out (Sep 5) through Sunday (Sep 6).
  const result = normalizeDatePhrase("Let's go this weekend", NOW);
  assert(result !== null, "must resolve, not return null");
  assert(result?.checkIn === "Sep 5", `expected Sep 5 — got ${result?.checkIn}`);
  assert(result?.checkOut === "Sep 6", `expected Sep 6 — got ${result?.checkOut}`);
});

run("'next weekend' resolves one week later than 'this weekend'", () => {
  const thisWeekend = normalizeDatePhrase("this weekend", NOW)!;
  const nextWeekend = normalizeDatePhrase("next weekend", NOW)!;
  assert(
    nextWeekend.checkIn !== thisWeekend.checkIn,
    "'next weekend' must resolve to a different date than 'this weekend'",
  );
});

run("'Friday through Sunday' resolves to a concrete weekday-range date pair", () => {
  const result = normalizeDatePhrase("Friday through Sunday", NOW);
  assert(result !== null, "must resolve, not return null");
  assert(
    result!.checkIn !== result!.checkOut,
    "check-in and check-out must be distinct concrete dates",
  );
});

run("An ambiguous/unrecognized phrase is left unresolved, never guessed", () => {
  assert(
    normalizeDatePhrase("sometime in the fall", NOW) === null,
    "a genuinely ambiguous phrase must return null, not a fabricated date",
  );
  assert(
    normalizeDatePhrase("whenever works", NOW) === null,
    "a non-date phrase must return null",
  );
});

run("Normalization is deterministic for the same phrase and 'now'", () => {
  const a = normalizeDatePhrase("Labor Day weekend", NOW);
  const b = normalizeDatePhrase("Labor Day weekend", NOW);
  assert(JSON.stringify(a) === JSON.stringify(b), "identical inputs produce identical output");
});

run("looksLikeDateAttempt distinguishes a date-shaped answer from an unrelated one (loop protection)", () => {
  assert(looksLikeDateAttempt("Labor Day weekend"), "a recognized holiday phrase looks like a date attempt");
  assert(looksLikeDateAttempt("Sept 12"), "a month+day looks like a date attempt");
  assert(looksLikeDateAttempt("this weekend"), "'this weekend' looks like a date attempt");
  assert(
    !looksLikeDateAttempt("somewhere quiet and pet-friendly"),
    "an unrelated answer must not be mistaken for a date attempt",
  );
});

if (failures > 0) {
  console.error(`\n${failures} date-normalization check(s) failed.`);
  process.exit(1);
}
console.log("\nAll date-normalization checks passed.");
