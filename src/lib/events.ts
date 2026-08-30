import { CAMPSITES } from "@/lib/campsites";
import type {
  Candidate,
  EvaluationResult,
  EventActor,
  EventType,
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
    id: crypto.randomUUID(),
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
 * comparison.
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
      "agent",
      `Started a new trip: ${summary}`,
    );
  }
  return makeEvent(
    "requirement_refined",
    "agent",
    "Updated trip requirements.",
  );
}

export function deriveClarificationRequestedEvent(question: string): TaskEvent {
  return makeEvent("clarification_requested", "agent", `Asked: "${question}"`);
}

export function deriveClarificationResolvedEvent(): TaskEvent {
  return makeEvent(
    "clarification_resolved",
    "agent",
    "Continued after clarification.",
  );
}

export function deriveUnsupportedEvent(): TaskEvent {
  return makeEvent(
    "unsupported_encountered",
    "agent",
    "Asked about something outside campsite booking.",
  );
}

export function deriveRequirementWidenedEvent(label: string): TaskEvent {
  return makeEvent(
    "requirement_widened",
    "agent",
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
