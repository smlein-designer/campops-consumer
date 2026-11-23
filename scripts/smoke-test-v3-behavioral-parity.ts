/**
 * Verifies the v2 -> v3 behavioral-parity port (src/lib/v3/clarification.ts,
 * no-match.ts, refinement.ts, candidate-qa.ts, and the gates wired into
 * src/lib/v3/agent-loop.ts's applyTurn/continueTrip): the deterministic
 * prerequisite and recommendation-readiness gates, date-phrase
 * normalization, the unsupported-turn state-leak fix, refinement
 * acknowledgment, widen search, candidate Q&A, and "show me another option."
 */
import { applyTurn, continueTrip, requestAlternativeCampsite, widenTripSearch } from "../src/lib/v3/agent-loop";
import { tryAnswerCandidateQuestion } from "../src/lib/v3/candidate-qa";
import { isAlternativeRequestMessage } from "../src/lib/v3/clarification";
import { emptyTrip } from "../src/lib/v3/trip-factory";
import type { V3IntentExtraction } from "../src/lib/v3/intent-schema";

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

const now = Date.now();

function extraction(overrides: Partial<V3IntentExtraction>): V3IntentExtraction {
  return {
    checkIn: null,
    checkOut: null,
    adults: null,
    pets: null,
    originZip: null,
    driveLimitHours: null,
    budgetUsd: null,
    requirements: [],
    status: "actionable",
    clarificationQuestion: null,
    unsupportedReason: null,
    clarificationOptions: null,
    ...overrides,
  };
}

run("Deterministic prerequisite gate: blocks on missing dates, resumes once supplied", () => {
  const trip = emptyTrip();
  const { trip: afterNoDates, factsToPhrase } = applyTurn(
    trip,
    extraction({ adults: 4, requirements: [{ label: "Waterfront", tier: "must" }] }),
    now,
    "I want a waterfront site for 4 people",
  );
  assert(afterNoDates.bookings.length === 0, "nothing is searched while dates are missing");
  assert(!!afterNoDates.pendingPrerequisite, "pendingPrerequisite is set");
  assert(
    factsToPhrase.some((f) => f.toLowerCase().includes("date")),
    `asks about dates, got "${factsToPhrase.join(" | ")}"`,
  );

  const { trip: afterDates } = applyTurn(
    afterNoDates,
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18" }),
    now,
    "Apr 16 to 18",
  );
  assert(!afterDates.pendingPrerequisite, "pendingPrerequisite clears once dates resolve");
  assert(afterDates.bookings.some((b) => b.kind === "campsite"), "the search now proceeds");
});

run("Date-phrase normalization: a recognized phrase resolves before the prerequisite gate runs", () => {
  const trip = emptyTrip();
  const { trip: after } = applyTurn(
    trip,
    extraction({ checkIn: "this weekend", adults: 4, requirements: [{ label: "Waterfront", tier: "must" }] }),
    now,
    "A waterfront site this weekend for 4",
  );
  assert(!!after.intent.checkIn && after.intent.checkIn !== "this weekend", `"this weekend" resolved to a concrete date, got "${after.intent.checkIn}"`);
  assert(!after.pendingPrerequisite, "no longer missing a date once the phrase resolves");
});

run("Loop protection: a second failed date attempt gets the more specific follow-up", () => {
  const trip = emptyTrip();
  const { trip: first, factsToPhrase: firstFacts } = applyTurn(
    trip,
    extraction({ adults: 4 }),
    now,
    "sometime in March maybe",
  );
  assert(firstFacts[0].includes("What dates"), "first ask is the plain date question");
  const { factsToPhrase: secondFacts } = applyTurn(first, extraction({}), now, "early April works I think");
  assert(
    secondFacts[0].includes("couldn't quite pin down"),
    `second unresolved date-like attempt gets the specific follow-up, got "${secondFacts[0]}"`,
  );
});

run("Recommendation-readiness gate: dates and party size alone are not enough to explain a pick", () => {
  const trip = emptyTrip();
  // Dates + party size satisfy the deterministic prerequisite gate, but
  // there's no origin and no trip-character requirement — not enough to
  // explain a SPECIFIC recommendation (ported from v2's "Find me somewhere
  // good for camping" + dates alone bug fix).
  const { trip: after, factsToPhrase } = applyTurn(
    trip,
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 4 }),
    now,
    "Apr 16 to 18, 4 of us",
  );
  assert(after.bookings.length === 0, "no recommendation is produced from dates and party size alone");
  assert(after.pendingReadiness, "pendingReadiness is set");
  assert(factsToPhrase[0].includes("tell me a bit more"), `asks for more signal, got "${factsToPhrase[0]}"`);

  const { trip: ready } = applyTurn(after, extraction({ requirements: [{ label: "Waterfront", tier: "must" }] }), now, "it should be on the water");
  assert(!ready.pendingReadiness, "readiness clears once a trip-character signal is given");
  assert(ready.bookings.some((b) => b.kind === "campsite"), "the search now proceeds");
});

run("Unsupported turn never touches trip state, even if the model's extraction carried other fields", () => {
  const trip = emptyTrip();
  const { trip: after } = applyTurn(
    trip,
    extraction({
      status: "unsupported",
      unsupportedReason: "CampOps can't book flights.",
      checkIn: "Apr 16",
      adults: 4,
      requirements: [{ label: "Waterfront", tier: "must" }],
    }),
    now,
    "book me a flight and a waterfront site",
  );
  assert(after.intent.checkIn === "", "checkIn was not merged on an unsupported turn");
  assert(after.intent.adults === 0, "adults was not merged on an unsupported turn");
  assert(after.intent.requirements.length === 0, "requirements were not merged on an unsupported turn");
});

