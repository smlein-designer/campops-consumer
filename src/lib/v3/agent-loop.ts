import { computeDateRange, looksLikeDateAttempt } from "@/lib/dates";
import { evaluateCampsites } from "@/lib/evaluate";
import { newId } from "@/lib/id";
import {
  checkRecommendationReadiness,
  checkTripPrerequisites,
  normalizeIntentDates,
  parsePartySizeAnswer,
  questionFor,
} from "@/lib/v3/clarification";
import { summarizeNoMatch, widenSearch } from "@/lib/v3/no-match";
import { buildCandidateFit } from "@/lib/v3/fit";
import { buildRefinementAcknowledgment, diffAddedRequirements } from "@/lib/v3/refinement";
import { activityTypesRequested, ACTIVITY_TYPE_LABEL } from "@/lib/v3/activity-match";
import { checkActivityOverlap } from "@/lib/v3/rules-dependency";
import { checkPermission } from "@/lib/v3/rules-permission";
import { suggestionFor } from "@/lib/v3/rules-suggestion";
import { ACTIVITIES_BY_ID, activitiesNear } from "@/lib/v3/providers";
import { activityBookingPrice } from "@/lib/v3/money";
import { toV2SearchIntent } from "@/lib/v3/search-adapter";
import { V3IntentExtractionSchema, type V3IntentExtraction } from "@/lib/v3/intent-schema";
import type {
  ActivityType,
  Booking,
  NeedsYouItem,
  Trip,
  TripPlanStep,
  TripRequirement,
} from "@/lib/v3/schemas";

/**
 * The agent loop (Build Brief §9): a deterministic planner that calls the
 * model only at the edges (interpret, phrase). Split for testability:
 * `applyTurn` is the pure deterministic core (no network — unit-testable
 * against a given extraction); `runAgentTurn` is the thin impure wrapper
 * that calls the intent-extraction API and then `applyTurn`.
 *
 * Behavioral-parity port (v2 -> v3, see docs on the three deterministic
 * gates below): v2's conversational depth (src/app/page.tsx,
 * src/lib/prerequisites.ts, recommendation-readiness.ts,
 * refinement-acknowledgment.ts, no-match.ts, candidate-facts.ts) is ported
 * here, adapted to v3's simpler must/nice Trip model and its hold-first
 * (rather than shop-then-choose) booking flow. Destination-region and
 * family-composition inference (src/lib/geography.ts, family-inference.ts)
 * are deliberately NOT ported — v3's TripIntent has no destinationRegion or
 * travelingWithChildren concept to inform.
 */

// Demo hold length (Build Brief §17: 15-30 min, shortened in demo mode;
// the "shortened" knob itself is the demo panel, stage 7).
const HOLD_MINUTES = 20;
// This POC always plans for a fixed Apr 16-18 trip; a party size the model
// hasn't yet extracted defaults to the golden-path size of 4.
const DEFAULT_PARTY_SIZE = 4;
const DEFAULT_NIGHTS = 2;

export function mergeRequirements(
  existing: TripRequirement[],
  extracted: { label: string; tier: "must" | "nice" }[],
): TripRequirement[] {
  const merged = [...existing];
  for (const item of extracted) {
    const key = item.label.trim().toLowerCase();
    const i = merged.findIndex((r) => r.label.trim().toLowerCase() === key);
    if (i >= 0) {
      merged[i] = { ...merged[i], tier: item.tier };
    } else {
      merged.push({ id: newId(), label: item.label.trim(), tier: item.tier, source: "you said", changed: false });
    }
  }
  return merged;
}

export function buildPlan(requirements: TripRequirement[]): TripPlanStep[] {
  const types = activityTypesRequested(requirements.map((r) => r.label));
  const steps: TripPlanStep[] = [
    { id: "step-campsite", label: "Find a campsite", detail: "", status: "pending" },
  ];
  for (const type of types) {
    steps.push({
      id: `step-activity-${type}`,
      label: ACTIVITY_TYPE_LABEL[type],
      detail: "",
      status: "pending",
    });
  }
  return steps;
}

