/**
 * Verifies the v3 scripted events (src/lib/v3/scripted-events.ts) — Build
 * Brief stage 7 check: "each fires and resets reliably."
 */
import { applyTurn } from "../src/lib/v3/agent-loop";
import { emptyTrip } from "../src/lib/v3/trip-factory";
import {
  choosePontoonSlot,
  fireCampsiteUnavailable,
  fireForecastChange,
  fireHoldExpiry,
  resolveCampsiteUnavailableHold,
  resolveForecastDecision,
  resolveHoldExpiryRehold,
} from "../src/lib/v3/scripted-events";
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

run("Forecast change: proposes Sunday, keeps the hold, posts one Needs You item", () => {
  const trip = goldenPathTrip();
  const { trip: afterFire, factsToPhrase } = fireForecastChange(trip, now);

  assert(afterFire.conditions.some((c) => c.type === "forecast"), "a forecast condition is logged");
  assert(afterFire.needsYouQueue.length === 1, `exactly one Needs You item, got ${afterFire.needsYouQueue.length}`);
  assert(afterFire.needsYouQueue[0]?.kind === "forecast_move", "the item is tagged forecast_move");

  const pontoon = afterFire.bookings.find((b) => b.refId === "lakeshore-pontoon")!;
  assert(pontoon.status === "changed_needs_ok", `pontoon booking is changed_needs_ok, got "${pontoon.status}"`);
  assert(factsToPhrase.length > 0, "facts were produced to phrase");

  // Idempotent: firing again does nothing further.
  const { trip: firedTwice } = fireForecastChange(afterFire, now);
  assert(firedTwice.needsYouQueue.length === 1, "firing the same event twice does not duplicate the Needs You item");

  const resolved = resolveForecastDecision(afterFire, afterFire.needsYouQueue[0].id, true, now);
  const resolvedPontoon = resolved.trip.bookings.find((b) => b.refId === "lakeshore-pontoon")!;
  assert(resolvedPontoon.status === "held", `keeping Sunday re-holds the pontoon, got "${resolvedPontoon.status}"`);
  assert(resolved.trip.needsYouQueue.length === 0, "the Needs You item is resolved");
  assert(
    resolved.trip.agent.currentStepText === "Everything is held · ready to book",
    "the trip returns to the ready-to-book state",
  );
});

run("Pontoon · Other Times: picking any open slot finalizes it, not just keep/revert", () => {
  const trip = goldenPathTrip();
  const { trip: afterFire } = fireForecastChange(trip, now);
  const itemId = afterFire.needsYouQueue[0].id;

  // Slot index 3 is neither the original (0) nor the proposed (1) slot —
  // exactly the case resolveForecastDecision's two-option shortcut can't
  // reach, matching Figma's 4-option "Other Times" picker (node 36:1610).
  const { trip: picked, factsToPhrase } = choosePontoonSlot(afterFire, itemId, 3, now);
  const pontoon = picked.bookings.find((b) => b.refId === "lakeshore-pontoon")!;
  assert(pontoon.status === "held", `the chosen slot is held, got "${pontoon.status}"`);
  assert(pontoon.day === "2027-04-18" && pontoon.time === "13:00-17:00", `the booking reflects the chosen slot, got ${pontoon.day} ${pontoon.time}`);
  assert(picked.needsYouQueue.length === 0, "the Needs You item is resolved");
  assert(factsToPhrase.length > 0, "an acknowledgment is produced");
});

run("Hold expiry: re-holds without asking when within permission, asks when not", () => {
  const trip = goldenPathTrip();
  const trailRide = trip.bookings.find((b) => b.refId === "hcr-beginner-trail")!;
  const originalHoldId = trailRide.holdId;

  const { trip: reheld } = fireHoldExpiry(trip, trailRide.id, now);
  const reheldBooking = reheld.bookings.find((b) => b.id === trailRide.id)!;
  assert(reheldBooking.status === "held", "re-held automatically, no Needs You item");
  assert(reheld.needsYouQueue.length === 0, "nothing is pending — re-hold did not ask");
  assert(reheldBooking.holdId !== originalHoldId, "a new hold id was issued for the re-hold");

  const tripWithPermissionOff = {
    ...trip,
    permissions: trip.permissions.map((p) => (p.id === "rehold_on_expiry" ? { ...p, enabled: false } : p)),
  };
  const { trip: asked } = fireHoldExpiry(tripWithPermissionOff, trailRide.id, now);
  assert(asked.needsYouQueue.length === 1, "asks when re-hold permission is off");
  const askedBooking = asked.bookings.find((b) => b.id === trailRide.id)!;
  assert(askedBooking.status === "hold_expired", `booking shows hold_expired while asking, got "${askedBooking.status}"`);

  const resolved = resolveHoldExpiryRehold(asked, asked.needsYouQueue[0].id, trailRide.id, now);
  assert(resolved.trip.bookings.find((b) => b.id === trailRide.id)?.status === "held", "resolving re-holds it");
  assert(resolved.trip.needsYouQueue.length === 0, "the item is resolved");
});

run("Campsite unavailable: posts the loss first, then the recommendation", () => {
  // A trip where Cedar Point (no dog requirement) is the natural first pick.
  const noDogExtraction: V3IntentExtraction = { ...goldenPathExtraction, pets: 0, requirements: [{ label: "Waterfront", tier: "must" }] };
  const trip = applyTurn(emptyTrip(), noDogExtraction, now).trip;
  const campsiteBooking = trip.bookings.find((b) => b.kind === "campsite")!;

  const { trip: afterLoss, factsToPhrase } = fireCampsiteUnavailable(trip, campsiteBooking.refId, now);
  assert(/booked by (another party|someone else)/.test(factsToPhrase[0] ?? ""), "the loss is stated first");
  assert(
    afterLoss.bookings.find((b) => b.id === campsiteBooking.id)?.status === "released",
    "the lost campsite's booking is released",
  );
  assert(afterLoss.needsYouQueue.length === 1, "a recommendation is posted as a Needs You item");
  assert(afterLoss.needsYouQueue[0]?.kind === "campsite_unavailable", "the item is tagged campsite_unavailable");

  const recommendedId = afterLoss.needsYouQueue[0].payload?.campsiteId ?? "";
  const resolved = resolveCampsiteUnavailableHold(afterLoss, afterLoss.needsYouQueue[0].id, recommendedId, now);
  assert(
    resolved.trip.bookings.some((b) => b.kind === "campsite" && b.refId === recommendedId && b.status === "held"),
    "accepting the recommendation holds the new site",
  );
  assert(resolved.trip.needsYouQueue.length === 0, "the item is resolved");

  // No-op when the lost site was never actually held.
  const untouchedTrip = goldenPathTrip(); // Pine Hollow held, not Cedar Point
  const { trip: noOp } = fireCampsiteUnavailable(untouchedTrip, "cedar-point-3", now);
  assert(noOp.needsYouQueue.length === 0, "no recommendation is posted when the lost site wasn't the one held");
});

run("Reset: a fresh empty trip has no bookings, holds, or pending decisions", () => {
  const fresh = emptyTrip();
  assert(fresh.bookings.length === 0 && fresh.holds.length === 0 && fresh.needsYouQueue.length === 0, "reset trip is clean");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 scripted-event checks passed.");
}
