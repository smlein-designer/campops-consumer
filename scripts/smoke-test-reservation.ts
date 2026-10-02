/**
 * Verifies the reservation staging + authorization state machine
 * (src/lib/reservation.ts) against the required scenarios. Pure logic only
 * (no React, no network) — the hard invariant this slice exists to prove
 * must hold at the transition-function level, not only in the UI.
 *
 * Flow (Figma "Staging and Authorization", 2026-10-01):
 *   staged (Review) → adding_payment (Add payment, only without a saved
 *   method) → ready_for_authorization (Confirm) → authorizing (Processing)
 *   → reserved (Booking confirmed).
 */
import { CAMPSITES } from "../src/lib/campsites";
import { evaluateCampsites } from "../src/lib/evaluate";
import { computeDateRange } from "../src/lib/dates";
import {
  discardStagedReservation,
  nonRefundableAfter,
  stageReservation,
  transitionReservation,
} from "../src/lib/reservation";
import { EMPTY_TRIP_INTENT, type Reservation, type ReservationStatus, type TripIntent } from "../src/lib/schemas";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

function run(label: string, fn: () => void) {
  console.log(`\n=== ${label} ===`);
  fn();
}

function throws(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function acceptedCandidateReservation(): Reservation {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    checkIn: "Sept 12",
    checkOut: "Sept 14",
    hardRequirements: ["Pet-friendly", "Capacity for 4"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  return stageReservation(top.campsite, intent.guestCount as number, intent.checkIn as string, intent.checkOut as string)
    .reservation;
}

/** Review → Add payment → Save: the route to Confirm with no saved payment. */
function throughAddPayment(reservation: Reservation): Reservation {
  const adding = transitionReservation(reservation, { type: "BEGIN_ADD_PAYMENT" }).reservation;
  return transitionReservation(adding, { type: "ADD_PAYMENT_METHOD", label: "Visa •••• 4471" }).reservation;
}

// 1. Accepted candidate produces the correct staged reservation.
run("Accepted candidate produces the correct staged reservation", () => {
  const site = CAMPSITES.find((c) => c.id === "blue-ridge-14")!;
  const { reservation, event } = stageReservation(site, 4, "Sept 12", "Sept 14");

  assert(reservation.status === "staged", `initial status should be "staged" — got ${reservation.status}`);
  assert(reservation.campsite.id === site.id, "reservation references the accepted campsite");
  assert(reservation.guestCount === 4, "guest count carried over from TripIntent");
  const expectedNights = computeDateRange("Sept 12", "Sept 14")!.nights;
  assert(
    reservation.nights === expectedNights,
    "nights derived from the actual requested check-in/check-out, not a campsite property (Dataset Depth correction, 2026-09-04)",
  );
  assert(reservation.nightlyRate === site.pricePerNight, "nightly rate sourced from campsite record");
  assert(reservation.serviceFee === site.serviceFee, "service fee sourced from campsite record");
  const expectedTotal = Math.round((site.pricePerNight * expectedNights + site.serviceFee) * 100) / 100;
  assert(
    reservation.total === expectedTotal,
    `total computed deterministically — got ${reservation.total}, expected ${expectedTotal}`,
  );
  assert(reservation.paymentMethodLabel === null, "no payment method on file yet");
  assert(reservation.confirmationNumber === null, "no confirmation number before authorization");
  assert(event.type === "reservation_staged", `stageReservation emits a reservation_staged event — got "${event.type}"`);
  assert(event.relatedIds?.campsiteId === site.id, "the emitted event references the actual campsite");
});

// 2. Staged state is clearly not committed.
run("Staged state is clearly not committed", () => {
  const reservation = acceptedCandidateReservation();
  assert(reservation.status !== "reserved", "a freshly staged reservation must never be 'reserved'");
  assert(reservation.confirmationNumber === null, "no confirmation number exists until authorized");
});

// 3. Party size is a conversational prerequisite of staging — a reservation
// can never exist without it, so the flow has no missing-info state.
run("A reservation cannot be staged without a party size", () => {
  const site = CAMPSITES.find((c) => c.id === "blue-ridge-14")!;
  for (const bad of [null, 0, -1, 2.5]) {
    assert(
      throws(() => stageReservation(site, bad as unknown as number, "Sept 12", "Sept 14")),
      `stageReservation refuses guestCount ${bad}`,
    );
  }
  const base = acceptedCandidateReservation();
  assert(
    throws(() =>
      transitionReservation({ ...base, status: "incomplete" as ReservationStatus }, { type: "CONTINUE_TO_CONFIRMATION" }),
    ),
    "no missing-info status is accepted by the state machine",
  );
});

// 4. No payment: Review → Add payment → Confirm. Payment is resolved inside
// the flow BEFORE confirmation — never an error discovered by an attempt.
run("No payment method: Review → Add payment → Confirm", () => {
  const staged = acceptedCandidateReservation();
  assert(staged.paymentMethodLabel === null, "a freshly staged reservation has no payment method");
  assert(
    throws(() => transitionReservation(staged, { type: "CONTINUE_TO_CONFIRMATION" })),
    "continuing to Confirm without a payment method throws — there is no missing-payment error state",
  );
  const { reservation: adding, event: started } = transitionReservation(staged, { type: "BEGIN_ADD_PAYMENT" });
  assert(adding.status === "adding_payment", `Review's primary action opens Add payment — got ${adding.status}`);
  assert(started.type === "payment_entry_started", `emits payment_entry_started — got "${started.type}"`);

  const { reservation: confirming, event } = transitionReservation(adding, {
    type: "ADD_PAYMENT_METHOD",
    label: "Visa •••• 4471",
  });
  assert(
    confirming.status === "ready_for_authorization",
    `saving a payment method continues straight to Confirm your reservation — got ${confirming.status}`,
  );
  assert(event.type === "payment_method_added", `emits payment_method_added — got "${event.type}"`);
  assert(confirming.paymentMethodLabel === "Visa •••• 4471", "payment method value is exactly what was saved");
  assert(confirming.confirmationNumber === null, "saving a payment method charges/books nothing");
});

// 4b. Leaving Add payment returns to Review with nothing lost.
run("Cancelling Add payment returns to Review unchanged", () => {
  const staged = acceptedCandidateReservation();
  const adding = transitionReservation(staged, { type: "BEGIN_ADD_PAYMENT" }).reservation;
  const { reservation: back, event } = transitionReservation(adding, { type: "CANCEL_ADD_PAYMENT" });
  assert(back.status === "staged", `back on Review — got ${back.status}`);
  assert(event.type === "payment_entry_dismissed", `emits payment_entry_dismissed — got "${event.type}"`);
  assert(JSON.stringify(back) === JSON.stringify(staged), "staged reservation data survives unchanged");
  assert(
    throws(() => transitionReservation(staged, { type: "ADD_PAYMENT_METHOD", label: "Visa •••• 4471" })),
    "a payment method is only saved from the Add payment step",
  );
});

// 5. Confirm repeats exact deterministic values.
run("Confirm uses exact deterministic values", () => {
  // Payment already on file (after cancelling Confirm): Review's
  // "Continue to confirm" presents the same deterministic details.
  const back = transitionReservation(throughAddPayment(acceptedCandidateReservation()), {
    type: "CANCEL_AUTHORIZATION",
  }).reservation;
  const attempt = transitionReservation(back, { type: "CONTINUE_TO_CONFIRMATION" });
  const reservation = attempt.reservation;
  assert(reservation.status === "ready_for_authorization", `payment on file → Confirm — got ${reservation.status}`);
  assert(
    attempt.event.type === "authorization_presented",
    `CONTINUE_TO_CONFIRMATION emits authorization_presented — got "${attempt.event.type}"`,
  );
  assert(
    reservation.total ===
      Math.round((reservation.nightlyRate * reservation.nights + reservation.serviceFee) * 100) / 100,
    "amount to charge is the same deterministic total computed at staging time",
  );
  assert(
    /^[A-Z][a-z]{2} \d{1,2}$/.test(nonRefundableAfter(reservation)) &&
      reservation.cancellationPolicy.includes(nonRefundableAfter(reservation)),
    `Confirm's non-refundable date comes from the real policy — got "${nonRefundableAfter(reservation)}"`,
  );
});

// 6. Dismissing Confirm preserves staged state.
run("Dismissing Confirm preserves staged state", () => {
  const reservation = throughAddPayment(acceptedCandidateReservation());
  const beforeCancel = JSON.stringify({ ...reservation, status: undefined });
  const { reservation: cancelled, event } = transitionReservation(reservation, { type: "CANCEL_AUTHORIZATION" });
  assert(cancelled.status === "staged", `cancel should return to "staged" — got ${cancelled.status}`);
  assert(
    event.type === "authorization_dismissed",
    `CANCEL_AUTHORIZATION emits authorization_dismissed — got "${event.type}"`,
  );
  assert(
    beforeCancel === JSON.stringify({ ...cancelled, status: undefined }),
    "cancelling must not lose or alter any staged data",
  );
});

// 7. Confirm's explicit authorization → Processing → Booking confirmed.
run("Explicit authorization: Confirm → Processing → Confirmed", () => {
  let reservation = throughAddPayment(acceptedCandidateReservation());
  reservation = transitionReservation(reservation, { type: "BEGIN_AUTHORIZE" }).reservation;
  assert(reservation.status === "authorizing", `authorization enters Processing — got ${reservation.status}`);
  assert(reservation.confirmationNumber === null, "nothing is confirmed while processing");
  assert(
    throws(() => transitionReservation(reservation, { type: "CANCEL_AUTHORIZATION" })),
    "Processing cannot be cancelled (Figma offers no cancel there)",
  );

  const { reservation: reserved, event } = transitionReservation(reservation, { type: "AUTHORIZE" });
  assert(reserved.status === "reserved", `successful processing reaches Booking confirmed — got ${reserved.status}`);
  assert(reserved.confirmationNumber !== null, "a confirmation number is set on reservation");
  assert(
    event.type === "reservation_reserved",
    `a "reservation_reserved" event exists only alongside the valid AUTHORIZE transition — got "${event.type}"`,
  );
});

// 8. No code path can reach "reserved" without authorization — every other
// status must reject an AUTHORIZE attempt outright (throw). Since the event
// is returned from the SAME call, a throw also means no reserved event.
run('No code path can reach "reserved" (or its event) without an explicit AUTHORIZE from "authorizing"', () => {
  const base = acceptedCandidateReservation();
  const others: ReservationStatus[] = ["staged", "adding_payment", "ready_for_authorization", "reserved"];
  for (const status of others) {
    assert(
      throws(() => transitionReservation({ ...base, status }, { type: "AUTHORIZE" })),
      `AUTHORIZE from status "${status}" must throw, never silently succeed`,
    );
  }
  const { reservation: result, event } = transitionReservation({ ...base, status: "authorizing" }, { type: "AUTHORIZE" });
  assert(result.status === "reserved", 'AUTHORIZE from "authorizing" is the one valid path to "reserved"');
  assert(event.type === "reservation_reserved", "and it is the one valid path to the reservation_reserved event");

  // Adjacent invariant: BEGIN_AUTHORIZE only from Confirm.
  for (const status of ["staged", "adding_payment", "authorizing", "reserved"] as ReservationStatus[]) {
    assert(
      throws(() => transitionReservation({ ...base, status }, { type: "BEGIN_AUTHORIZE" })),
      `BEGIN_AUTHORIZE from status "${status}" must throw`,
    );
  }
});

// 8b. Cancel reservation / Edit reservation discard only an uncharged,
// staged reservation — never one that is processing or confirmed.
run("Discarding a staged reservation (Cancel / Edit)", () => {
  const staged = acceptedCandidateReservation();
  const cancelled = discardStagedReservation(staged, "cancelled");
  assert(cancelled.type === "reservation_cancelled" && /Nothing was charged/.test(cancelled.description), "Cancel emits reservation_cancelled");
  const editing = discardStagedReservation(throughAddPayment(staged), "editing");
  assert(editing.type === "trip_edit_requested", "Edit (also from Confirm) emits trip_edit_requested");
  for (const status of ["authorizing", "reserved"] as ReservationStatus[]) {
    assert(
      throws(() => discardStagedReservation({ ...staged, status }, "cancelled")),
      `a reservation in "${status}" can't be discarded`,
    );
  }
});

// 8c. A payment method saved earlier in the session carries into a re-staged
// reservation (after Edit / Cancel), so Review offers Continue to confirm.
run("Re-staging keeps the saved payment method", () => {
  const site = CAMPSITES.find((c) => c.id === "blue-ridge-14")!;
  const { reservation } = stageReservation(site, 4, "Sept 12", "Sept 14", "Visa •••• 4471");
  assert(reservation.status === "staged" && reservation.paymentMethodLabel === "Visa •••• 4471", "staged with the saved method");
  assert(
    transitionReservation(reservation, { type: "CONTINUE_TO_CONFIRMATION" }).reservation.status === "ready_for_authorization",
    "Continue to confirm goes straight to Confirm",
  );
});

// 9. Repeated simulated authorization is deterministic.
run("Repeated simulated authorization is deterministic", () => {
  const build = () => {
    let reservation = throughAddPayment(acceptedCandidateReservation());
    reservation = transitionReservation(reservation, { type: "BEGIN_AUTHORIZE" }).reservation;
    return transitionReservation(reservation, { type: "AUTHORIZE" }).reservation;
  };
  const first = build();
  const second = build();
  assert(
    first.confirmationNumber === second.confirmationNumber,
    `identical reservations must produce the identical confirmation number — got "${first.confirmationNumber}" vs "${second.confirmationNumber}"`,
  );
  assert(JSON.stringify(first) === JSON.stringify(second), "repeated authorization of identical input is byte-identical end to end");
});

if (failures > 0) {
  console.error(`\n${failures} reservation check(s) failed.`);
  process.exit(1);
}
console.log("\nAll reservation checks passed.");