function stepStatus(plan: TripPlanStep[], id: string) {
  return plan.find((s) => s.id === id)?.status ?? "pending";
}

function setStep(plan: TripPlanStep[], id: string, patch: Partial<TripPlanStep>): TripPlanStep[] {
  return plan.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function bookedActivityRefs(bookings: Booking[]) {
  return bookings.filter((b) => b.kind === "activity" && b.status === "held");
}

/**
 * Releases a booking and everything that transitively depends on it (an
 * activity depends on its campsite) — used when a newly added requirement
 * conflicts with an already-held campsite, so the plan can search and hold
 * fresh. Ported from the same cascade src/lib/v3/authorize.ts's
 * removeBooking uses, but agent-initiated (actor "CampOps") rather than a
 * user removal.
 */
function releaseBookingAndDependents(trip: Trip, bookingId: string, now: number): Trip {
  const toRelease = new Set<string>([bookingId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of trip.bookings) {
      if (!toRelease.has(b.id) && b.dependsOn.some((depId) => toRelease.has(depId))) {
        toRelease.add(b.id);
        changed = true;
      }
    }
  }
  const released = trip.bookings.filter((b) => toRelease.has(b.id));
  const releasedStepIds = new Set(
    released.map((b) =>
      b.kind === "campsite" ? "step-campsite" : `step-activity-${ACTIVITIES_BY_ID[b.refId]?.type}`,
    ),
  );
  return {
    ...trip,
    bookings: trip.bookings.filter((b) => !toRelease.has(b.id)),
    holds: trip.holds.filter((h) => !toRelease.has(h.bookingId)),
    plan: trip.plan.map((s) => (releasedStepIds.has(s.id) ? { ...s, status: "pending" as const, detail: "" } : s)),
    events: [
      ...trip.events,
      ...released.map((b) => ({
        id: newId(),
        timestamp: now,
        what: `Released ${b.title} — a new requirement meant it no longer fit.`,
        permissionId: null,
        actor: "CampOps" as const,
        kind: "change" as const,
      })),
    ],
  };
}

export type TurnCheckpoint = { trip: Trip; facts: string[] };

/**
 * Advances the plan as far as it can go without a decision — the shared
 * executor behind a fresh user turn, a widened search, or any other direct
 * state change that should resume the plan. Never calls the model. Returns
 * `checkpoints` the same way `applyTurn` does, seeded with `leadingFacts` in
 * its first beat (e.g. a widen-search or refinement acknowledgment).
 */
export function continueTrip(
  trip: Trip,
  now: number,
  leadingFacts: string[] = [],
): { trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] } {
  const facts: string[] = [...leadingFacts];
  const checkpoints: TurnCheckpoint[] = [];
  let factsCheckpointed = 0;
  function checkpoint() {
    checkpoints.push({ trip: next, facts: facts.slice(factsCheckpointed) });
    factsCheckpointed = facts.length;
  }

  let next: Trip = {
    ...trip,
    plan: buildPlan(trip.intent.requirements).map((fresh) => {
      const existing = trip.plan.find((s) => s.id === fresh.id);
      return existing ? { ...fresh, status: existing.status, detail: existing.detail } : fresh;
    }),
  };
  // First beat: "What I heard" + "My plan" become visible before anything
  // is searched or held (Handoff Spec §4.1 "Start · After First Message").
  next = { ...next, agent: { ...next.agent, working: true, phase: "searching", currentStepText: "Looking at what you're after" } };
  checkpoint();

  let blocked = false;

  // Step 1: find a campsite.
  let heldCampsiteBooking = next.bookings.find((b) => b.kind === "campsite" && b.status === "held");
  if (!heldCampsiteBooking && stepStatus(next.plan, "step-campsite") !== "done") {
    next = { ...next, plan: setStep(next.plan, "step-campsite", { status: "active" }) };
    const v2Intent = toV2SearchIntent(next.intent);
    const result = evaluateCampsites(v2Intent);
    next = {
      ...next,
      events: [
        ...next.events,
        { id: newId(), timestamp: now, what: "Searched for a matching campsite.", permissionId: null, actor: "CampOps", kind: "search" },
      ],
    };
    // evaluateCampsites always returns candidates, even for "no_match"
    // (the closest sites, shown for transparency per src/lib/evaluate.ts) —
    // never presented as a confident recommendation, so the KIND decides
    // whether to hold, never just whether a candidate exists. `candidateIndex`
    // (ported from v2's candidate cycling) picks which ranked candidate —
    // requestAlternativeCampsite advances it to hold the next-best option.
    const top = result.kind !== "no_match" ? result.candidates[next.candidateIndex ?? 0]?.campsite : undefined;
    if (!top) {
      // No-Match recovery (ported from v2's src/lib/no-match.ts): names the
      // specific failing requirement(s) instead of a generic "nothing fits."
      facts.push(summarizeNoMatch(result));
      const closest = result.candidates[0]?.campsite;
      next = {
        ...next,
        needsYouQueue: [...next.needsYouQueue, {
          id: newId(),
          eyebrow: "No campsite fits every must-have",
          message: "Want me to widen the search, or adjust a requirement?",
          primaryLabel: "Widen search",
          kind: "no_match",
        }],
        // Compromise visibility (PRD v3 §5.4 "must name any must-have that
        // is missed") — the closest option, shown for transparency, with
        // exactly what it fails to satisfy.
        campsiteComparison: closest
          ? {
              id: newId(),
              recommended: {
                eyebrow: "Closest option",
                title: `${closest.campgroundName} · ${closest.siteName}`,
                facts: [],
                fit: buildCandidateFit(result, closest.id, next.intent),
                reason: "No site currently satisfies every must-have.",
              },
            }
          : null,
      };
      blocked = true;
      checkpoint();
    } else {
      next = { ...next, campsiteComparison: null };
      const dateRange = computeDateRange(next.intent.checkIn || "Apr 16", next.intent.checkOut || "Apr 18");
      const nights = dateRange?.nights ?? DEFAULT_NIGHTS;
      const price = Math.round((top.pricePerNight * nights + top.serviceFee) * 100) / 100;
      const decision = checkPermission(next.permissions, { type: "hold", refundable: true, amountUsd: price });
      if (decision.result === "allow") {
        const holdId = newId();
        const bookingId = "b-campsite";
        const booking: Booking = {
          id: bookingId,
          kind: "campsite",
          refId: top.id,
          title: `${top.campgroundName} · ${top.siteName}`,
          day: `${next.intent.checkIn || "Apr 16"}-${(next.intent.checkOut || "Apr 18").replace(/^.* /, "")}`,
          price,
          refundTerms: `Fully refundable until ${nights} night(s) before`,
          dependsOn: [],
          status: "held",
          holdId,
        };
        next = {
          ...next,
          bookings: [...next.bookings, booking],
          holds: [...next.holds, { id: holdId, bookingId, expiresAt: now + HOLD_MINUTES * 60_000, refundable: true, placedUnderPermissionId: decision.permissionId }],
          plan: setStep(next.plan, "step-campsite", { status: "done", detail: `${booking.title} — held` }),
          events: [...next.events, { id: newId(), timestamp: now, what: `Held ${booking.title} for $${price}.`, permissionId: decision.permissionId, actor: "CampOps", kind: "hold" }],
        };
        facts.push(`Held ${booking.title} for $${price}.`);
        heldCampsiteBooking = booking;
        checkpoint();
      } else {
        next = { ...next, needsYouQueue: [...next.needsYouQueue, {
          id: newId(),
          eyebrow: "Asking before holding",
          message: `Hold ${top.campgroundName}, ${top.siteName} for $${price}?`,
          primaryLabel: `Hold · $${price}`,
        }] };
        facts.push(`Found ${top.campgroundName}, ${top.siteName} for $${price} — asking before holding it.`);
        blocked = true;
        checkpoint();
      }
    }
  }

  // Activity steps, in plan order, only once the campsite is held.
  if (heldCampsiteBooking && !blocked) {
    const campsite = evaluateCampsites(toV2SearchIntent(next.intent)).candidates.find(
      (c) => c.campsite.id === heldCampsiteBooking!.refId,
    )?.campsite;
    for (const step of next.plan) {
      if (blocked) break;
      if (!step.id.startsWith("step-activity-") || step.status === "done") continue;
      const type = step.id.replace("step-activity-", "") as ActivityType;
      next = { ...next, plan: setStep(next.plan, step.id, { status: "active" }) };
      if (!campsite) break;

      const options = activitiesNear(campsite).filter((a) => a.type === type);
      const activity = options[0];
      if (!activity) {
        next = { ...next, plan: setStep(next.plan, step.id, { status: "done", detail: "Not available at this campsite" }) };
        facts.push(`${ACTIVITY_TYPE_LABEL[type]} isn't available at ${campsite.campgroundName} — skipping it.`);
        checkpoint();
        continue;
      }

      const existingBooked = bookedActivityRefs(next.bookings)
        .map((b) => ({ activity: ACTIVITIES_BY_ID[b.refId], slotIndex: 0 }))
        .filter((e) => e.activity && e.activity.id !== activity.id);
      let slotIndex = 0;
      const overlap = checkActivityOverlap(activity, 0, existingBooked);
      if (overlap.result === "conflict") {
        if (overlap.alternativeSlotIndex != null) {
          slotIndex = overlap.alternativeSlotIndex;
        } else {
          next = { ...next, needsYouQueue: [...next.needsYouQueue, {
            id: newId(),
            eyebrow: "Two activities would overlap",
            message: `${activity.name} overlaps ${overlap.conflictingWith.name}. Which slot would you like to keep?`,
            primaryLabel: "Keep current plan",
          }] };
          facts.push(`${activity.name} overlaps ${overlap.conflictingWith.name} — asking which to keep.`);
          blocked = true;
          checkpoint();
          continue;
        }
      }

      const slot = activity.slots[slotIndex];
      const price = activityBookingPrice(activity, next.intent.adults || DEFAULT_PARTY_SIZE);
      const decision = checkPermission(next.permissions, { type: "hold", refundable: true, amountUsd: price });
      if (decision.result === "allow") {
        const holdId = newId();
        const bookingId = `b-activity-${activity.id}`;
        const booking: Booking = {
          id: bookingId,
          kind: "activity",
          refId: activity.id,
          title: activity.name,
          day: slot.date,
          time: `${slot.startTime}-${slot.endTime}`,
          price,
          refundTerms: activity.refundTerms,
          dependsOn: [heldCampsiteBooking.id],
          status: "held",
          holdId,
        };
        next = {
          ...next,
          bookings: [...next.bookings, booking],
          holds: [...next.holds, { id: holdId, bookingId, expiresAt: now + HOLD_MINUTES * 60_000, refundable: true, placedUnderPermissionId: decision.permissionId }],
          plan: setStep(next.plan, step.id, { status: "done", detail: `${booking.title} — held` }),
          events: [...next.events, { id: newId(), timestamp: now, what: `Held ${booking.title} for $${price}.`, permissionId: decision.permissionId, actor: "CampOps", kind: "hold" }],
        };
        facts.push(`Held ${booking.title} for $${price}.`);
        checkpoint();
      } else {
        next = { ...next, needsYouQueue: [...next.needsYouQueue, {
          id: newId(),
          eyebrow: "Asking before holding",
          message: `Hold ${activity.name} for $${price}?`,
          primaryLabel: `Hold · $${price}`,
        }] };
        facts.push(`Found ${activity.name} for $${price} — asking before holding it.`);
        blocked = true;
        checkpoint();
      }
    }
  }

  const allDone = next.plan.every((s) => s.status === "done");
  if (blocked || next.needsYouQueue.length > 0) {
    next = { ...next, agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "One item needs a decision" } };
    checkpoint();
  } else if (allDone) {
    // Natural pause: at most one suggestion, never mid-decision (Build Brief §10).
    if (heldCampsiteBooking) {
      const campsite = evaluateCampsites(toV2SearchIntent(next.intent)).candidates.find(
        (c) => c.campsite.id === heldCampsiteBooking!.refId,
      )?.campsite;
      if (campsite) {
        const suggestion = suggestionFor({
          campsite,
          dismissedTypes: next.dismissedSuggestionTypes,
          permissions: next.permissions,
          hasPendingDecision: false,
          bookedActivityIds: next.bookings.filter((b) => b.kind === "activity").map((b) => b.refId),
        });
        if (suggestion && !next.suggestions.some((s) => s.id === suggestion.id)) {
          next = { ...next, suggestions: [...next.suggestions, suggestion] };
        }
      }
    }
    next = {
      ...next,
      agent: { ...next.agent, working: false, phase: "complete", currentStepText: "Everything is held · ready to book" },
    };
    facts.push("Everything is held · ready to book.");
    checkpoint();
  } else {
    next = { ...next, agent: { ...next.agent, working: true, phase: "holding", currentStepText: "Working through the plan" } };
    checkpoint();
  }

  return { trip: next, factsToPhrase: facts, checkpoints };
}

