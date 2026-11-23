/**
 * Verifies campground add-ons (PRD v3 §10 "Campground add-ons: for example
 * firewood bundle, kayak rental, ice, late checkout") are actually offered
 * and bookable — src/lib/v3/add-ons.ts existed with zero consumers before
 * this; suggestionFor only ever considered activities.
 */
import { acceptSuggestion, dismissSuggestion } from "../src/lib/v3/agent-loop";
import { suggestionFor } from "../src/lib/v3/rules-suggestion";
import { defaultPermissions } from "../src/lib/v3/trip-factory";
import { emptyTrip } from "../src/lib/v3/trip-factory";
import { CAMPSITES } from "../src/lib/campsites";

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
const pineHollow = CAMPSITES.find((c) => c.campgroundName === "Pine Hollow")!;

run("An add-on is offered once every near-site activity type is dismissed", () => {
  const permissions = defaultPermissions();
  const activityTypes = ["boat", "horseback", "guided_hike", "kayak"];
  const suggestion = suggestionFor({ campsite: pineHollow, dismissedTypes: activityTypes, permissions, hasPendingDecision: false });
  assert(suggestion !== null, "a suggestion is still offered once every activity type is dismissed");
  assert(suggestion?.target.kind === "addon", `falls back to an add-on, got ${JSON.stringify(suggestion?.target)}`);
});

run("Accepting an add-on suggestion holds it as a real booking", () => {
  const permissions = defaultPermissions();
  const suggestion = suggestionFor({
    campsite: pineHollow,
    dismissedTypes: ["boat", "horseback", "guided_hike", "kayak"],
    permissions,
    hasPendingDecision: false,
  });
  assert(suggestion?.target.kind === "addon", "an add-on suggestion is offered");

  let trip = emptyTrip();
  trip = { ...trip, suggestions: [suggestion!] };
  const { trip: accepted, factsToPhrase } = acceptSuggestion(trip, suggestion!.id, now);
  const booking = accepted.bookings.find((b) => b.kind === "addon");
  assert(!!booking, "an addon booking is created");
  assert(booking?.status === "held", "the add-on is held, not silently added at approved status");
  assert(factsToPhrase.length > 0, "an acknowledgment fact is produced");
});

run("Dismissing an add-on suggestion never offers that exact add-on again", () => {
  const permissions = defaultPermissions();
  const suggestion = suggestionFor({
    campsite: pineHollow,
    dismissedTypes: ["boat", "horseback", "guided_hike", "kayak"],
    permissions,
    hasPendingDecision: false,
  });
  let trip = emptyTrip();
  trip = { ...trip, suggestions: [suggestion!] };
  const dismissed = dismissSuggestion(trip, suggestion!.id);
  const again = suggestionFor({
    campsite: pineHollow,
    dismissedTypes: dismissed.dismissedSuggestionTypes,
    permissions,
    hasPendingDecision: false,
  });
  assert(again === null || again.target.id !== suggestion!.target.id, "the exact dismissed add-on is never re-offered");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll v3 add-on checks passed.");
