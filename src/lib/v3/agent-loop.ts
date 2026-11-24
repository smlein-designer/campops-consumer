import { looksLikeDateAttempt, normalizeDatePhrase, type DateRange } from "@/lib/dates";
import { answerCandidateQuestion } from "@/lib/candidate-facts";
import { normalizeDestinationRegion } from "@/lib/geography";
import { newId } from "@/lib/id";
import { describeCancellationPolicy } from "@/lib/reservation";
import type { Campsite, EvaluationResult } from "@/lib/schemas";
import { activityTypesRequested, ACTIVITY_STEP } from "@/lib/v3/activity-match";
import { ADD_ONS, addOnsNear } from "@/lib/v3/add-ons";
import { holdBlockers, parsePartySizeAnswer, questionFor, recommendBlockers } from "@/lib/v3/clarification";
import { isExploratoryDiscoveryMessage } from "@/lib/prerequisites";
import { buildFitCard, campsiteTitle, partyLabel } from "@/lib/v3/fit";
import { V3IntentExtractionSchema, type V3IntentExtraction } from "@/lib/v3/intent-schema";
import { activityBookingPrice, tripTotal } from "@/lib/v3/money";
import { activityMeta, activityPartyLabel, defaultActivityParty, partyCount } from "@/lib/v3/activity-choice";
import { summarizeNoMatch, widenSearch } from "@/lib/v3/no-match";
import { slotsOverlap, type TimeSlot } from "@/lib/v3/overlap";
import {
  ACTIVITIES_BY_ID,
  activitiesNear,
  activityOfType,
  activitySlots,
  campsiteSatisfiesActivityRequirement,
  providerForActivity,
} from "@/lib/v3/providers";
import { checkPermission } from "@/lib/v3/rules-permission";
import { suggestionFor } from "@/lib/v3/rules-suggestion";
import {
  campsiteById,
  campsitesInScope,
  isActivityRequirement,
  mustHavesMissed,
  originZip,
  partySize,
  searchCampsites,
  searchDates,
  searchOne,
  tripRange,
  wantsIntermediateRide,
} from "@/lib/v3/search";
import { isoSpanLabel, namedWeekend, spokenSlot } from "@/lib/v3/trip-dates";
import type {
  Activity,
  ActivityParty,
  ActivitySlot,
  ActivityType,
  Booking,
  HoldBlocker,
  NeedsYouItem,
  ClarifyingOption,
  PendingClarifyingQuestion,
  Trip,
  TripPlanStep,
  TripRequirement,
  V3TripIntent,
} from "@/lib/v3/schemas";

/**
 * The agent loop (Build Brief §9): a deterministic planner that calls the
 * model only at the edges (interpret, phrase).
 *
 * The plan is built from what the user actually asked for. A trip is a
 * campsite; a boat, a ride or a guide is only ever a step when the user
 * asked for one, and only ever booked when the chosen campsite really has
 * it nearby. Two things run side by side: the plan moves as far as the
 * known facts allow, while the chat narrows down whatever is still missing.
 */

// Demo hold length (Build Brief §17: 15-30 minutes).
const HOLD_MINUTES = 20;

export type TurnCheckpoint = { trip: Trip; facts: string[] };
export type TurnResult = { trip: Trip; factsToPhrase: string[]; checkpoints: TurnCheckpoint[] };

const isActive = (b: Booking) => b.status === "held" || b.status === "changed_needs_ok" || b.status === "hold_expired";

export function activeBookings(trip: Trip): Booking[] {
  return trip.bookings.filter(isActive);
}

export function activeCampsiteBooking(trip: Trip): Booking | undefined {
  return trip.bookings.find((b) => b.kind === "campsite" && isActive(b));
}

/** The campsite the conversation is currently about: the held one, else the
 * one CampOps is recommending. */
export function shownCampsite(trip: Trip): Campsite | undefined {
  const id = activeCampsiteBooking(trip)?.refId ?? trip.campsiteComparison?.recommended.campsiteId;
  return id ? campsiteById(id) : undefined;
}

function single(trip: Trip, facts: string[]): TurnResult {
  return { trip, factsToPhrase: facts, checkpoints: [{ trip, facts }] };
}

// ---- Intent ---------------------------------------------------------------

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

const FAMILY_LABEL = "Family-friendly";

/** Which "What I heard" chips differ between two versions of the trip. */
function changedChipKeys(before: V3TripIntent, after: V3TripIntent): string[] {
  const keys: string[] = [];
  if (before.checkIn !== after.checkIn || before.checkOut !== after.checkOut || before.dateHint !== after.dateHint) keys.push("dates");
  if (before.adults !== after.adults || before.children !== after.children || before.pets !== after.pets) keys.push("party");
  if (before.destination !== after.destination) keys.push("destination");
  if (before.origin !== after.origin || before.driveLimitHours !== after.driveLimitHours) keys.push("drive");
  if (before.budgetTotalUsd !== after.budgetTotalUsd || before.budgetPerNightUsd !== after.budgetPerNightUsd) keys.push("budget");
  for (const r of after.requirements) {
    const prior = before.requirements.find((p) => p.id === r.id);
    if (!prior || prior.tier !== r.tier) keys.push(r.id);
  }
  return keys;
}

const CHIP_NAMES: Record<string, string> = {
  dates: "your dates",
  party: "who's coming",
  destination: "where you want to be",
  drive: "the drive",
  budget: "your budget",
};

// ---- Plan -----------------------------------------------------------------

function campsiteStepLabel(intent: V3TripIntent): string {
  const text = intent.requirements.map((r) => r.label.toLowerCase()).join(" ");
  if (/lake/.test(text)) return "Find a lakeside campsite";
  if (/river|creek/.test(text)) return "Find a riverside campsite";
  if (/water|beach/.test(text)) return "Find a campsite on the water";
  return "Find a campsite";
}

/** One step for the campsite, plus one for each activity the user asked for
 * — and nothing they didn't. */
export function buildPlan(intent: V3TripIntent): TripPlanStep[] {
  const labels = intent.requirements.map((r) => r.label);
  return [
    { id: "step-campsite", label: campsiteStepLabel(intent), detail: "", status: "pending" },
    ...activityTypesRequested(labels).map((type): TripPlanStep => ({
      id: `step-activity-${type}`,
      label:
        type === "horseback" && labels.some((l) => /beginner/i.test(l)) ? "Book a beginner trail ride" : ACTIVITY_STEP[type].label,
      detail: ACTIVITY_STEP[type].pending,
      status: "pending",
    })),
  ];
}

