import { newId } from "@/lib/id";
import { CAMPSITES } from "@/lib/campsites";
import { ACTIVITIES_BY_ID } from "@/lib/v3/providers";
import { checkPermission } from "@/lib/v3/rules-permission";
import { evaluateCampsites } from "@/lib/evaluate";
import { toV2SearchIntent } from "@/lib/v3/search-adapter";
import type { Booking, Condition, Trip } from "@/lib/v3/schemas";

/**
 * Scripted events (Build Brief §11). Each is deterministic, fires from the
 * application (never the model), and is idempotent — firing one twice with
 * nothing changed in between is a no-op, so the demo panel can safely fire
 * an event "now" without double-booking.
 */

export type ScriptedEventResult = { trip: Trip; factsToPhrase: string[] };

const PONTOON_ACTIVITY_ID = "lakeshore-pontoon";

/**
 * Forecast change: storms 70% likely Sat 2-6pm. Finds the same-price Sunday
 * slot, proposes the move (keeps the original hold until the user decides),
 * and posts one Needs You item — never silently applied, even when the
 * replan permission is on (Build Brief §10 "always asks before applying").
 */
export function fireForecastChange(trip: Trip, now: number): ScriptedEventResult {
  const pontoonBooking = trip.bookings.find((b) => b.refId === PONTOON_ACTIVITY_ID && b.status === "held");
  if (!pontoonBooking) return { trip, factsToPhrase: [] };
  if (trip.conditions.some((c) => c.type === "forecast")) return { trip, factsToPhrase: [] };

  const condition: Condition = {
    id: newId(),
    type: "forecast",
    description: "Storms 70% likely Sat 2-6pm",
    windowStartISO: "2027-04-17T14:00",
    windowEndISO: "2027-04-17T18:00",
    severity: "high",
    affectedBookingIds: [pontoonBooking.id],
  };
  const facts = [`Storms are 70% likely Saturday 2-6pm, right when the pontoon was booked.`];

  let trip2: Trip = {
    ...trip,
    conditions: [...trip.conditions, condition],
    events: [
      ...trip.events,
      { id: newId(), timestamp: now, what: condition.description, permissionId: null, actor: "CampOps", kind: "change" },
    ],
  };

  const decision = checkPermission(trip2.permissions, { type: "replan" });
  if (decision.result !== "ask") {
    // Permission off: no alternative is proposed at all (Build Brief §10).
    return { trip: trip2, factsToPhrase: facts };
  }

  const pontoon = ACTIVITIES_BY_ID[PONTOON_ACTIVITY_ID];
  const altSlot = pontoon.slots[1]; // Sun 9:00-1:00 — same price, Build Brief §11.
  const proposedBooking: Booking = {
    ...pontoonBooking,
    status: "changed_needs_ok",
    changeNote: `Proposed: move to ${altSlot.startTime}-${altSlot.endTime} ${altSlot.date} for weather, same price.`,
  };

  trip2 = {
    ...trip2,
    bookings: trip2.bookings.map((b) => (b.id === pontoonBooking.id ? proposedBooking : b)),
    needsYouQueue: [
      ...trip2.needsYouQueue,
      {
        id: newId(),
        eyebrow: "Storms 70% likely Sat 2-6pm",
        message: `I found a Sunday ${altSlot.startTime}-${altSlot.endTime} slot at the same price. Keep Sunday?`,
        primaryLabel: "Keep Sunday",
        secondaryLabel: "Other options",
        kind: "forecast_move",
      },
    ],
    events: [
      ...trip2.events,
      {
        id: newId(),
        timestamp: now,
        what: `Proposed moving the pontoon to Sunday ${altSlot.startTime}-${altSlot.endTime}.`,
        permissionId: decision.permissionId,
        actor: "CampOps",
        kind: "change",
        details: { before: "Sat 14:00-18:00", after: `Sun ${altSlot.startTime}-${altSlot.endTime} (proposed)`, reason: condition.description },
      },
    ],
    agent: { ...trip2.agent, working: false, phase: "awaiting_user", currentStepText: "One item needs a decision" },
  };

  facts.push(`I found a Sunday ${altSlot.startTime}-${altSlot.endTime} slot at the same price. Keep Sunday, or see other options?`);
  return { trip: trip2, factsToPhrase: facts };
}

/**
 * Resolves the forecast Needs You item. `keepProposed` true = "Keep Sunday"
 * (finalize the move); false = "Other options" (keep the original Saturday
 * slot — a fuller slot-picker is the Pontoon · Other Times screen, out of
 * scope for this resolver).
 */
