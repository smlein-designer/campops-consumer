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
    id: crypto.randomUUID(),
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
 * `dates` (the string the Reservation Review/Authorize Booking surfaces
 * actually display) is built from these USER-STATED dates — the dates the
 * user asked for, not any campsite-side default. `nights` (and therefore
 * the nightly-rate math and the cancellation cutoff) is DERIVED from this
 * exact pair, never sourced from a campsite property (Campsite has no
 * `nights` field at all).
 */
export function stageReservation(
  campsite: Campsite,
  guestCount: number | null,
  checkIn: string,
  checkOut: string,
): { reservation: Reservation; event: TaskEvent } {
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
    paymentMethodLabel: null,
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
 * Required fields for authorization. The live Figma design only models
 * payment method as capable of being missing (Reservation Review never
 * shows a guest-count row as an error state). guestCount is guarded here
 * too as a defensive extension beyond the literal mock — see
 * docs/implementation-decisions.md — since it's a structured field with
 * deterministic meaning (capacity) that could otherwise reach staging
 * unset.
 */
export function computeMissingFields(reservation: Reservation): string[] {
  const missing: string[] = [];
  if (reservation.guestCount === null) missing.push("Guest count");
  if (!reservation.paymentMethodLabel) missing.push("Payment method");
  return missing;
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

export function transitionReservation(
  reservation: Reservation,
  event: ReservationEvent,
): { reservation: Reservation; event: TaskEvent } {
  const site = `${reservation.campsite.siteName} at ${reservation.campsite.campgroundName}`;
  const relatedIds = { campsiteId: reservation.campsite.id };

  switch (event.type) {
    case "RESERVE_ATTEMPT": {
      if (
        reservation.status !== "staged" &&
        reservation.status !== "incomplete"
      ) {
        throw new Error(
          `Cannot attempt to reserve from status "${reservation.status}".`,
        );
      }
      const missing = computeMissingFields(reservation);
      if (missing.length > 0) {
        return {
          reservation: { ...reservation, status: "incomplete" },
          event: makeEvent(
            "missing_info_detected",
            "system",
            `Missing ${missing.join(" and ").toLowerCase()} — can't authorize yet.`,
            relatedIds,
          ),
        };
      }
      return {
        reservation: { ...reservation, status: "ready_for_authorization" },
        event: makeEvent(
          "authorization_presented",
          "agent",
          `Presented booking details for ${site}.`,
          relatedIds,
        ),
      };
    }

    case "ADD_PAYMENT_METHOD": {
      if (reservation.status === "reserved") {
        throw new Error("Cannot modify payment method on a reserved booking.");
      }
      // Resolves the missing-info condition; returns to the resting staged
      // state so the user can attempt Reserve again.
      return {
        reservation: {
          ...reservation,
          paymentMethodLabel: event.label,
          status: "staged",
        },
        event: makeEvent(
          "payment_method_added",
          "user",
          "Added a payment method.",
          relatedIds,
        ),
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
      if (
        reservation.status !== "ready_for_authorization" &&
        reservation.status !== "authorizing"
      ) {
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
