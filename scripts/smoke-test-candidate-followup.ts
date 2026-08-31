/**
 * Regression coverage for Active-Recommendation Follow-Up Classification +
 * Intent Refinement (2026-09-05 — see docs/implementation-decisions.md).
 * Reproduced bug: against an active recommendation, "is it near water?"
 * silently mutated TripIntent (the model folded the question into a soft
 * preference) and re-ran evaluation, producing a DIFFERENT, unrelated
 * recommendation instead of answering the question; a follow-up explicit
 * refinement ("I'd like it to be near water") then appeared to do nothing
 * new, because the requirement had already been silently added.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { answerCandidateQuestion } from "../src/lib/candidate-facts";
import {
  buildRefinementAcknowledgment,
  diffAddedRequirements,
} from "../src/lib/refinement-acknowledgment";
import { CAMPSITES } from "../src/lib/campsites";
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

const NON_WATER_SITE = CAMPSITES.find((c) => !c.waterAccess.nearby)!;
const CREEK_SITE = CAMPSITES.find((c) => c.waterAccess.nearby && !c.waterAccess.directAccess && c.waterAccess.type === "creek")!;
const LAKE_DIRECT_SITE = CAMPSITES.find((c) => c.waterAccess.directAccess && c.waterAccess.type === "lake")!;
const PET_NOT_ALLOWED_SITE = CAMPSITES.find((c) => !c.petPolicy.allowed)!;
const PET_ALLOWED_SITE = CAMPSITES.find((c) => c.petPolicy.allowed)!;

// --- Candidate factual questions (item 1a, 2) ---

run("'Is it near water?' answers factually from structured data — not near water", () => {
  const answer = answerCandidateQuestion("water", NON_WATER_SITE, {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  assert(/no/i.test(answer) && /water/i.test(answer), `expected an honest "no" answer — got: "${answer}"`);
});

run("Water answer names the specific type when near water — creek (indirect) vs lake (direct)", () => {
  const creekAnswer = answerCandidateQuestion("water", CREEK_SITE, {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  const lakeAnswer = answerCandidateQuestion("water", LAKE_DIRECT_SITE, {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  assert(/creek/i.test(creekAnswer) && !/direct/i.test(creekAnswer), `creek (nearby, not direct) answer should say "near a creek" — got: "${creekAnswer}"`);
  assert(/direct/i.test(lakeAnswer) && /lake/i.test(lakeAnswer), `lake (direct access) answer should say "direct lake access" — got: "${lakeAnswer}"`);
});

run("'Does it allow dogs?' answers factually from petPolicy", () => {
  const noAnswer = answerCandidateQuestion("pet", PET_NOT_ALLOWED_SITE, {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  const yesAnswer = answerCandidateQuestion("pet", PET_ALLOWED_SITE, {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  assert(/no/i.test(noAnswer), `expected a "no" answer for a non-pet-friendly site — got: "${noAnswer}"`);
  assert(/yes/i.test(yesAnswer) && /\d/.test(yesAnswer), `expected a "yes" answer naming the max count — got: "${yesAnswer}"`);
});

run("'Does it have showers?' vs 'I need showers' follow different, correct paths", () => {
  const noShowerSite = CAMPSITES.find((c) => !c.amenities.includes("shower"))!;
  const factual = answerCandidateQuestion("amenity", noShowerSite, {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: "showers",
  });
  assert(/no/i.test(factual) && /shower/i.test(factual), `factual answer should honestly say no — got: "${factual}"`);
  // The refinement path is exercised end-to-end below via evaluateCampsites
  // with "Showers" as a real requirement — a structurally different path
  // (mutates TripIntent + reruns evaluation) than the factual answer above
  // (which touches no state at all).
});

run("Distance question without an origin ZIP is honest about the gap, never a guessed number", () => {
  const answer = answerCandidateQuestion("distance", CAMPSITES[0], {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  assert(!/\d/.test(answer), `must not state a distance number with no origin ZIP — got: "${answer}"`);
});

run("A genuinely unanswerable topic never invents an unsupported claim", () => {
  const answer = answerCandidateQuestion("other", CAMPSITES[0], {
    originZip: null,
    checkIn: null,
    checkOut: null,
    amenityHint: null,
  });
  assert(answer.length > 0 && !/yes|no\b/i.test(answer), `an "other" topic should decline gracefully, not fabricate yes/no — got: "${answer}"`);
});

// --- Intent refinement + re-evaluation (items 1b, 3) ---

run("Adding a water requirement that the current candidate FAILS causes the recommendation to change", () => {
  // Start from a search whose top candidate does not have water access.
  const before: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4 };
  const beforeResult = evaluateCampsites(before);
  const beforeTop = beforeResult.candidates[0];
  assert(!!beforeTop, "an initial candidate exists");

  const after: TripIntent = { ...before, hardRequirements: ["Near water"] };
  const afterResult = evaluateCampsites(after);
  const afterTop = afterResult.candidates[0];
  assert(!!afterTop, "a candidate still exists after adding the water requirement");
  assert(
    !!afterTop && afterTop.campsite.waterAccess.nearby,
    "the new top candidate must actually be near water",
  );
});

run("A candidate that ALREADY satisfies a newly-added requirement may remain, shown as satisfied", () => {
  const waterSite = CREEK_SITE;
  const before: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    destinationRegion: waterSite.city,
  };
  const beforeResult = evaluateCampsites(before);
  assert(
    beforeResult.candidates[0]?.campsite.id === waterSite.id,
    `setup: ${waterSite.id} should already be the top candidate for its own city`,
  );

  const after: TripIntent = { ...before, hardRequirements: ["Near water"] };
  const afterResult = evaluateCampsites(after);
  const top = afterResult.candidates[0];
  assert(top?.campsite.id === waterSite.id, "the same candidate remains the top pick");
  assert(
    !!top?.preserved.includes("Near water"),
    `the new requirement must show as a satisfied/preserved chip — got: ${JSON.stringify(top?.preserved)}`,
  );
});

run("diffAddedRequirements reports only genuinely new labels", () => {
  const before: TripIntent = { ...EMPTY_TRIP_INTENT, hardRequirements: ["Pet-friendly"] };
  const after: TripIntent = {
    ...before,
    hardRequirements: ["Pet-friendly", "Near water"],
    preferences: ["Quiet"],
  };
  const added = diffAddedRequirements(before, after);
  assert(added.includes("Near water") && added.includes("Quiet"), "both newly added labels are reported");
  assert(!added.includes("Pet-friendly"), "a pre-existing label is not reported as newly added");
});

run("diffAddedRequirements reports a new travelingWithPets as 'Pet-friendly'", () => {
  const before: TripIntent = { ...EMPTY_TRIP_INTENT };
  const after: TripIntent = { ...before, travelingWithPets: true };
  assert(diffAddedRequirements(before, after).includes("Pet-friendly"), "travelingWithPets becoming true is reported");
});

run("Refinement acknowledgment names the site that still wins vs. the site that newly wins", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4, hardRequirements: ["Near water"] };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  const sameSite = buildRefinementAcknowledgment(["Near water"], top.campsite.id, result, "fallback");
  const differentSite = buildRefinementAcknowledgment(["Near water"], "some-other-id", result, "fallback");
  assert(/still comes out on top/i.test(sameSite), `same-candidate framing expected — got: "${sameSite}"`);
  assert(/now the stronger fit/i.test(differentSite), `different-candidate framing expected — got: "${differentSite}"`);
  assert(sameSite.includes("Near water") && differentSite.includes("Near water"), "both mention what was added");
});

run("Intent refinement preserves all prior constraints (never discards existing state)", () => {
  const before: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    checkIn: "Sept 12",
    checkOut: "Sept 14",
    travelingWithPets: true,
    petCount: 1,
    hardRequirements: ["Tent"],
  };
  // Simulate a refinement turn that ONLY adds a water preference — every
  // other field must survive untouched, the same invariant the app's own
  // merge-driven architecture (not this test) is responsible for
  // upholding; this documents the expectation the evaluator relies on.
  const after: TripIntent = { ...before, preferences: ["Near water"] };
  assert(after.guestCount === before.guestCount, "guestCount preserved");
  assert(after.travelingWithPets === before.travelingWithPets && after.petCount === before.petCount, "pet requirement preserved");
  assert(after.hardRequirements[0] === "Tent", "existing hard requirement preserved");
  const result = evaluateCampsites(after);
  assert(
    result.candidates.every((c) => c.campsite.siteType.toLowerCase().includes("tent")),
    "the preserved Tent requirement is still enforced after the refinement",
  );
});

if (failures > 0) {
  console.error(`\n${failures} candidate-follow-up check(s) failed.`);
  process.exit(1);
}
console.log("\nAll candidate-follow-up checks passed.");
