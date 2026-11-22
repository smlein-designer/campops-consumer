/**
 * Verifies the v3 data layer (src/lib/v3) — Build Brief stage 3 check:
 * "unit tests for totals ($642), refund terms, slot overlaps."
 */
import { CAMPSITES } from "../src/lib/campsites";
import { ACTIVITIES, activitiesNear, campsiteSatisfiesActivityRequirement } from "../src/lib/v3/providers";
import { activityBookingPrice, tripTotal } from "../src/lib/v3/money";
import { describeActivityRefund, isActivityRefundable } from "../src/lib/v3/refund";
import { slotsOverlap } from "../src/lib/v3/overlap";
import type { Booking } from "../src/lib/v3/schemas";

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

const pineHollow = CAMPSITES.find((c) => c.id === "pine-hollow-14")!;
const prairieFlats = CAMPSITES.find((c) => c.id === "prairie-flats-22")!;
const pontoon = ACTIVITIES.find((a) => a.id === "lakeshore-pontoon")!;
const beginnerTrail = ACTIVITIES.find((a) => a.id === "hcr-beginner-trail")!;
const intermediateTrail = ACTIVITIES.find((a) => a.id === "hcr-intermediate-trail")!;
const guidedHike = ACTIVITIES.find((a) => a.id === "granite-ridge-guided-hike")!;

run("The 5 named demo sites exist alongside the original 25", () => {
  assert(CAMPSITES.length === 30, `expected 30 campsites, got ${CAMPSITES.length}`);
  for (const id of ["cedar-point-3", "pine-hollow-14", "live-oak-bend-7", "prairie-flats-22", "ridgeview-31"]) {
    assert(CAMPSITES.some((c) => c.id === id), `${id} is in the dataset`);
  }
});

run("Golden-path total: campsite $168 + trail ride $260 + pontoon $180 + guide $34 = $642", () => {
  const bookings: Booking[] = [
    {
      id: "b-campsite",
      kind: "campsite",
      refId: pineHollow.id,
      title: `${pineHollow.campgroundName} · ${pineHollow.siteName}`,
      day: "Apr 16-18",
      price: pineHollow.pricePerNight * 2 + pineHollow.serviceFee,
      refundTerms: "Fully refundable until Apr 14",
      dependsOn: [],
      status: "held",
      holdId: null,
    },
    {
      id: "b-trail-ride",
      kind: "activity",
      refId: beginnerTrail.id,
      title: beginnerTrail.name,
      day: "Sat",
      time: "10:00-12:00",
      price: activityBookingPrice(beginnerTrail, 4),
      refundTerms: beginnerTrail.refundTerms,
      dependsOn: ["b-campsite"],
      status: "held",
      holdId: null,
    },
    {
      id: "b-pontoon",
      kind: "activity",
      refId: pontoon.id,
      title: pontoon.name,
      day: "Sat",
      time: "14:00-18:00",
      price: activityBookingPrice(pontoon, 4),
      refundTerms: pontoon.refundTerms,
      dependsOn: ["b-campsite"],
      status: "held",
      holdId: null,
    },
    {
      id: "b-guide",
      kind: "activity",
      refId: guidedHike.id,
      title: guidedHike.name,
      day: "Sun",
      time: "07:00-08:30",
      price: activityBookingPrice(guidedHike, 4),
      refundTerms: guidedHike.refundTerms,
      dependsOn: ["b-campsite"],
      status: "held",
      holdId: null,
    },
  ];
  assert(bookings[0].price === 168, `campsite booking is $168, got $${bookings[0].price}`);
  assert(bookings[1].price === 260, `trail ride booking is $260, got $${bookings[1].price}`);
  assert(bookings[2].price === 180, `pontoon booking is $180, got $${bookings[2].price}`);
  assert(bookings[3].price === 34, `guide booking is $34, got $${bookings[3].price}`);
  assert(tripTotal(bookings) === 642, `trip total is $642, got $${tripTotal(bookings)}`);
});

run("Refund terms are relative to the slot, not a stale literal", () => {
  const farInAdvance = new Date("2027-01-01T00:00:00");
  assert(
    isActivityRefundable(pontoon, 0, farInAdvance),
    "pontoon is refundable a long time before its slot",
  );
  assert(
    describeActivityRefund(pontoon, 0, farInAdvance) === pontoon.refundTerms,
    "far in advance shows the normal refund terms",
  );

  const slot = pontoon.slots[0];
  const insideCutoff = new Date(`${slot.date}T${slot.startTime}:00`);
  insideCutoff.setHours(insideCutoff.getHours() - 1); // 1 hour before, cutoff is 24
  assert(
    !isActivityRefundable(pontoon, 0, insideCutoff),
    "pontoon is not refundable inside its 24-hour cutoff",
  );
  assert(
    describeActivityRefund(pontoon, 0, insideCutoff).includes("Non-refundable"),
    "inside the cutoff shows non-refundable copy",
  );
});

run("Slot overlaps: the beginner and intermediate trail rides overlap on purpose", () => {
  assert(
    slotsOverlap(beginnerTrail.slots[0], intermediateTrail.slots[0]),
    "beginner (10:00-12:00) and intermediate (11:00-13:00) trail rides overlap",
  );
  assert(
    !slotsOverlap(beginnerTrail.slots[0], pontoon.slots[0]),
    "beginner trail ride (10:00-12:00) and the Saturday pontoon (14:00-18:00) do not overlap",
  );
  assert(
    !slotsOverlap(beginnerTrail.slots[0], { date: "2027-04-18", startTime: "10:00", endTime: "12:00" }),
    "identical times on a different date never overlap",
  );
});

run("Dependency rule: water-access activities only offered where the campsite has water", () => {
  assert(
    campsiteSatisfiesActivityRequirement(pontoon, pineHollow),
    "Pine Hollow (lake, direct access) can offer the pontoon",
  );
  assert(
    !campsiteSatisfiesActivityRequirement(pontoon, prairieFlats),
    "Prairie Flats (no water access) cannot offer the pontoon",
  );
  const prairieFlatsActivities = activitiesNear(prairieFlats);
  assert(
    !prairieFlatsActivities.some((a) => a.requiresWaterAccess),
    "no water-dependent activity is offered at Prairie Flats",
  );
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 trip data checks passed.");
}
