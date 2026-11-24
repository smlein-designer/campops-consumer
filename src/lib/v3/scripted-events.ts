import { newId } from "@/lib/id";
import {
  activeBookings,
  activeCampsiteBooking,
  applyTurn,
  continueTrip,
  holdSpecificCampsite,
  shownCampsite,
  type TurnResult,
} from "@/lib/v3/agent-loop";
import { buildFitCard, campsiteTitle } from "@/lib/v3/fit";
import { slotsOverlap, type TimeSlot } from "@/lib/v3/overlap";
import { ACTIVITIES_BY_ID, activitySlots, tripDay } from "@/lib/v3/providers";
import { checkPermission } from "@/lib/v3/rules-permission";
import { searchCampsites, tripRange } from "@/lib/v3/search";
import { spokenSlot, spokenTime, weekdayName } from "@/lib/v3/trip-dates";
import type { ActivitySlot, Booking, Condition, Trip } from "@/lib/v3/schemas";

/**
 * Outside changes (Build Brief §11): the forecast shifts, a hold runs out,
 * a campsite is lost. Each fires from the application, never the model, and
 * acts on whatever is actually in this trip's plan — not on a fixed story.
 * Firing one twice with nothing changed in between is a no-op.
 */

export type ScriptedEventResult = { trip: Trip; factsToPhrase: string[] };

const NOTHING = (trip: Trip): ScriptedEventResult => ({ trip, factsToPhrase: [] });

const STORM = { startTime: "14:00", endTime: "18:00" };
const STORM_CHANCE = 70;
const REHOLD_MINUTES = 20;

function slotOf(booking: Booking): TimeSlot | null {
  if (!booking.time) return null;
  const [startTime, endTime] = booking.time.split("-");
  return { date: booking.day, startTime, endTime };
}

function stormWindow(trip: Trip): TimeSlot | null {
  const condition = trip.conditions.find((c) => c.type === "forecast");
  if (!condition) return null;
  const [date, startTime] = condition.windowStartISO.split("T");
  return { date, startTime, endTime: condition.windowEndISO.split("T")[1] };
}

/** Why each demo scenario can't run on this trip right now, or null when it can. */
export function scenarioBlockers(trip: Trip): { forecast: string | null; holdExpiry: string | null; campsiteUnavailable: string | null } {
  return {
    forecast: !tripRange(trip.intent)
      ? "Needs a trip with dates first."
      : trip.conditions.some((c) => c.type === "forecast")
        ? "Already happened on this trip."
        : null,
    holdExpiry: activeBookings(trip).some((b) => b.status === "held") ? null : "Needs something held first.",
    campsiteUnavailable: shownCampsite(trip) ? null : "Needs a campsite shown or held first.",
  };
}

/** The Figma story's request, typed for the user: one tap starts the demo trip. */
export const DEMO_TRIP_MESSAGE =
  "Lake weekend for 4 plus our dog, Apr 16 to 18, from Austin, under 2 hours, budget $800. A boat if we're on the water, a beginner trail ride and a guided hike would be great.";

/** What that request means, read without a model call, so the demo always starts the same way. */
export function startDemoTrip(trip: Trip, now: number): TurnResult {
  return applyTurn(
    trip,
    {
      checkIn: "Apr 16",
      checkOut: "Apr 18",
      dateHint: null,
      adults: 4,
      children: null,
      pets: 1,
      destination: null,
      origin: "Austin",
      driveLimitHours: 2,
      budgetTotalUsd: 800,
      budgetPerNightUsd: null,
      requirements: [
        { label: "On the water", tier: "nice" },
        { label: "Boat rental", tier: "nice" },
        { label: "Beginner trail ride", tier: "nice" },
        { label: "Guided hike", tier: "nice" },
      ],
      status: "actionable",
      clarificationQuestion: null,
      clarificationOptions: null,
      unsupportedReason: null,
      candidateQuestion: null,
    },
    now,
    DEMO_TRIP_MESSAGE,
  );
}

/** Every time an activity booking could move to: its provider's slots for
 * this trip, minus anything that clashes with the rest of the plan. */
