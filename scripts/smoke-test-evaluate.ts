import { evaluateCampsites } from "../src/lib/evaluate";
import type { TripIntent } from "../src/lib/schemas";
import { EMPTY_TRIP_INTENT } from "../src/lib/schemas";

function run(label: string, intent: TripIntent) {
  const result = evaluateCampsites(intent);
  console.log(`\n=== ${label} ===`);
  console.log("kind:", result.kind);
  for (const c of result.candidates) {
    console.log(
      `  #${c.rank} ${c.campsite.siteName} @ ${c.campsite.campgroundName} — matchType=${c.matchType} preserved=${JSON.stringify(
        c.preserved,
      )} compromises=${JSON.stringify(c.compromises)}`,
    );
  }
}

// 1. Full match — everything is verifiable and satisfied (from prior slice).
run("Full match", {
  ...EMPTY_TRIP_INTENT,
  guestCount: 4,
  hardRequirements: ["Pet-friendly", "Capacity for 4"],
  preferences: ["Near water"],
  priorities: ["Keep cost low"],
});

// 2. Compromise — a hard requirement the evaluator cannot recognize/verify
// must demote every candidate to "compromise", never silently pass as full.
run("Compromise (unverifiable hard requirement)", {
  ...EMPTY_TRIP_INTENT,
  guestCount: 4,
  hardRequirements: ["Pet-friendly", "Has a hammock stand"], // unrecognized concept
});

// 3. No match — a hard requirement every site actually fails.
run("No match (every site fails a hard requirement)", {
  ...EMPTY_TRIP_INTENT,
  guestCount: 20, // no site has this capacity
  hardRequirements: ["Capacity for 20"],
});

// 4. Refinement — dropping the impossible requirement should recover a full match.
run("Refinement recovers a full match", {
  ...EMPTY_TRIP_INTENT,
  guestCount: 4,
  hardRequirements: ["Pet-friendly"],
});