/**
 * The deterministic planner/executor core — no network calls. Given the
 * current Trip, this turn's structured extraction, and the raw user
 * message, advances the plan as far as it can go without a decision,
 * stopping at the first thing that needs the user (never more than one
 * Needs You item at a time, Handoff Spec §2.3).
 *
 * Runs the three deterministic gates ported from v2, in the SAME order v2
 * checks them (src/app/page.tsx's submitMessage):
 *   1. Deterministic prerequisites (dates, party size) — an objective
 *      application fact, never the model's call to make.
 *   2. The model's own semantic judgment (needs_clarification).
 *   3. Recommendation readiness — even once 1 and 2 are satisfied, refuses
 *      to hand back a specific recommendation built from dates alone.
 * All three are skipped once a campsite has already been resolved (held or
 * further along) — they exist only to protect the FIRST recommendation.
 */
export function applyTurn(
  trip: Trip,
  extraction: V3IntentExtraction,
  now: number,
  userMessage = "",
): { trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] } {
  // An unsupported turn must never touch the active trip intent, regardless
  // of what else the model's extraction happened to contain — enforced here
  // in code, before any merge, the same deterministic guard v2 applies
  // (src/app/page.tsx's own "unsupported" branch).
  if (extraction.status === "unsupported") {
    const fact = extraction.unsupportedReason ?? "CampOps can't help with that part of the request.";
    const unsupported: Trip = { ...trip, agent: { ...trip.agent, working: false, phase: "awaiting_user" } };
    return { trip: unsupported, factsToPhrase: [fact], checkpoints: [{ trip: unsupported, facts: [fact] }] };
  }

  const priorRequirements = trip.intent.requirements;

  // Party-size backstop (ported from v2): if the last turn specifically
  // asked for party size and the model still didn't extract adults, read a
  // bare reply ("4", "just me") deterministically.
  let adults = extraction.adults ?? trip.intent.adults;
  if (trip.pendingPrerequisite?.missing[0] === "party_size" && !adults) {
    adults = parsePartySizeAnswer(userMessage) ?? adults;
  }

  let next: Trip = {
    ...trip,
    intent: {
      ...trip.intent,
      checkIn: extraction.checkIn ?? trip.intent.checkIn,
      checkOut: extraction.checkOut ?? trip.intent.checkOut,
      adults,
      pets: extraction.pets ?? trip.intent.pets,
      originZip: extraction.originZip ?? trip.intent.originZip,
      driveLimitHours: extraction.driveLimitHours ?? trip.intent.driveLimitHours,
      budgetUsd: extraction.budgetUsd ?? trip.intent.budgetUsd,
      requirements: mergeRequirements(trip.intent.requirements, extraction.requirements),
    },
  };

  // Deterministic relative/holiday date-phrase normalization — resolve a
  // recognized phrase ("Labor Day weekend") before any date prerequisite is
  // checked, so a recognized phrase is never treated as "still missing."
  next = { ...next, intent: normalizeIntentDates(next.intent).intent };

  const campsiteAlreadyResolved = next.bookings.some((b) => b.kind === "campsite");

  if (!campsiteAlreadyResolved) {
    const prereq = checkTripPrerequisites(next.intent);
    if (prereq.status === "missing_prerequisites") {
      const stillMissingDates = prereq.missing.includes("check_in_date") || prereq.missing.includes("check_out_date");
      const priorAttempts = trip.pendingPrerequisite?.dateAskAttempts ?? 0;
      const attempt = stillMissingDates ? (looksLikeDateAttempt(userMessage) ? priorAttempts + 1 : priorAttempts) : 0;
      const fact = questionFor(prereq.missing, attempt);
      next = {
        ...next,
        pendingPrerequisite: { missing: prereq.missing, dateAskAttempts: attempt },
        agent: { ...next.agent, working: false, phase: "awaiting_user" },
      };
      return { trip: next, factsToPhrase: [fact], checkpoints: [{ trip: next, facts: [fact] }] };
    }
    if (next.pendingPrerequisite) next = { ...next, pendingPrerequisite: null };

    if (extraction.status === "needs_clarification") {
      const question = extraction.clarificationQuestion ?? "Could you say a bit more about what you're looking for?";
      next = {
        ...next,
        clarifyingQuestion:
          extraction.clarificationOptions && extraction.clarificationOptions.length > 0
            ? { id: newId(), question, options: extraction.clarificationOptions }
            : null,
        agent: { ...next.agent, working: false, phase: "awaiting_user" },
      };
      return { trip: next, factsToPhrase: [question], checkpoints: [{ trip: next, facts: [question] }] };
    }
    if (next.clarifyingQuestion) next = { ...next, clarifyingQuestion: null };

    const readiness = checkRecommendationReadiness(next.intent);
    if (readiness.status === "insufficient") {
      next = { ...next, pendingReadiness: true, agent: { ...next.agent, working: false, phase: "awaiting_user" } };
      return { trip: next, factsToPhrase: [readiness.question], checkpoints: [{ trip: next, facts: [readiness.question] }] };
    }
    if (next.pendingReadiness) next = { ...next, pendingReadiness: false };
  } else if (extraction.status === "needs_clarification") {
    // A campsite already exists; treat an otherwise-ambiguous turn as a
    // plain remark rather than reopening the first-recommendation gates.
    const question = extraction.clarificationQuestion ?? "Could you say a bit more?";
    next = { ...next, agent: { ...next.agent, working: false, phase: "awaiting_user" } };
    return { trip: next, factsToPhrase: [question], checkpoints: [{ trip: next, facts: [question] }] };
  }

  // Active-Recommendation Follow-Up (ported from v2's refinement
  // acknowledgment): a NEW must-have arriving after a campsite is already
  // held is acknowledged honestly — "X still comes out on top" when it
  // still satisfies everything, or released and re-searched when it no
  // longer does, rather than silently ignored or re-explained from scratch.
  const addedLabels = diffAddedRequirements(priorRequirements, next.intent.requirements);
  const heldCampsiteBeforeRefinement = next.bookings.find((b) => b.kind === "campsite" && b.status === "held");
  const leadingFacts: string[] = [];
  if (heldCampsiteBeforeRefinement && addedLabels.length > 0) {
    const fresh = evaluateCampsites(toV2SearchIntent(next.intent));
    const stillTop = fresh.kind !== "no_match" && fresh.candidates[0]?.campsite.id === heldCampsiteBeforeRefinement.refId;
    const fallbackSummary =
      fresh.kind !== "no_match" && fresh.candidates[0]
        ? `${fresh.candidates[0].campsite.siteName} at ${fresh.candidates[0].campsite.campgroundName} looks like the strongest fit.`
        : "Nothing currently satisfies every requirement — I may need to widen the search.";
    leadingFacts.push(buildRefinementAcknowledgment(addedLabels, heldCampsiteBeforeRefinement.refId, fresh, fallbackSummary));
    if (!stillTop) {
      next = { ...releaseBookingAndDependents(next, heldCampsiteBeforeRefinement.id, now), candidateIndex: 0 };
    }
  }

  return continueTrip(next, now, leadingFacts);
}