export function resolveForecastDecision(trip: Trip, itemId: string, keepProposed: boolean, now: number): ScriptedEventResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  if (!item) return { trip, factsToPhrase: [] };
  const pontoonBooking = trip.bookings.find((b) => b.refId === PONTOON_ACTIVITY_ID && b.status === "changed_needs_ok");
  if (!pontoonBooking) return { trip, factsToPhrase: [] };

  const pontoon = ACTIVITIES_BY_ID[PONTOON_ACTIVITY_ID];
  const slot = keepProposed ? pontoon.slots[1] : pontoon.slots[0];
  const changeNote = keepProposed
    ? "Moved from Saturday for weather. You kept Sunday."
    : "Weather risk acknowledged. You kept Saturday.";
  const updatedBooking: Booking = {
    ...pontoonBooking,
    status: "held",
    day: slot.date,
    time: `${slot.startTime}-${slot.endTime}`,
    changeNote,
  };
  const fact = keepProposed ? "You kept Sunday." : "You kept Saturday, storm risk and all.";

  return {
    trip: {
      ...trip,
      bookings: trip.bookings.map((b) => (b.id === pontoonBooking.id ? updatedBooking : b)),
      needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId),
      events: [...trip.events, { id: newId(), timestamp: now, what: fact, permissionId: null, actor: "You", kind: "decision" }],
      agent: { ...trip.agent, working: false, phase: "complete", currentStepText: "Everything is held · ready to book" },
    },
    factsToPhrase: [fact],
  };
}

/**
 * Hold expiry: a held booking's hold has run out. Re-holds automatically,
 * without asking, if the slot is still open and within permission; asks
 * otherwise (Build Brief §11).
 */
export function fireHoldExpiry(trip: Trip, bookingId: string, now: number): ScriptedEventResult {
  const booking = trip.bookings.find((b) => b.id === bookingId && b.status === "held");
  if (!booking) return { trip, factsToPhrase: [] };

  const decision = checkPermission(trip.permissions, { type: "rehold" });
  const expiredAtLabel = new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (decision.result === "allow") {
    const holdId = newId();
    const fact = `Your ${booking.title.toLowerCase()} hold ran out at ${expiredAtLabel}. The slot is still open and within permission, so I'm holding it again. Nothing to do.`;
    return {
      trip: {
        ...trip,
        holds: [
          ...trip.holds.filter((h) => h.id !== booking.holdId),
          { id: holdId, bookingId: booking.id, expiresAt: now + 20 * 60_000, refundable: true, placedUnderPermissionId: decision.permissionId },
        ],
        bookings: trip.bookings.map((b) => (b.id === bookingId ? { ...b, holdId } : b)),
        events: [...trip.events, { id: newId(), timestamp: now, what: fact, permissionId: decision.permissionId, actor: "CampOps", kind: "hold" }],
      },
      factsToPhrase: [fact],
    };
  }

  const fact = `Your ${booking.title.toLowerCase()} hold ran out at ${expiredAtLabel}. Re-hold it?`;
  return {
    trip: {
      ...trip,
      bookings: trip.bookings.map((b) => (b.id === bookingId ? { ...b, status: "hold_expired" as const } : b)),
      needsYouQueue: [
        ...trip.needsYouQueue,
        { id: newId(), eyebrow: "Hold expired", message: fact, primaryLabel: "Re-hold it", kind: "hold_expired", payload: { bookingId } },
      ],
      agent: { ...trip.agent, working: false, phase: "awaiting_user", currentStepText: "One item needs a decision" },
    },
    factsToPhrase: [fact],
  };
}

/** Resolves a "Hold expired" Needs You item by re-holding the same booking now. */
export function resolveHoldExpiryRehold(trip: Trip, itemId: string, bookingId: string, now: number): ScriptedEventResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  const booking = trip.bookings.find((b) => b.id === bookingId);
  if (!item || !booking) return { trip, factsToPhrase: [] };

  const holdId = newId();
  const fact = `Re-held ${booking.title.toLowerCase()}.`;
  return {
    trip: {
      ...trip,
      bookings: trip.bookings.map((b) => (b.id === bookingId ? { ...b, status: "held" as const, holdId } : b)),
      holds: [...trip.holds, { id: holdId, bookingId, expiresAt: now + 20 * 60_000, refundable: true, placedUnderPermissionId: "rehold_on_expiry" }],
      needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId),
      events: [...trip.events, { id: newId(), timestamp: now, what: fact, permissionId: "rehold_on_expiry", actor: "You", kind: "hold" }],
      agent: { ...trip.agent, working: false, phase: "complete", currentStepText: "Everything is held · ready to book" },
    },
    factsToPhrase: [fact],
  };
}

