/**
 * Verifies v3 Review and Approve (src/lib/v3/authorize.ts) — Build Brief
 * stage 8 / Definition of Done check: "no path reaches approved without
 * the commit action."
 */
import { applyTurn } from "../src/lib/v3/agent-loop";
import { emptyTrip } from "../src/lib/v3/trip-factory";
import { commitBooking, removeBooking, reverifyHolds } from "../src/lib/v3/authorize";
import type { V3IntentExtraction } from "../src/lib/v3/intent-schema";

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

const now = Date.now();

const goldenPathExtraction: V3IntentExtraction = {
  checkIn: "Apr 16",
  checkOut: "Apr 18",
  adults: 4,
  pets: 1,
  originZip: null,
  driveLimitHours: null,
  budgetUsd: null,
  requirements: [
    { label: "Waterfront", tier: "must" },
    { label: "Dogs OK", tier: "must" },
    { label: "Trail ride", tier: "nice" },
    { label: "Pontoon", tier: "nice" },
    { label: "Guided hike", tier: "nice" },
  ],
  status: "actionable",
  clarificationQuestion: null,
  unsupportedReason: null,
};

function goldenPathTrip() {
  return applyTurn(emptyTrip(), goldenPathExtraction, now).trip;
}

run("Removing the campsite removes every activity that depends on it", () => {
  const trip = goldenPathTrip();
  const campsite = trip.bookings.find((b) => b.kind === "campsite")!;
  assert(trip.bookings.length === 4, "starts with 4 bookings");

  const after = removeBooking(trip, campsite.id, now);
  assert(after.bookings.length === 0, `removing the campsite removes every dependent activity, got ${after.bookings.length} left`);
  assert(after.holds.length === 0, "every hold for the removed bookings is released");
  assert(after.authorization.removedBookingIds.length === 4, "all 4 removed ids are recorded");
});

run("Removing one activity only removes that activity", () => {
  const trip = goldenPathTrip();
  const pontoon = trip.bookings.find((b) => b.refId === "lakeshore-pontoon")!;
  const after = removeBooking(trip, pontoon.id, now);
  assert(after.bookings.length === 3, `3 bookings remain, got ${after.bookings.length}`);
  assert(!after.bookings.some((b) => b.id === pontoon.id), "the pontoon booking itself is gone");
});

run("Re-verify catches an expired hold before committing", () => {
  const trip = goldenPathTrip();
  const stillGood = reverifyHolds(trip, now);
  assert(stillGood.ok, "all holds are fresh right after booking");

  const futureNow = now + 60 * 60_000; // 1 hour later — past the 20-minute demo hold.
  const expired = reverifyHolds(trip, futureNow);
  assert(!expired.ok, "holds are reported expired an hour later");

  const commitAttempt = commitBooking(trip, "Visa ending 4242", futureNow);
  assert(!commitAttempt.ok, "commit refuses to proceed with an expired hold");
  if (!commitAttempt.ok) {
    assert(commitAttempt.expiredBookingIds.length === 4, "every expired booking is named");
  }
});

run("Commit is the only path to approved", () => {
  const trip = goldenPathTrip();
  assert(trip.bookings.every((b) => b.status !== "approved"), "nothing is approved before commit");

  const result = commitBooking(trip, "Visa ending 4242", now);
  assert(result.ok, "commit succeeds with fresh holds and a payment method");
  if (result.ok) {
    assert(result.trip.bookings.every((b) => b.status === "approved"), "every booking is approved after commit");
    assert(result.trip.holds.length === 0, "holds are cleared once booked");
    assert(result.trip.authorization.approved, "authorization.approved is true");
    assert(result.trip.authorization.paymentMethodLabel === "Visa ending 4242", "the payment method is recorded");
    assert(result.trip.agent.currentStepText === "Trip booked", 'agent says "Trip booked"');
  }
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 authorize checks passed.");
}