function setStep(trip: Trip, id: string, patch: Partial<TripPlanStep>): Trip {
  return { ...trip, plan: trip.plan.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

const stepIdFor = (booking: Booking) =>
  booking.kind === "campsite" ? "step-campsite" : `step-activity-${ACTIVITIES_BY_ID[booking.refId]?.type}`;

// ---- Bookings and holds ---------------------------------------------------

type BookingDraft = Omit<Booking, "status" | "holdId">;

function campsiteDraft(site: Campsite, range: DateRange): BookingDraft {
  return {
    id: "b-campsite",
    kind: "campsite",
    refId: site.id,
    title: campsiteTitle(site),
    category: `Campsite · ${range.nights} night${range.nights === 1 ? "" : "s"}`,
    meta: `${site.siteType} · ${site.petPolicy.allowed ? "pets OK" : "no pets"}`,
    photoKey: site.photoKey,
    day: range.startISO,
    price: Math.round((site.pricePerNight * range.nights + site.serviceFee) * 100) / 100,
    refundTerms: describeCancellationPolicy(site.cancellationPolicy, range.startISO),
    dependsOn: [],
  };
}

function activityDraft(activity: Activity, slot: ActivitySlot, party: ActivityParty): BookingDraft {
  return {
    id: `b-activity-${activity.id}`,
    kind: "activity",
    refId: activity.id,
    title: activity.name,
    category: activity.category,
    provider: providerForActivity(activity).name,
    meta: activityMeta(activity, party),
    photoKey: activity.photoKey,
    day: slot.date,
    time: `${slot.startTime}-${slot.endTime}`,
    party,
    price: activityBookingPrice(activity, partyCount(party)),
    refundTerms: activity.refundTerms,
    dependsOn: ["b-campsite"],
  };
}

function describeDraft(draft: BookingDraft): string {
  return draft.time ? `${draft.title} with ${draft.provider}, ${spokenSlot(draft.day, draft.time)}` : draft.title;
}

/** Puts a hold on a booking. `permissionId` null means the user said yes
 * themselves rather than a standing rule allowing it. */
function placeHold(trip: Trip, draft: BookingDraft, permissionId: "hold_refundable" | null, now: number): Trip {
  const holdId = newId();
  return {
    ...trip,
    bookings: [...trip.bookings.filter((b) => b.id !== draft.id), { ...draft, status: "held", holdId }],
    holds: [
      ...trip.holds.filter((h) => h.bookingId !== draft.id),
      { id: holdId, bookingId: draft.id, expiresAt: now + HOLD_MINUTES * 60_000, refundable: true, placedUnderPermissionId: "hold_refundable" },
    ],
    events: [
      ...trip.events,
      {
        id: newId(),
        timestamp: now,
        what: `Held ${describeDraft(draft)} · $${draft.price}`,
        permissionId,
        actor: permissionId ? "CampOps" : "You",
        kind: "hold",
      },
    ],
  };
}

function releaseBookings(trip: Trip, ids: string[], now: number, why: string): Trip {
  const released = trip.bookings.filter((b) => ids.includes(b.id));
  if (released.length === 0) return trip;
  const siteGone = released.some((b) => b.kind === "campsite");
  return {
    ...trip,
    bookings: trip.bookings.filter((b) => !ids.includes(b.id)),
    holds: trip.holds.filter((h) => !ids.includes(h.bookingId)),
    // An extra offered for the old site isn't an offer for the next one.
    suggestions: siteGone ? trip.suggestions.filter((s) => s.state !== "offered") : trip.suggestions,
    events: [
      ...trip.events,
      ...released.map((b) => ({
        id: newId(),
        timestamp: now,
        what: `Released ${b.title} — ${why}.`,
        permissionId: null,
        actor: "CampOps" as const,
        kind: "change" as const,
      })),
    ],
  };
}

function bookedSlots(trip: Trip): TimeSlot[] {
  return activeBookings(trip)
    .filter((b) => b.time)
    .map((b) => {
      const [startTime, endTime] = (b.time as string).split("-");
      return { date: b.day, startTime, endTime };
    });
}

/** Every slot of an activity that doesn't clash with what's already booked
 * (Build Brief §10: no two activities overlap), best first. */
export function openActivitySlots(trip: Trip, activity: Activity, exceptBookingId?: string): ActivitySlot[] {
  const range = tripRange(trip.intent);
  if (!range) return [];
  const taken = bookedSlots({ ...trip, bookings: trip.bookings.filter((b) => b.id !== exceptBookingId) });
  return activitySlots(activity, range).filter((slot) => !taken.some((t) => slotsOverlap(slot, t)));
}

/** The first open slot of an activity. */
export function openSlot(trip: Trip, activity: Activity, exceptBookingId?: string): ActivitySlot | undefined {
  return openActivitySlots(trip, activity, exceptBookingId)[0];
}

/**
 * An activity isn't held for a time CampOps picked: it lists the open times
 * and asks the user to choose one and who's going (the "activity_choice"
 * decision). Returns the trip unchanged if nothing is open.
 */
function askActivityChoice(trip: Trip, activity: Activity, stepId: string, facts: string[]): { trip: Trip; asked: boolean } {
  const slots = openActivitySlots(trip, activity);
  const provider = providerForActivity(activity).name;
  if (slots.length === 0) return { trip, asked: false };
  const noun = activity.name.toLowerCase();
  facts.push(
    `${provider} has ${slots.length} open time${slots.length === 1 ? "" : "s"} for the ${noun}. Pick the one you want and who's going, and I'll hold it.`,
  );
  return {
    trip: setStep(
      {
        ...trip,
        needsYouQueue: [
          ...trip.needsYouQueue,
          {
            id: newId(),
            eyebrow: `Needs you · pick a time`,
            // The times live in the plan, not in this card: it points there
            // instead of offering one time as "this or nothing".
            message: `Choose a time and who's going for the ${noun} at ${provider}. Nothing is held until you do.`,
            primaryLabel: "Pick a time",
            kind: "activity_choice",
            payload: { activityId: activity.id, stepId },
          },
        ],
      },
      stepId,
      { status: "active", detail: `${provider} — pick a time` },
    ),
    asked: true,
  };
}

/**
 * Holds a booking if the user's standing rules allow it; otherwise asks
 * (PRD v3 §5.5: over the limit, holds switched off, or over the trip budget).
 * Returns whether it was held.
 */
function holdOrAsk(
  trip: Trip,
  draft: BookingDraft,
  stepId: string,
  now: number,
  facts: string[],
  why = "",
): { trip: Trip; held: boolean } {
  const budget = trip.intent.budgetTotalUsd;
  const totalAfter = tripTotal(activeBookings(trip).filter((b) => b.id !== draft.id)) + draft.price;
  const decision = checkPermission(trip.permissions, { type: "hold", refundable: true, amountUsd: draft.price });
  const limit = trip.permissions.find((p) => p.id === "hold_refundable")?.limitUsd;

  let ask: Pick<NeedsYouItem, "eyebrow" | "message" | "primaryLabel"> | null = null;
  if (draft.kind !== "campsite" && budget != null && totalAfter > budget) {
    ask = {
      eyebrow: "Needs you · over budget",
      message: `Adding ${describeDraft(draft)} for $${draft.price} would bring the trip to $${totalAfter}, over your $${budget} budget.`,
      primaryLabel: `Add anyway · $${draft.price}`,
    };
  } else if (decision.result !== "allow") {
    const overLimit = limit != null && draft.price > limit && trip.permissions.find((p) => p.id === "hold_refundable")?.enabled;
    ask = {
      eyebrow: overLimit ? "Needs you · over your limit" : "Needs you · your OK to hold",
      message: overLimit
        ? `${describeDraft(draft)} is $${draft.price}, over your $${limit} rule for holds. Hold it anyway?`
        : `I found ${describeDraft(draft)} for $${draft.price}. Holding is switched off, so I'm asking first.`,
      primaryLabel: `Hold · $${draft.price}`,
    };
  }

  if (!ask) {
    facts.push(`Held ${describeDraft(draft)} for $${draft.price}.${why ? ` ${why}` : ""}`);
    return { trip: placeHold(trip, draft, "hold_refundable", now), held: true };
  }
  facts.push(`${ask.message}`);
  return {
    trip: {
      ...trip,
      needsYouQueue: [
        ...trip.needsYouQueue,
        {
          id: newId(),
          ...ask,
          secondaryLabel: draft.kind === "campsite" ? "Other options" : "Skip it",
          kind: "hold_ask",
          payload: { draft: JSON.stringify(draft), stepId },
        },
      ],
    },
    held: false,
  };
}

const DROP_REASON: Record<ActivityType, (site: Campsite) => string> = {
  boat: (site) => (site.waterAccess.nearby ? `no boat rental is near ${site.campgroundName}` : `${site.campgroundName} isn't on the water`),
  kayak: (site) => (site.waterAccess.nearby ? `nobody rents kayaks near ${site.campgroundName}` : `${site.campgroundName} isn't on the water`),
  horseback: (site) => `there's no stable near ${site.campgroundName}`,
  guided_hike: (site) => `no guide works near ${site.campgroundName}`,
};

/**
 * Changing the campsite re-checks every booking that depends on it (Build
 * Brief §10). What still fits stays held exactly as it was; what doesn't is
 * released, and CampOps says so out loud (PRD v3 §5.4).
 */
function recheckDependents(trip: Trip, site: Campsite, now: number, facts: string[]): Trip {
  // A time choice offered for the old site's provider is asked again for this one.
  const stale = trip.needsYouQueue.filter((n) => n.kind === "activity_choice");
  let next: Trip = {
    ...trip,
    needsYouQueue: trip.needsYouQueue.filter((n) => n.kind !== "activity_choice"),
    plan: trip.plan.map((s) => (stale.some((n) => n.payload?.stepId === s.id) ? { ...s, status: "pending" } : s)),
  };
  for (const booking of activeBookings(next)) {
    if (booking.kind === "activity") {
      const activity = ACTIVITIES_BY_ID[booking.refId];
      if (campsiteSatisfiesActivityRequirement(activity, site)) continue;
      const reason = DROP_REASON[activity.type](site);
      next = releaseBookings(next, [booking.id], now, reason);
      next = setStep(next, stepIdFor(booking), { status: "done", detail: `Not offered near ${site.campgroundName}` });
      facts.push(`${reason.charAt(0).toUpperCase()}${reason.slice(1)}, so I released the ${booking.title.toLowerCase()} hold. Nothing was charged.`);
    } else if (booking.kind === "addon" && !addOnsNear(site).some((a) => a.id === booking.refId)) {
      next = releaseBookings(next, [booking.id], now, `${site.campgroundName} doesn't offer it`);
      facts.push(`${site.campgroundName} doesn't offer ${booking.title.toLowerCase()}, so I took it off.`);
    }
  }
  return next;
}

function holdCampsite(
  trip: Trip,
  site: Campsite,
  range: DateRange,
  now: number,
  facts: string[],
  why = "",
): { trip: Trip; held: boolean } {
  const result = holdOrAsk(trip, campsiteDraft(site, range), "step-campsite", now, facts, why);
  if (!result.held) return result;
  let next = setStep(result.trip, "step-campsite", { status: "done", detail: `${campsiteTitle(site)} — held` });
  next = recheckDependents({ ...next, campsiteComparison: null }, site, now, facts);
  // Something the last site couldn't offer gets another try at this one.
  next = {
    ...next,
    plan: next.plan.map((s) => (s.detail.startsWith("Not offered near") && !s.detail.endsWith(site.campgroundName) ? { ...s, status: "pending" } : s)),
  };
  return { trip: next, held: true };
}

// ---- Suggestions ----------------------------------------------------------

/** One optional extra at a natural pause (PRD v3 §9): only once the plan has
 * settled, and only something this campsite really offers. */
function offerSuggestionIfNatural(trip: Trip): Trip {
  if (trip.suggestions.some((s) => s.state === "offered")) return trip;
  if (!trip.plan.every((s) => s.status === "done") || trip.needsYouQueue.length > 0) return trip;
  const campsiteBooking = activeCampsiteBooking(trip);
  const site = campsiteBooking && campsiteById(campsiteBooking.refId);
  if (!site) return trip;
  const suggestion = suggestionFor({
    campsite: site,
    dismissedTypes: trip.dismissedSuggestionTypes,
    permissions: trip.permissions,
    hasPendingDecision: false,
    bookedIds: trip.bookings.map((b) => b.refId),
  });
  if (!suggestion || trip.suggestions.some((s) => s.id === suggestion.id)) return trip;
  return { ...trip, suggestions: [...trip.suggestions, suggestion] };
}

// ---- The planner ----------------------------------------------------------

const BLOCKER_NEED: Record<HoldBlocker, string> = {
  more_detail: "a little more about the trip",
  destination: "an area or where you're driving from",
  dates: "your dates",
  party_size: "how many are coming",
  origin: "where you're driving from",
};

const BLOCKER_STEP_TEXT: Record<HoldBlocker, string> = {
  more_detail: "need a little more detail",
  destination: "need where to look",
  dates: "need your dates",
  party_size: "need your party size",
  origin: "need your starting point",
};

function heardSummary(intent: V3TripIntent): string {
  const range = tripRange(intent);
  const musts = [
    range ? isoSpanLabel(range.startISO, range.endISO) : "",
    partyLabel(intent),
    intent.destination ? `in ${intent.destination}` : "",
    intent.driveLimitHours != null ? `under ${intent.driveLimitHours} hours' drive` : "",
    intent.budgetTotalUsd != null ? `a budget of $${intent.budgetTotalUsd}` : "",
    intent.budgetPerNightUsd != null ? `under $${intent.budgetPerNightUsd} a night` : "",
    ...intent.requirements.filter((r) => r.tier === "must").map((r) => r.label.toLowerCase()),
  ].filter(Boolean);
  const nices = intent.requirements.filter((r) => r.tier === "nice").map((r) => r.label.toLowerCase());
  const parts = ["I've laid out what I heard and my plan."];
  if (musts.length > 0) parts.push(`Must-haves: ${musts.join(", ")}.`);
  if (nices.length > 0) parts.push(`Nice-to-haves: ${nices.join(", ")}. I won't drop a good site just because one of those isn't available.`);
  return parts.join(" ");
}

/**
 * Advances the plan as far as the known facts allow, then asks for the next
 * thing it needs. Never calls the model. Each checkpoint is a consistent
 * trip state the UI can reveal as its own beat — and stop at, if paused.
 */
export function continueTrip(
  trip: Trip,
  now: number,
  leadingFacts: string[] = [],
  modelQuestion: { question: string; options: string[] } | null = null,
): TurnResult {
  const facts: string[] = [...leadingFacts];
  const checkpoints: TurnCheckpoint[] = [];
  let checkpointed = 0;

  const firstPlan = trip.plan.length === 0;
  let next: Trip = {
    ...trip,
    plan: buildPlan(trip.intent).map((fresh) => {
      const existing = trip.plan.find((s) => s.id === fresh.id);
      return existing ? { ...fresh, status: existing.status, detail: existing.detail } : fresh;
    }),
    clarifyingQuestion: null,
    agent: { ...trip.agent, working: true, phase: "searching", currentStepText: "reading your trip" },
  };
  function checkpoint() {
    checkpoints.push({ trip: next, facts: facts.slice(checkpointed) });
    checkpointed = facts.length;
  }

  // First beat: what CampOps heard and its plan, before anything is searched.
  if (firstPlan) facts.push(heardSummary(next.intent));
  checkpoint();

  const blockers = holdBlockers(next.intent);
  const showBlockers = recommendBlockers(next.intent, next.browsing);
  const range = tripRange(next.intent);
  let waitingOnDecision = next.needsYouQueue.length > 0;

  // Step 1: the campsite — but no site is shown until v2's minimum for one
  // is known. Until then the plan says what it is waiting on.
  if (showBlockers.length > 0 && !activeCampsiteBooking(next) && !waitingOnDecision) {
    const assumed = showBlockers.length === 1 && showBlockers[0] === "dates" ? searchDates(next.intent) : null;
    if (assumed) {
      // Only the exact weekend is open: look on the one being assumed, without
      // naming a site for dates the user hasn't confirmed (Figma 5:98).
      const result = searchCampsites(next);
      const fits = result.kind === "no_match" ? 0 : result.candidates.length;
      next = setStep(next, "step-campsite", {
        status: "active",
        detail: `${fits} of ${campsitesInScope(next)} campsites fit so far`,
      });
    } else {
      next = setStep(next, "step-campsite", { status: "pending", detail: `Needs ${BLOCKER_NEED[showBlockers[0]]}` });
    }
    next = { ...next, campsiteComparison: null };
    checkpoint();
  }

  if (showBlockers.length === 0 && !activeCampsiteBooking(next) && !waitingOnDecision) {
    const inScope = campsitesInScope(next);
    next = setStep(next, "step-campsite", { status: "active", detail: `Checking ${inScope} campsites` });
    next = { ...next, agent: { ...next.agent, currentStepText: "finding a campsite" } };
    const result = searchCampsites(next);
    const fitCount = result.kind === "no_match" ? 0 : result.candidates.length;
    next = {
      ...next,
      events: [
        ...next.events,
        {
          id: newId(),
          timestamp: now,
          what: `Compared ${inScope} campsites. ${fitCount === 0 ? "None fit every must-have." : `${fitCount} fit every must-have.`}`,
          permissionId: null,
          actor: "CampOps",
          kind: "search",
        },
      ],
    };

    if (result.kind === "no_match") {
      const closest = result.candidates[0]?.campsite;
      const card = closest ? buildFitCard(result, closest.id, next.intent, "Closest match") : null;
      const loosen = widenLabel(next, result);
      const canLoosen = loosen !== "Closest options";
      facts.push(`${summarizeNoMatch(result)} I didn't hold anything, and I won't drop a must-have without asking.`);
      next = {
        ...next,
        needsYouQueue: [
          ...next.needsYouQueue,
          {
            id: newId(),
            eyebrow: "Needs you · no full match",
            message: canLoosen
              ? "Nothing open meets every must-have. Want me to loosen the one that's blocking, or look at the closest options?"
              : "Nothing open meets every must-have. Have a look at the closest options, or tell me what to change.",
            primaryLabel: loosen,
            secondaryLabel: canLoosen ? "Closest options" : undefined,
            kind: "no_match",
          },
        ],
        campsiteComparison: card ? { id: newId(), recommended: card } : null,
      };
      next = setStep(next, "step-campsite", { detail: "No site fits every must-have" });
      waitingOnDecision = true;
    } else {
      const index = Math.min(next.candidateIndex, result.candidates.length - 1);
      const top = result.candidates[index].campsite;
      const card = buildFitCard(result, top.id, next.intent, blockers.length > 0 ? "Best match so far" : "Recommended");
      if (blockers.length > 0 || !range) {
        // Enough to recommend, not enough to hold.
        next = { ...next, candidateIndex: index, campsiteComparison: card ? { id: newId(), recommended: card } : null };
        next = setStep(next, "step-campsite", { detail: `Best match so far: ${campsiteTitle(top)}` });
        facts.push(
          `${campsiteTitle(top)} is the best match so far. ${card?.reason ?? ""} Nothing is held yet — I need ${blockers.map((b) => BLOCKER_NEED[b]).join(" and ")} first.`,
        );
      } else {
        // The user picks the campsite: the best fit, marked Recommended, and
        // the next two beside it. Nothing is held until they choose; holding
        // their pick moves the plan on to the next step.
        const others = result.candidates.filter((c) => c.campsite.id !== top.id).slice(0, 2);
        const options = others
          .map((c) => buildFitCard(result, c.campsite.id, next.intent, "Option"))
          .filter((c): c is NonNullable<typeof c> => c !== null);
        const count = options.length + 1;
        next = {
          ...next,
          candidateIndex: index,
          campsiteComparison: card ? { id: newId(), recommended: card, options } : null,
          needsYouQueue: [
            ...next.needsYouQueue,
            {
              id: newId(),
              eyebrow: "Needs you · pick a campsite",
              message:
                count > 1
                  ? `${count} sites fit what you asked for. ${top.campgroundName} is my pick. Choose one and I'll hold it.`
                  : `${campsiteTitle(top)} fits what you asked for. Hold it, or ask to see other options.`,
              primaryLabel: count > 1 ? "Choose a campsite" : `Hold ${top.siteName}`,
              kind: "campsite_choice",
              payload: { campsiteId: top.id, stepId: "step-campsite" },
            },
          ],
        };
        next = setStep(next, "step-campsite", { status: "active", detail: count > 1 ? `${count} sites fit — pick one` : `${campsiteTitle(top)} fits` });
        facts.push(
          count > 1
            ? `I found ${count} campsites that fit. ${campsiteTitle(top)} is my pick: ${card?.reason ?? ""} Choose one and I'll hold it.`
            : `${campsiteTitle(top)} fits. ${card?.reason ?? ""} Say the word and I'll hold it.`,
        );
        waitingOnDecision = true;
      }
    }
    checkpoint();
  }

  // Then each activity the user asked for, if this campsite really has it.
  const campsiteBooking = next.bookings.find((b) => b.kind === "campsite" && b.status === "held");
  const site = campsiteBooking && campsiteById(campsiteBooking.refId);
  if (site && range && blockers.length === 0 && !waitingOnDecision) {
    if (next.plan.find((s) => s.id === "step-campsite")?.status !== "done") {
      next = setStep(next, "step-campsite", { status: "done", detail: `${campsiteBooking.title} — held` });
    }
    for (const step of next.plan) {
      if (!step.id.startsWith("step-activity-") || step.status === "done") continue;
      const type = step.id.replace("step-activity-", "") as ActivityType;
      const already = activeBookings(next).find((b) => b.kind === "activity" && ACTIVITIES_BY_ID[b.refId]?.type === type);
      if (already) {
        next = setStep(next, step.id, { status: "done", detail: `${already.provider} — held` });
        continue;
      }
      next = setStep(next, step.id, { status: "active" });
      next = { ...next, agent: { ...next.agent, phase: "holding", currentStepText: ACTIVITY_STEP[type].working } };

      const activity = activityOfType(site, type, wantsIntermediateRide(next.intent));
      if (!activity) {
        const reason = DROP_REASON[type](site);
        next = setStep(next, step.id, { status: "done", detail: `Not offered near ${site.campgroundName}` });
        facts.push(`${reason.charAt(0).toUpperCase()}${reason.slice(1)}, so I left ${ACTIVITY_STEP[type].noun} out.`);
        checkpoint();
        continue;
      }
      const asked = askActivityChoice(next, activity, step.id, facts);
      if (!asked.asked) {
        next = setStep(next, step.id, { status: "done", detail: "No open time that fits" });
        facts.push(`${providerForActivity(activity).name} has no time that fits around the rest of your plan, so I left ${ACTIVITY_STEP[type].noun} out.`);
        checkpoint();
        continue;
      }
      // One choice at a time: the next activity waits for this one.
      next = asked.trip;
      waitingOnDecision = true;
      checkpoint();
      break;
    }
  }

  // Where this leaves things: a decision, a question, or ready to book.
  next = { ...next, changedChips: [] };
  if (waitingOnDecision) {
    next = { ...next, pendingAsk: null, agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "one thing needs you" } };
  } else if (showBlockers.length > 0 || blockers.length > 0) {
    const blocker = showBlockers[0] ?? blockers[0];
    const attempts = trip.pendingAsk?.kind === "dates" ? trip.pendingAsk.dateAskAttempts : 0;
    const useModelQuestion = blocker === "more_detail" && modelQuestion;
    const { question, card } = useModelQuestion
      ? { question: modelQuestion.question, card: optionsCard(modelQuestion) }
      : questionFor(blocker, next.intent, attempts);
    // A card carries its own question; a plain question is said in the thread.
    if (!card) facts.push(question);
    next = {
      ...next,
      pendingAsk: { kind: blocker, dateAskAttempts: attempts },
      clarifyingQuestion: card,
      agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: BLOCKER_STEP_TEXT[blocker] },
    };
  } else if (next.plan.every((s) => s.status === "done")) {
    next = offerSuggestionIfNatural({ ...next, pendingAsk: null });
    const count = activeBookings(next).length;
    next = { ...next, agent: { ...next.agent, working: false, phase: "complete", currentStepText: "ready to book" } };
    // No model follow-up question here: on a settled trip it only re-asks
    // what the trip already knows ("How many people?") or offers choices
    // that aren't real (activities not near the site).
    facts.push(count === 1 ? "That's held and ready to book whenever you are." : `All ${count} are held and ready to book whenever you are.`);
  } else {
    next = { ...next, pendingAsk: null, agent: { ...next.agent, working: true, phase: "holding", currentStepText: "working through the plan" } };
  }
  checkpoint();

  return { trip: next, factsToPhrase: facts, checkpoints };
}

