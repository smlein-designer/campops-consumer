/**
 * Verifies the reservation staging + authorization state machine
 * (src/lib/reservation.ts) against the required scenarios. Pure logic only
 * (no React, no network) — the hard invariant this slice exists to prove
 * must hold at the transition-function level, not only in the UI.
 */
import { CAMPSITES } from "../src/lib/campsites";
import { evaluateCampsites } from "../src/lib/evaluate";
import {
  computeMissingFields,
  stageReservation,
  transitionReservation,
} from "../src/lib/reservation";
import {
  EMPTY_TRIP_INTENT,
  type Reservation,
  type ReservationStatus,
  type TripIntent,
} from "../src/lib/schemas";

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

function acceptedCandidateReservation(): Reservation {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Capacity for 4"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  return stageReservation(top.campsite, intent.guestCount);
}

// 1. Accepted candidate produces the correct staged reservation.
run("Accepted candidate produces the correct staged reservation", () => {
  const site = CAMPSITES.find((c) => c.id === "blue-ridge-14")!;
  const reservation = stageReservation(site, 4);

  assert(
    reservation.status === "staged",
    `initial status should be "staged" — got ${reservation.status}`,
  );
  assert(
    reservation.campsite.id === site.id,
    "reservation references the accepted campsite",
  );
  assert(
    reservation.guestCount === 4,
    "guest count carried over from TripIntent",
  );
  assert(
    reservation.nights === site.nights,
    "nights sourced from campsite record",
  );
  assert(
    reservation.nightlyRate === site.pricePerNight,
    "nightly rate sourced from campsite record",
  );
  assert(
    reservation.serviceFee === site.serviceFee,
    "service fee sourced from campsite record",
  );
  const expectedTotal =
    Math.round((site.pricePerNight * site.nights + site.serviceFee) * 100) /
    100;
  assert(
    reservation.total === expectedTotal,
    `total computed deterministically — got ${reservation.total}, expected ${expectedTotal}`,
  );
  assert(
    reservation.paymentMethodLabel === null,
    "no payment method on file yet",
  );
  assert(
    reservation.confirmationNumber === null,
    "no confirmation number before authorization",
  );
});

// 2. Staged state is clearly not committed.
run("Staged state is clearly not committed", () => {
  const reservation = acceptedCandidateReservation();
  assert(
    reservation.status !== "reserved",
    "a freshly staged reservation must never be 'reserved'",
  );
  assert(
    reservation.confirmationNumber === null,
    "no confirmation number exists until authorized",
  );
});

// 3. Incomplete booking attempt produces Missing Info without losing staged state.
run(
  "Incomplete attempt produces Missing Info without losing staged state",
  () => {
    const staged = acceptedCandidateReservation();
    const before = JSON.stringify({ ...staged, status: undefined }); // compare everything except status

    const attempted = transitionReservation(staged, {
      type: "RESERVE_ATTEMPT",
    });
    assert(
      attempted.status === "incomplete",
      `missing payment method should yield "incomplete" — got ${attempted.status}`,
    );

    const after = JSON.stringify({ ...attempted, status: undefined });
    assert(
      before === after,
      "all staged reservation data must survive the failed attempt unchanged",
    );
    assert(
      computeMissingFields(attempted).includes("Payment method"),
      "computeMissingFields correctly reports the missing field",
    );
  },
);

// 4. Authorization surface repeats exact deterministic values.
run("Authorization surface uses exact deterministic values", () => {
  let reservation = acceptedCandidateReservation();
  reservation = transitionReservation(reservation, {
    type: "ADD_PAYMENT_METHOD",
    label: "Visa •••• 4471",
  });
  reservation = transitionReservation(reservation, { type: "RESERVE_ATTEMPT" });
  assert(
    reservation.status === "ready_for_authorization",
    `complete info should reach "ready_for_authorization" — got ${reservation.status}`,
  );
  // The values an Authorize Booking surface would display are read directly
  // off this object — assert they are exactly the staged facts, not derived
  // or re-computed some other way.
  assert(
    reservation.paymentMethodLabel === "Visa •••• 4471",
    "payment method value is exactly what was added",
  );
  assert(
    reservation.total ===
      Math.round(
        (reservation.nightlyRate * reservation.nights +
          reservation.serviceFee) *
          100,
      ) /
        100,
    "amount to charge is the same deterministic total computed at staging time",
  );
});

