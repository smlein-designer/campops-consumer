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
  | "destination";

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
  options: {
    availabilityBacked: boolean;
    // Facts the user has explicitly told CampOps to stop assuming (removing
    // a destination or party-size chip): the search waits for a new value
    // instead of running without one. Not required for a fresh request.
    required?: PrerequisiteKind[];
  },
): PrerequisiteCheckResult {
  const missing: PrerequisiteKind[] = [];
  if (hasOriginRelativeDistanceConstraint(intent) && !intent.originZip) {
    missing.push("origin_location");
  }
  if (options.required?.includes("destination") && !intent.destinationRegion) {
    missing.push("destination");
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
  if (options.required?.includes("guest_count") && !intent.guestCount) {
    missing.push("guest_count");
  }
  return missing.length > 0
    ? { status: "missing_prerequisites", missing: dedupePrereqs(missing) }
    : { status: "actionable" };
}

/** The search prerequisites that exist only because the user removed them
 * (see `checkSearchPrerequisites`' `required`) — carried in the pending
 * missing list itself until the user supplies a new value. */
export function explicitSearchRequirements(missing: PrerequisiteKind[] | null): PrerequisiteKind[] {
  return (missing ?? []).filter((kind) => kind === "destination" || kind === "guest_count");
}

function dedupePrereqs(missing: PrerequisiteKind[]): PrerequisiteKind[] {
  return Array.from(new Set(missing));
}

/**
 * Booking prerequisites: gate the Choose action itself (staging a
 * reservation). The reservation flow is not a requirements-gathering
 * surface — everything a valid reservation needs apart from payment (a
 * REAL, resolvable date range and the party size) is resolved here, in the
 * conversation, before staging can happen at all. Dates come first, then
 * party size, matching the order the questions are asked in.
 */
export function checkBookingPrerequisites(
  intent: TripIntent,
): PrerequisiteCheckResult {
  const missing: PrerequisiteKind[] = [];
  if (!hasResolvableDateRange(intent)) {
    if (!intent.checkIn) missing.push("check_in_date");
    if (!intent.checkOut) missing.push("check_out_date");
    if (intent.checkIn && intent.checkOut) missing.push("check_in_date", "check_out_date");
  }
  if (!intent.guestCount || intent.guestCount < 1) missing.push("guest_count");
  return missing.length > 0
    ? { status: "missing_prerequisites", missing: dedupePrereqs(missing) }
    : { status: "actionable" };
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
  Exclude<PrerequisiteKind, "check_in_date" | "check_out_date" | "guest_count">,
  string
> = {
  origin_location: "What ZIP code should I use as your starting point?",
  destination: "Where would you like to search instead?",
};

const PARTY_SIZE_QUESTIONS: Record<"search" | "booking", string> = {
  search: "How many people are camping?",
  booking: "How many people are camping? I need the party size to reserve this site.",
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
  if (first === "guest_count") return PARTY_SIZE_QUESTIONS[context];
  return PREREQUISITE_QUESTIONS[first];
}

const PARTY_SIZE_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/**
 * Reads a party size out of a reply to the party-size question ("4",
 * "4 people", "four of us", "just me"). A deterministic backstop for the
 * interpreter, which isn't told which question was asked and may leave a
 * bare number unmapped. Returns null when no size is recognizable — the
 * question is then simply asked again.
 */
export function parsePartySizeAnswer(message: string): number | null {
  const m = message.toLowerCase();
  if (/\b(just|only) me\b|\bsolo\b|\bby myself\b/.test(m)) return 1;
  const digits = m.match(/\b(\d{1,2})\b/);
  if (digits) {
    const n = Number(digits[1]);
    return n >= 1 ? n : null;
  }
  const word = m.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
  return word ? PARTY_SIZE_WORDS[word[1]] : null;
}

/**
 * Whether a reply to "Where would you like to search instead?" says location
 * doesn't matter ("Anywhere", "I don't care", "No preference"). The trip
 * model has no "unconstrained" value for the interpreter to return, so —
 * like `parsePartySizeAnswer` — this is a small deterministic reading of
 * the answer, used only right after that question. An unconstrained
 * destination is simply a null `destinationRegion` that is no longer being
 * asked for: the same state a fresh broad request has.
 */
export function isUnconstrainedDestinationAnswer(message: string): boolean {
  const m = message.toLowerCase().replace(/[’']/g, "");
  return /\b(anywhere|any ?where|wherever|dont care|do not care|no preference|doesnt matter|does not matter|any (location|place|area|region)|not picky|open to anything|surprise me)\b/.test(m);
}
