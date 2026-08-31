/**
 * Trip Requirement Projection + Party-Composition Inference (2026-09-10 —
 * see docs/implementation-decisions.md). Covers the two things the live bug
 * report found: (1) real evaluator-enforced hard constraints (capacity, pet
 * count/eligibility) that never appeared in the Trip Requirements panel
 * because they live in structured fields, not `hardRequirements` text; (2)
 * the new deterministic inference that explicit child composition (not
 * generic headcount) implies a soft "Family-friendly" preference.
 */
import { EMPTY_TRIP_INTENT, type TripIntent } from "../src/lib/schemas";
import { evaluateCampsites, UNMET_PREFERENCE_PREFIX, UNSATISFIED_PREFIX } from "../src/lib/evaluate";
import {
  getDerivedRequirements,
  petPanelLabel,
  removeRequirement,
} from "../src/lib/requirements";
import { applyFamilyPreferenceInference, FAMILY_FRIENDLY_LABEL } from "../src/lib/family-inference";
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

const BASE: TripIntent = { ...EMPTY_TRIP_INTENT };

// --- Item 15: "4 adults + 2 kids derives guestCount 6" is an
// extraction-side (model) behavior — not something this pure-function suite
// can exercise; it's covered by live verification instead (see
// docs/implementation-decisions.md). This file covers everything
// downstream of that extraction: projection, inference, and enforcement.

run("Capacity for N appears in the Trip Requirements projection, derived from guestCount", () => {
  const intent: TripIntent = { ...BASE, guestCount: 6 };
  const derived = getDerivedRequirements(intent);
  assert(
    derived.some((d) => d.label === "Capacity for 6" && d.tier === "hard"),
    `expected a derived "Capacity for 6" hard requirement — got ${JSON.stringify(derived)}`,
  );
});

run("No capacity chip is derived when guestCount is null", () => {
  const derived = getDerivedRequirements(BASE);
  assert(
    !derived.some((d) => d.label.startsWith("Capacity for")),
    "an unstated guestCount must not fabricate a capacity requirement",
  );
});

run("Pet requirement/count appears in the Trip Requirements projection", () => {
  const intent: TripIntent = { ...BASE, travelingWithPets: true, petCount: 2 };
  const derived = getDerivedRequirements(intent);
  assert(
    derived.some((d) => d.label === "Pet-friendly for 2 pets" && d.tier === "hard"),
    `expected a derived 2-pet requirement — got ${JSON.stringify(derived)}`,
  );
});

run("A known pet count is preserved as meaningful structured input, not collapsed into a generic boolean label", () => {
  assert(petPanelLabel(2) === "Pet-friendly for 2 pets", `petPanelLabel(2) — got "${petPanelLabel(2)}"`);
  assert(petPanelLabel(1) === "Pet-friendly for 1 pet", `petPanelLabel(1) — got "${petPanelLabel(1)}"`);
  assert(petPanelLabel(null) === "Pet-friendly", `petPanelLabel(null) should stay generic — got "${petPanelLabel(null)}"`);
});

run("Pet count is deterministically checked against campsite maxPets (already-enforced path, locked down here)", () => {
  const maxPets1Site = CAMPSITES.find((c) => c.petPolicy.allowed && c.petPolicy.maxPets === 1);
  assert(!!maxPets1Site, "fixture assumption: dataset has at least one allowed pet-friendly site with maxPets 1");
  const twoDogTrip: TripIntent = { ...BASE, travelingWithPets: true, petCount: 2 };
  const result = evaluateCampsites(twoDogTrip);
  assert(
    !result.candidates.some((c) => c.campsite.id === maxPets1Site!.id),
    "a site allowing pets but capped at 1 must not satisfy a 2-pet trip — allowed:true is not the same claim as sufficient maxPets",
  );
});