export async function fetchIntentExtraction(
  message: string,
  priorRequirements: TripRequirement[],
): Promise<V3IntentExtraction> {
  const res = await fetch("/api/trip/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, priorRequirements }),
  });
  if (res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) throw new Error(`Intent extraction failed (${res.status})`);
  const body = await res.json();
  return V3IntentExtractionSchema.parse(body.extraction);
}

/** Thrown by `fetchIntentExtraction` on a 429 — callers show a specific,
 * calm message instead of the generic error path (ported from v2's public
 * demo rate limiting, src/app/page.tsx). */
export class RateLimitError extends Error {
  constructor() {
    super("You've sent a lot of requests in a short time. Try again in a moment.");
    this.name = "RateLimitError";
  }
}

export async function fetchPhrasing(facts: string[]): Promise<string[]> {
  if (facts.length === 0) return [];
  try {
    const res = await fetch("/api/trip/phrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts }),
    });
    if (!res.ok) return facts;
    const body = await res.json();
    return Array.isArray(body.lines) && body.lines.length === facts.length ? body.lines : facts;
  } catch {
    return facts;
  }
}

/** The impure entry point: extracts intent via the model, then runs the deterministic planner. */
export async function runAgentTurn(
  trip: Trip,
  userMessage: string,
  now: number,
): Promise<{ trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] }> {
  const extraction = await fetchIntentExtraction(userMessage, trip.intent.requirements);
  return applyTurn(trip, extraction, now, userMessage);
}

