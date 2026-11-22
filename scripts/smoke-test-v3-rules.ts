/**
 * Verifies the v3 rules engines (src/lib/v3/rules-*) — Build Brief stage 5
 * check: "unit tests for no water, overlap, over-limit hold, lowered
 * permission, dismissed suggestion."
 */
import { CAMPSITES } from "../src/lib/campsites";
import { ACTIVITIES, ACTIVITIES_BY_ID } from "../src/lib/v3/providers";
import { activityBookingsToDrop, checkActivityOverlap } from "../src/lib/v3/rules-dependency";
import { checkPermission } from "../src/lib/v3/rules-permission";
import { suggestionFor } from "../src/lib/v3/rules-suggestion";
import { defaultPermissions } from "../src/lib/v3/trip-factory";
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

run("No water: switching to a no-water campsite drops the pontoon booking", () => {
  const bookings: Booking[] = [
    {
      id: "b-pontoon",
      kind: "activity",
      refId: pontoon.id,
      title: pontoon.name,
      day: "Sun",
      price: 180,
      refundTerms: pontoon.refundTerms,
      dependsOn: ["b-campsite"],
      status: "held",
      holdId: "hold-pontoon",
    },
    {
      id: "b-guide",
      kind: "activity",
      refId: guidedHike.id,
      title: guidedHike.name,
      day: "Sun",
      price: 34,
      refundTerms: guidedHike.refundTerms,
      dependsOn: ["b-campsite"],
      status: "held",
      holdId: "hold-guide",
    },
  ];
  // Prairie Flats has neither water access nor trailhead access, so both
  // the pontoon (water) and the guided hike (trailhead) are dropped.
  const dropped = activityBookingsToDrop(prairieFlats, bookings, ACTIVITIES_BY_ID);
  assert(dropped.length === 2, `both bookings dropped, got ${dropped.length}`);
  const pontoonDrop = dropped.find((d) => d.booking.id === "b-pontoon");
  assert(!!pontoonDrop, "the pontoon booking is dropped");
  assert(/no water access/.test(pontoonDrop?.reason ?? ""), `reason names the missing water access — got "${pontoonDrop?.reason}"`);
  const hikeDrop = dropped.find((d) => d.booking.id === "b-guide");
  assert(!!hikeDrop, "the guided hike booking is dropped");
  assert(/no trailhead access/.test(hikeDrop?.reason ?? ""), `reason names the missing trailhead access — got "${hikeDrop?.reason}"`);

  const droppedAtPineHollow = activityBookingsToDrop(pineHollow, bookings, ACTIVITIES_BY_ID);
  assert(droppedAtPineHollow.length === 0, "nothing is dropped when the campsite still has water access");
});

run("Overlap: the beginner/intermediate trail ride pair conflicts; a hiking slot does not", () => {
  const existing = [{ activity: beginnerTrail, slotIndex: 0 }];
  const conflict = checkActivityOverlap(intermediateTrail, 0, existing);
  assert(conflict.result === "conflict", "booking the intermediate ride over the beginner ride's slot conflicts");
  if (conflict.result === "conflict") {
    assert(conflict.conflictingWith.id === beginnerTrail.id, "conflict names the beginner trail ride");
    assert(conflict.alternativeSlotIndex === null, "there is no alternate slot for the intermediate ride, so the agent must ask");
  }

  const ok = checkActivityOverlap(guidedHike, 0, existing);
  assert(ok.result === "ok", "the guided hike's Sunday slot does not conflict with the Saturday trail ride");
});

run("Over-limit hold: a $320 hold asks when the limit is $300", () => {
  const permissions = defaultPermissions();
  const overLimit = checkPermission(permissions, { type: "hold", refundable: true, amountUsd: 320 });
  assert(overLimit.result === "ask", `a $320 hold over the $300 limit must ask — got ${overLimit.result}`);
  assert(overLimit.permissionId === "hold_refundable", "names the hold_refundable permission");

  const underLimit = checkPermission(permissions, { type: "hold", refundable: true, amountUsd: 168 });
  assert(underLimit.result === "allow", `a $168 hold under the $300 limit is allowed — got ${underLimit.result}`);

  assert(
    checkPermission(permissions, { type: "book_and_charge" }).result === "ask",
    "charging always asks, regardless of settings",
  );
});

run("Lowered permission: the same $280 hold flips from allow to ask once the limit drops", () => {
  const permissions = defaultPermissions();
  const before = checkPermission(permissions, { type: "hold", refundable: true, amountUsd: 280 });
  assert(before.result === "allow", `$280 is allowed under the default $300 limit — got ${before.result}`);

  const lowered = permissions.map((p) => (p.id === "hold_refundable" ? { ...p, limitUsd: 200 } : p));
  const after = checkPermission(lowered, { type: "hold", refundable: true, amountUsd: 280 });
  assert(after.result === "ask", `the same $280 hold must ask once the limit drops to $200 — got ${after.result}`);
});

run("Dismissed suggestion: a dismissed activity type is never offered again", () => {
  const permissions = defaultPermissions();
  const first = suggestionFor({ campsite: pineHollow, dismissedTypes: [], permissions, hasPendingDecision: false });
  assert(first !== null, "a suggestion is offered at Pine Hollow with nothing dismissed yet");

  const dismissedType = ACTIVITIES_BY_ID[first!.activityId].type;
  const afterDismiss = suggestionFor({
    campsite: pineHollow,
    dismissedTypes: [dismissedType],
    permissions,
    hasPendingDecision: false,
  });
  assert(
    afterDismiss === null || ACTIVITIES_BY_ID[afterDismiss.activityId].type !== dismissedType,
    "the dismissed type is never offered again",
  );

  const midDecision = suggestionFor({ campsite: pineHollow, dismissedTypes: [], permissions, hasPendingDecision: true });
  assert(midDecision === null, "no suggestion is offered while a decision is pending");

  const permissionOff = permissions.map((p) => (p.id === "suggest_extras" ? { ...p, enabled: false } : p));
  const withPermissionOff = suggestionFor({
    campsite: pineHollow,
    dismissedTypes: [],
    permissions: permissionOff,
    hasPendingDecision: false,
  });
  assert(withPermissionOff === null, "no suggestion is offered once the permission is off");

  const noWaterSite = suggestionFor({
    campsite: prairieFlats,
    dismissedTypes: [],
    permissions,
    hasPendingDecision: false,
  });
  assert(
    noWaterSite === null || !ACTIVITIES_BY_ID[noWaterSite.activityId].requiresWaterAccess,
    "a no-water campsite is never offered a water-dependent suggestion",
  );
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 rules-engine checks passed.");
}
