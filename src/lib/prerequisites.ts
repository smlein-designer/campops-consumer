import { computeDateRange } from "@/lib/dates";
import type { TripIntent } from "@/lib/schemas";

/**
 * Deterministic Action Prerequisites (2026-09-01 slice — see
 * docs/implementation-decisions.md). This is the boundary the standing
 * rules describe as "objectively required action prerequisites are
 * deterministic application rules, not probabilistic model judgments":
 * GPT may phrase the resulting question, but it never decides WHETHER one
 * of these is missing — that is a pure function of structured state.
 *
 * This is deliberately distinct from `IntentInterpretation.status ===
 * "needs_clarification"`, which is the model's own semantic judgment about
 * ordinary ambiguity. Both can produce an Attention Card the user sees as
 * an ordinary question, but the two are never the same underlying event
 * (see `EventType`'s `clarification_requested` vs. `prerequisite_missing`
 * in schemas.ts) and this module never reads or depends on the model's
 * status field.
 *
 * Deliberately NOT a confidence score and NOT inferred from chat copy
 * after the fact — every check here reads only real structured fields
 * (`TripIntent`, or a `Reservation` at its own call site) that the
 * application already owns.
 */

export type PrerequisiteKind =
  | "origin_location"
  | "check_in_date"
  | "check_out_date"
  | "guest_count"
  | "payment_method";

export type PrerequisiteCheckResult =
  | { status: "actionable" }
  | { status: "missing_prerequisites"; missing: PrerequisiteKind[] };

/**
 * Detects a constraint phrased relative to the user's own (unspecified)
 * location — "within an hour of my home", "less than 50 miles from me",
 * "somewhere close to home" — as opposed to a constraint already anchored
 * to a real, named place ("near the lake", "close to downtown Denver"),
 * which needs no origin at all. Deliberately a plain keyword/pattern
 * match, not an LLM judgment: this module must reach the same answer for
 * the same text every time, and must not depend on the model noticing.
 *
 * A false negative here (missing a real self-referential phrasing) is a
 * known POC-level limitation of a keyword approach, not a silent
 * "satisfied" claim — the evaluator's own unrecognized-label path already
 * marks anything it doesn't understand as "unverifiable", never
 * "satisfied", so failing to flag it here does not create a false-positive
 * match, only a missed clarification opportunity.
 */
const SELF_REFERENTIAL_ORIGIN_PATTERN =
  /\b(me|myself|my home|my house|my place|home)\b/i;
const DISTANCE_OR_TRAVEL_TIME_PATTERN =
  /\b(mile|mi\.?|kilometer|km\b|minute|min\.?|hour|hr\.?)s?\b/i;
// A qualitative proximity word ("close to home", "near me") counts too,
// even with no explicit unit — the PRD's own examples include "somewhere
// close to home", which has no "mile"/"hour" in it at all.
const PROXIMITY_WORD_PATTERN = /\b(close|near|nearby|within|far|farther|distance)\b/i;

export function isOriginRelativeDistanceLabel(label: string): boolean {
  if (!SELF_REFERENTIAL_ORIGIN_PATTERN.test(label)) return false;
  return (
    DISTANCE_OR_TRAVEL_TIME_PATTERN.test(label) ||
    PROXIMITY_WORD_PATTERN.test(label)
  );
}

/** Every requirement/constraint/preference/priority label, across all four tiers. */
function allRequirementLabels(intent: TripIntent): string[] {
  return [
    ...intent.hardRequirements,
    ...intent.flexibleConstraints,
    ...intent.preferences,
    ...intent.priorities,
  ];
}

export function hasOriginRelativeDistanceConstraint(
  intent: TripIntent,
): boolean {
  return allRequirementLabels(intent).some(isOriginRelativeDistanceLabel);
}

