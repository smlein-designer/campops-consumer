/**
 * Verifies the real application-event model (src/lib/events.ts) and its
 * integration with evaluateCampsites/transitionReservation. Every event
 * here is derived from an actual before/after state pair the way
 * src/app/page.tsx orchestrates it — this test exercises the same
 * derivation functions in the same order, not a separate reimplementation.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import {
  deriveAlternativeRequestedEvent,
  deriveAvailabilityChangedEvent,
  deriveCandidateExcludedEvent,
  deriveClarificationRequestedEvent,
  deriveClarificationResolvedEvent,
  deriveEvaluationPerformedEvent,
  deriveIntentEvent,
  derivePrerequisiteResolvedEvent,
  deriveRequirementWidenedEvent,
  deriveUnsupportedEvent,
  deriveRecommendationAcceptedEvent,
  deriveRecommendationSelectedEvent,
  deriveReplacementSelectedEvent,
} from "../src/lib/events";
import {
  stageReservation,
  transitionReservation,
} from "../src/lib/reservation";
import {
  EMPTY_TRIP_INTENT,
  type TaskEvent,
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

/** Strips id/timestamp — the only intentionally-variable fields — for sequence comparison. */
function typeSequence(events: TaskEvent[]): string[] {
  return events.map((e) => e.type);
}

// 1. Initial actionable intent creates the expected meaningful activity.
run(
  "Initial actionable intent creates the expected meaningful activity",
  () => {
    const events: TaskEvent[] = [];
    const before = EMPTY_TRIP_INTENT;
    const after: TripIntent = {
      ...EMPTY_TRIP_INTENT,
      guestCount: 4,
      hardRequirements: ["Pet-friendly"],
    };

    const intentEvent = deriveIntentEvent(
      before,
      after,
      /* alreadyEstablished */ false,
    );
    if (intentEvent) events.push(intentEvent);
    events.push(deriveEvaluationPerformedEvent(new Set()));
    const result = evaluateCampsites(after);
    const recEvent = deriveRecommendationSelectedEvent(result);
    if (recEvent) events.push(recEvent);

    assert(
      JSON.stringify(typeSequence(events)) ===
        JSON.stringify([
          "trip_established",
          "evaluation_performed",
          "recommendation_selected",
        ]),
      `expected [trip_established, evaluation_performed, recommendation_selected] — got ${JSON.stringify(typeSequence(events))}`,
    );
    assert(
      events[0].description.includes("Started a new trip"),
      "trip_established description is plain and factual",
    );
    assert(
      /Checked \d+ campsite/.test(events[1].description),
      "evaluation_performed reports a real considered count",
    );
  },
);

// 2. Refinement produces an event only when intent actually changed.
run("Refinement produces an event only when intent actually changed", () => {
  const intentA: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const unchanged = deriveIntentEvent(intentA, { ...intentA }, true);
  assert(
    unchanged === null,
    "no event when the new intent is identical to the old one",
  );

  const intentB: TripIntent = {
    ...intentA,
    hardRequirements: ["Pet-friendly", "Near water"],
  };
  const changed = deriveIntentEvent(intentA, intentB, true);
  assert(
    changed !== null && changed.type === "requirement_refined",
    "a genuine change produces requirement_refined",
  );
});

// 3. Clarification request and resolution appear in correct order.
run("Clarification request and resolution appear in correct order", () => {
  const events: TaskEvent[] = [];
  // Turn A: vague message -> needs_clarification.
  events.push(deriveClarificationRequestedEvent("How many people, and when?"));
  // Turn B: answer arrives -> resolved fires before the merge/actionable events.
  events.push(deriveClarificationResolvedEvent());
  const before: TripIntent = EMPTY_TRIP_INTENT;
  const after: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4 };
  const intentEvent = deriveIntentEvent(before, after, false);
  if (intentEvent) events.push(intentEvent);
  events.push(deriveEvaluationPerformedEvent(new Set()));

  assert(
    JSON.stringify(typeSequence(events)) ===
      JSON.stringify([
        "clarification_requested",
        "clarification_resolved",
        "trip_established",
        "evaluation_performed",
      ]),
    `expected request before resolution before the merge — got ${JSON.stringify(typeSequence(events))}`,
  );
});