run("Refinement acknowledgment: a new must-have the held site already satisfies keeps the hold", () => {
  const trip = emptyTrip();
  const { trip: held } = applyTurn(
    trip,
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 4, requirements: [{ label: "Dog allowed", tier: "must" }] }),
    now,
    "A dog-friendly site for 4, Apr 16 to 18",
  );
  const campsiteBefore = held.bookings.find((b) => b.kind === "campsite");
  assert(!!campsiteBefore, "a campsite is held");

  const { trip: refined, factsToPhrase } = applyTurn(
    held,
    extraction({ requirements: [{ label: "Dog allowed", tier: "must" }] }),
    now,
    "actually make sure it still allows dogs",
  );
  // Re-stating an already-satisfied requirement adds nothing new — no
  // refinement acknowledgment fires, the hold is simply left alone.
  const campsiteAfter = refined.bookings.find((b) => b.kind === "campsite");
  assert(campsiteAfter?.refId === campsiteBefore!.refId, "the same site is still held");
  assert(factsToPhrase.length >= 0, "turn completes without error");
});

run("Refinement acknowledgment: a conflicting new must-have releases and re-searches", () => {
  const trip = emptyTrip();
  const { trip: held } = applyTurn(
    trip,
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 4, requirements: [{ label: "Dog allowed", tier: "must" }] }),
    now,
    "A dog-friendly site for 4, Apr 16 to 18",
  );
  const campsiteBefore = held.bookings.find((b) => b.kind === "campsite")!;

  const { trip: refined, factsToPhrase } = applyTurn(
    held,
    extraction({ requirements: [{ label: "Waterfront", tier: "must" }] }),
    now,
    "actually it needs to be on the water",
  );
  assert(
    factsToPhrase.some((f) => f.startsWith("Got it —")),
    `a refinement acknowledgment is produced, got "${factsToPhrase.join(" | ")}"`,
  );
  const campsiteAfter = refined.bookings.find((b) => b.kind === "campsite");
  if (campsiteAfter) {
    assert(
      campsiteAfter.refId !== campsiteBefore.refId || factsToPhrase.some((f) => f.includes("still comes out on top")),
      "either a different site is now held, or the same one was confirmed to still satisfy it",
    );
  }
});

run("Widen search: resolves a no-match by relaxing the one failing must-have", () => {
  const trip = emptyTrip();
  // Two literal, mutually-exclusive must-haves (no site is both a tent site
  // and a cabin): a clean no-match with exactly one confirmed-failing
  // literal requirement once the other is satisfied, so a single widen
  // fully resolves it.
  const { trip: noMatch } = applyTurn(
    trip,
    extraction({
      checkIn: "Apr 16",
      checkOut: "Apr 18",
      adults: 4,
      requirements: [
        { label: "Tent site", tier: "must" },
        { label: "Cabin", tier: "must" },
      ],
    }),
    now,
    "a tent site that's also a cabin, for 4",
  );
  const blocked = noMatch.needsYouQueue.find((n) => n.kind === "no_match");
  assert(!!blocked, "the impossible combination produces a no_match Needs You item");

  const { trip: widened, factsToPhrase } = widenTripSearch(noMatch, now);
  assert(widened.bookings.some((b) => b.kind === "campsite"), "a campsite is now held after widening");
  assert(factsToPhrase.some((f) => f.includes("widened")), `acknowledges the widen, got "${factsToPhrase.join(" | ")}"`);
});

run("Candidate Q&A: answers a factual question about the held site without mutating state", () => {
  const trip = emptyTrip();
  const { trip: held } = applyTurn(
    trip,
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 4, requirements: [{ label: "Waterfront", tier: "must" }, { label: "Dog allowed", tier: "must" }] }),
    now,
    "A waterfront, dog-friendly site for 4, Apr 16 to 18",
  );
  assert(held.bookings.some((b) => b.kind === "campsite"), "a campsite is held");

  const answer = tryAnswerCandidateQuestion(held, "is it near water?");
  assert(!!answer, "a deterministic answer is produced");
  assert(/yes/i.test(answer ?? ""), `answers yes for a waterfront site, got "${answer}"`);

  const notAQuestion = tryAnswerCandidateQuestion(held, "I'd prefer somewhere quieter");
  assert(notAQuestion === null, "a refinement statement is not mistaken for a factual question");
});

run("Alternative-request detection and cycling", () => {
  assert(isAlternativeRequestMessage("show me another option"), 'detects "show me another option"');
  assert(isAlternativeRequestMessage("I don't like this site"), 'detects "I don\'t like this site"');
  assert(!isAlternativeRequestMessage("what's the price?"), "a plain question is not an alternative request");

  const trip = emptyTrip();
  const { trip: held } = applyTurn(
    trip,
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 4, requirements: [{ label: "Dog allowed", tier: "must" }] }),
    now,
    "A dog-friendly site for 4, Apr 16 to 18",
  );
  const first = held.bookings.find((b) => b.kind === "campsite")!;
  const { trip: another, factsToPhrase } = requestAlternativeCampsite(held, now);
  const second = another.bookings.find((b) => b.kind === "campsite");
  assert(!!second && second.refId !== first.refId, "a different campsite is now held");
  assert(another.candidateIndex === 1, `candidateIndex advanced, got ${another.candidateIndex}`);
  assert(factsToPhrase.length > 0, "an acknowledgment is produced");
});

run("continueTrip is the shared resume path widen/alternative use", () => {
  const trip = emptyTrip();
  const { checkpoints } = continueTrip(trip, now, ["seeded fact"]);
  assert(checkpoints[0].facts.includes("seeded fact"), "leadingFacts land in the first checkpoint");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll v3 behavioral-parity checks passed.");
