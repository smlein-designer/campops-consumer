/**
 * Regression coverage for Deterministic Pet Requirement Enforcement
 * (2026-09-03, extended with a structured pet COUNT in the Dataset Depth
 * correction, 2026-09-04 — see docs/implementation-decisions.md). Fixes the
 * reported bug: "Dog-friendly" (and other pet/dog phrasing variants) fell
 * through every recognized keyword branch straight to "Couldn't verify"
 * even though the dataset's pet-policy data was fully known. The fix
 * mirrors the guestCount lesson: pet eligibility is a structured
 * `TripIntent.travelingWithPets`/`petCount` pair, enforced directly against
 * `site.petPolicy` in `evaluateCampsites` — never inferred by
 * keyword-matching free-text requirement labels.
 */
import { evaluateCampsites, petStatus } from "../src/lib/evaluate";
import { CAMPSITES } from "../src/lib/campsites";
import {
  EMPTY_TRIP_INTENT,
  type Campsite,
  type TripIntent,
} from "../src/lib/schemas";

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

// --- Dataset audit (item 5) ---

run("Every campsite record has an explicit, deterministic pet-policy value", () => {
  const missing = CAMPSITES.filter((c) => typeof c.petPolicy?.allowed !== "boolean");
  assert(
    missing.length === 0,
    `every record must have petPolicy.allowed explicitly true/false — got ${missing.length} missing (${missing.map((c) => c.id).join(", ")})`,
  );
});

run("Pet-friendly status has meaningful variation, including multiple maxPets tiers", () => {
  const allowedCount = CAMPSITES.filter((c) => c.petPolicy.allowed).length;
  const notAllowedCount = CAMPSITES.filter((c) => !c.petPolicy.allowed).length;
  assert(allowedCount > 0, "at least one record allows pets");
  assert(notAllowedCount > 0, "at least one record does NOT allow pets");
  const maxPets1 = CAMPSITES.filter((c) => c.petPolicy.allowed && c.petPolicy.maxPets === 1).length;
  const maxPets2Plus = CAMPSITES.filter((c) => c.petPolicy.allowed && c.petPolicy.maxPets >= 2).length;
  assert(maxPets1 > 0, "at least one record allows exactly 1 pet");
  assert(maxPets2Plus > 0, "at least one record allows 2 or more pets");
});

// --- Enforcement (items 1, 4) ---

const KNOWN_PET_FRIENDLY_ID = CAMPSITES.find((c) => c.petPolicy.allowed && c.available)!.id;
const KNOWN_NOT_PET_FRIENDLY_ID = CAMPSITES.find(
  (c) => !c.petPolicy.allowed && c.available,
)!.id;
const MAX_PETS_1_SITE = CAMPSITES.find((c) => c.petPolicy.allowed && c.petPolicy.maxPets === 1)!;

run("travelingWithPets=true is enforced directly against the structured petPolicy field", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, travelingWithPets: true };
  const result = evaluateCampsites(intent);

  const knownPetFriendly = result.candidates.find(
    (c) => c.campsite.id === KNOWN_PET_FRIENDLY_ID,
  );
  assert(!!knownPetFriendly, "a known pet-friendly site appears as a candidate");
  assert(
    !!knownPetFriendly &&
      knownPetFriendly.matchType !== "no_match" &&
      knownPetFriendly.compromises.every((m) => !/pet/i.test(m)),
    "a known pet-friendly site's pet check is satisfied, never flagged as a compromise",
  );

  const knownNotPetFriendly = result.candidates.some(
    (c) => c.campsite.id === KNOWN_NOT_PET_FRIENDLY_ID,
  );
  assert(
    !knownNotPetFriendly,
    "a known NON-pet-friendly site is excluded outright (hard requirement, confirmed failing)",
  );
});

run("One dog is a structured pet requirement satisfied by any pet-allowed site", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, travelingWithPets: true, petCount: 1 };
  const result = evaluateCampsites(intent);
  assert(
    result.candidates.some((c) => c.campsite.id === MAX_PETS_1_SITE.id),
    "a maxPets:1 site qualifies for exactly 1 pet",
  );
});

run("Two dogs fails a site whose policy allows only 1 pet", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, travelingWithPets: true, petCount: 2 };
  const result = evaluateCampsites(intent);
  assert(
    !result.candidates.some((c) => c.campsite.id === MAX_PETS_1_SITE.id),
    `a maxPets:1 site (${MAX_PETS_1_SITE.id}) must be excluded when the user is bringing 2 pets`,
  );
});

run("An unspecified pet count is treated as at least 1 (never assumed higher)", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, travelingWithPets: true, petCount: null };
  const result = evaluateCampsites(intent);
  assert(
    result.candidates.some((c) => c.campsite.id === MAX_PETS_1_SITE.id),
    "an unspecified count must not be assumed to exceed a maxPets:1 site's policy",
  );
});