// 4. Availability-loss recovery produces loss/exclusion/recommendation events in correct order.
run(
  "Availability-loss recovery produces loss/exclusion/replacement events in correct order",
  () => {
    const intent: TripIntent = {
      ...EMPTY_TRIP_INTENT,
      guestCount: 4,
      hardRequirements: ["Pet-friendly"],
    };
    const initial = evaluateCampsites(intent);
    const lost = initial.candidates[0];

    const events: TaskEvent[] = [];
    events.push(deriveAvailabilityChangedEvent(lost));
    events.push(deriveCandidateExcludedEvent(lost));
    const excluded = new Set([lost.campsite.id]);
    events.push(deriveEvaluationPerformedEvent(excluded));
    const adapted = evaluateCampsites(intent, excluded);
    const replacementEvent = deriveReplacementSelectedEvent(adapted, 0);
    if (replacementEvent) events.push(replacementEvent);

    assert(
      JSON.stringify(typeSequence(events)) ===
        JSON.stringify([
          "availability_changed",
          "candidate_excluded",
          "evaluation_performed",
          "replacement_selected",
        ]),
      `expected loss -> exclusion -> evaluation -> replacement — got ${JSON.stringify(typeSequence(events))}`,
    );
  },
);

// 5. Excluded/rejected campsite is never logged as subsequently recommended.
run("Excluded campsite is never logged as a subsequent recommendation", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  const initial = evaluateCampsites(intent);
  const lost = initial.candidates[0];
  const excluded = new Set([lost.campsite.id]);

  const adapted = evaluateCampsites(intent, excluded);
  const replacementEvent = deriveReplacementSelectedEvent(adapted, 0);

  assert(
    replacementEvent !== null &&
      replacementEvent.relatedIds?.campsiteId !== lost.campsite.id,
    "the replacement event never references the excluded campsite's id",
  );
  assert(
    !adapted.candidates.some((c) => c.campsite.id === lost.campsite.id),
    "the excluded campsite does not appear anywhere in the adapted candidate set at all",
  );
});

// 5b. Alternative-request cycling also never re-logs a superseded candidate as new.
run(
  "Request-alternative cycling logs the new candidate, not the previous one",
  () => {
    const intent: TripIntent = {
      ...EMPTY_TRIP_INTENT,
      guestCount: 4,
      hardRequirements: ["Pet-friendly"],
    };
    const result = evaluateCampsites(intent);
    assert(
      result.candidates.length >= 2,
      "setup: at least two candidates to cycle between",
    );

    const requestEvent = deriveAlternativeRequestedEvent();
    const replacementEvent = deriveReplacementSelectedEvent(result, 1);
    assert(
      requestEvent.type === "alternative_requested" &&
        requestEvent.actor === "user",
      "alternative_requested is a user action",
    );
    assert(
      replacementEvent?.relatedIds?.campsiteId ===
        result.candidates[1].campsite.id,
      "the resulting replacement event references the NEW candidate at the new index, not the old one",
    );
  },
);

