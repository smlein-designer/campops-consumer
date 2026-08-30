import type { Campsite, Reservation, ReservationEvent } from "@/lib/schemas";

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
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Builds a fresh, staged Reservation from an accepted Candidate's campsite. */
export function stageReservation(
  campsite: Campsite,
  guestCount: number | null,
): Reservation {
  const total = round2(
    campsite.pricePerNight * campsite.nights + campsite.serviceFee,
  );
  return {
    campsite,
    guestCount,
    dates: `${campsite.datesAvailable} (${campsite.nights} night${campsite.nights === 1 ? "" : "s"})`,
    nights: campsite.nights,
    nightlyRate: campsite.pricePerNight,
    serviceFee: campsite.serviceFee,
    total,
    cancellationPolicy: campsite.cancellationPolicy,
    paymentMethodLabel: null,
    status: "staged",
    confirmationNumber: null,
  };
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
): Reservation {
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
      return {
        ...reservation,
        status: missing.length > 0 ? "incomplete" : "ready_for_authorization",
      };
    }

    case "ADD_PAYMENT_METHOD": {
      if (reservation.status === "reserved") {
        throw new Error("Cannot modify payment method on a reserved booking.");
      }
      // Resolves the missing-info condition; returns to the resting staged
      // state so the user can attempt Reserve again.
      return {
        ...reservation,
        paymentMethodLabel: event.label,
        status: "staged",
      };
    }

    case "BEGIN_AUTHORIZE": {
      if (reservation.status !== "ready_for_authorization") {
        throw new Error(
          `Cannot begin authorization from status "${reservation.status}" — only valid from "ready_for_authorization".`,
        );
      }
      return { ...reservation, status: "authorizing" };
    }

    case "AUTHORIZE": {
      if (reservation.status !== "authorizing") {
        throw new Error(
          `Cannot authorize a reservation from status "${reservation.status}" — authorization is only valid from "authorizing". This invariant must never be bypassed.`,
        );
      }
      return {
        ...reservation,
        status: "reserved",
        confirmationNumber: deterministicConfirmationNumber(reservation),
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
      return { ...reservation, status: "staged" };
    }

    default:
      return reservation;
  }
}