function openSlots(trip: Trip, booking: Booking): ActivitySlot[] {
  const range = tripRange(trip.intent);
  const activity = ACTIVITIES_BY_ID[booking.refId];
  if (!range || !activity) return [];
  const others = activeBookings(trip)
    .filter((b) => b.id !== booking.id)
    .map(slotOf)
    .filter((s): s is TimeSlot => s !== null);
  return activitySlots(activity, range).filter((slot) => !others.some((o) => slotsOverlap(slot, o)));
}

/**
 * Forecast change: storms on the first full afternoon of the trip. Any held
 * activity in that window is moved to a clear time with the same provider,
 * at the same price, and CampOps asks the user to OK the move — it is never
 * applied silently (Build Brief §10 "always asks before applying").
 */
export function fireForecastChange(trip: Trip, now: number): ScriptedEventResult {
  const range = tripRange(trip.intent);
  if (!range || trip.conditions.some((c) => c.type === "forecast")) return NOTHING(trip);

  // The storm lands on a held activity when there is one, so firing it always
  // shows a real move; otherwise on the trip's first full afternoon.
  const target = activeBookings(trip)
    .filter((b) => b.kind === "activity" && b.status === "held")
    .map(slotOf)
    .find((s): s is TimeSlot => s !== null);
  const storm: TimeSlot = target ?? { date: tripDay(range, "first_full"), ...STORM };
  const date = storm.date;
  const day = weekdayName(date);
  const when = `${day} ${spokenTime(`${storm.startTime}-${storm.endTime}`)}`;
  const affected = activeBookings(trip).filter((b) => {
    const slot = b.status === "held" ? slotOf(b) : null;
    return slot && slotsOverlap(slot, storm);
  });

  const condition: Condition = {
    id: newId(),
    type: "forecast",
    description: `Forecast changed: storms now ${STORM_CHANCE}% likely ${when}`,
    windowStartISO: `${date}T${storm.startTime}`,
    windowEndISO: `${date}T${storm.endTime}`,
    severity: "high",
    affectedBookingIds: affected.map((b) => b.id),
  };
  let next: Trip = {
    ...trip,
    conditions: [...trip.conditions, condition],
    events: [...trip.events, { id: newId(), timestamp: now, what: condition.description, permissionId: null, actor: "CampOps", kind: "change" }],
  };

  if (affected.length === 0) {
    return {
      trip: next,
      factsToPhrase: [`The forecast changed: storms are ${STORM_CHANCE}% likely ${when}. Nothing in your plan is outdoors then, so nothing moves.`],
    };
  }
  const first = affected[0].category.toLowerCase();
  const decision = checkPermission(next.permissions, { type: "replan" });
  if (decision.result !== "ask") {
    return {
      trip: next,
      factsToPhrase: [
        `The forecast changed: storms are ${STORM_CHANCE}% likely ${when}, when your ${first} is booked. Replanning is switched off, so I left it where it is.`,
      ],
    };
  }

  for (const booking of affected) {
    const noun = booking.category.toLowerCase();
    const alt = openSlots(next, booking).find((slot) => !slotsOverlap(slot, storm));
    if (!alt) continue;
    const altTime = `${alt.startTime}-${alt.endTime}`;
    const before = spokenSlot(booking.day, booking.time as string);
    const after = spokenSlot(alt.date, altTime);
    next = {
      ...next,
      bookings: next.bookings.map((b) =>
        b.id === booking.id
          ? { ...b, status: "changed_needs_ok", movedFrom: { day: b.day, time: b.time as string }, day: alt.date, time: altTime }
          : b,
      ),
      // An outside change jumps the queue: it's news, and it's about something already held.
      needsYouQueue: [
        {
          id: newId(),
          eyebrow: "Needs you · weather",
          message: `Storms are now likely ${when}. I moved the ${noun} to ${after}. Same ${booking.provider}, same price, still refundable.`,
          primaryLabel: `Keep ${weekdayName(alt.date)}`,
          secondaryLabel: "Other options",
          kind: "forecast_move",
          payload: { bookingId: booking.id },
        },
        ...next.needsYouQueue,
      ],
      events: [
        ...next.events,
        {
          id: newId(),
          timestamp: now,
          what: `Moved the ${noun} from ${before} to ${after} and asked for your OK`,
          permissionId: decision.permissionId,
          actor: "CampOps",
          kind: "change",
          details: {
            before: `${before} · $${booking.price}`,
            after: `${after} · $${booking.price}`,
            checked: `${booking.provider} has the new time open, and it clears the rest of your plan`,
            reason: `storms ${STORM_CHANCE}% likely in the original window`,
          },
        },
      ],
    };
  }
  if (next.needsYouQueue.length === trip.needsYouQueue.length) {
    return {
      trip: next,
      factsToPhrase: [`The forecast changed: storms are ${STORM_CHANCE}% likely ${when}. There's no other open time for your ${first}, so I left it where it is.`],
    };
  }
  return {
    trip: { ...next, agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "one thing needs you" } },
    factsToPhrase: [`The forecast just changed for ${day}. I've put the details above.`],
  };
}

