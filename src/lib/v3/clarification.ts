import { computeDateRange, normalizeDatePhrase } from "@/lib/dates";
import { parsePartySizeAnswer } from "@/lib/prerequisites";
import type { PrerequisiteKind, V3TripIntent } from "@/lib/v3/schemas";

/**
 * Deterministic conversational gates, ported from v2 (src/lib/prerequisites.ts,
 * src/lib/recommendation-readiness.ts) and adapted to v3's simpler
 * must/nice TripIntent. These are distinct from the model's own
 * needs_clarification judgment (Build Brief standing rule: "objectively
 * required action prerequisites are deterministic application rules, not
 * probabilistic model judgments") — GPT phrases requirement labels, but
 * never decides whether a date or a party size is missing.
 */

export { parsePartySizeAnswer };

export type PrerequisiteCheckResult =
  | { status: "actionable" }
  | { status: "missing_prerequisites"; missing: PrerequisiteKind[] };

function hasResolvableDateRange(intent: V3TripIntent): boolean {
  if (!intent.checkIn || !intent.checkOut) return false;
  return computeDateRange(intent.checkIn, intent.checkOut) !== null;
}

/**
 * Everything a held booking objectively needs apart from payment: real
 * resolvable dates, and a party size. Checked regardless of what the model's
 * own status says — an objectively missing field is an application fact.
 */
export function checkTripPrerequisites(intent: V3TripIntent): PrerequisiteCheckResult {
  const missing: PrerequisiteKind[] = [];
  if (!hasResolvableDateRange(intent)) {
    if (!intent.checkIn) missing.push("check_in_date");
    if (!intent.checkOut) missing.push("check_out_date");
    if (intent.checkIn && intent.checkOut) missing.push("check_in_date", "check_out_date");
  }
  if (!intent.adults || intent.adults < 1) missing.push("party_size");
  return missing.length > 0
    ? { status: "missing_prerequisites", missing: Array.from(new Set(missing)) }
    : { status: "actionable" };
}

const DATE_QUESTION = "What dates are you planning to camp?";
const DATE_FOLLOWUP_QUESTION =
  'I couldn\'t quite pin down exact dates from that — could you give me a specific check-in and check-out (e.g. "Apr 16 to Apr 18"), or a recognized phrase like "Labor Day weekend" or "this weekend"?';
const PARTY_SIZE_QUESTION = "How many people are camping?";

/**
 * Deterministic, factual question text for a missing-prerequisite result —
 * never model-phrased. `dateAttempt` (ported from v2's loop-protection
 * follow-up): 0/1 use the normal date question; 2+ switches to a more
 * specific follow-up instead of repeating the same question verbatim.
 */
export function questionFor(missing: PrerequisiteKind[], dateAttempt = 0): string {
  const first = missing[0];
  if (!first) return "Could you provide a bit more information?";
  if (first === "check_in_date" || first === "check_out_date") {
    return dateAttempt >= 2 ? DATE_FOLLOWUP_QUESTION : DATE_QUESTION;
  }
  return PARTY_SIZE_QUESTION;
}

/**
 * Resolves a recognized relative/holiday date phrase (e.g. "Labor Day
 * weekend") in checkIn/checkOut into concrete dates before any prerequisite
 * is checked, so a recognized phrase is never treated as "still missing."
 * An unrecognized phrase is left exactly as the model returned it.
 */
export function normalizeIntentDates(intent: V3TripIntent): { intent: V3TripIntent; normalized: boolean } {
  const source = intent.checkIn || intent.checkOut;
  if (!source) return { intent, normalized: false };
  const resolved = normalizeDatePhrase(source);
  if (!resolved) return { intent, normalized: false };
  if (intent.checkIn === resolved.checkIn && intent.checkOut === resolved.checkOut) {
    return { intent, normalized: false };
  }
  return { intent: { ...intent, checkIn: resolved.checkIn, checkOut: resolved.checkOut }, normalized: true };
}

export type ReadinessResult = { status: "ready" } | { status: "insufficient"; question: string };

const READINESS_QUESTION =
  "To recommend a specific site, tell me a bit more — a starting ZIP or how far you're willing to drive, or what matters most for the trip (quiet, pet-friendly, on the water, and so on).";

/**
 * The third gate (ported from v2's recommendation-readiness.ts): even once
 * the model considers the request actionable and every prerequisite is met,
 * refuses to hand back a specific recommendation built from dates alone —
 * "Find me somewhere to camp" plus dates is not enough to explain a pick.
 * Party size is deliberately NOT a readiness signal here — v3's
 * checkTripPrerequisites already requires it before this gate ever runs
 * (unlike v2, where party size is a BOOKING prerequisite, not a search
 * one), so treating it as a readiness dimension too would make this gate
 * unreachable.
 */
export function checkRecommendationReadiness(intent: V3TripIntent): ReadinessResult {
  const hasTripCharacter = intent.requirements.length > 0;
  const hasOrigin = !!intent.originZip || intent.driveLimitHours != null;
  if (hasTripCharacter || hasOrigin) return { status: "ready" };
  return { status: "insufficient", question: READINESS_QUESTION };
}

/**
 * Deterministic detector for "show me another option" / "I don't like this
 * site" (ported from v2's candidate-cycling intent, adapted to v3's
 * hold-first model — see requestAlternativeCampsite in agent-loop.ts).
 * Checked before the message is ever sent to the model, same priority as
 * v2's candidate-question detection.
 */
const ALTERNATIVE_REQUEST_PATTERN =
  /\b(another option|a different (site|campsite|campground|spot|place)|something else|don'?t like (this|it)|try again|somewhere else)\b/i;

export function isAlternativeRequestMessage(message: string): boolean {
  return ALTERNATIVE_REQUEST_PATTERN.test(message);
}

/**
 * Deterministic detector for an explicit, NAMED campsite switch ("Let's
 * switch to Prairie Flats", "Change to Cedar Point instead") — distinct
 * from isAlternativeRequestMessage, which only ever means "show me the
 * next ranked option," never a specific site the user already has in
 * mind. Checked before the message reaches the model, same priority as
 * the other deterministic detectors. Returns the matched campsite's id,
 * or null if the message isn't this kind of request or names no real
 * site. Among same-named campgrounds (several sites can share one), the
 * caller's own candidate list decides which one wins.
 */
const NAMED_SWITCH_PATTERN =
  /\b(switch (?:to|campsites? to)|let'?s (?:switch|go|do|try)|change (?:to|campsites? to)|i'?d rather (?:have|stay at|go with))\b/i;

export function isNamedCampsiteSwitchMessage(message: string): boolean {
  return NAMED_SWITCH_PATTERN.test(message);
}

export function matchNamedCampsite<T extends { campgroundName: string }>(message: string, candidates: T[]): T | null {
  const lower = message.toLowerCase();
  return candidates.find((c) => lower.includes(c.campgroundName.toLowerCase())) ?? null;
}