/**
 * Widen Search (ported from v2's src/lib/no-match.ts "Widen search to
 * 100 mi" pattern, generalized): moves exactly ONE confirmed-failing
 * must-have into nice-to-have — the requirement actually blocking a match —
 * then resumes the plan. Wired to the "Widen search" NeedsYouItem's primary
 * button (kind: "no_match").
 */
export function widenTripSearch(trip: Trip, now: number): { trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] } {
  const fresh = evaluateCampsites(toV2SearchIntent(trip.intent));
  if (fresh.kind !== "no_match") return { trip, factsToPhrase: [], checkpoints: [] };
  const { requirements, widened } = widenSearch(trip.intent, fresh);
  if (!widened) return { trip, factsToPhrase: [], checkpoints: [] };

  const widenedTrip: Trip = {
    ...trip,
    intent: { ...trip.intent, requirements },
    needsYouQueue: trip.needsYouQueue.filter((n) => n.kind !== "no_match"),
    candidateIndex: 0,
  };
  return continueTrip(widenedTrip, now, [`I widened the search — "${widened}" is now a nice-to-have instead of a must-have.`]);
}

/**
 * "Show me another option" (ported from v2's candidate cycling, adapted to
 * v3's hold-first model: rather than paging through a shopping list before
 * choosing, this releases the held campsite — and anything depending on
 * it — and holds the NEXT-ranked candidate instead.
 */
