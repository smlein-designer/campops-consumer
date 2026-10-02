import { newId } from "@/lib/id";
import { CAMPSITES } from "@/lib/campsites";
import { questionFor, type PrerequisiteKind } from "@/lib/prerequisites";
import type {
  Candidate,
  EvaluationResult,
  EventActor,
  EventType,
  RequirementTier,
  TaskEvent,
  TripIntent,
} from "@/lib/schemas";

/**
 * Real application events (Handoff Spec 4.1 Activity Log / OOUX EVENT
 * object). Every function here is a pure, deterministic deriver: given the
 * actual before/after state of a real transition, it returns the event(s)
 * that transition produced — zero events if nothing meaningful changed.
 * Nothing here reconstructs history from rendered chat messages.
 */

function makeEvent(
  type: EventType,
  actor: EventActor,
  description: string,
  extra?: {
    relatedIds?: TaskEvent["relatedIds"];
    metadata?: TaskEvent["metadata"];
  },
): TaskEvent {
  return {
    id: newId(),
    type,
    actor,
    description,
    timestamp: Date.now(),
    ...extra,
  };
}

function candidateLabel(c: Candidate): string {
  return `${c.campsite.siteName} at ${c.campsite.campgroundName}`;
}

/**
 * Trip intent established / refined. Fires "trip_established" exactly once
 * per task (the first time intent has real content), "requirement_refined"
 * for any later genuine change, and nothing when intent didn't actually
 * change — never inferred from field counts, driven by a real before/after
 * comparison. Actor is "user": the person describes and changes their own
 * trip through the conversation — CampOps only interprets it.
 */
export function deriveIntentEvent(
  before: TripIntent,
  after: TripIntent,
  alreadyEstablished: boolean,
): TaskEvent | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;

  if (!alreadyEstablished) {
    const summary = after.goalStatement || "a new camping trip";
    return makeEvent(
      "trip_established",
      "user",
      `Started a new trip: ${summary}`,
    );
  }
  return makeEvent(
    "requirement_refined",
    "user",
    "Changed the trip requirements.",
  );
}

export function deriveClarificationRequestedEvent(question: string): TaskEvent {
  return makeEvent("clarification_requested", "agent", `Asked: "${question}"`);
}

export function deriveClarificationResolvedEvent(): TaskEvent {
  return makeEvent(
    "clarification_resolved",
    "user",
    "Answered CampOps' question.",
  );
}

export function deriveUnsupportedEvent(): TaskEvent {
  return makeEvent(
    "unsupported_encountered",
    "user",
    "Asked about something outside campsite booking.",
  );
}

const TIER_LABEL: Record<RequirementTier, string> = {
  hard: "hard requirement",
  flexible: "flexible constraint",
  preference: "preference",
  priority: "priority",
};

/**
 * Direct-manipulation chip removal (distinct from `requirement_refined`,
 * which is the chat-driven merge path) — actor is "user" since this is
 * something the person did directly, not an agent interpretation.
 */
export function deriveRequirementRemovedEvent(tier: RequirementTier, label: string): TaskEvent {
  return makeEvent("requirement_removed", "user", `Removed "${label}" as a ${TIER_LABEL[tier]}.`);
}

/** "Widen search" on the No Match card — a direct user action. */
/** A derived trip-detail chip removed ("In San Antonio", "Capacity for 10",
 * "Available for your dates") — the same requirement_removed event, naming
 * the chip the person removed. */
export function deriveTripDetailRemovedEvent(label: string): TaskEvent {
  return makeEvent("requirement_removed", "user", `Removed "${label}" from the trip.`);
}

/** The user answered the destination question with "anywhere" — the
 * destination constraint was relaxed, not supplied. */
export function deriveDestinationUnconstrainedEvent(): TaskEvent {
  return makeEvent("requirement_widened", "user", "Chose not to limit the search to a destination.");
}

export function deriveRequirementWidenedEvent(label: string): TaskEvent {
  return makeEvent(
    "requirement_widened",
    "user",
    `Widened the search — treated "${label}" as flexible instead of required.`,
  );
}

/** "Checked N campsites" — N is the real considered-set size, not invented. */
export function deriveEvaluationPerformedEvent(
  excludedIds: ReadonlySet<string>,
): TaskEvent {
  const considered = CAMPSITES.filter(
    (c) => c.available && !excludedIds.has(c.id),
  ).length;
  return makeEvent(
    "evaluation_performed",
    "agent",
    `Checked ${considered} campsite${considered === 1 ? "" : "s"}.`,
  );
}

function matchQualifier(kind: "full" | "compromise"): string {
  return kind === "full" ? "a strong match" : "the closest option";
}

function replacementQualifier(kind: "full" | "compromise"): string {
  return kind === "full" ? "a replacement" : "the closest replacement";
}

/** The top candidate from a normal (non-recovery, non-alternative) evaluation. */
export function deriveRecommendationSelectedEvent(
  result: EvaluationResult,
): TaskEvent | null {
  const top = result.candidates[0];
  if (!top || (result.kind !== "full" && result.kind !== "compromise"))
    return null;
  return makeEvent(
    "recommendation_selected",
    "agent",
    `Found ${matchQualifier(result.kind)}: ${candidateLabel(top)}`,
    {
      relatedIds: { campsiteId: top.campsite.id },
    },
  );
}

/** The new top candidate after an availability-loss recovery or a Request Alternative cycle. */
export function deriveReplacementSelectedEvent(
  result: EvaluationResult,
  candidateIndex = 0,
): TaskEvent | null {
  const candidate = result.candidates[candidateIndex];
  if (!candidate || (result.kind !== "full" && result.kind !== "compromise"))
    return null;
  return makeEvent(
    "replacement_selected",
    "agent",
    `Found ${replacementQualifier(result.kind)}: ${candidateLabel(candidate)}`,
    { relatedIds: { campsiteId: candidate.campsite.id } },
  );
}

