/**
 * Deterministic Action Prerequisites (2026-09-01 — see
 * docs/implementation-decisions.md). Verifies the pure-logic layer in
 * src/lib/prerequisites.ts, its integration point in evaluate.ts (a
 * self-referential distance constraint must never resolve to "satisfied"),
 * and the reservation state machine's new date requirement. The stateful
 * React flow (blocking a search/Accept, asking the deterministic question,
 * resuming the interrupted action once the prerequisite arrives) is
 * verified live via Playwright — see docs/implementation-decisions.md for
 * that run's results; no component-test harness exists in this project.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import {
  checkBookingPrerequisites,
  parsePartySizeAnswer,
  checkSearchPrerequisites,
  hasOriginRelativeDistanceConstraint,
  isExploratoryDiscoveryMessage,
  isOriginRelativeDistanceLabel,
  questionFor,
} from "../src/lib/prerequisites";
import { stageReservation } from "../src/lib/reservation";
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

// 1. isOriginRelativeDistanceLabel — self-referential distance phrasing.
run("isOriginRelativeDistanceLabel recognizes self-referential distance/travel-time phrasing", () => {
  const shouldMatch = [
    "Within an hour of my home",
    "Less than 90 minutes from me",
    "Somewhere close to home",
    "Within 50 miles of my house",
    "Within an hour of home",
    "Less than 50 miles from me",
  ];
  for (const label of shouldMatch) {
    assert(isOriginRelativeDistanceLabel(label), `"${label}" should be recognized as origin-relative`);
  }
});

run("isOriginRelativeDistanceLabel does not misfire on ordinary requirements", () => {
  const shouldNotMatch = [
    "Pet-friendly",
    "Near water",
    "Seclusion",
    "Within 50 miles of downtown", // anchored to a named place, not "me"/"home"
    "Willing to pay more for Wifi",
    "Tent",
  ];
  for (const label of shouldNotMatch) {
    assert(!isOriginRelativeDistanceLabel(label), `"${label}" should NOT be flagged as origin-relative`);
  }
});

// 2. hasOriginRelativeDistanceConstraint scans all four tiers.
run("hasOriginRelativeDistanceConstraint scans all four requirement tiers", () => {
  const inHard: TripIntent = { ...EMPTY_TRIP_INTENT, hardRequirements: ["Within an hour of home"] };
  const inFlexible: TripIntent = { ...EMPTY_TRIP_INTENT, flexibleConstraints: ["Less than 50 miles from me"] };
  const inPreferences: TripIntent = { ...EMPTY_TRIP_INTENT, preferences: ["Close to home"] };
  const inPriorities: TripIntent = { ...EMPTY_TRIP_INTENT, priorities: ["Willing to drive farther than an hour from me for a better site"] };
  const none: TripIntent = { ...EMPTY_TRIP_INTENT, hardRequirements: ["Pet-friendly"] };
  assert(hasOriginRelativeDistanceConstraint(inHard), "detected in hardRequirements");
  assert(hasOriginRelativeDistanceConstraint(inFlexible), "detected in flexibleConstraints");
  assert(hasOriginRelativeDistanceConstraint(inPreferences), "detected in preferences");
  assert(hasOriginRelativeDistanceConstraint(inPriorities), "detected in priorities");
  assert(!hasOriginRelativeDistanceConstraint(none), "not falsely detected when absent");
});

// 3. checkSearchPrerequisites — action-sensitive, not a global required-fields check.
run("checkSearchPrerequisites: exploratory discovery needs no origin, no dates", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, hardRequirements: ["Quiet"] };
  const result = checkSearchPrerequisites(intent, { availabilityBacked: false });
  assert(result.status === "actionable", `"What are some quiet campgrounds?" should be actionable — got ${result.status}`);
});

run("checkSearchPrerequisites: an availability-backed search with no dates is blocked (the reproduced bug)", () => {
  // The exact reproduced phrasing: no explicit "find me"/"book" verb at
  // all, no dates, a self-referential distance constraint AND a guest
  // count — this must be classified availability-backed by default.
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 8,
    hardRequirements: ["Pet-friendly"],
    flexibleConstraints: ["Within an hour from my home"],
  };
  const message = "a campsite for 4 adults, two kids, and two dogs within an hour from my home";
  assert(!isExploratoryDiscoveryMessage(message), "setup: this message must NOT be classified exploratory");
  const result = checkSearchPrerequisites(intent, {
    availabilityBacked: !isExploratoryDiscoveryMessage(message),
  });
  assert(result.status === "missing_prerequisites", `expected missing_prerequisites — got ${result.status}`);
  if (result.status === "missing_prerequisites") {
    assert(result.missing.includes("origin_location"), "origin_location is missing");
    assert(result.missing.includes("check_in_date"), "check_in_date is missing");
    assert(result.missing.includes("check_out_date"), "check_out_date is missing");
  }
});

run("checkSearchPrerequisites: ALL currently-missing prerequisites are reported together, not just the first", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, flexibleConstraints: ["Within an hour of my home"] };
  const result = checkSearchPrerequisites(intent, { availabilityBacked: true });
  assert(result.status === "missing_prerequisites", "setup: missing_prerequisites");
  if (result.status === "missing_prerequisites") {
    assert(
      result.missing.length === 3 &&
        result.missing.includes("origin_location") &&
        result.missing.includes("check_in_date") &&
        result.missing.includes("check_out_date"),
      `all three should be reported at once (before the first clarification is even asked) — got ${JSON.stringify(result.missing)}`,
    );
    assert(
      result.missing[0] === "origin_location",
      "origin_location is ordered first, matching 'collect them sequentially, ZIP before dates'",
    );
  }
});

run("checkSearchPrerequisites: supplying ONLY originZip does not mark the action actionable while dates remain missing", () => {
  const before: TripIntent = { ...EMPTY_TRIP_INTENT, flexibleConstraints: ["Within an hour of my home"] };
  const afterZipOnly: TripIntent = { ...before, originZip: "78660" };
  const result = checkSearchPrerequisites(afterZipOnly, { availabilityBacked: true });
  assert(
    result.status === "missing_prerequisites",
    `completing ONE prerequisite (origin) must not make the action actionable while dates remain missing — got ${result.status}`,
  );
  if (result.status === "missing_prerequisites") {
    assert(
      !result.missing.includes("origin_location") &&
        result.missing.includes("check_in_date") &&
        result.missing.includes("check_out_date"),
      "origin_location resolved and dropped from `missing`; check_in_date/check_out_date remain",
    );
    assert(
      questionFor(result.missing, "search") === "What dates are you planning to camp?",
      `the next question is the dates question, matching the required example — got "${questionFor(result.missing, "search")}"`,
    );
  }
});

run("checkSearchPrerequisites: supplying ZIP and dates together resolves fully, preserving guest count/pets/preferences", () => {
  const before: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 8,
    hardRequirements: ["Pet-friendly"],
    flexibleConstraints: ["Within an hour of my home"],
  };
  const after: TripIntent = {
    ...before,
    originZip: "78660",
    checkIn: "Sept 12",
    checkOut: "Sept 14",
  };
  assert(
    checkSearchPrerequisites(before, { availabilityBacked: true }).status === "missing_prerequisites",
    "setup: missing before ZIP+dates supplied",
  );
  assert(
    checkSearchPrerequisites(after, { availabilityBacked: true }).status === "actionable",
    "actionable once origin AND dates are both present",
  );
  assert(
    after.guestCount === before.guestCount &&
      JSON.stringify(after.hardRequirements) === JSON.stringify(before.hardRequirements) &&
      JSON.stringify(after.flexibleConstraints) === JSON.stringify(before.flexibleConstraints),
    "guest count, pet requirement, and the distance constraint itself all survive the full ZIP -> dates chain untouched",
  );
});

run("checkSearchPrerequisites: a complete request with dates up front never triggers unnecessary clarification", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    checkIn: "Oct 3",
    checkOut: "Oct 5",
    hardRequirements: ["Pet-friendly"],
  };
  const result = checkSearchPrerequisites(intent, { availabilityBacked: true });
  assert(result.status === "actionable", `a fully-specified availability-backed request should be immediately actionable — got ${result.status}`);
});

// isExploratoryDiscoveryMessage — the text heuristic gating availabilityBacked.
run("isExploratoryDiscoveryMessage recognizes general/plural browsing questions", () => {
  const exploratory = [
    "What are some quiet campgrounds?",
    "Show me campgrounds with good lake access.",
    "What campgrounds are good for families?",
  ];
  for (const message of exploratory) {
    assert(isExploratoryDiscoveryMessage(message), `"${message}" should be classified exploratory`);
  }
});

run("isExploratoryDiscoveryMessage defaults to availability-backed for anything not clearly general/plural browsing", () => {
  const availabilityBacked = [
    "Find me a campsite.",
    "I need a site for 6 people.",
    "Find somewhere for us to camp.",
    "a campsite for 4 adults, two kids, and two dogs within an hour from my home", // the reproduced bug's own phrasing
  ];
  for (const message of availabilityBacked) {
    assert(!isExploratoryDiscoveryMessage(message), `"${message}" should NOT be classified exploratory`);
  }
});

// 4. A missing origin can never be silently treated as a satisfied distance constraint.
run("A self-referential distance constraint is never marked satisfied, with or without an origin", () => {
  const withoutOrigin: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Within an hour of my home"],
  };
  const withOrigin: TripIntent = { ...withoutOrigin, originZip: "10001" };
  for (const intent of [withoutOrigin, withOrigin]) {
    const result = evaluateCampsites(intent);
    for (const candidate of result.candidates) {
      const distanceCheck = candidate.checks.find((c) => c.label === "Within an hour of my home");
      assert(!!distanceCheck, "setup: the check exists on every candidate");
      assert(
        distanceCheck?.status !== "satisfied",
        `"Within an hour of my home" must never be "satisfied" (originZip=${intent.originZip ?? "null"}) — this POC has no real distance calculation`,
      );
    }
    assert(
      result.kind !== "full",
      `a hard requirement the app cannot verify must never yield a "full" match (originZip=${intent.originZip ?? "null"}) — got ${result.kind}`,
    );
  }
});

// 5. checkBookingPrerequisites — everything a reservation needs apart from
//    payment (real dates AND party size) is resolved in the conversation
//    before Choose may stage anything.
run("checkBookingPrerequisites: dates, then party size", () => {
  const neither: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4 };
  const onlyCheckIn: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4, checkIn: "Sept 12" };
  const both: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4, checkIn: "Sept 12", checkOut: "Sept 14" };

  const r1 = checkBookingPrerequisites(neither);
  assert(r1.status === "missing_prerequisites", "neither date present -> missing_prerequisites");
  if (r1.status === "missing_prerequisites") {
    assert(
      r1.missing.includes("check_in_date") && r1.missing.includes("check_out_date"),
      "both check_in_date and check_out_date reported missing",
    );
  }

  const r2 = checkBookingPrerequisites(onlyCheckIn);
  assert(r2.status === "missing_prerequisites", "only checkIn present -> still missing_prerequisites");
  if (r2.status === "missing_prerequisites") {
    assert(
      r2.missing.includes("check_out_date") && !r2.missing.includes("check_in_date"),
      "only check_out_date reported missing",
    );
  }

  assert(checkBookingPrerequisites(both).status === "actionable", "dates + party size present -> actionable (no unnecessary clarification)");
});

run("checkBookingPrerequisites: a trip without party size cannot enter the reservation flow", () => {
  const noParty: TripIntent = { ...EMPTY_TRIP_INTENT, checkIn: "Sept 12", checkOut: "Sept 14" };
  const r = checkBookingPrerequisites(noParty);
  assert(
    r.status === "missing_prerequisites" && r.missing.length === 1 && r.missing[0] === "guest_count",
    `missing party size alone blocks Choose — got ${JSON.stringify(r)}`,
  );
  if (r.status === "missing_prerequisites") {
    assert(/how many people/i.test(questionFor(r.missing, "booking")), "CampOps asks for the party size conversationally");
  }
  const neitherNorParty = checkBookingPrerequisites({ ...EMPTY_TRIP_INTENT });
  assert(
    neitherNorParty.status === "missing_prerequisites" &&
      neitherNorParty.missing[0] === "check_in_date" &&
      neitherNorParty.missing.at(-1) === "guest_count",
    "with dates also missing, dates are asked first and party size after",
  );
  assert(
    checkBookingPrerequisites({ ...noParty, guestCount: 4 }).status === "actionable",
    "supplying the party size makes the reservation path available",
  );
});

run("parsePartySizeAnswer reads replies to the party-size question", () => {
  const cases: [string, number | null][] = [
    ["4", 4],
    ["4 people", 4],
    ["We're 6", 6],
    ["four of us", 4],
    ["just me", 1],
    ["not sure yet", null],
    ["0", null],
  ];
  for (const [reply, expected] of cases) {
    assert(parsePartySizeAnswer(reply) === expected, `"${reply}" -> ${expected} (got ${parsePartySizeAnswer(reply)})`);
  }
});

// 6. "Book this" with no dates cannot reach a booking-ready reservation —
//    proven at the type/API level: stageReservation requires concrete
//    checkIn/checkOut params, making an undated reservation unrepresentable.
run("stageReservation records the user's actual stated dates, not a campsite default", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    checkIn: "Oct 3",
    checkOut: "Oct 5",
    hardRequirements: ["Pet-friendly"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  const { reservation } = stageReservation(
    top.campsite,
    intent.guestCount as number,
    intent.checkIn as string,
    intent.checkOut as string,
  );
  assert(reservation.checkIn === "Oct 3" && reservation.checkOut === "Oct 5", "checkIn/checkOut preserved exactly as the user stated them");
  assert(
    reservation.dates.includes("Oct 3") && reservation.dates.includes("Oct 5"),
    `the displayed "dates" reflects the user's actual dates, not the campsite's fixed datesAvailable — got "${reservation.dates}"`,
  );
});

// 7. A reservation can never be staged without a party size — the
//    reservation flow is not a requirements-gathering surface.
run("stageReservation refuses a trip with dates but no party size", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: null, // missing, on purpose
    checkIn: "Sept 12",
    checkOut: "Sept 14",
    hardRequirements: ["Pet-friendly"],
  };
  const top = evaluateCampsites(intent).candidates[0];
  let threw = false;
  try {
    stageReservation(top.campsite, intent.guestCount as unknown as number, "Sept 12", "Sept 14");
  } catch {
    threw = true;
  }
  assert(threw, "no reservation (and so no Review screen) can exist with a missing guest count");
});

console.log("\n(See docs/implementation-decisions.md for the live-Playwright results covering: " +
  "missing-origin blocking a search and resuming after a ZIP is supplied; " +
  "missing-dates blocking Accept and resuming the same acceptance after dates are supplied; " +
  "a stale in-flight response never overwriting a prerequisite the user supplied in the meantime; " +
  "and live-model calibration against GPT-5.4-mini for representative prompts.)");

if (failures > 0) {
  console.error(`\n${failures} prerequisite check(s) failed.`);
  process.exit(1);
}
console.log("\nAll deterministic action-prerequisite checks passed.");
