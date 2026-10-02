import { newId } from "@/lib/id";
import { computeDateRange } from "@/lib/dates";
import type {
  CancellationPolicy,
  Campsite,
  Reservation,
  ReservationEvent,
  TaskEvent,
} from "@/lib/schemas";

/**
 * Reservation staging + the authorization state machine (PRD §6, Handoff
 * Spec §4.3/§5, Build Brief §6 "Booking state").
 *
 * `transitionReservation` is the ONLY function permitted to change a
 * Reservation's `status` — in particular the ONLY code path that can ever
 * produce `"reserved"`. Every transition is guarded by the status it's
 * valid from; an invalid transition throws rather than silently no-op-ing
 * or advancing anyway. This is the hard invariant the authorization slice
 * exists to prove: `reservation.status === "reserved"` is impossible
 * without an explicit AUTHORIZE event fired from `"authorizing"`.
 *
 * Both `stageReservation` and `transitionReservation` also return the real
 * TaskEvent that transition produced (Activity Log slice) — emitted at the
 * exact same guarded boundary as the state change itself, per the standing
 * rule against reproducing transition logic separately in the UI. A
 * "reservation_reserved" event can therefore never exist without the
 * matching valid AUTHORIZE transition, by construction.
 */

function makeEvent(
  type: TaskEvent["type"],
  actor: TaskEvent["actor"],
  description: string,
  relatedIds?: TaskEvent["relatedIds"],
): TaskEvent {
  return {
    id: newId(),
    type,
    actor,
    description,
    timestamp: Date.now(),
    relatedIds,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Formats an ISO `YYYY-MM-DD` as e.g. "Oct 3" — for cancellation-cutoff display only. */
function formatISODateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

/**
 * Builds the user-facing cancellation sentence from a campsite's structured
 * policy, relative to the ACTUAL reservation's check-in date (Dataset Depth
 * correction, 2026-09-04 — see docs/implementation-decisions.md). Replaces a
 * literal, hard-coded cutoff string that stayed stale for every trip date
 * other than the one it happened to be authored for.
 */
export function describeCancellationPolicy(
  policy: CancellationPolicy,
  checkInISO: string,
): string {
  // `new Date("YYYY-MM-DD")` parses as UTC midnight — reading it back with
  // local-time getters (getDate/getMonth) silently shifts the date by a day
  // in any timezone behind UTC. Parsed as explicit local-time components
  // instead, so the cutoff math is never off by one depending on the
  // server's timezone.
  const [ciYear, ciMonth, ciDay] = checkInISO.split("-").map(Number);
  const cutoff = new Date(ciYear, ciMonth - 1, ciDay);
  cutoff.setDate(cutoff.getDate() - policy.freeUntilDaysBeforeCheckIn);
  const cutoffLabel = formatISODateShort(
    `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`,
  );
  const nights = policy.latePenaltyNights;
  return `Free cancellation until ${cutoffLabel}. After that, ${nights} night${nights === 1 ? "" : "s"} ${nights === 1 ? "is" : "are"} non-refundable.`;
}

/**
 * Builds a fresh, staged Reservation from an accepted Candidate's campsite.
 *
 * `checkIn`/`checkOut` are required (non-nullable) params, not optional —
 * this makes "a reservation was staged without concrete dates" unrepresentable
 * at the type level. The caller (`page.tsx`'s Accept handler) is responsible
 * for running `checkBookingDatePrerequisites` first — which, as of the
 * Dataset Depth correction (2026-09-04), also requires the pair to be
 * RESOLVABLE to a real, positive-night date range (see
 * `src/lib/prerequisites.ts`), so `computeDateRange` below is never null in
 * practice; it throws rather than silently defaulting if that invariant is
 * ever violated — inventory facts (nights, price, cancellation cutoff) are
 * always derived from the trip's actual dates, never a campsite default.
 *
 * `guestCount` is likewise required: party size is a conversational
 * prerequisite (`checkBookingPrerequisites`), resolved before the user can
 * enter the reservation flow at all — the reservation UI never asks for it.
 *
 * `dates` (the string the Reservation Review/Confirm surfaces
 * actually display) is built from these USER-STATED dates — the dates the
 * user asked for, not any campsite-side default. `nights` (and therefore
 * the nightly-rate math and the cancellation cutoff) is DERIVED from this
 * exact pair, never sourced from a campsite property (Campsite has no
 * `nights` field at all).
 */
export function stageReservation(
  campsite: Campsite,
  guestCount: number,
  checkIn: string,
  checkOut: string,
  // The user's saved payment method, when one was already added earlier in
  // this session (e.g. before choosing to edit the trip) — Review then offers
  // "Continue to confirm" instead of asking for payment again.
  savedPaymentMethodLabel: string | null = null,
): { reservation: Reservation; event: TaskEvent } {
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    throw new Error(
      `stageReservation requires a known party size (got ${guestCount}) — caller must run checkBookingPrerequisites first.`,
    );
  }
  const range = computeDateRange(checkIn, checkOut);
  if (!range) {
    throw new Error(
      `stageReservation requires a resolvable, positive-night date range ("${checkIn}" -> "${checkOut}") — caller must run checkBookingDatePrerequisites first.`,
    );
  }
  const total = round2(campsite.pricePerNight * range.nights + campsite.serviceFee);
  const reservation: Reservation = {
    campsite,
    guestCount,
    checkIn,
    checkOut,
    dates: `${checkIn} – ${checkOut} (${range.nights} night${range.nights === 1 ? "" : "s"})`,
    nights: range.nights,
    nightlyRate: campsite.pricePerNight,
    serviceFee: campsite.serviceFee,
    total,
    cancellationPolicy: describeCancellationPolicy(campsite.cancellationPolicy, range.startISO),
    paymentMethodLabel: savedPaymentMethodLabel,
    status: "staged",
    confirmationNumber: null,
  };
  const event = makeEvent(
    "reservation_staged",
    "agent",
    `Staged a reservation for ${campsite.siteName} at ${campsite.campgroundName}.`,
    { campsiteId: campsite.id },
  );
  return { reservation, event };
}

/**
 * The date after which the booking stops being refundable — the same cutoff
 * `describeCancellationPolicy` words, for the Confirm screen's warning line.
 */
export function nonRefundableAfter(reservation: Reservation): string {
  const range = computeDateRange(reservation.checkIn, reservation.checkOut);
  if (!range) return "";
  const [y, m, d] = range.startISO.split("-").map(Number);
  const cutoff = new Date(y, m - 1, d);
  cutoff.setDate(cutoff.getDate() - reservation.campsite.cancellationPolicy.freeUntilDaysBeforeCheckIn);
  return `${MONTH_NAMES[cutoff.getMonth()]} ${cutoff.getDate()}`;
}

/**
 * Deterministic confirmation number — derived from the reservation's own
 * facts, never Math.random()/Date.now(), so repeated authorization of an
 * identical reservation always produces the identical number.
 */
function deterministicConfirmationNumber(reservation: Reservation): string {
  const seed = `${reservation.campsite.id}:${reservation.total}:${reservation.dates}:${reservation.guestCount}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `CO-${(hash % 100000).toString().padStart(5, "0")}`;
}

/**
 * Discards a staged (not yet charged) reservation — Cancel reservation after
 * its confirmation dialog, or Edit reservation returning to the conversation.
 * Only possible before authorization: once processing has begun, or the
 * booking is confirmed, there is nothing "staged" left to discard.
 */
export function discardStagedReservation(
  reservation: Reservation,
  reason: "cancelled" | "editing",
): TaskEvent {
  if (reservation.status === "authorizing" || reservation.status === "reserved") {
    throw new Error(`Cannot discard a reservation from status "${reservation.status}".`);
  }
  const site = `${reservation.campsite.siteName} at ${reservation.campsite.campgroundName}`;
  return reason === "cancelled"
    ? makeEvent("reservation_cancelled", "user", `Cancelled the staged reservation for ${site}. Nothing was charged.`, {
        campsiteId: reservation.campsite.id,
      })
    : makeEvent("trip_edit_requested", "user", `Went back to edit the trip; the staged reservation for ${site} was set aside.`, {
        campsiteId: reservation.campsite.id,
      });
}

export function transitionReservation(
  reservation: Reservation,
  event: ReservationEvent,
): { reservation: Reservation; event: TaskEvent } {
  const site = `${reservation.campsite.siteName} at ${reservation.campsite.campgroundName}`;
  const relatedIds = { campsiteId: reservation.campsite.id };

  switch (event.type) {
    case "BEGIN_ADD_PAYMENT": {
      if (reservation.status !== "staged") {
        throw new Error(`Cannot add a payment method from status "${reservation.status}".`);
      }
      return {
        reservation: { ...reservation, status: "adding_payment" },
        event: makeEvent("payment_entry_started", "user", "Started adding a payment method.", relatedIds),
      };
    }

    case "CANCEL_ADD_PAYMENT": {
      if (reservation.status !== "adding_payment") {
        throw new Error(`Cannot leave payment entry from status "${reservation.status}".`);
      }
      return {
        reservation: { ...reservation, status: "staged" },
        event: makeEvent(
          "payment_entry_dismissed",
          "user",
          "Went back to the reservation without adding a payment method.",
          relatedIds,
        ),
      };
    }

    case "ADD_PAYMENT_METHOD": {
      if (reservation.status !== "adding_payment") {
        throw new Error(`Cannot save a payment method from status "${reservation.status}".`);
      }
      // Payment satisfied → straight on to Confirm your reservation. Nothing
      // is attempted or charged here; authorization is its own explicit step.
      return {
        reservation: {
          ...reservation,
          paymentMethodLabel: event.label,
          status: "ready_for_authorization",
        },
        event: makeEvent("payment_method_added", "user", `Added a payment method (${event.label}).`, relatedIds),
      };
    }

    case "CONTINUE_TO_CONFIRMATION": {
      if (reservation.status !== "staged") {
        throw new Error(`Cannot continue to confirmation from status "${reservation.status}".`);
      }
      // Error prevention: Review offers "Add payment method" instead of this
      // until a payment method exists, so the throw is unreachable from the UI.
      if (!reservation.paymentMethodLabel) {
        throw new Error("Cannot continue to confirmation without a payment method — add one first.");
      }
      return {
        reservation: { ...reservation, status: "ready_for_authorization" },
        event: makeEvent("authorization_presented", "agent", `Presented booking details for ${site}.`, relatedIds),
      };
    }

    case "BEGIN_AUTHORIZE": {
      if (reservation.status !== "ready_for_authorization") {
        throw new Error(
          `Cannot begin authorization from status "${reservation.status}" — only valid from "ready_for_authorization".`,
        );
      }
      return {
        reservation: { ...reservation, status: "authorizing" },
        event: makeEvent(
          "authorization_initiated",
          "user",
          `Requested authorization to reserve ${site} for $${reservation.total.toFixed(2)}.`,
          relatedIds,
        ),
      };
    }

    case "AUTHORIZE": {
      if (reservation.status !== "authorizing") {
        throw new Error(
          `Cannot authorize a reservation from status "${reservation.status}" — authorization is only valid from "authorizing". This invariant must never be bypassed.`,
        );
      }
      return {
        reservation: {
          ...reservation,
          status: "reserved",
          confirmationNumber: deterministicConfirmationNumber(reservation),
        },
        event: makeEvent(
          "reservation_reserved",
          "system",
          "Booking authorized — reservation confirmed.",
          relatedIds,
        ),
      };
    }

    case "CANCEL_AUTHORIZATION": {
      // Only from Confirm — once processing has begun there is no cancel
      // (Figma's Processing state offers none).
      if (reservation.status !== "ready_for_authorization") {
        throw new Error(
          `Cannot cancel authorization from status "${reservation.status}".`,
        );
      }
      // Staged data is untouched — only status reverts.
      return {
        reservation: { ...reservation, status: "staged" },
        event: makeEvent(
          "authorization_dismissed",
          "user",
          "Dismissed the authorization request.",
          relatedIds,
        ),
      };
    }

    default: {
      const exhaustive: never = event;
      throw new Error(
        `Unknown reservation event: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
