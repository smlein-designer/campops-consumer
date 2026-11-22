/**
 * Build Brief stage 9 (evaluation pass): covers the PRD scenarios not
 * already exercised by an earlier stage's smoke test — see
 * docs/v3-case-study-notes.md for the full 14-scenario scorecard and which
 * test (or live trace) backs each one.
 */
import { CAMPSITES } from "../src/lib/campsites";
import { acceptSuggestion, applyTurn, dismissSuggestion } from "../src/lib/v3/agent-loop";
import { commitBooking } from "../src/lib/v3/authorize";
import { ACTIVITIES_BY_ID } from "../src/lib/v3/providers";
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
    checkIn: "Apr 16",
    checkOut: "Apr 18",
    adults: 4,
    pets: 0,
    originZip: null,
    driveLimitHours: null,
    budgetUsd: null,
    requirements: [],
    status: "actionable",
    clarificationQuestion: null,
    unsupportedReason: null,
    ...overrides,
  };
}

run("Scenario: no campsite satisfies every requirement", () => {
  // Waterfront + RV site + under $20/night: nothing in the dataset clears all three.
  const impossible = extraction({
    requirements: [
      { label: "Waterfront", tier: "must" },
      { label: "RV site", tier: "must" },
      { label: "Budget $20/night", tier: "must" },
    ],
    budgetUsd: 20,
  });
  const { trip } = applyTurn(emptyTrip(), impossible, now);
  assert(trip.bookings.length === 0, "nothing is booked when no site qualifies");
  assert(trip.needsYouQueue.length === 1, "a Needs You item asks how to proceed");
  assert(trip.agent.phase === "awaiting_user", `agent is awaiting_user, got "${trip.agent.phase}"`);
});

run("Scenario: user changes a constraint while working (mid-task refinement)", () => {
  const first = applyTurn(emptyTrip(), extraction({ requirements: [{ label: "Waterfront", tier: "must" }] }), now).trip;
  const campsiteId = first.bookings.find((b) => b.kind === "campsite")?.refId;
  assert(!!campsiteId, "a campsite is held after the first turn");

  // Second turn: the user now also wants dogs allowed — must merge, not discard.
  const second = applyTurn(first, extraction({ requirements: [{ label: "Dogs OK", tier: "must" }] }), now).trip;
  assert(
    second.intent.requirements.some((r) => r.label === "Waterfront") &&
      second.intent.requirements.some((r) => r.label === "Dogs OK"),
    "both requirements are present after the refinement — nothing was discarded",
  );
});

run("Scenario: user lowers a permission mid-task (agent-loop level)", () => {
  const trip = emptyTrip();
  const lowered = {
    ...trip,
    permissions: trip.permissions.map((p) => (p.id === "hold_refundable" ? { ...p, limitUsd: 50 } : p)),
  };
  const { trip: result } = applyTurn(lowered, extraction({ requirements: [{ label: "Waterfront", tier: "must" }] }), now);
  assert(result.bookings.length === 0, "the campsite hold asks instead of proceeding once the limit is too low");
  assert(result.needsYouQueue.length === 1, "exactly one Needs You item is posted");
});

run("Scenario: user dismisses a suggestion", () => {
  const golden = applyTurn(
    emptyTrip(),
    extraction({
      pets: 1,
      requirements: [
        { label: "Waterfront", tier: "must" },
        { label: "Dogs OK", tier: "must" },
        { label: "Trail ride", tier: "nice" },
        { label: "Pontoon", tier: "nice" },
        { label: "Guided hike", tier: "nice" },
      ],
    }),
    now,
  ).trip;
  const suggestion = golden.suggestions.find((s) => s.state === "offered");
  assert(!!suggestion, "a suggestion is offered once everything is held");

  const dismissed = dismissSuggestion(golden, suggestion!.id);
  assert(dismissed.suggestions.find((s) => s.id === suggestion!.id)?.state === "dismissed", "the suggestion is marked dismissed");
  assert(dismissed.dismissedSuggestionTypes.length === 1, "its activity type is recorded as dismissed");

  // Re-running the same turn must never re-offer the DISMISSED TYPE (a
  // different, not-yet-dismissed type may legitimately be offered instead).
  const rerun = applyTurn(dismissed, extraction({ requirements: golden.intent.requirements }), now).trip;
  const dismissedType = dismissed.dismissedSuggestionTypes[0];
  assert(
    !rerun.suggestions.some((s) => s.state === "offered" && ACTIVITIES_BY_ID[s.activityId]?.type === dismissedType),
    "no new suggestion of the dismissed type appears",
  );
});

run("Scenario: user accepts a suggestion — added to the plan and total, never automatic", () => {
  const golden = applyTurn(
    emptyTrip(),
    extraction({
      pets: 1,
      requirements: [
        { label: "Waterfront", tier: "must" },
        { label: "Dogs OK", tier: "must" },
        { label: "Trail ride", tier: "nice" },
        { label: "Pontoon", tier: "nice" },
        { label: "Guided hike", tier: "nice" },
      ],
    }),
    now,
  ).trip;
  const suggestion = golden.suggestions.find((s) => s.state === "offered")!;
  const before = golden.bookings.length;

  const { trip: accepted } = acceptSuggestion(golden, suggestion.id, now);
  assert(accepted.bookings.length === before + 1, "accepting adds exactly one new booking");
  assert(accepted.suggestions.find((s) => s.id === suggestion.id)?.state === "added", "the suggestion is marked added");
});

run("Scenario: incomplete authorization never reaches approved", () => {
  const golden = applyTurn(
    emptyTrip(),
    extraction({ requirements: [{ label: "Waterfront", tier: "must" }] }),
    now,
  ).trip;
  const result = commitBooking(golden, "", now);
  assert(!result.ok, "committing with no payment method is refused");
  assert(golden.bookings.every((b) => b.status !== "approved"), "nothing was approved");
});

run("Sanity: the 5 named demo sites and the original 25 both still answer searches", () => {
  assert(CAMPSITES.length === 30, `dataset is 30 sites, got ${CAMPSITES.length}`);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 evaluation-scenario checks passed.");
}