run("Explicit child composition infers Family-friendly as a soft preference", () => {
  const prior = BASE;
  const fresh: TripIntent = { ...BASE, guestCount: 6, travelingWithChildren: true, childCount: 2 };
  const result = applyFamilyPreferenceInference(prior, fresh);
  assert(
    result.preferences.includes(FAMILY_FRIENDLY_LABEL),
    `expected Family-friendly inferred into preferences — got ${JSON.stringify(result.preferences)}`,
  );
  assert(
    !result.hardRequirements.includes(FAMILY_FRIENDLY_LABEL) && !result.priorities.includes(FAMILY_FRIENDLY_LABEL),
    "the inference must default to the soft preference tier, never hard or priority",
  );
});

run("Generic '6 people' (no explicit children) does not infer Family-friendly", () => {
  const fresh: TripIntent = { ...BASE, guestCount: 6, travelingWithChildren: false, childCount: null };
  const result = applyFamilyPreferenceInference(BASE, fresh);
  assert(
    !result.preferences.includes(FAMILY_FRIENDLY_LABEL),
    "generic headcount alone must never imply family-friendliness",
  );
});

run("'6 adults' does not infer Family-friendly", () => {
  const fresh: TripIntent = { ...BASE, guestCount: 6, travelingWithChildren: false, childCount: null };
  const result = applyFamilyPreferenceInference(BASE, fresh);
  assert(!result.preferences.includes(FAMILY_FRIENDLY_LABEL), "explicit 'adults' must not infer children");
});

run("The inference only fires on the false -> true transition, not on every turn travelingWithChildren is already true", () => {
  const alreadyEstablished: TripIntent = {
    ...BASE,
    travelingWithChildren: true,
    childCount: 2,
    // Simulates the user having removed the inferred preference on an
    // earlier turn — it must not be silently re-added on an unrelated
    // later turn just because the boolean is still true.
    preferences: [],
  };
  const result = applyFamilyPreferenceInference(alreadyEstablished, {
    ...alreadyEstablished,
    flexibleConstraints: ["near water"], // an unrelated refinement this turn
  });
  assert(
    !result.preferences.includes(FAMILY_FRIENDLY_LABEL),
    "an already-established travelingWithChildren must not force the preference back in on a later, unrelated turn — this would be a tug-of-war against an explicit chip removal",
  );
});

run("Stronger explicit language already classified into a stronger tier is never duplicated or downgraded", () => {
  const fresh: TripIntent = {
    ...BASE,
    travelingWithChildren: true,
    childCount: 1,
    priorities: ["Kid-friendly is a must"],
  };
  const result = applyFamilyPreferenceInference(BASE, fresh);
  assert(
    !result.preferences.includes(FAMILY_FRIENDLY_LABEL),
    "when the model already placed a family-related label in a stronger tier, the inference must not also add a generic soft duplicate",
  );
  assert(
    result.priorities.includes("Kid-friendly is a must"),
    "the stronger, model-classified label itself must be left untouched",
  );
});

run("Family-friendly appears under Preferred and participates in ranking via the existing preference pipeline", () => {
  const familySite = CAMPSITES.find((c) => c.familyFeatures.length > 0);
  assert(!!familySite, "fixture assumption: dataset has at least one site with family features");
  const intent: TripIntent = { ...BASE, preferences: [FAMILY_FRIENDLY_LABEL] };
  const result = evaluateCampsites(intent);
  const candidateForFamilySite = result.candidates.find((c) => c.campsite.id === familySite!.id);
  assert(!!candidateForFamilySite, "the family-featured site is a candidate");
  assert(
    candidateForFamilySite!.preserved.includes(FAMILY_FRIENDLY_LABEL),
    `a site with real family features should show Family-friendly as preserved — got ${JSON.stringify(candidateForFamilySite!.preserved)}`,
  );
});

