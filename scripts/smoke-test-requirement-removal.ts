/**
 * Verifies direct-manipulation Requirement Chip removal (Handoff Spec 2.4's
 * removable-chip affordance): src/lib/requirements.ts's pure removal logic,
 * and src/lib/events.ts's requirement_removed event deriver. Distinct from
 * chat-driven refinement (requirement_refined) — see
 * docs/implementation-decisions.md for the actor/event-type reasoning.
 *
 * Also covers the 2026-09-01 design-resolution update: removal must be
 * consistently available wherever editable requirement chips are shown,
 * including the Candidate Card's preserved/compromise rows during a
 * recommendation/compromise state — gated by `isRemovableHardRequirement` so
 * synthetic checks (e.g. "Capacity for 4", derived from `guestCount`, not
 * from `hardRequirements` text) correctly stay non-removable this way.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { deriveRequirementRemovedEvent } from "../src/lib/events";
import {
  isRemovableHardRequirement,
  rawRequirementLabel,
  removeRequirement,
} from "../src/lib/requirements";
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

const BASE: TripIntent = {
  ...EMPTY_TRIP_INTENT,
  goalStatement: "A 4-person pet-friendly camping trip near water.",
  guestCount: 4,
  hardRequirements: ["Pet-friendly", "Near water"],
  flexibleConstraints: ["Under $150/night"],
  preferences: ["Wifi"],
  priorities: ["Willing to drive farther for more seclusion"],
};

// 1. Removing one chip changes only the intended tier/value — every other
//    field, including the other three requirement tiers, is untouched.
run("Removing one requirement touches only its own tier/value", () => {
  const { intent, changed } = removeRequirement(
    BASE,
    "hardRequirements",
    "Near water",
  );
  assert(changed, "removal of a present value should report changed: true");
  assert(
    JSON.stringify(intent.hardRequirements) === JSON.stringify(["Pet-friendly"]),
    "hardRequirements should retain only the untouched entry",
  );
  assert(
    JSON.stringify(intent.flexibleConstraints) ===
      JSON.stringify(BASE.flexibleConstraints),
    "flexibleConstraints must be byte-identical to the original",
  );
  assert(
    JSON.stringify(intent.preferences) === JSON.stringify(BASE.preferences),
    "preferences must be byte-identical to the original",
  );
  assert(
    JSON.stringify(intent.priorities) === JSON.stringify(BASE.priorities),
    "priorities must be byte-identical to the original",
  );
  assert(
    intent.guestCount === BASE.guestCount &&
      intent.goalStatement === BASE.goalStatement,
    "unrelated scalar fields (guestCount, goalStatement) must be untouched",
  );
});

// 2. Removing a value that isn't present is a no-op, not a silent mutation.
run("Removing an absent value is a no-op", () => {
  const { intent, changed } = removeRequirement(
    BASE,
    "hardRequirements",
    "Something never stated",
  );
  assert(!changed, "removal of an absent value should report changed: false");
  assert(
    JSON.stringify(intent) === JSON.stringify(BASE),
    "a no-op removal must return the intent unchanged",
  );
});

// 3. requirement_removed event language names the real removed value and tier.
run("requirement_removed event names the real change", () => {
  const event = deriveRequirementRemovedEvent("hard", "Near water");
  assert(event.type === "requirement_removed", "event type is requirement_removed");
  assert(event.actor === "user", "actor is 'user' — this is a direct action, not agent interpretation");
  assert(
    event.description.includes("Near water") &&
      event.description.includes("hard requirement"),
    `description should factually name the removed value and its tier — got "${event.description}"`,
  );
});

// 4. requirement_removed is distinct from requirement_refined (chat-driven
//    path) as an event type, even though both mutate TripIntent.
run("requirement_removed is a distinct event type from requirement_refined", () => {
  const event = deriveRequirementRemovedEvent("preference", "Wifi");
  assert(
    (event.type as string) !== "requirement_refined",
    "direct removal must never be logged under the chat-refinement event type",
  );
});

// 5. rawRequirementLabel strips known compromise-description prefixes and
//    leaves already-raw (preserved-style) labels untouched.
run("rawRequirementLabel recovers the underlying label", () => {
  assert(
    rawRequirementLabel("Doesn't satisfy: Pet-friendly") === "Pet-friendly",
    "strips the 'Doesn't satisfy:' prefix",
  );
  assert(
    rawRequirementLabel("Couldn't verify: Wifi") === "Wifi",
    "strips the 'Couldn't verify:' prefix",
  );
  assert(
    rawRequirementLabel("Pet-friendly") === "Pet-friendly",
    "an already-raw (preserved-style) label is returned unchanged",
  );
});

// 6. isRemovableHardRequirement gates on literal hardRequirements membership
//    — a synthetic, structurally-derived check (capacity) is never removable
//    this way, since there is nothing in hardRequirements text to remove.
run("isRemovableHardRequirement distinguishes real entries from synthetic checks", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  assert(
    isRemovableHardRequirement(intent, "Pet-friendly"),
    "a literal hardRequirements entry (preserved-style, unprefixed) is removable",
  );
  assert(
    isRemovableHardRequirement(intent, "Doesn't satisfy: Pet-friendly"),
    "the same entry is still recognized through its compromise-prefixed form",
  );
  assert(
    !isRemovableHardRequirement(intent, "Capacity for 4"),
    "a synthetic capacity check is NOT removable — it isn't literal hardRequirements text",
  );
  assert(
    !isRemovableHardRequirement(intent, "Never stated"),
    "a label with no matching hardRequirements entry is not removable",
  );
});

// 7. End-to-end against a real evaluation: exactly the expected Candidate
//    Card chips are flagged removable, both in a full-match's "preserved"
//    row and a compromise's mixed preserved/compromise rows.
run("Real evaluation output: only literal hardRequirements chips are removable", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Wifi"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  assert(!!top, "setup: an evaluation result should exist");
  if (top) {
    const removable = [...top.preserved, ...top.compromises].filter((l) =>
      isRemovableHardRequirement(intent, l),
    );
    const nonRemovable = [...top.preserved, ...top.compromises].filter(
      (l) => !isRemovableHardRequirement(intent, l),
    );
    assert(
      removable.some((l) => rawRequirementLabel(l) === "Pet-friendly"),
      "Pet-friendly (a literal hardRequirements entry) should be flagged removable",
    );
    // "Capacity for 4" is always present (guestCount: 4) and never removable.
    assert(
      nonRemovable.some((l) => l === "Capacity for 4"),
      "Capacity for 4 (synthetic, guestCount-derived) should never be flagged removable",
    );
  }
});

if (failures > 0) {
  console.error(`\n${failures} requirement-removal check(s) failed.`);
  process.exit(1);
}
console.log("\nAll requirement-removal checks passed.");