export function requestAlternativeCampsite(trip: Trip, now: number): { trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] } {
  const held = trip.bookings.find((b) => b.kind === "campsite" && b.status === "held");
  if (!held) return { trip, factsToPhrase: [], checkpoints: [] };
  const result = evaluateCampsites(toV2SearchIntent(trip.intent));
  if (result.kind === "no_match") return { trip, factsToPhrase: [], checkpoints: [] };
  const nextIndex = (trip.candidateIndex ?? 0) + 1;
  const alternative = result.candidates[nextIndex];
  if (!alternative) {
    return continueTrip(trip, now, ["That's the last option I have for this search — nothing else currently fits."]);
  }
  const released = releaseBookingAndDependents(trip, held.id, now);
  const next: Trip = { ...released, candidateIndex: nextIndex };
  return continueTrip(next, now, [`Sure — looking at another option: ${alternative.campsite.siteName} at ${alternative.campsite.campgroundName}.`]);
}

/**
 * Requirement Chip removal (ported from v2's direct-manipulation chip
 * removal, src/app/page.tsx's handleRemoveTripDetail): "X" means "CampOps,
 * don't assume this anymore." Unlike v2 — where every turn re-derives a
 * fresh recommendation from scratch — v3 only needs to re-run the search
 * when nothing has been held yet; a site already held still satisfies
 * every requirement in the SMALLER remaining set, so removing one never
 * invalidates an existing hold.
 */