run("Family-friendly soft failure appears as a compromise ('Didn't fully match'), never as a hard No Match cause", () => {
  const noFamilySite = CAMPSITES.find((c) => c.familyFeatures.length === 0);
  assert(!!noFamilySite, "fixture assumption: dataset has at least one site with no family features");
  const intent: TripIntent = { ...BASE, preferences: [FAMILY_FRIENDLY_LABEL] };
  const result = evaluateCampsites(intent);
  // A soft preference never eliminates a candidate from the pool or forces
  // "no_match" — it can only ever show up as a compromise note.
  assert(result.kind !== "no_match", "Family-friendly alone must never cause a no_match result");
  const candidateForNoFamilySite = result.candidates.find((c) => c.campsite.id === noFamilySite!.id);
  if (candidateForNoFamilySite) {
    assert(
      candidateForNoFamilySite.compromises.some((m) => m === `${UNMET_PREFERENCE_PREFIX}${FAMILY_FRIENDLY_LABEL}`),
      `an unsatisfied soft Family-friendly preference should show as "${UNMET_PREFERENCE_PREFIX}${FAMILY_FRIENDLY_LABEL}" — got ${JSON.stringify(candidateForNoFamilySite.compromises)}`,
    );
    assert(
      !candidateForNoFamilySite.compromises.some((m) => m === `${UNSATISFIED_PREFIX}${FAMILY_FRIENDLY_LABEL}`),
      "a soft preference miss must never be phrased with the HARD-failure prefix, which no-match.ts's failing-label extraction treats as a confirmed hard failure",
    );
  }
});

run("Evaluator / Trip Requirements projection stay aligned: every derived hard check the evaluator computes is also projected", () => {
  const intent: TripIntent = { ...BASE, guestCount: 6, travelingWithPets: true, petCount: 2 };
  const result = evaluateCampsites(intent);
  const evaluatorKnowsCapacity = result.candidates.some((c) =>
    c.checks.some((chk) => chk.label === "Capacity for 6"),
  );
  const evaluatorKnowsPets = result.candidates.some((c) => c.checks.some((chk) => chk.label === "Pet-friendly"));
  assert(evaluatorKnowsCapacity, "fixture assumption: the evaluator does compute a capacity check for this intent");
  assert(evaluatorKnowsPets, "fixture assumption: the evaluator does compute a pet check for this intent");

  const projected = getDerivedRequirements(intent);
  assert(
    projected.some((d) => d.label === "Capacity for 6"),
    "the evaluator knows Capacity for 6 — the Trip Requirements projection must not omit it",
  );
  assert(
    projected.some((d) => d.label.includes("2 pet")),
    "the evaluator knows a 2-pet requirement — the Trip Requirements projection must not omit it",
  );
});

run("Removing the inferred Family-friendly preference does not remove children from party composition", () => {
  const intent: TripIntent = {
    ...BASE,
    travelingWithChildren: true,
    childCount: 2,
    preferences: [FAMILY_FRIENDLY_LABEL],
  };
  const { intent: afterRemoval, changed } = removeRequirement(intent, "preferences", FAMILY_FRIENDLY_LABEL);
  assert(changed, "the preference was present and should be removed");
  assert(!afterRemoval.preferences.includes(FAMILY_FRIENDLY_LABEL), "Family-friendly is gone from preferences");
  assert(
    afterRemoval.travelingWithChildren === true && afterRemoval.childCount === 2,
    "party composition (travelingWithChildren/childCount) must be completely untouched by removing the derived preference",
  );
});

run("Derived hard requirements (capacity, pet count) cannot be hidden while their underlying structured state remains active", () => {
  // There is no removal path for these at all (see getDerivedRequirements'
  // doc comment) — this locks that down: nothing in this module can drop a
  // derived entry while guestCount/travelingWithPets are still set.
  const intent: TripIntent = { ...BASE, guestCount: 6, travelingWithPets: true, petCount: 2 };
  const derivedBefore = getDerivedRequirements(intent);
  // Simulate every OTHER kind of requirement removal happening around it —
  // none of them can affect guestCount/travelingWithPets, which live
  // outside the four literal tier arrays entirely.
  const { intent: afterUnrelatedRemoval } = removeRequirement(
    { ...intent, hardRequirements: ["Something else"] },
    "hardRequirements",
    "Something else",
  );
  const derivedAfter = getDerivedRequirements(afterUnrelatedRemoval);
  assert(
    JSON.stringify(derivedBefore) === JSON.stringify(derivedAfter),
    "derived hard requirements must remain exactly as long as guestCount/travelingWithPets are set, regardless of unrelated chip removals",
  );
});

if (failures > 0) {
  console.error(`\n${failures} party-composition check(s) failed.`);
  process.exit(1);
}
console.log("\nAll party-composition checks passed.");