function optionsCard(q: { question: string; options: string[] }): PendingClarifyingQuestion | null {
  return q.options.length > 0 ? { id: newId(), question: q.question, options: q.options.map((label) => ({ label })) } : null;
}

/** What "widen" would actually do for this no-match, as the button label. */
function widenLabel(trip: Trip, result: EvaluationResult): string {
  const widened = widenSearch(trip.intent, result);
  if (widened.driveLimitHours != null) return `Allow up to ${widened.driveLimitHours} hrs`;
  if (widened.anywhere) return `Look beyond ${widened.label}`;
  return widened.label ? `Make "${widened.label}" optional` : "Closest options";
}

// ---- A user turn ----------------------------------------------------------

/**
 * Applies one interpreted message to the trip. The model supplied the
 * language reading; everything that follows is application logic.
 */
export function applyTurn(trip: Trip, extraction: V3IntentExtraction, now: number, userMessage = ""): TurnResult {
  // An unsupported turn never touches the trip (v2's deterministic guard) and
  // never lets an open decision drop out of sight (Figma 31:1523).
  if (extraction.status === "unsupported") {
    const reason = extraction.unsupportedReason ?? "That's outside what CampOps can help with.";
    const pending = trip.needsYouQueue[0];
    return single(trip, [
      pending
        ? `${reason} Nothing in your trip changed, and the question above still needs you.`
        : `${reason} Nothing in your trip changed.`,
    ]);
  }

  // A factual question about the site on screen is answered from its record
  // and changes nothing (v2's candidate follow-up).
  const shown = shownCampsite(trip);
  if (extraction.candidateQuestion && shown) {
    const range = tripRange(trip.intent);
    return single(trip, [
      answerCandidateQuestion(extraction.candidateQuestion.topic, shown, {
        originZip: originZip(trip.intent),
        checkIn: range ? trip.intent.checkIn : null,
        checkOut: range ? trip.intent.checkOut : null,
        amenityHint: extraction.candidateQuestion.amenityHint,
      }),
    ]);
  }

  const before = trip.intent;
  const asked = trip.pendingAsk?.kind;

  // Deterministic readings of a bare reply to the question just asked (v2's
  // backstops): "4" for party size, a city for the starting point.
  let adults = extraction.adults ?? before.adults;
  if (asked === "party_size" && extraction.adults == null && extraction.children == null) {
    adults = parsePartySizeAnswer(userMessage) ?? adults;
  }
  let origin = extraction.origin ?? before.origin;
  if (asked === "origin" && !extraction.origin && originZip({ ...before, origin: userMessage.trim() })) {
    origin = userMessage.trim();
  }
  // A bare place in reply to "Where should I look?": a known area, else a
  // city to start from.
  let destination = normalizeDestinationRegion(extraction.destination) ?? before.destination;
  if (asked === "destination" && !extraction.destination && !extraction.origin) {
    const reply = userMessage.trim();
    const area = normalizeDestinationRegion(reply);
    if (area) destination = area;
    else if (originZip({ ...before, origin: reply })) origin = reply;
  }

  // Dates: exact dates win; a recognised phrase ("Labor Day weekend") is
  // resolved by calendar rules; a new loose timeframe replaces old dates.
  let { checkIn, checkOut, dateHint } = before;
  const phrase = normalizeDatePhrase(userMessage) ?? namedWeekend(`${userMessage} ${extraction.dateHint ?? ""}`);
  if (extraction.checkIn && extraction.checkOut) {
    ({ checkIn, checkOut } = extraction as { checkIn: string; checkOut: string });
    dateHint = "";
  } else if (phrase) {
    ({ checkIn, checkOut } = phrase);
    dateHint = "";
  } else if (extraction.dateHint) {
    checkIn = "";
    checkOut = "";
    dateHint = extraction.dateHint;
  }

  let requirements = mergeRequirements(before.requirements, extraction.requirements);
  const children = extraction.children ?? before.children;
  // v2's party-composition inference: children coming makes a
  // family-friendly site a preference, once, and it stays removable.
  if (children > 0 && before.children === 0 && !requirements.some((r) => /famil|kid|child/i.test(r.label))) {
    requirements = mergeRequirements(requirements, [{ label: FAMILY_LABEL, tier: "nice" }]);
  }

  const intent: V3TripIntent = {
    checkIn,
    checkOut,
    dateHint,
    adults,
    children,
    pets: extraction.pets ?? before.pets,
    // v2's destination normalisation: "near Austin" is the place "Austin".
    destination,
    origin,
    driveLimitHours: extraction.driveLimitHours ?? before.driveLimitHours,
    budgetTotalUsd: extraction.budgetTotalUsd ?? before.budgetTotalUsd,
    budgetPerNightUsd: extraction.budgetPerNightUsd ?? before.budgetPerNightUsd,
    requirements,
  };

  const firstTurn = trip.plan.length === 0;
  const changed = firstTurn ? [] : changedChipKeys(before, intent);
  const stillNoDates = asked === "dates" && !tripRange(intent) && !intent.dateHint;
  let next: Trip = {
    ...trip,
    intent,
    changedChips: changed,
    // v2 decided once, from the opening message, whether this is a browse
    // or a stay request — later answers don't re-decide it.
    browsing: firstTurn ? isExploratoryDiscoveryMessage(userMessage) : trip.browsing,
    pendingAsk:
      stillNoDates && trip.pendingAsk
        ? { kind: "dates", dateAskAttempts: trip.pendingAsk.dateAskAttempts + (looksLikeDateAttempt(userMessage) ? 1 : 0) }
        : null,
  };

  const leading: string[] = [];
  const named = changed
    .filter((k) => CHIP_NAMES[k])
    .map((k) => (k === "drive" && intent.driveLimitHours == null ? "where you're starting from" : CHIP_NAMES[k]));
  const added = intent.requirements.filter((r) => !before.requirements.some((p) => p.id === r.id)).map((r) => r.label);

  const held = activeCampsiteBooking(next);
  if (held && changed.length > 0) {
    const datesMoved = JSON.stringify(tripRange(before)) !== JSON.stringify(tripRange(intent));
    const partyMoved = partySize(before) !== partySize(intent);
    if (datesMoved || partyMoved) {
      // Every hold was for the old dates or the old party; none of them stand.
      next = releaseAll(next, now, datesMoved ? "the dates changed" : "the party size changed");
      leading.push(
        `Got it — I updated ${named.join(" and ")}. The holds were for the old ${datesMoved ? "dates" : "party size"}, so I released them and I'm planning again. Nothing was charged.`,
      );
    } else {
      // The held site only has to go if the change makes it miss a must-have
      // it didn't already miss — a site the user chose knowing its trade-off
      // isn't second-guessed for that same trade-off later.
      const missedBefore = mustHavesMissed(trip, held.refId);
      const stillFits = mustHavesMissed(next, held.refId).every((label) => missedBefore.includes(label));
      const what = [...named, ...added.map((l) => `"${l}"`)].join(" and ") || "your requirements";
      if (stillFits) {
        leading.push(`Got it — I updated ${what}. ${held.title} still fits, so nothing moves.`);
      } else {
        next = releaseBookings(next, [held.id], now, "it no longer fits the trip");
        next = setStep({ ...next, candidateIndex: 0 }, "step-campsite", { status: "pending", detail: "" });
        leading.push(`Got it — I updated ${what}. ${held.title} no longer fits, so I released it and I'm looking again. Nothing was charged.`);
      }
    }
  } else if (!firstTurn && (named.length > 0 || added.length > 0)) {
    leading.push(`Got it — I updated ${[...named, ...added.map((l) => `"${l}"`)].join(" and ")} on the left.`);
    next = { ...next, candidateIndex: 0 };
  }

  const modelQuestion =
    extraction.status === "needs_clarification" && extraction.clarificationQuestion
      ? { question: extraction.clarificationQuestion, options: extraction.clarificationOptions ?? [] }
      : null;
  return continueTrip(next, now, leading, modelQuestion);
}

