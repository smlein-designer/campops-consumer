/**
 * Verifies No Match behavior and its deterministic helpers
 * (src/lib/no-match.ts) — distinct from Clarification: CampOps has
 * successfully evaluated the request here, and no candidate qualifies.
 * Re-asserts the constraint-integrity rules this slice must preserve, plus
 * the new Widen Search behavior.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { summarizeNoMatch, widenSearch } from "../src/lib/no-match";
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

// 1. Confirmed-failed hard requirements exclude candidates from recommendation.
run(
  "Confirmed-failed hard requirement excludes candidates (preserved from constraint-integrity slice)",
  () => {
    const result = evaluateCampsites({
      ...EMPTY_TRIP_INTENT,
      guestCount: 20,
      hardRequirements: ["Capacity for 20"],
    });
    assert(
      result.kind === "no_match",
      `every site fails capacity 20 — expected no_match, got ${result.kind}`,
    );
    assert(
      result.candidates.every((c) => c.matchType === "no_match"),
      "no candidate in a no_match result is classified as full or compromise",
    );
  },
);

// 2. Unverifiable hard requirements can never yield a full match.
run("Unverifiable hard requirement can never yield a full match", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["Pet-friendly", "Has a hammock stand"],
  });
  assert(
    result.kind !== "full",
    `an unrecognized hard requirement must never resolve to full — got ${result.kind}`,
  );
});

// 3. Losing candidates must not be visually presented as recommendations —
// verified structurally: no_match candidates carry zero "preserved" hard
// requirements (nothing to claim as satisfied) and always carry a
// "Doesn't satisfy" compromise, distinguishing them from a real pick.
run("No-match candidates never carry a full-match-style preserved list", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    guestCount: 20,
    hardRequirements: ["Capacity for 20"],
  });
  for (const c of result.candidates) {
    assert(
      c.preserved.length === 0,
      `no_match candidate ${c.campsite.id} should have no preserved hard requirements`,
    );
    assert(
      c.compromises.some((m) => m.startsWith("Doesn't satisfy:")),
      `no_match candidate ${c.campsite.id} should carry a "Doesn't satisfy" reason`,
    );
  }
});

// 4. summarizeNoMatch produces a truthful summary from actual failing labels only.
run("summarizeNoMatch reflects only confirmed-failing labels", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    guestCount: 20,
    hardRequirements: ["Capacity for 20"],
  });
  const summary = summarizeNoMatch(result);
  assert(
    summary.includes("Capacity for 20"),
    `summary should mention the actual failing requirement — got: "${summary}"`,
  );
});

// 5. Widen Search modifies only the intended constraint(s).
run("Widen Search modifies only the intended constraint", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 6,
    hardRequirements: ["Pet-friendly"],
  };
  const result = evaluateCampsites(intent);
  assert(
    result.kind === "no_match",
    `setup should be no_match — got ${result.kind}`,
  );

  const { intent: widenedIntent, widened } = widenSearch(intent, result);
  assert(
    widened === "Pet-friendly",
    `should widen "Pet-friendly" — got "${widened}"`,
  );
  assert(
    widenedIntent.hardRequirements.length === 0,
    "the widened requirement is removed from hardRequirements, and only that one",
  );
  assert(
    widenedIntent.flexibleConstraints.length === 1 &&
      widenedIntent.flexibleConstraints[0] === "Pet-friendly",
    "the widened requirement moves to flexibleConstraints, and only that one",
  );
  assert(
    widenedIntent.guestCount === intent.guestCount,
    "guestCount is untouched by widening",
  );
  assert(
    widenedIntent.preferences.length === 0 &&
      widenedIntent.priorities.length === 0,
    "unrelated fields untouched",
  );
});

// 6. No Match refinement can recover to a recommendation.
run(
  "No Match refinement (Widen Search) can recover to a full-match recommendation",
  () => {
    const intent: TripIntent = {
      ...EMPTY_TRIP_INTENT,
      guestCount: 6,
      hardRequirements: ["Pet-friendly"],
    };
    const initial = evaluateCampsites(intent);
    assert(
      initial.kind === "no_match",
      `setup should be no_match — got ${initial.kind}`,
    );

    const { intent: widenedIntent } = widenSearch(intent, initial);
    const recovered = evaluateCampsites(widenedIntent);
    assert(
      recovered.kind === "full",
      `widening should recover a full match — got ${recovered.kind}`,
    );
    assert(
      recovered.candidates[0]?.campsite.id === "blue-ridge-22",
      "the 6-capacity site is the recovered match",
    );
  },
);

// 7. Widen Search is a safe no-op when nothing is widenable (only a
// structured-field check, not literal hardRequirements text, is failing).
run("Widen Search no-ops when nothing is widenable", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 20 }; // fails only the synthetic capacity check
  const result = evaluateCampsites(intent);
  assert(
    result.kind === "no_match",
    `setup should be no_match — got ${result.kind}`,
  );

  const { intent: widenedIntent, widened } = widenSearch(intent, result);
  assert(widened === null, "nothing widenable should report widened: null");
  assert(
    JSON.stringify(widenedIntent) === JSON.stringify(intent),
    "intent is returned unchanged when nothing is widenable",
  );
});

if (failures > 0) {
  console.error(`\n${failures} No Match check(s) failed.`);
  process.exit(1);
}
console.log("\nAll No Match checks passed.");