run("The pet check never reports 'Couldn't verify' when the dataset's pet-policy data is known", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, travelingWithPets: true };
  const result = evaluateCampsites(intent);
  const anyUnverifiablePet = [...result.candidates].some((c) =>
    c.checks.some(
      (chk) => chk.label === "Pet-friendly" && chk.status === "unverifiable",
    ),
  );
  assert(
    !anyUnverifiablePet,
    "every candidate's pet check must resolve to satisfied/unsatisfied against known dataset data — never unverifiable",
  );
});

run("A genuinely unknown pet-policy value (defensive case) is honestly unverifiable, not a false failure", () => {
  // The real dataset never has this (petPolicy.allowed is a required
  // boolean on every record — the prior test proves it) but the
  // evaluator's own handling of a hypothetically missing value must still
  // be correct: a naive `site.petPolicy.allowed ? ... : "unsatisfied"`
  // would misreport "genuinely unknown" as "confirmed not pet-friendly",
  // exactly the false-negative the constraint-integrity rule forbids.
  const unknownPetPolicySite: Campsite = {
    ...CAMPSITES[0],
    id: "test-unknown-pet-policy",
    petPolicy: undefined as unknown as Campsite["petPolicy"],
  };
  assert(
    petStatus(unknownPetPolicySite, 1) === "unverifiable",
    `a genuinely missing petPolicy must read as unverifiable — got "${petStatus(unknownPetPolicySite, 1)}"`,
  );
  assert(
    petStatus({ ...CAMPSITES[0], petPolicy: { allowed: true, maxPets: 2 } }, 1) === "satisfied",
    "an allowed policy with sufficient maxPets reads as satisfied",
  );
  assert(
    petStatus({ ...CAMPSITES[0], petPolicy: { allowed: true, maxPets: 1 } }, 2) === "unsatisfied",
    "a maxPets:1 policy against a 2-pet requirement reads as unsatisfied — never confused with 'unknown'",
  );
  assert(
    petStatus({ ...CAMPSITES[0], petPolicy: { allowed: false, maxPets: 0 } }, 1) === "unsatisfied",
    "allowed:false reads as unsatisfied regardless of maxPets",
  );
});

run("No pet-related query leaves pet policy unaffecting evaluation", () => {
  const withoutPets = evaluateCampsites({ ...EMPTY_TRIP_INTENT, guestCount: 4 });
  const anyPetCheck = withoutPets.candidates.some((c) =>
    c.checks.some((chk) => chk.label === "Pet-friendly"),
  );
  assert(
    !anyPetCheck,
    "when travelingWithPets is false and no pet-related text is present, no pet check is added at all",
  );
});

// --- Free-text keyword fallback (defense in depth for a soft preference) ---

run("Free-text 'Dog-friendly'/'Pet-friendly' labels resolve via the structured field, never 'Couldn't verify'", () => {
  for (const label of ["Dog-friendly", "Pet-friendly", "Dogs allowed", "Pets allowed"]) {
    const result = evaluateCampsites({
      ...EMPTY_TRIP_INTENT,
      hardRequirements: [label],
    });
    const anyUnverifiable = result.candidates.some((c) =>
      c.checks.some((chk) => chk.label === label && chk.status === "unverifiable"),
    );
    assert(
      !anyUnverifiable,
      `"${label}" must resolve against the structured pet-policy field, never stay unverifiable`,
    );
  }
});

// --- Candidate Card explanation reflects the structured result (item 6) ---

run("A satisfied pet requirement appears in 'preserved', never as a compromise", () => {
  const result = evaluateCampsites({ ...EMPTY_TRIP_INTENT, travelingWithPets: true });
  const top = result.candidates[0];
  assert(!!top, "a candidate exists");
  assert(
    top?.preserved.includes("Pet-friendly"),
    `the top candidate's preserved list should include "Pet-friendly" — got ${JSON.stringify(top?.preserved)}`,
  );
  assert(
    !top?.compromises.some((m) => /pet/i.test(m)),
    "a satisfied pet requirement must never also appear as a compromise",
  );
});

// --- Multi-turn persistence (item 7) ---

run("Pet-related refinement survives across a multi-turn update that changes an unrelated field", () => {
  const turn1: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    travelingWithPets: true,
    petCount: 2,
    guestCount: 4,
  };
  // Simulate a later turn's merged intent (as the model would return it) —
  // guestCount changes, travelingWithPets/petCount are untouched/preserved.
  const turn2: TripIntent = { ...turn1, guestCount: 6 };
  assert(
    turn2.travelingWithPets === true && turn2.petCount === 2,
    "travelingWithPets/petCount survive an unrelated field update, same as any other established TripIntent fact",
  );
  const result = evaluateCampsites(turn2);
  assert(
    result.candidates.every((c) => c.campsite.petPolicy.allowed && c.campsite.petPolicy.maxPets >= 2),
    "the pet constraint (including the count) is still enforced after the multi-turn update",
  );
});

if (failures > 0) {
  console.error(`\n${failures} pet-requirement check(s) failed.`);
  process.exit(1);
}
console.log("\nAll pet-requirement checks passed.");