function releaseAll(trip: Trip, now: number, why: string): Trip {
  const released = releaseBookings(trip, activeBookings(trip).map((b) => b.id), now, why);
  return {
    ...released,
    candidateIndex: 0,
    needsYouQueue: [],
    suggestions: released.suggestions.filter((s) => s.state !== "offered"),
    plan: released.plan.map((s) => ({ ...s, status: "pending" as const, detail: "" })),
  };
}

// ---- Model calls ----------------------------------------------------------

export async function fetchIntentExtraction(message: string, trip: Trip): Promise<V3IntentExtraction> {
  const res = await fetch("/api/trip/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, intent: trip.intent, hasCampsite: !!shownCampsite(trip) }),
  });
  if (res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) throw new Error(`Intent extraction failed (${res.status})`);
  const body = await res.json();
  return V3IntentExtractionSchema.parse(body.extraction);
}

/** Thrown on a 429 — callers show a calm message instead of the generic
 * error path (v2's public demo rate limiting). */
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

/** The impure entry point: interprets the message, then runs the planner. */
export async function runAgentTurn(trip: Trip, userMessage: string, now: number): Promise<TurnResult> {
  const extraction = await fetchIntentExtraction(userMessage, trip);
  return applyTurn(trip, extraction, now, userMessage);
}