function settleMove(trip: Trip, itemId: string, slot: ActivitySlot | null, now: number): TurnResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  const booking = trip.bookings.find((b) => b.id === item?.payload?.bookingId && b.status === "changed_needs_ok");
  if (!item || !booking?.movedFrom) return { trip, factsToPhrase: [], checkpoints: [] };

  const day = slot?.date ?? booking.day;
  const time = slot ? `${slot.startTime}-${slot.endTime}` : (booking.time as string);
  const keptOriginal = day === booking.movedFrom.day && time === booking.movedFrom.time;
  const noun = booking.category.toLowerCase();
  const changeNote = keptOriginal
    ? "Storm risk acknowledged. You kept the original time."
    : `Moved from ${weekdayName(booking.movedFrom.day)} for weather. You kept ${weekdayName(day)}.`;
  const fact = keptOriginal
    ? `Okay, the ${noun} stays ${spokenSlot(day, time)}, storm risk and all.`
    : `Thanks, the ${noun} is set for ${spokenSlot(day, time)}.`;

  const next: Trip = {
    ...trip,
    bookings: trip.bookings.map((b) => (b.id === booking.id ? { ...b, status: "held", day, time, movedFrom: undefined, changeNote } : b)),
    needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId),
    events: [
      ...trip.events,
      { id: newId(), timestamp: now, what: `Kept the ${noun} on ${spokenSlot(day, time)}`, permissionId: null, actor: "You", kind: "decision" },
    ],
  };
  return continueTrip(next, now, [fact]);
}

/** "Keep Sunday": the user OKs the proposed move. */
export function resolveForecastDecision(trip: Trip, itemId: string, now: number): TurnResult {
  return settleMove(trip, itemId, null, now);
}

/** "Other options", then a pick: the user chooses a different time. */
export function chooseSlot(trip: Trip, itemId: string, slot: ActivitySlot, now: number): TurnResult {
  return settleMove(trip, itemId, slot, now);
}

export type OtherTime = { slot: ActivitySlot; label: string; note: string; action: string; primary: boolean };

/**
 * The times a moved booking could take instead (Figma "Other Times"): the
 * current pick first, then the other clear times, then the original time
 * flagged with its storm risk.
 */
export function otherTimes(trip: Trip, bookingId: string): OtherTime[] {
  const booking = trip.bookings.find((b) => b.id === bookingId);
  const range = tripRange(trip.intent);
  const storm = stormWindow(trip);
  if (!booking?.movedFrom || !range) return [];
  const lastDay = tripDay(range, "last");

  const describe = (slot: ActivitySlot) => {
    const time = `${slot.startTime}-${slot.endTime}`;
    const isCurrent = slot.date === booking.day && time === booking.time;
    const isOriginal = slot.date === booking.movedFrom?.day && time === booking.movedFrom?.time;
    const where = slot.date === range.startISO ? "Arrival day" : slot.date === lastDay ? "Last day" : weekdayName(slot.date);
    return {
      slot,
      label: `${weekdayName(slot.date).slice(0, 3)} ${spokenTime(time)}`,
      note: isOriginal ? `Original time · storms ${STORM_CHANCE}% likely` : isCurrent ? "Current pick" : where,
      action: isOriginal ? "Keep anyway" : isCurrent ? "Keep" : "Choose",
      primary: isCurrent,
      isOriginal,
    };
  };
  const times = openSlots(trip, booking).map(describe);
  // A stormy time is only worth listing if it was the user's original one.
  const clear = times.filter((t) => !t.isOriginal && !(storm && slotsOverlap(t.slot, storm)));
  return [...clear.filter((t) => t.primary), ...clear.filter((t) => !t.primary), ...times.filter((t) => t.isOriginal)];
}

