/**
 * Verifies the deterministic core of the v3 agent loop (src/lib/v3/agent-loop.ts
 * applyTurn) — Build Brief stage 6 check: "the golden path runs to
 * 'Everything is held · ready to book'." No network call: this tests the
 * planner/executor directly against a given (mocked) intent extraction, the
 * same shape /api/trip/intent would return.
 */
import { applyTurn } from "../src/lib/v3/agent-loop";
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

run("Golden path: one turn holds the campsite and every requested activity", () => {
  const extraction: V3IntentExtraction = {
    checkIn: "Apr 16",
    checkOut: "Apr 18",
    adults: 4,
    pets: 1,
    originZip: null,
    driveLimitHours: null,
    budgetUsd: null,
    requirements: [
      { label: "Waterfront", tier: "must" },
      { label: "Dogs OK", tier: "must" },
      { label: "Trail ride", tier: "nice" },
      { label: "Pontoon", tier: "nice" },
      { label: "Guided hike", tier: "nice" },
    ],
    status: "actionable",
    clarificationQuestion: null,
    unsupportedReason: null,
  };

  const { trip, factsToPhrase } = applyTurn(emptyTrip(), extraction, now);

  assert(trip.plan.length === 4, `plan has 4 steps (campsite + 3 activities), got ${trip.plan.length}`);
  assert(trip.plan.every((s) => s.status === "done"), "every plan step is done");
  assert(trip.needsYouQueue.length === 0, "nothing is pending a decision");
  assert(trip.bookings.length === 4, `4 bookings exist, got ${trip.bookings.length}`);
  assert(trip.bookings.every((b) => b.status === "held"), "every booking is held");
  assert(trip.holds.length === 4, `4 holds exist, got ${trip.holds.length}`);
  assert(trip.agent.phase === "complete", `agent phase is "complete", got "${trip.agent.phase}"`);
  assert(
    trip.agent.currentStepText === "Everything is held · ready to book",
    `agent says "Everything is held · ready to book", got "${trip.agent.currentStepText}"`,
  );
  assert(
    factsToPhrase.some((f) => f === "Everything is held · ready to book."),
    "a fact for that exact line was produced for phrasing",
  );

  const campsiteBooking = trip.bookings.find((b) => b.kind === "campsite");
  assert(!!campsiteBooking, "a campsite booking exists");
  assert(campsiteBooking!.title.includes("Pine Hollow"), `the waterfront + dogs-OK pick is Pine Hollow, got "${campsiteBooking!.title}"`);

  console.log(`  facts: ${factsToPhrase.join(" | ")}`);
});

run("Over-limit hold asks instead of silently booking", () => {
  const extraction: V3IntentExtraction = {
    checkIn: "Apr 16",
    checkOut: "Apr 18",
    adults: 4,
    pets: 0,
    originZip: null,
    driveLimitHours: null,
    budgetUsd: null,
    requirements: [{ label: "Waterfront", tier: "must" }],
    status: "actionable",
    clarificationQuestion: null,
    unsupportedReason: null,
  };
  let trip = emptyTrip();
  trip = {
    ...trip,
    permissions: trip.permissions.map((p) => (p.id === "hold_refundable" ? { ...p, limitUsd: 50 } : p)),
  };
  const result = applyTurn(trip, extraction, now);
  assert(result.trip.needsYouQueue.length === 1, "a Needs You item is queued when the hold is over the limit");
  assert(result.trip.bookings.length === 0, "nothing is held while the decision is pending");
  assert(result.trip.agent.phase === "awaiting_user", `agent phase is "awaiting_user", got "${result.trip.agent.phase}"`);
});

run("Unsupported request leaves the plan untouched", () => {
  const extraction: V3IntentExtraction = {
    checkIn: null,
    checkOut: null,
    adults: null,
    pets: null,
    originZip: null,
    driveLimitHours: null,
    budgetUsd: null,
    requirements: [],
    status: "unsupported",
    clarificationQuestion: null,
    unsupportedReason: "CampOps can't book flights.",
  };
  const trip = emptyTrip();
  const result = applyTurn(trip, extraction, now);
  assert(result.trip.bookings.length === 0, "nothing changes in the plan");
  assert(result.factsToPhrase[0] === "CampOps can't book flights.", "the unsupported reason is surfaced as a fact");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 agent-loop checks passed.");
}