// ---- Direct changes (no model call) ---------------------------------------

/** Answers the open dates question from a tapped option. */
export function applyDates(trip: Trip, checkIn: string, checkOut: string, now: number): TurnResult {
  const intent: V3TripIntent = { ...trip.intent, checkIn, checkOut, dateHint: "" };
  const range = tripRange(intent);
  if (!range) return { trip, factsToPhrase: [], checkpoints: [] };
  return continueTrip({ ...trip, intent, pendingAsk: null, candidateIndex: 0 }, now, [
    `${isoSpanLabel(range.startISO, range.endISO)} it is.`,
  ]);
}

/**
 * Widen Search (v2's no-match recovery): loosens exactly the one must-have
 * that is blocking a match — the drive limit by half an hour, or a
 * requirement from must-have to nice-to-have — then plans again.
 */
export function widenTripSearch(trip: Trip, now: number): TurnResult {
  const result = searchCampsites(trip);
  if (result.kind !== "no_match") return { trip, factsToPhrase: [], checkpoints: [] };
  const widened = widenSearch(trip.intent, result);
  if (!widened.label) return { trip, factsToPhrase: [], checkpoints: [] };
  const intent: V3TripIntent = {
    ...trip.intent,
    requirements: widened.requirements,
    driveLimitHours: widened.driveLimitHours ?? trip.intent.driveLimitHours,
    destination: widened.anywhere ? "" : trip.intent.destination,
  };
  return continueTrip(
    { ...trip, intent, needsYouQueue: trip.needsYouQueue.filter((n) => n.kind !== "no_match"), campsiteComparison: null, candidateIndex: 0 },
    now,
    [
      widened.driveLimitHours != null
        ? `I widened the drive to ${widened.driveLimitHours} hours.`
        : widened.anywhere
          ? `I'm now looking beyond ${widened.label}.`
          : `I made "${widened.label}" a nice-to-have instead of a must-have.`,
    ],
  );
}