/**
 * Hold expiry: a hold has run out. If re-holding is allowed and the price is
 * within the user's hold rule, CampOps holds it again and says so in one
 * line; otherwise it asks (Build Brief §11). While paused it always asks.
 */
export function fireHoldExpiry(trip: Trip, now: number, bookingId?: string): ScriptedEventResult {
  const held = activeBookings(trip).filter((b) => b.status === "held");
  const booking = bookingId ? held.find((b) => b.id === bookingId) : (held.find((b) => b.kind === "activity") ?? held[0]);
  if (!booking) return NOTHING(trip);

  const noun = (booking.kind === "campsite" ? "campsite" : booking.category).toLowerCase();
  const at = new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const rehold = checkPermission(trip.permissions, { type: "rehold" });
  const hold = checkPermission(trip.permissions, { type: "hold", refundable: true, amountUsd: booking.price });
  const limit = trip.permissions.find((p) => p.id === "hold_refundable")?.limitUsd;

  if (rehold.result === "allow" && hold.result === "allow" && !trip.agent.paused) {
    const holdId = newId();
    return {
      trip: {
        ...trip,
        holds: [
          ...trip.holds.filter((h) => h.bookingId !== booking.id),
          { id: holdId, bookingId: booking.id, expiresAt: now + REHOLD_MINUTES * 60_000, refundable: true, placedUnderPermissionId: "rehold_on_expiry" },
        ],
        bookings: trip.bookings.map((b) => (b.id === booking.id ? { ...b, holdId } : b)),
        events: [
          ...trip.events,
          {
            id: newId(),
            timestamp: now,
            what: `Your ${noun} hold ran out. It was still open, so it was held again.`,
            permissionId: "rehold_on_expiry",
            actor: "CampOps",
            kind: "hold",
          },
        ],
      },
      factsToPhrase: [
        `Your ${noun} hold ran out at ${at}. It is still open and within your $${limit} rule, so I am holding it again. Nothing to do.`,
      ],
    };
  }

  return {
    trip: {
      ...trip,
      bookings: trip.bookings.map((b) => (b.id === booking.id ? { ...b, status: "hold_expired" as const } : b)),
      holds: trip.holds.filter((h) => h.bookingId !== booking.id),
      needsYouQueue: [
        ...trip.needsYouQueue,
        {
          id: newId(),
          eyebrow: "Needs you · hold ran out",
          message: `Your ${noun} hold ran out at ${at}. It is still open. Want me to hold it again?`,
          primaryLabel: "Hold it again",
          secondaryLabel: "Let it go",
          kind: "hold_expired",
          payload: { bookingId: booking.id },
        },
      ],
      events: [...trip.events, { id: newId(), timestamp: now, what: `Your ${noun} hold ran out.`, permissionId: null, actor: "CampOps", kind: "hold" }],
      agent: { ...trip.agent, working: false, phase: "awaiting_user", currentStepText: "one thing needs you" },
    },
    factsToPhrase: [`Your ${noun} hold ran out at ${at}. I've put the details above.`],
  };
}