/**
 * Distinguishes exploratory campground discovery ("what are some quiet
 * campgrounds?", "show me campgrounds with good lake access") from a
 * request for a specific, availability-backed campsite ("find me a
 * campsite", "I need a site for 6 people", or any phrasing that isn't
 * clearly general/plural browsing). Deliberately a plain text heuristic on
 * the user's own raw message — the same kind of POC-scale, documented,
 * deterministic pattern match as `isOriginRelativeDistanceLabel` — not an
 * LLM judgment, and not inferred from the structured TripIntent (which by
 * design normalizes away the very phrasing distinction this needs).
 *
 * Deliberately errs toward the SAFER default: a message must clearly read
 * as a general/plural browsing question to be classified exploratory;
 * anything else (including the reproduced bug's own phrasing, "a campsite
 * for 4 adults... within an hour from my home", which contains no explicit
 * "find me" verb at all) falls through to "availability-backed" — the
 * stricter path that requires dates. Under-blocking (silently treating a
 * real request as mere browsing) is the failure mode this exists to
 * prevent; over-asking for dates on an ambiguous message is the
 * acceptable, safer cost.
 */
export function isExploratoryDiscoveryMessage(message: string): boolean {
  const m = message.toLowerCase();
  const generalQuestionWord = /\b(what|which)\b/.test(m) || m.includes("show me");
  const generalTopic = /\b(campgrounds?|campsites?|places?|spots?|areas?)\b/.test(m);
  const specificAsk =
    /\b(find me|find us|find somewhere|book|reserve|i need|i want|get me|give me)\b/.test(
      m,
    );
  return generalQuestionWord && generalTopic && !specificAsk;
}

/**
 * Search/evaluation prerequisite — ACTION-SENSITIVE, not a global
 * required-fields check (Deterministic Search-Date Prerequisites
 * correction, 2026-09-01 — see docs/implementation-decisions.md).
 *
 * `availabilityBacked: false` (exploratory discovery): no dates required —
 * "what are some quiet campgrounds?" is answerable without them. Still
 * requires an origin if an active constraint needs one to be evaluated at
 * all (a self-referential distance phrase is unverifiable regardless of
 * whether the user is browsing or booking).
 *
 * `availabilityBacked: true` (the default/stricter path — see
 * `isExploratoryDiscoveryMessage`): concrete `checkIn`/`checkOut` are
 * REQUIRED before the deterministic evaluator may produce a specific
 * ranked campsite recommendation at all. This is the fix for the
 * reproduced bug: CampOps was asking for an origin but then silently
 * proceeding straight to a recommendation without ever gating on dates —
 * an availability-backed recommendation implicitly claims "this site is
 * available", which the application cannot honestly claim without knowing
 * what dates it's being asked about.
 *
 * Returns EVERY currently-missing prerequisite together (never just the
 * first one found) — "completing one prerequisite does not make an action
 * actionable while other deterministic prerequisites remain unresolved."
 * The caller may still choose to ask about them one at a time; re-running
 * this function after each answer is what correctly reveals the next one.
 */
/**
 * Whether `intent.checkIn`/`checkOut` are not just non-null strings, but a
 * REAL, resolvable, positive-night date range (Dataset Depth correction,
 * 2026-09-04 — see docs/implementation-decisions.md). A pair of non-null
 * strings that don't actually resolve to calendar dates ("sometime next
 * month", or a genuinely malformed answer) must be treated exactly like
 * "still missing" — deterministic downstream logic (unavailableRanges
 * checks, nights/price derivation, cancellation-cutoff computation) all
 * require a real date range to exist at all.
 */
function hasResolvableDateRange(intent: TripIntent): boolean {
  if (!intent.checkIn || !intent.checkOut) return false;
  return computeDateRange(intent.checkIn, intent.checkOut) !== null;
}

export function checkSearchPrerequisites(
  intent: TripIntent,
  options: { availabilityBacked: boolean },
): PrerequisiteCheckResult {
  const missing: PrerequisiteKind[] = [];
  if (hasOriginRelativeDistanceConstraint(intent) && !intent.originZip) {
    missing.push("origin_location");
  }
  if (options.availabilityBacked && !hasResolvableDateRange(intent)) {
    if (!intent.checkIn) missing.push("check_in_date");
    if (!intent.checkOut) missing.push("check_out_date");
    if (intent.checkIn && intent.checkOut) {
      // Both present but unresolvable — still missing a REAL date, not a
      // structural absence, but the prerequisite kinds are the same either
      // way (the caller doesn't need to distinguish "absent" from
      // "unparsable" to know what to re-ask).
      missing.push("check_in_date", "check_out_date");
    }
  }
  return missing.length > 0
    ? { status: "missing_prerequisites", missing: dedupePrereqs(missing) }
    : { status: "actionable" };
}