/**
 * Moves the trip to a specific campsite. With something held, the old site
 * is released and everything that depends on it is re-checked; before
 * anything is held, it just becomes the recommendation.
 */
export function holdSpecificCampsite(trip: Trip, campsiteId: string, now: number, leadingFacts: string[] = []): TurnResult {
  const site = campsiteById(campsiteId);
  if (!site || trip.unavailableCampsiteIds.includes(campsiteId)) return { trip, factsToPhrase: [], checkpoints: [] };
  const index = searchCampsites(trip).candidates.findIndex((c) => c.campsite.id === campsiteId);
  const base: Trip = {
    ...trip,
    candidateIndex: Math.max(index, 0),
    needsYouQueue: trip.needsYouQueue.filter((n) => n.kind !== "no_match" && n.kind !== "campsite_unavailable" && n.payload?.stepId !== "step-campsite"),
    campsiteComparison: null,
  };

  const range = tripRange(base.intent);
  if (!range || holdBlockers(base.intent).length > 0) return continueTrip(base, now, leadingFacts);

  const facts = [...leadingFacts];
  const current = activeCampsiteBooking(base);
  const previous = current ? campsiteById(current.refId) : undefined;
  let next = current ? releaseBookings(base, [current.id], now, `switched to ${site.campgroundName}`) : base;
  next = setStep(next, "step-campsite", { status: "pending", detail: "" });
  // The user chose this site — even one that misses a must-have. That is
  // their decision, not CampOps relaxing a requirement; it says what the
  // choice trades off rather than refusing it.
  const card = buildFitCard(searchOne(base, campsiteId), campsiteId, base.intent, "Your pick", previous);
  const held = holdCampsite(next, site, range, now, facts, card?.reason);
  return continueTrip(held.trip, now, facts);
}

/** "Show me another option" (v2's candidate cycling): the next-ranked site. */
export function requestAlternativeCampsite(trip: Trip, now: number): TurnResult {
  const result = searchCampsites(trip);
  if (result.kind === "no_match") return { trip, factsToPhrase: [], checkpoints: [] };
  const alternative = result.candidates[trip.candidateIndex + 1];
  if (!alternative) {
    return single(trip, ["That's the last option that fits this search. Tell me what to loosen and I'll look again."]);
  }
  return holdSpecificCampsite(trip, alternative.campsite.id, now, [`Sure — here's another option: ${campsiteTitle(alternative.campsite)}.`]);
}

/**
 * The user went to see the other campsites instead of answering the open
 * campsite decision (hold this one over the limit, the closest match, a lost
 * site): that decision is answered by whatever they pick from the list, so
 * the alert goes away.
 */
export function dropCampsiteDecision(trip: Trip): Trip {
  const isCampsiteDecision = (n: Trip["needsYouQueue"][number]) =>
    n.kind === "no_match" || n.kind === "campsite_unavailable" || n.payload?.stepId === "step-campsite";
  if (!trip.needsYouQueue.some(isCampsiteDecision)) return trip;
  return {
    ...trip,
    needsYouQueue: trip.needsYouQueue.filter((n) => !isCampsiteDecision(n)),
    agent: { ...trip.agent, working: false, phase: "awaiting_user", currentStepText: "choosing a campsite" },
  };
}

/**
 * "Show me other options" — what to say beside the list of other sites.
 * When plenty fit, just the list. Only when few or none do, it also asks
 * what to loosen, as tappable choices that change the search.
 */
export function otherOptionsReply(trip: Trip): { line: string; question: PendingClarifyingQuestion | null } {
  const result = searchCampsites(trip);
  const pickId = shownCampsite(trip)?.id;
  const others = result.kind === "no_match" ? 0 : result.candidates.filter((c) => c.campsite.id !== pickId).length;
  if (others >= 2) {
    // "other … too" only when there's a pick to compare against.
    const sites = pickId ? "other sites" : "sites";
    const too = pickId ? " too" : "";
    return {
      line: others > 6 ? `${others} ${sites} fit everything${too}. Here are the best of them.` : `Here are the ${others} ${sites} that fit everything${too}.`,
      question: null,
    };
  }
  const line =
    result.kind === "no_match"
      ? "No site fits everything, so these are the closest."
      : others === 0
        ? "Nothing else fits everything you asked for on these dates."
        : "Only one other site fits everything you asked for.";
  const options: ClarifyingOption[] = [
    ...trip.intent.requirements
      .filter((r) => r.tier === "must" && !isActivityRequirement(r))
      .map((r) => ({ label: `Make "${r.label}" optional`, relaxRequirementId: r.id })),
    ...(trip.intent.driveLimitHours != null ? [{ label: "Drive farther", dropDriveLimit: true }] : []),
  ];
  if (options.length === 0) return { line: `${line} Other dates may open up more.`, question: null };
  return { line, question: { id: newId(), question: "Want to loosen something to see more?", options } };
}

/** Resolves an "asking before holding" item: yes holds it on the user's own
 * say-so; no skips that activity. */