/** "Hold it again": re-holds an expired booking on the user's say-so. */
export function resolveHoldExpiryRehold(trip: Trip, itemId: string, now: number): TurnResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  const booking = trip.bookings.find((b) => b.id === item?.payload?.bookingId);
  if (!item || !booking) return { trip, factsToPhrase: [], checkpoints: [] };
  const holdId = newId();
  const next: Trip = {
    ...trip,
    bookings: trip.bookings.map((b) => (b.id === booking.id ? { ...b, status: "held" as const, holdId } : b)),
    holds: [...trip.holds, { id: holdId, bookingId: booking.id, expiresAt: now + REHOLD_MINUTES * 60_000, refundable: true, placedUnderPermissionId: "rehold_on_expiry" }],
    needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId),
    events: [...trip.events, { id: newId(), timestamp: now, what: `Held ${booking.title} again`, permissionId: null, actor: "You", kind: "hold" }],
  };
  return continueTrip(next, now, [`Held ${booking.title} again.`]);
}

/**
 * Campsite lost: the site this trip is built on is booked by someone else.
 * CampOps says so first, then recommends a replacement with what it keeps
 * and trades off — and waits for the user's OK before holding it (PRD v3
 * §5.5, §7.3). Activities stay held meanwhile; they are re-checked against
 * whichever site the user picks.
 */
export function fireCampsiteUnavailable(trip: Trip, now: number): ScriptedEventResult {
  const lost = shownCampsite(trip);
  if (!lost) return NOTHING(trip);
  const held = activeCampsiteBooking(trip);
  const title = campsiteTitle(lost);

  let next: Trip = {
    ...trip,
    unavailableCampsiteIds: [...trip.unavailableCampsiteIds, lost.id],
    candidateIndex: 0,
    campsiteComparison: null,
    bookings: trip.bookings.filter((b) => b.id !== held?.id),
    holds: trip.holds.filter((h) => h.bookingId !== held?.id),
    suggestions: trip.suggestions.filter((s) => s.state !== "offered"),
    needsYouQueue: trip.needsYouQueue.filter((n) => n.kind !== "campsite_unavailable" && n.kind !== "no_match"),
    plan: trip.plan.map((s) => (s.id === "step-campsite" ? { ...s, status: "pending" as const, detail: "" } : s)),
    events: [
      ...trip.events,
      { id: newId(), timestamp: now, what: `${title} was booked by someone else`, permissionId: null, actor: "CampOps", kind: "change" },
    ],
  };
  const loss = `${title} was just booked by someone else.`;

  const result = searchCampsites(next);
  const replacement = result.kind !== "no_match" ? result.candidates[0]?.campsite : undefined;
  const card = replacement ? buildFitCard(result, replacement.id, next.intent, "Recommended", lost) : null;
  // Nothing was held yet, or nothing fits any more: the normal plan handles
  // it (a fresh recommendation, or the no-match decision).
  if (!held || !replacement || !card) return continueTrip(next, now, [loss]);

  next = {
    ...next,
    campsiteComparison: {
      id: newId(),
      lost: {
        campsiteId: lost.id,
        photoKey: lost.photoKey,
        eyebrow: "Was your first pick",
        title,
        facts: [lost.siteType, `$${lost.pricePerNight}/night`],
        badge: "Just booked by someone else",
        fit: [],
        reason: "",
        unavailable: true,
      },
      recommended: card,
    },
    // An outside change jumps the queue, ahead of any open question.
    needsYouQueue: [
      {
        id: newId(),
        eyebrow: "Needs you · first pick booked",
        message: `${title} was just booked by someone else. I recommend ${card.title}. ${card.reason}`,
        primaryLabel: `Hold ${replacement.siteName}`,
        secondaryLabel: "Show other options",
        kind: "campsite_unavailable",
        payload: { campsiteId: replacement.id },
      },
      ...next.needsYouQueue,
    ],
    agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "your first pick was booked" },
  };
  return { trip: next, factsToPhrase: [loss, "I compared what is still open and put the best replacement on the left."] };
}

/** "Hold Site 14": the user accepts the recommended replacement. */
export function resolveCampsiteUnavailableHold(trip: Trip, itemId: string, now: number): TurnResult {
  const campsiteId = trip.needsYouQueue.find((n) => n.id === itemId)?.payload?.campsiteId;
  return campsiteId ? holdSpecificCampsite(trip, campsiteId, now) : { trip, factsToPhrase: [], checkpoints: [] };
}