// 6. Reservation staging and authorization events reflect actual guarded transitions.
run(
  "Reservation staging and authorization events reflect the guarded transitions",
  () => {
    const intent: TripIntent = {
      ...EMPTY_TRIP_INTENT,
      guestCount: 4,
      checkIn: "Sept 12",
      checkOut: "Sept 14",
      hardRequirements: ["Pet-friendly"],
    };
    const result = evaluateCampsites(intent);
    const top = result.candidates[0];

    const events: TaskEvent[] = [];
    events.push(deriveRecommendationAcceptedEvent(top));
    const staged = stageReservation(
      top.campsite,
      intent.guestCount as number,
      intent.checkIn as string,
      intent.checkOut as string,
    );
    events.push(staged.event);

    // No saved payment: Review -> Add payment -> Save lands on Confirm.
    // There is no failed attempt / missing-info step anywhere.
    const adding = transitionReservation(staged.reservation, { type: "BEGIN_ADD_PAYMENT" });
    events.push(adding.event);
    const attempt2 = transitionReservation(adding.reservation, {
      type: "ADD_PAYMENT_METHOD",
      label: "Visa •••• 4471",
    });
    events.push(attempt2.event); // -> ready_for_authorization (Confirm)

    const begin = transitionReservation(attempt2.reservation, {
      type: "BEGIN_AUTHORIZE",
    });
    events.push(begin.event);

    const authorized = transitionReservation(begin.reservation, {
      type: "AUTHORIZE",
    });
    events.push(authorized.event);

    assert(
      JSON.stringify(typeSequence(events)) ===
        JSON.stringify([
          "recommendation_accepted",
          "reservation_staged",
          "payment_entry_started",
          "payment_method_added",
          "authorization_initiated",
          "reservation_reserved",
        ]),
      `expected the full guarded-transition sequence — got ${JSON.stringify(typeSequence(events))}`,
    );
    assert(
      authorized.reservation.status === "reserved",
      "the reservation is actually reserved at the end of this sequence",
    );
  },
);

// 11. Repeated deterministic flows yield the same event sequence (types +
// descriptions), apart from id/timestamp, which are intentionally variable.
run(
  "Repeated deterministic flows yield the same event sequence apart from id/timestamp",
  () => {
    function buildSequence(): TaskEvent[] {
      const intent: TripIntent = {
        ...EMPTY_TRIP_INTENT,
        guestCount: 4,
        hardRequirements: ["Pet-friendly"],
      };
      const events: TaskEvent[] = [];
      const intentEvent = deriveIntentEvent(EMPTY_TRIP_INTENT, intent, false);
      if (intentEvent) events.push(intentEvent);
      events.push(deriveEvaluationPerformedEvent(new Set()));
      const result = evaluateCampsites(intent);
      const recEvent = deriveRecommendationSelectedEvent(result);
      if (recEvent) events.push(recEvent);
      return events;
    }

    const first = buildSequence();
    const second = buildSequence();
    const strip = (events: TaskEvent[]) =>
      events.map((e) => ({ type: e.type, actor: e.actor, description: e.description, relatedIds: e.relatedIds }));
    assert(
      JSON.stringify(strip(first)) === JSON.stringify(strip(second)),
      "identical inputs produce identical event sequences once id/timestamp are stripped",
    );
    assert(
      first[0].id !== second[0].id,
      "ids are still real, unique, and intentionally variable",
    );
  },
);

// 12. Activity tracks the USER's actions as well as CampOps' — including
// what the person does through the conversation, not only button taps.
run("User actions are credited to the user", () => {
  const trip: TripIntent = { ...EMPTY_TRIP_INTENT, goalStatement: "A lake weekend.", guestCount: 4 };
  const established = deriveIntentEvent(EMPTY_TRIP_INTENT, trip, false)!;
  const refined = deriveIntentEvent(trip, { ...trip, guestCount: 6 }, true)!;
  const cases: [string, { actor: string; description: string }][] = [
    ["describing a new trip", established],
    ["changing the trip", refined],
    ["answering CampOps' question", deriveClarificationResolvedEvent()],
    ["asking for something out of scope", deriveUnsupportedEvent()],
    ["tapping Widen search", deriveRequirementWidenedEvent("Near water")],
    ["supplying the party size", derivePrerequisiteResolvedEvent(["guest_count"])],
    ["tapping Show me another option", deriveAlternativeRequestedEvent()],
  ];
  for (const [what, e] of cases) assert(e.actor === "user", `${what} is the user's action — got "${e.actor}" (${e.description})`);
  assert(
    derivePrerequisiteResolvedEvent(["check_in_date", "check_out_date"]).description === "Provided the trip dates.",
    "supplied prerequisites are described in plain words",
  );
  assert(deriveClarificationRequestedEvent("How many?").actor === "agent", "CampOps' own question stays CampOps'");
});

if (failures > 0) {
  console.error(`\n${failures} event check(s) failed.`);
  process.exit(1);
}
console.log("\nAll event checks passed.");