/** Resolves a "campsite unavailable" Needs You item by holding the recommended alternative. */
export function resolveCampsiteUnavailableHold(trip: Trip, itemId: string, campsiteId: string, now: number): ScriptedEventResult {
  const item = trip.needsYouQueue.find((n) => n.id === itemId);
  const campsite = CAMPSITES.find((c) => c.id === campsiteId);
  if (!item || !campsite) return { trip, factsToPhrase: [] };

  const nights = 2; // fixed golden-path trip length (Apr 16-18, Build Brief §5).
  const price = Math.round((campsite.pricePerNight * nights + campsite.serviceFee) * 100) / 100;
  const holdId = newId();
  const bookingId = "b-campsite";
  const booking: Booking = {
    id: bookingId,
    kind: "campsite",
    refId: campsite.id,
    title: `${campsite.campgroundName} · ${campsite.siteName}`,
    day: `${trip.intent.checkIn || "Apr 16"}-${(trip.intent.checkOut || "Apr 18").replace(/^.* /, "")}`,
    price,
    refundTerms: `Fully refundable until ${nights} night(s) before`,
    dependsOn: [],
    status: "held",
    holdId,
  };
  const fact = `Held ${booking.title} for $${price}.`;
  return {
    trip: {
      ...trip,
      bookings: [...trip.bookings.filter((b) => b.id !== bookingId), booking],
      holds: [...trip.holds, { id: holdId, bookingId, expiresAt: now + 20 * 60_000, refundable: true, placedUnderPermissionId: "hold_refundable" }],
      plan: trip.plan.map((s) => (s.id === "step-campsite" ? { ...s, status: "done" as const, detail: `${booking.title} — held` } : s)),
      needsYouQueue: trip.needsYouQueue.filter((n) => n.id !== itemId),
      events: [...trip.events, { id: newId(), timestamp: now, what: fact, permissionId: "hold_refundable", actor: "You", kind: "hold" }],
      agent: { ...trip.agent, working: false, phase: "complete", currentStepText: "Everything is held · ready to book" },
    },
    factsToPhrase: [fact],
  };
}

/**
 * Campsite unavailable: the preferred site becomes unavailable after
 * evaluation starts. Posts the loss first, then the recommendation (Build
 * Brief §11 "system change shows the reason, then the result").
 */
export function fireCampsiteUnavailable(trip: Trip, campsiteId: string, now: number): ScriptedEventResult {
  const lost = CAMPSITES.find((c) => c.id === campsiteId);
  if (!lost) return { trip, factsToPhrase: [] };

  const alreadyHeldElsewhere = trip.bookings.some((b) => b.kind === "campsite" && b.refId !== campsiteId && b.status === "held");
  const wasHeld = trip.bookings.find((b) => b.kind === "campsite" && b.refId === campsiteId && b.status === "held");

  let next: Trip = {
    ...trip,
    events: [
      ...trip.events,
      { id: newId(), timestamp: now, what: `${lost.campgroundName}, ${lost.siteName} was booked by another party.`, permissionId: null, actor: "CampOps", kind: "change" },
    ],
  };
  const facts = [`${lost.campgroundName}, ${lost.siteName} was just booked by someone else.`];

  if (wasHeld) {
    next = {
      ...next,
      bookings: next.bookings.map((b) => (b.id === wasHeld.id ? { ...b, status: "released" as const, holdId: null } : b)),
      holds: next.holds.filter((h) => h.bookingId !== wasHeld.id),
      plan: next.plan.map((s) => (s.id === "step-campsite" ? { ...s, status: "pending" as const } : s)),
    };
  }

  if (!alreadyHeldElsewhere) {
    const result = evaluateCampsites(toV2SearchIntent({ ...next.intent }), new Set([campsiteId]));
    // Same rule as the agent loop's own campsite step: no_match candidates
    // are shown for transparency only, never recommended.
    const recommended = result.kind !== "no_match" ? result.candidates[0]?.campsite : undefined;
    if (recommended) {
      next = {
        ...next,
        needsYouQueue: [
          ...next.needsYouQueue,
          {
            id: newId(),
            eyebrow: `${lost.campgroundName}, ${lost.siteName} is no longer available`,
            message: `${recommended.campgroundName}, ${recommended.siteName} is the closest match — hold it?`,
            primaryLabel: `Hold ${recommended.siteName}`,
            secondaryLabel: "Other options",
            kind: "campsite_unavailable",
            payload: { campsiteId: recommended.id },
          },
        ],
        agent: { ...next.agent, working: false, phase: "awaiting_user", currentStepText: "One item needs a decision" },
      };
      facts.push(`${recommended.campgroundName}, ${recommended.siteName} is the closest match.`);
    }
  }

  return { trip: next, factsToPhrase: facts };
}