export function resolveHoldAsk(trip: Trip, itemId: string, accept: boolean, now: number): TurnResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  if (!item?.payload) return { trip, factsToPhrase: [], checkpoints: [] };
  const draft = JSON.parse(item.payload.draft) as BookingDraft;
  const stepId = item.payload.stepId;
  let next: Trip = { ...trip, needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId) };
  const facts: string[] = [];
  if (accept) {
    next = placeHold(next, draft, null, now);
    next = setStep(next, stepId, { status: "done", detail: `${draft.provider ?? draft.title} — held` });
    facts.push(`Held ${describeDraft(draft)} for $${draft.price}, on your OK.`);
    const site = draft.kind === "campsite" ? campsiteById(draft.refId) : undefined;
    if (site) next = recheckDependents({ ...next, campsiteComparison: null }, site, now, facts);
  } else {
    next = setStep(next, stepId, { status: "done", detail: "Skipped" });
    facts.push(`Okay, I left ${draft.title.toLowerCase()} out.`);
  }
  return continueTrip(next, now, facts);
}

/** The time and party an activity choice starts on: the first open time,
 * and everyone the activity has room for. */
export function defaultActivityChoice(trip: Trip, activityId: string, exceptBookingId?: string) {
  const activity = ACTIVITIES_BY_ID[activityId];
  const slot = activity ? openSlot(trip, activity, exceptBookingId) : undefined;
  return activity && slot ? { slot, party: defaultActivityParty(activity, trip.intent) } : null;
}

/** The user picked a time and who's going: hold exactly that, on their say-so. */
export function holdActivityChoice(trip: Trip, itemId: string, slot: ActivitySlot, party: ActivityParty, now: number): TurnResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  const activity = item?.payload && ACTIVITIES_BY_ID[item.payload.activityId];
  if (!item?.payload || !activity || partyCount(party) < 1) return { trip, factsToPhrase: [], checkpoints: [] };
  const draft = activityDraft(activity, slot, party);
  let next: Trip = { ...trip, needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId) };
  next = placeHold(next, draft, null, now);
  next = setStep(next, item.payload.stepId, { status: "done", detail: `${draft.provider} — held` });
  const fact = `Held the ${activity.name.toLowerCase()} with ${draft.provider}, ${spokenSlot(draft.day, draft.time as string)}, for ${activityPartyLabel(party)} · $${draft.price}.`;
  return continueTrip(next, now, [fact]);
}

/** "Skip it": the activity is left out of the plan. */
export function skipActivityChoice(trip: Trip, itemId: string, now: number): TurnResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  const activity = item?.payload && ACTIVITIES_BY_ID[item.payload.activityId];
  if (!item?.payload || !activity) return { trip, factsToPhrase: [], checkpoints: [] };
  // Skipped means it isn't offered again as a suggestion; asking for it still works.
  let next: Trip = {
    ...trip,
    needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId),
    dismissedSuggestionTypes: [...trip.dismissedSuggestionTypes, activity.type],
  };
  next = setStep(next, item.payload.stepId, { status: "done", detail: "Skipped" });
  return continueTrip(next, now, [`Okay, I left the ${activity.name.toLowerCase()} out.`]);
}

/**
 * Offers one activity on the user's ask: its open times and who's going, in
 * the plan — even one they skipped earlier. Uses the activity's own plan
 * step when there is one.
 */
export function offerActivity(trip: Trip, activityId: string): TurnResult {
  const activity = ACTIVITIES_BY_ID[activityId];
  if (!activity) return single(trip, []);
  const typeStep = `step-activity-${activity.type}`;
  const stepId = trip.plan.some((s) => s.id === typeStep) ? typeStep : "suggestion";
  const facts: string[] = [];
  const asked = askActivityChoice({ ...trip, clarifyingQuestion: null }, activity, stepId, facts);
  if (!asked.asked) {
    return single({ ...trip, clarifyingQuestion: null }, [`${providerForActivity(activity).name} has no open time that fits around the rest of your plan.`]);
  }
  return single({ ...asked.trip, agent: { ...asked.trip.agent, working: false, phase: "awaiting_user", currentStepText: "one thing needs you" } }, facts);
}