// 5. Dismissing authorization preserves staged state.
run("Dismissing authorization preserves staged state", () => {
  let reservation = acceptedCandidateReservation();
  reservation = transitionReservation(reservation, {
    type: "ADD_PAYMENT_METHOD",
    label: "Visa •••• 4471",
  });
  reservation = transitionReservation(reservation, { type: "RESERVE_ATTEMPT" });
  const beforeCancel = JSON.stringify({ ...reservation, status: undefined });

  const cancelled = transitionReservation(reservation, {
    type: "CANCEL_AUTHORIZATION",
  });
  assert(
    cancelled.status === "staged",
    `cancel should return to "staged" — got ${cancelled.status}`,
  );
  const afterCancel = JSON.stringify({ ...cancelled, status: undefined });
  assert(
    beforeCancel === afterCancel,
    "cancelling authorization must not lose or alter any staged data",
  );
});

// 6. Explicit authorization transitions staged -> reserved.
run("Explicit authorization transitions staged -> reserved", () => {
  let reservation = acceptedCandidateReservation();
  reservation = transitionReservation(reservation, {
    type: "ADD_PAYMENT_METHOD",
    label: "Visa •••• 4471",
  });
  reservation = transitionReservation(reservation, { type: "RESERVE_ATTEMPT" });
  reservation = transitionReservation(reservation, { type: "BEGIN_AUTHORIZE" });
  assert(
    reservation.status === "authorizing",
    `should be "authorizing" before AUTHORIZE — got ${reservation.status}`,
  );

  reservation = transitionReservation(reservation, { type: "AUTHORIZE" });
  assert(
    reservation.status === "reserved",
    `explicit AUTHORIZE should yield "reserved" — got ${reservation.status}`,
  );
  assert(
    reservation.confirmationNumber !== null,
    "a confirmation number is set on reservation",
  );
});

// 7. No code path can reach "reserved" without authorization — every other
// status must reject an AUTHORIZE attempt outright (throw), not silently
// ignore it or advance anyway.
run(
  'No code path can reach "reserved" without an explicit AUTHORIZE from "authorizing"',
  () => {
    const base = acceptedCandidateReservation();
    const statuses: ReservationStatus[] = [
      "staged",
      "incomplete",
      "ready_for_authorization",
      "reserved",
    ];
    for (const status of statuses) {
      const reservation: Reservation = { ...base, status };
      let threw = false;
      try {
        transitionReservation(reservation, { type: "AUTHORIZE" });
      } catch {
        threw = true;
      }
      assert(
        threw,
        `AUTHORIZE from status "${status}" must throw, never silently succeed`,
      );
    }

    // The only valid starting point:
    const authorizing: Reservation = { ...base, status: "authorizing" };
    const result = transitionReservation(authorizing, { type: "AUTHORIZE" });
    assert(
      result.status === "reserved",
      'AUTHORIZE from "authorizing" is the one valid path to "reserved"',
    );

    // Also guard the adjacent invariant: BEGIN_AUTHORIZE must only work from
    // "ready_for_authorization".
    for (const status of [
      "staged",
      "incomplete",
      "authorizing",
      "reserved",
    ] as ReservationStatus[]) {
      const reservation: Reservation = { ...base, status };
      let threw = false;
      try {
        transitionReservation(reservation, { type: "BEGIN_AUTHORIZE" });
      } catch {
        threw = true;
      }
      assert(threw, `BEGIN_AUTHORIZE from status "${status}" must throw`);
    }
  },
);

// 8. Repeated simulated authorization is deterministic.
run("Repeated simulated authorization is deterministic", () => {
  const build = () => {
    let reservation = acceptedCandidateReservation();
    reservation = transitionReservation(reservation, {
      type: "ADD_PAYMENT_METHOD",
      label: "Visa •••• 4471",
    });
    reservation = transitionReservation(reservation, {
      type: "RESERVE_ATTEMPT",
    });
    reservation = transitionReservation(reservation, {
      type: "BEGIN_AUTHORIZE",
    });
    return transitionReservation(reservation, { type: "AUTHORIZE" });
  };
  const first = build();
  const second = build();
  assert(
    first.confirmationNumber === second.confirmationNumber,
    `identical reservations must produce the identical confirmation number — got "${first.confirmationNumber}" vs "${second.confirmationNumber}"`,
  );
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "repeated authorization of identical input is byte-identical end to end",
  );
});

if (failures > 0) {
  console.error(`\n${failures} reservation check(s) failed.`);
  process.exit(1);
}
console.log("\nAll reservation checks passed.");