export function removeTripRequirement(
  trip: Trip,
  requirementId: string,
  now: number,
): { trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] } {
  const requirement = trip.intent.requirements.find((r) => r.id === requirementId);
  if (!requirement) return { trip, factsToPhrase: [], checkpoints: [] };
  const nextTrip: Trip = {
    ...trip,
    intent: { ...trip.intent, requirements: trip.intent.requirements.filter((r) => r.id !== requirementId) },
  };
  return continueTrip(nextTrip, now, [`Removed "${requirement.label}" — no longer treating it as a requirement.`]);
}

/**
 * Accepting a suggestion (Build Brief §10 "never added to the plan or
 * total without a yes"): only this function moves one from "offered" to
 * booked — never automatic.
 */
export function acceptSuggestion(trip: Trip, suggestionId: string, now: number): { trip: Trip; factsToPhrase: string[] } {
  const suggestion = trip.suggestions.find((s) => s.id === suggestionId && s.state === "offered");
  if (!suggestion) return { trip, factsToPhrase: [] };
  const activity = ACTIVITIES_BY_ID[suggestion.activityId];
  if (!activity) return { trip, factsToPhrase: [] };

  const price = activityBookingPrice(activity, trip.intent.adults || DEFAULT_PARTY_SIZE);
  const decision = checkPermission(trip.permissions, { type: "hold", refundable: true, amountUsd: price });
  const slot = activity.slots[0];
  const campsiteBooking = trip.bookings.find((b) => b.kind === "campsite");

  const fact = decision.result === "allow" ? `Held ${activity.name} for $${price}.` : `Found ${activity.name} for $${price} — asking before holding it.`;

  let next: Trip = {
    ...trip,
    suggestions: trip.suggestions.map((s) => (s.id === suggestionId ? { ...s, state: "added" as const } : s)),
  };

  if (decision.result === "allow") {
    const holdId = newId();
    const bookingId = `b-activity-${activity.id}`;
    next = {
      ...next,
      bookings: [
        ...next.bookings,
        {
          id: bookingId,
          kind: "activity",
          refId: activity.id,
          title: activity.name,
          day: slot.date,
          time: `${slot.startTime}-${slot.endTime}`,
          price,
          refundTerms: activity.refundTerms,
          dependsOn: campsiteBooking ? [campsiteBooking.id] : [],
          status: "held",
          holdId,
        },
      ],
      holds: [...next.holds, { id: holdId, bookingId, expiresAt: now + HOLD_MINUTES * 60_000, refundable: true, placedUnderPermissionId: decision.permissionId }],
      events: [...next.events, { id: newId(), timestamp: now, what: fact, permissionId: decision.permissionId, actor: "CampOps", kind: "hold" }],
    };
  } else {
    next = {
      ...next,
      needsYouQueue: [...next.needsYouQueue, { id: newId(), eyebrow: "Asking before holding", message: `Hold ${activity.name} for $${price}?`, primaryLabel: `Hold · $${price}` }],
      agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "One item needs a decision" },
    };
  }

  return { trip: next, factsToPhrase: [fact] };
}

/** Dismissing a suggestion: that activity TYPE is never offered again this trip (Build Brief §10). */
export function dismissSuggestion(trip: Trip, suggestionId: string): Trip {
  const suggestion = trip.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return trip;
  const activity = ACTIVITIES_BY_ID[suggestion.activityId];
  return {
    ...trip,
    suggestions: trip.suggestions.map((s) => (s.id === suggestionId ? { ...s, state: "dismissed" as const } : s)),
    dismissedSuggestionTypes: activity ? [...trip.dismissedSuggestionTypes, activity.type] : trip.dismissedSuggestionTypes,
  };
}

export type { NeedsYouItem };