const GENERAL_ACTIVITY_QUESTION = /\b(activit(y|ies)|things to do|anything (else )?to do|what (else )?(is there|can we) do)\b/i;
const NOT_WANTED = /\b(no|not|don'?t|remove|drop|cancel|skip|without)\b/i;

/**
 * "Any activities?", "any boats to rent?" — answered from what is really near
 * the held campsite, with no model call. A kind that's nearby is offered
 * straight away; a general ask lists only what's nearby, as choices. Null
 * when the message isn't that kind of ask, so it goes on to the model.
 */
export function answerActivityQuestion(trip: Trip, message: string): TurnResult | null {
  if (NOT_WANTED.test(message)) return null;
  const types = activityTypesRequested([message]);
  if (types.length === 0 && !GENERAL_ACTIVITY_QUESTION.test(message)) return null;
  const campsite = activeCampsiteBooking(trip);
  const site = campsite && campsiteById(campsite.refId);
  if (!site || !tripRange(trip.intent) || trip.needsYouQueue.length > 0) return null;

  const heldTypes = activeBookings(trip)
    .filter((b) => b.kind === "activity")
    .map((b) => ACTIVITIES_BY_ID[b.refId]?.type);
  // A change to one already held ("move the hike") is the model's to read.
  if (types.length > 0 && types.every((t) => heldTypes.includes(t))) return null;
  const nearby = activitiesNear(site).filter((a, i, all) => !heldTypes.includes(a.type) && all.findIndex((b) => b.type === a.type) === i);
  const named = (list: Activity[]) => list.map((a) => a.name.toLowerCase()).join(", ");

  if (types.length > 0) {
    const match = nearby.find((a) => types.includes(a.type));
    if (match) return offerActivity(trip, match.id);
    const what = ACTIVITY_STEP[types[0]].noun;
    return single(trip, [
      `There's no ${what.replace(/^an? /, "")} I can book near ${site.campgroundName}.${nearby.length > 0 ? ` What is nearby: ${named(nearby)}.` : ""}`,
    ]);
  }
  if (nearby.length === 0) return single(trip, [`There's nothing more I can book near ${site.campgroundName}.`]);
  return single(
    {
      ...trip,
      clarifyingQuestion: {
        id: newId(),
        question: `Near ${site.campgroundName}, I can book:`,
        options: nearby.map((a) => ({ label: a.name, activityId: a.id })),
      },
    },
    [`Here's what's near ${site.campgroundName} that I can book. Tap one to pick a time.`],
  );
}

/** A held activity, moved to another open time or a different group. It
 * stays held (same hold) while it changes. */
export function changeActivity(trip: Trip, bookingId: string, slot: ActivitySlot, party: ActivityParty, now: number): TurnResult {
  const booking = trip.bookings.find((b) => b.id === bookingId && b.kind === "activity" && b.status === "held");
  const activity = booking && ACTIVITIES_BY_ID[booking.refId];
  if (!booking || !activity || partyCount(party) < 1) return { trip, factsToPhrase: [], checkpoints: [] };
  const draft = activityDraft(activity, slot, party);
  const when = spokenSlot(draft.day, draft.time as string);
  return single(
    {
      ...trip,
      bookings: trip.bookings.map((b) => (b.id === bookingId ? { ...b, ...draft, changeNote: undefined } : b)),
      events: [
        ...trip.events,
        {
          id: newId(),
          timestamp: now,
          what: `Changed the ${activity.name.toLowerCase()} to ${when}, ${activityPartyLabel(party)} · $${draft.price}`,
          permissionId: null,
          actor: "You",
          kind: "decision",
        },
      ],
    },
    [`Done — the ${activity.name.toLowerCase()} is now ${when}, for ${activityPartyLabel(party)} · $${draft.price}. Still held, nothing charged.`],
  );
}

/** Releases a booking the user no longer wants, and anything that depends
 * on it (PRD v3 §5.3). CampOps doesn't quietly re-book it. */
export function releaseBooking(trip: Trip, bookingId: string, now: number): TurnResult {
  const booking = trip.bookings.find((b) => b.id === bookingId);
  if (!booking) return { trip, factsToPhrase: [], checkpoints: [] };
  const ids = trip.bookings.filter((b) => b.id === bookingId || b.dependsOn.includes(bookingId)).map((b) => b.id);
  let next: Trip = {
    ...trip,
    bookings: trip.bookings.filter((b) => !ids.includes(b.id)),
    holds: trip.holds.filter((h) => !ids.includes(h.bookingId)),
    needsYouQueue: trip.needsYouQueue.filter((n) => !ids.includes(n.payload?.bookingId ?? "")),
    suggestions: trip.suggestions.filter((s) => s.state !== "offered" || booking.kind !== "campsite"),
    events: [
      ...trip.events,
      { id: newId(), timestamp: now, what: `Released ${booking.title}.`, permissionId: null, actor: "You", kind: "decision" },
    ],
  };
  const others = ids.length - 1;
  const released = `Released ${booking.title}${others > 0 ? ` and the ${others} booking${others === 1 ? "" : "s"} that depended on it` : ""}. Nothing was charged.`;
  if (booking.kind === "campsite") {
    // Everything after the campsite hangs on where the trip is, so the plan
    // goes back to the campsite choice and the activities wait for the new pick.
    next = {
      ...next,
      candidateIndex: 0,
      campsiteComparison: null,
      needsYouQueue: next.needsYouQueue.filter((n) => n.kind !== "activity_choice" && n.payload?.stepId !== "step-campsite"),
      plan: next.plan.map((s) => (s.id === "step-campsite" || s.id.startsWith("step-activity-") ? { ...s, status: "pending" as const, detail: "" } : s)),
    };
    return continueTrip(next, now, [released]);
  }
  for (const b of trip.bookings.filter((x) => ids.includes(x.id) && x.kind !== "addon")) {
    next = setStep(next, stepIdFor(b), { status: "done", detail: "Released" });
  }
  return single(
    { ...next, agent: { ...next.agent, working: false, currentStepText: activeBookings(next).length > 0 ? "ready to book" : "nothing held" } },
    [`${released} Tell me if you'd like something else instead.`],
  );
}

/**
 * Removing a requirement chip (v2: "don't assume this anymore"). An activity
 * the user no longer wants is released; a campsite that satisfied a larger
 * set of requirements still satisfies the smaller one, so it stays.
 */
export function removeTripRequirement(trip: Trip, requirementId: string, now: number): TurnResult {
  const requirement = trip.intent.requirements.find((r) => r.id === requirementId);
  if (!requirement) return { trip, factsToPhrase: [], checkpoints: [] };
  let next: Trip = {
    ...trip,
    intent: { ...trip.intent, requirements: trip.intent.requirements.filter((r) => r.id !== requirementId) },
  };
  const facts = [`Removed "${requirement.label}" — I'm no longer looking for it.`];
  const [type] = activityTypesRequested([requirement.label]);
  const booking = type && activeBookings(next).find((b) => b.kind === "activity" && ACTIVITIES_BY_ID[b.refId]?.type === type);
  if (booking) {
    next = releaseBookings(next, [booking.id], now, "you no longer want it");
    facts.push(`I released the ${booking.title.toLowerCase()} hold. Nothing was charged.`);
  }
  return continueTrip(next, now, facts);
}

/** Flips a requirement between must-have and nice-to-have (PRD v3 §5.3
 * "change priorities"), then re-checks the plan against it. */
export function setRequirementTier(trip: Trip, requirementId: string, tier: "must" | "nice", now: number): TurnResult {
  const requirement = trip.intent.requirements.find((r) => r.id === requirementId);
  if (!requirement || requirement.tier === tier) return { trip, factsToPhrase: [], checkpoints: [] };
  const extraction = { ...EMPTY_EXTRACTION, requirements: [{ label: requirement.label, tier }] };
  return applyTurn(trip, extraction, now);
}

export type TripFactKey = "dates" | "party" | "destination" | "drive" | "budget";

/**
 * Clearing a trip fact chip (v2's chip-source removal). Dates and party size
 * are needed to hold anything, so clearing them releases the holds and
 * CampOps asks again; the others only loosen the search.
 */
export function clearTripFact(trip: Trip, key: TripFactKey, now: number): TurnResult {
  const cleared: Record<TripFactKey, Partial<V3TripIntent>> = {
    dates: { checkIn: "", checkOut: "", dateHint: "" },
    party: { adults: 0, children: 0, pets: 0 },
    destination: { destination: "" },
    drive: { origin: "", driveLimitHours: null },
    budget: { budgetTotalUsd: null, budgetPerNightUsd: null },
  };
  let next: Trip = { ...trip, intent: { ...trip.intent, ...cleared[key] }, candidateIndex: 0 };
  const facts = [`Removed ${CHIP_NAMES[key]} — I'm no longer assuming it.`];
  if ((key === "dates" || key === "party") && activeBookings(next).length > 0) {
    next = releaseAll(next, now, `${CHIP_NAMES[key]} changed`);
    facts.push("The holds depended on it, so I released them. Nothing was charged.");
  }
  return continueTrip(next, now, facts);
}

const EMPTY_EXTRACTION: V3IntentExtraction = {
  checkIn: null,
  checkOut: null,
  dateHint: null,
  adults: null,
  children: null,
  pets: null,
  destination: null,
  origin: null,
  driveLimitHours: null,
  budgetTotalUsd: null,
  budgetPerNightUsd: null,
  requirements: [],
  status: "actionable",
  clarificationQuestion: null,
  clarificationOptions: null,
  unsupportedReason: null,
  candidateQuestion: null,
};

// ---- Suggestions ----------------------------------------------------------

/** Adding a suggestion — only ever on the user's yes (PRD v3 §9). */
export function acceptSuggestion(trip: Trip, suggestionId: string, now: number): TurnResult {
  const suggestion = trip.suggestions.find((s) => s.id === suggestionId && s.state === "offered");
  const range = tripRange(trip.intent);
  if (!suggestion || !range) return { trip, factsToPhrase: [], checkpoints: [] };
  const marked: Trip = {
    ...trip,
    suggestions: trip.suggestions.map((s) => (s.id === suggestionId ? { ...s, state: "added" as const } : s)),
  };

  let draft: BookingDraft | null = null;
  if (suggestion.target.kind === "addon") {
    const addOn = ADD_ONS.find((a) => a.id === suggestion.target.id);
    if (addOn) {
      draft = {
        id: `b-addon-${addOn.id}`,
        kind: "addon",
        refId: addOn.id,
        title: addOn.name,
        category: "Add-on",
        meta: `Per ${addOn.unit}`,
        day: range.startISO,
        price: addOn.price,
        refundTerms: addOn.refundTerms,
        dependsOn: ["b-campsite"],
      };
    }
  } else {
    // An activity still needs its time and who's going.
    const activity = ACTIVITIES_BY_ID[suggestion.target.id];
    const facts: string[] = [];
    const asked = activity ? askActivityChoice(marked, activity, "suggestion", facts) : { trip: marked, asked: false };
    if (asked.asked) {
      return single({ ...asked.trip, agent: { ...asked.trip.agent, working: false, phase: "awaiting_user", currentStepText: "one thing needs you" } }, facts);
    }
  }
  if (!draft) return single(marked, ["That one isn't available any more, so I left it out."]);

  const facts: string[] = [];
  return single(holdOrAsk(marked, draft, "suggestion", now, facts).trip, facts);
}

/** Dismissing a suggestion: one tap, and that kind isn't offered again this
 * trip (PRD v3 §9). The next one, if any, is offered straight away. */
export function dismissSuggestion(trip: Trip, suggestionId: string): Trip {
  const suggestion = trip.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return trip;
  const dismissedKey =
    suggestion.target.kind === "addon" ? suggestion.target.id : ACTIVITIES_BY_ID[suggestion.target.id]?.type;
  return offerSuggestionIfNatural({
    ...trip,
    suggestions: trip.suggestions.map((s) => (s.id === suggestionId ? { ...s, state: "dismissed" as const } : s)),
    dismissedSuggestionTypes: dismissedKey ? [...trip.dismissedSuggestionTypes, dismissedKey] : trip.dismissedSuggestionTypes,
  });
}

export type { NeedsYouItem };