function dedupePrereqs(missing: PrerequisiteKind[]): PrerequisiteKind[] {
  return Array.from(new Set(missing));
}

/**
 * Booking-date prerequisite: gates the Accept action itself (staging a
 * reservation), independent of the later guest-count/payment-method gate
 * `computeMissingFields` (src/lib/reservation.ts) already enforces at
 * RESERVE_ATTEMPT. A reservation must never be staged from a candidate the
 * user never actually attached a REAL, resolvable date range to — "Book
 * that one" said about a search whose dates never resolved to real
 * calendar dates must be refused here (Dataset Depth correction,
 * 2026-09-04 — `stageReservation` now derives nights/price/cancellation
 * cutoff from this exact range and throws if it can't).
 */
export function checkBookingDatePrerequisites(
  intent: TripIntent,
): PrerequisiteCheckResult {
  if (hasResolvableDateRange(intent)) return { status: "actionable" };
  const missing: PrerequisiteKind[] = [];
  if (!intent.checkIn) missing.push("check_in_date");
  if (!intent.checkOut) missing.push("check_out_date");
  if (intent.checkIn && intent.checkOut) missing.push("check_in_date", "check_out_date");
  return { status: "missing_prerequisites", missing: dedupePrereqs(missing) };
}

/**
 * Date-question wording differs by WHICH action is asking, not because the
 * underlying prerequisite differs — a search asks in search terms
 * ("planning to camp"), a booking asks in reservation terms ("check-in and
 * check-out ... for this reservation"). Both resolve the exact same
 * `checkIn`/`checkOut` TripIntent fields.
 */
const DATE_QUESTIONS: Record<"search" | "booking", string> = {
  search: "What dates are you planning to camp?",
  booking: "What check-in and check-out dates should I use for this reservation?",
};

/**
 * Loop-protection follow-up (Search Truth correction, 2026-09-02 — see
 * docs/implementation-decisions.md): shown instead of the generic date
 * question once the user has already made an apparent attempt to answer it
 * (see `looksLikeDateAttempt` in src/lib/dates.ts) that didn't resolve to a
 * concrete date. Repeating the identical generic question after that would
 * read as CampOps not having heard the answer at all; asking something more
 * specific signals the parsing gap honestly instead of looping.
 */
const DATE_FOLLOWUP_QUESTIONS: Record<"search" | "booking", string> = {
  search:
    "I couldn't quite pin down exact dates from that — could you give me a specific check-in and check-out (e.g. \"Sept 12 to Sept 14\"), or a recognized phrase like \"Labor Day weekend\" or \"this weekend\"?",
  booking:
    "I still need exact check-in and check-out dates to book this — could you give me specific dates (e.g. \"Sept 12 to Sept 14\")?",
};

const PREREQUISITE_QUESTIONS: Record<
  Exclude<PrerequisiteKind, "check_in_date" | "check_out_date">,
  string
> = {
  origin_location: "What ZIP code should I use as your starting point?",
  guest_count: "How many guests is this trip for?",
  payment_method: "What payment method should I use?",
};

/**
 * Deterministic, factual question text for a missing-prerequisite result —
 * never model-phrased. Returns the question for the FIRST missing
 * prerequisite in `missing`'s own order (callers/checkers order that array
 * so origin comes before dates, matching "collect them sequentially" —
 * ZIP first, then dates, per the reproduced flow's expected behavior).
 *
 * `dateAttempt` (default 0): how many times a date-like answer has already
 * failed to resolve for THIS same missing-date ask (see `looksLikeDateAttempt`
 * / the caller's own attempt counter). 0 or 1 use the normal question; 2+
 * switches to the more specific loop-protection follow-up.
 */
export function questionFor(
  missing: PrerequisiteKind[],
  context: "search" | "booking" = "search",
  dateAttempt = 0,
): string {
  const first = missing[0];
  if (!first) return "Could you provide a bit more information?";
  if (first === "check_in_date" || first === "check_out_date") {
    return dateAttempt >= 2 ? DATE_FOLLOWUP_QUESTIONS[context] : DATE_QUESTIONS[context];
  }
  return PREREQUISITE_QUESTIONS[first];
}