export function deriveAvailabilityChangedEvent(lost: Candidate): TaskEvent {
  return makeEvent(
    "availability_changed",
    "system",
    `${candidateLabel(lost)} became unavailable.`,
    {
      relatedIds: { campsiteId: lost.campsite.id },
    },
  );
}

export function deriveCandidateExcludedEvent(lost: Candidate): TaskEvent {
  return makeEvent(
    "candidate_excluded",
    "system",
    `Removed ${candidateLabel(lost)} from consideration.`,
    {
      relatedIds: { campsiteId: lost.campsite.id },
    },
  );
}

export function deriveAlternativeRequestedEvent(): TaskEvent {
  return makeEvent(
    "alternative_requested",
    "user",
    "Requested another option.",
  );
}

/** The user cycled back to the first recommendation of the current result
 * set ("Start over with the first option") — same search, same set. */
export function deriveFirstOptionRequestedEvent(candidate: Candidate): TaskEvent {
  return makeEvent(
    "first_option_requested",
    "user",
    `Went back to the first option: ${candidateLabel(candidate)}.`,
    { relatedIds: { campsiteId: candidate.campsite.id } },
  );
}

export function deriveRecommendationAcceptedEvent(
  candidate: Candidate,
): TaskEvent {
  return makeEvent(
    "recommendation_accepted",
    "user",
    `Accepted ${candidateLabel(candidate)}.`,
    {
      relatedIds: { campsiteId: candidate.campsite.id },
    },
  );
}

export function deriveRecommendationRejectedEvent(): TaskEvent {
  return makeEvent(
    "recommendation_rejected",
    "user",
    "Declined the recommendation — search ended.",
  );
}

export function deriveTaskClosedEvent(
  reason: "declined" | "reserved",
): TaskEvent {
  return makeEvent(
    "task_closed",
    "system",
    reason === "reserved"
      ? "Task completed — reservation confirmed."
      : "Search closed.",
  );
}

/**
 * Deterministic Action Prerequisites (2026-09-01) — actor is "system", NOT
 * "agent": the application itself detected that an objectively required
 * structured field is missing before the requested action can proceed.
 * This is never emitted for ordinary model-driven ambiguity (that stays
 * `clarification_requested`, actor "agent") — see the `EventActor`
 * doc comment in schemas.ts.
 */
export function derivePrerequisiteMissingEvent(
  missing: PrerequisiteKind[],
): TaskEvent {
  return makeEvent(
    "prerequisite_missing",
    "system",
    `Needs ${missing.join(" and ").replace(/_/g, " ")} before continuing: "${questionFor(missing)}"`,
    { metadata: { missing: missing.join(",") } },
  );
}

const PREREQUISITE_LABEL: Record<PrerequisiteKind, string> = {
  origin_location: "starting ZIP code",
  check_in_date: "trip dates",
  check_out_date: "trip dates",
  guest_count: "party size",
  destination: "destination",
};

export function derivePrerequisiteResolvedEvent(
  missing: PrerequisiteKind[],
): TaskEvent {
  // Actor "user": the person supplied the missing information.
  const provided = Array.from(new Set(missing.map((kind) => PREREQUISITE_LABEL[kind])));
  return makeEvent(
    "prerequisite_resolved",
    "user",
    `Provided the ${provided.join(" and ")}.`,
    { metadata: { missing: missing.join(",") } },
  );
}

/**
 * Recommendation-readiness gate (src/lib/recommendation-readiness.ts) —
 * actor "system", the same deterministic-refusal shape as
 * `prerequisite_missing`/`prerequisite_resolved`, but a genuinely distinct
 * concept: every deterministic prerequisite was met here, the model judged
 * the request actionable, and the application STILL declined to produce a
 * specific recommendation because there isn't enough structured intent to
 * explain one.
 */
export function deriveRecommendationReadinessInsufficientEvent(): TaskEvent {
  return makeEvent(
    "recommendation_readiness_insufficient",
    "system",
    "Not enough structured intent yet for a non-arbitrary recommendation — asked for more.",
  );
}

export function deriveRecommendationReadinessSatisfiedEvent(): TaskEvent {
  return makeEvent(
    "recommendation_readiness_satisfied",
    "system",
    "Enough is known to make a meaningful recommendation.",
  );
}

/**
 * Active-Recommendation Follow-Up correction (2026-09-05 — see
 * docs/implementation-decisions.md): a factual question about the active
 * candidate was answered from real structured data — TripIntent was NOT
 * touched. Actor "agent": CampOps' own interpretive work (recognizing the
 * question and picking the right fact), distinct from a refinement's
 * `requirement_refined` event, which only fires when intent actually
 * changed.
 */
export function deriveCandidateQuestionAnsweredEvent(
  topic: string,
  candidateLabel: string,
): TaskEvent {
  return makeEvent(
    "candidate_question_answered",
    "agent",
    `Answered a question about ${candidateLabel} (${topic.replace(/_/g, " ")}) — no change to your requirements.`,
  );
}

/** Deterministic relative/holiday date-phrase normalization (src/lib/dates.ts). */
export function deriveDatePhraseNormalizedEvent(
  checkIn: string,
  checkOut: string,
): TaskEvent {
  return makeEvent(
    "date_phrase_normalized",
    "system",
    `Resolved the stated dates to ${checkIn} – ${checkOut}.`,
    { metadata: { checkIn, checkOut } },
  );
}
