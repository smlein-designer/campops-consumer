/**
 * Regression coverage for the expanded ~10-record campsite dataset
 * (src/lib/campsites.ts) — proves the larger, deliberately-authored dataset
 * still supports every deterministic scenario the evaluator promises, and
 * that expanding it didn't quietly change the evaluator's own rules. See
 * docs/implementation-decisions.md for the reasoning behind each record.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
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

function ids(intent: TripIntent) {
  return evaluateCampsites(intent).candidates.map((c) => c.campsite.id);
}

// 1. Known full-match scenario still ranks the intended candidate first.
run("Known full-match scenario ranks the intended candidate first", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const result = evaluateCampsites(intent);
  assert(result.kind === "full", `expected full — got ${result.kind}`);
  assert(
    result.candidates[0]?.campsite.id === "government-canyon-5",
    `expected government-canyon-5 to rank first (cheapest of the qualifying sites, in the expanded Texas dataset) — got ${result.candidates[0]?.campsite.id}`,
  );
});

// 2. Structured capacity hard failure excludes undersized campsites.
run("Structured capacity check excludes every undersized campsite", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4 };
  const result = evaluateCampsites(intent);
  const tooSmall = ["cedar-hollow-3", "enchanted-rock-2"]; // capacity 2 (Dataset Depth rebalancing, 2026-09-04)
  for (const id of tooSmall) {
    assert(
      !result.candidates.some((c) => c.campsite.id === id),
      `${id} (capacity < 4) must not appear for guestCount 4`,
    );
  }
});

// 3. Pet-policy hard failure is enforced across the expanded set.
run("Pet-policy hard requirement excludes every non-pet-friendly site", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["Pet-friendly"],
  };
  const result = evaluateCampsites(intent);
  const notPetFriendly = ["blue-ridge-22", "pine-ridge-9", "eagle-point-5"];
  for (const id of notPetFriendly) {
    assert(
      !result.candidates.some((c) => c.campsite.id === id),
      `${id} (not pet-friendly) must not appear as a candidate`,
    );
  }
});

// 4. A statically-closed record (available: false) never appears, under
//    any intent — including one that matches its attributes closely.
run(
  "Statically unavailable campsite (north-ridge-1) never appears, even for a matching intent",
  () => {
    const closeMatch: TripIntent = {
      ...EMPTY_TRIP_INTENT,
      guestCount: 4,
      hardRequirements: ["Cabin", "Seclusion"],
    };
    const result = evaluateCampsites(closeMatch);
    assert(
      !result.candidates.some((c) => c.campsite.id === "north-ridge-1"),
      "north-ridge-1 (available: false) must be excluded before scoring, regardless of intent",
    );
    // Sanity: this isn't excluding everything — confirm the pool isn't empty.
    assert(
      result.candidates.length > 0,
      "setup sanity check: some candidate should still be returned",
    );
  },
);

// 5. Changing a requirement materially changes the candidate set where the
//    dataset demonstrates that (adding "Near water" removes timber-hollow-2,
//    which is otherwise a full match on Pet-friendly + Capacity for 4).
run("Adding a hard requirement changes which candidates qualify", () => {
  const before: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const after: TripIntent = {
    ...before,
    hardRequirements: ["Pet-friendly", "Near water"],
  };
  const beforeIds = ids(before);
  const afterIds = ids(after);
  assert(
    beforeIds.includes("timber-hollow-2"),
    "setup: timber-hollow-2 should qualify before adding Near water",
  );
  assert(
    !afterIds.includes("timber-hollow-2"),
    "timber-hollow-2 (nearWater: false) should drop out once Near water becomes a hard requirement",
  );
});

// 6. Changing a relative priority changes ranking where the dataset
//    demonstrates that (only silver-creek-7 has Wifi among the qualifying
//    pet-friendly, capacity-4 sites).
run("Adding a relative priority changes the top-ranked candidate", () => {
  const before: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const after: TripIntent = {
    ...before,
    priorities: ["Willing to pay more for Wifi"],
  };
  const beforeTop = evaluateCampsites(before).candidates[0]?.campsite.id;
  const afterTop = evaluateCampsites(after).candidates[0]?.campsite.id;
  assert(
    beforeTop !== "silver-creek-7",
    `setup: silver-creek-7 shouldn't lead without the Wifi priority — got ${beforeTop}`,
  );
  assert(
    afterTop === "silver-creek-7",
    `silver-creek-7 (the only qualifying site with Wifi) should take the lead once Wifi is a stated priority — got ${afterTop}`,
  );
});

// 7. Repeated evaluation of the same intent/data is deterministic.
run("Repeated evaluation of the same intent produces the same ranking", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const first = ids(intent);
  const second = ids(intent);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "identical inputs must produce a byte-identical ranking",
  );
});

// 8. True no-match remains possible against the expanded dataset.
run("A genuinely unsatisfiable combination still yields no_match", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    // Structurally impossible regardless of dataset size: a record's
    // siteType is a single string, so no site can ever be both an RV site
    // and a Cabin — robust against the dataset growing further, unlike a
    // combination of independent boolean attributes some new record could
    // happen to satisfy all at once.
    hardRequirements: ["RV site", "Cabin"],
  };
  const result = evaluateCampsites(intent);
  assert(
    result.kind === "no_match",
    `expected no_match for an unsatisfiable combination — got ${result.kind}`,
  );
});

if (failures > 0) {
  console.error(`\n${failures} dataset check(s) failed.`);
  process.exit(1);
}
console.log("\nAll dataset checks passed.");
