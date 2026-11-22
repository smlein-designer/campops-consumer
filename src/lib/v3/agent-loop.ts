import { computeDateRange } from "@/lib/dates";
import { evaluateCampsites } from "@/lib/evaluate";
import { newId } from "@/lib/id";
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
 * The deterministic planner/executor core — no network calls. Given the
 * current Trip and this turn's structured extraction, advances the plan as
 * far as it can go without a decision, stopping at the first thing that
 * needs the user (never more than one Needs You item at a time, Handoff
 * Spec §2.3).
 */
export function applyTurn(
  trip: Trip,
  extraction: V3IntentExtraction,
  now: number,
): { trip: Trip; factsToPhrase: string[] } {
  const facts: string[] = [];
  let next: Trip = {
    ...trip,
    intent: {
      ...trip.intent,
      checkIn: extraction.checkIn ?? trip.intent.checkIn,
      checkOut: extraction.checkOut ?? trip.intent.checkOut,
      adults: extraction.adults ?? trip.intent.adults,
      pets: extraction.pets ?? trip.intent.pets,
      originZip: extraction.originZip ?? trip.intent.originZip,
      driveLimitHours: extraction.driveLimitHours ?? trip.intent.driveLimitHours,
      budgetUsd: extraction.budgetUsd ?? trip.intent.budgetUsd,
      requirements: mergeRequirements(trip.intent.requirements, extraction.requirements),
    },
  };

  if (extraction.status === "unsupported") {
    facts.push(extraction.unsupportedReason ?? "CampOps can't help with that part of the request.");
    next = { ...next, agent: { ...next.agent, working: false, phase: "awaiting_user" } };
    return { trip: next, factsToPhrase: facts };
  }
  if (extraction.status === "needs_clarification") {
    facts.push(extraction.clarificationQuestion ?? "Could you say a bit more about what you're looking for?");
    next = { ...next, agent: { ...next.agent, working: false, phase: "awaiting_user" } };
    return { trip: next, factsToPhrase: facts };
  }

  next = { ...next, plan: buildPlan(next.intent.requirements).map((fresh) => {
    const existing = next.plan.find((s) => s.id === fresh.id);
    return existing ? { ...fresh, status: existing.status, detail: existing.detail } : fresh;
  }) };

  let blocked = false;

  // Step 1: find a campsite.
  let heldCampsiteBooking = next.bookings.find((b) => b.kind === "campsite" && b.status === "held");
  if (!heldCampsiteBooking && stepStatus(next.plan, "step-campsite") !== "done") {
    next = { ...next, plan: setStep(next.plan, "step-campsite", { status: "active" }) };
    const v2Intent = toV2SearchIntent(next.intent);
    const result = evaluateCampsites(v2Intent);
    const top = result.candidates[0]?.campsite;
    if (!top) {
      facts.push("Nothing available fits every must-have right now.");
      next = { ...next, needsYouQueue: [...next.needsYouQueue, {
        id: newId(),
        eyebrow: "No campsite fits every must-have",
        message: "Want me to widen the search, or adjust a requirement?",
        primaryLabel: "Widen search",
      }] };
      blocked = true;
    } else {
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
          events: [...next.events, { id: newId(), timestamp: now, what: `Held ${booking.title} for $${price}.`, permissionId: decision.permissionId, actor: "CampOps" }],
        };
        facts.push(`Held ${booking.title} for $${price}.`);
        heldCampsiteBooking = booking;
      } else {
        next = { ...next, needsYouQueue: [...next.needsYouQueue, {
          id: newId(),
          eyebrow: "Asking before holding",
          message: `Hold ${top.campgroundName}, ${top.siteName} for $${price}?`,
          primaryLabel: `Hold · $${price}`,
        }] };
        facts.push(`Found ${top.campgroundName}, ${top.siteName} for $${price} — asking before holding it.`);
        blocked = true;
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
          events: [...next.events, { id: newId(), timestamp: now, what: `Held ${booking.title} for $${price}.`, permissionId: decision.permissionId, actor: "CampOps" }],
        };
        facts.push(`Held ${booking.title} for $${price}.`);
      } else {
        next = { ...next, needsYouQueue: [...next.needsYouQueue, {
          id: newId(),
          eyebrow: "Asking before holding",
          message: `Hold ${activity.name} for $${price}?`,
          primaryLabel: `Hold · $${price}`,
        }] };
        facts.push(`Found ${activity.name} for $${price} — asking before holding it.`);
        blocked = true;
      }
    }
  }

  const allDone = next.plan.every((s) => s.status === "done");
  if (blocked || next.needsYouQueue.length > 0) {
    next = { ...next, agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "One item needs a decision" } };
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
  } else {
    next = { ...next, agent: { ...next.agent, working: true, phase: "holding", currentStepText: "Working through the plan" } };
  }

  return { trip: next, factsToPhrase: facts };
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
  if (!res.ok) throw new Error(`Intent extraction failed (${res.status})`);
  const body = await res.json();
  return V3IntentExtractionSchema.parse(body.extraction);
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
export async function runAgentTurn(trip: Trip, userMessage: string, now: number): Promise<{ trip: Trip; factsToPhrase: string[] }> {
  const extraction = await fetchIntentExtraction(userMessage, trip.intent.requirements);
  return applyTurn(trip, extraction, now);
}

export type { NeedsYouItem };
