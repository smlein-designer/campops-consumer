/**
 * Verifies the availability-loss recovery slice against the six required
 * scenarios. Uses only evaluateCampsites/recovery helpers directly (no
 * model call) — this is deterministic application logic and should be
 * fully testable without a live API key.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { buildRecoveryMessages } from "../src/lib/recovery";
import { EMPTY_TRIP_INTENT, type TripIntent } from "../src/lib/schemas";

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

// 1. Preferred candidate becomes unavailable, a full-match substitute exists.
run("Loss with a full-match substitute", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Capacity for 4"],
  };
  const initial = evaluateCampsites(intent);
  assert(
    initial.kind === "full",
    `initial evaluation should be full — got ${initial.kind}`,
  );
  assert(
    initial.candidates.length >= 2,
    "expect at least two full-match candidates initially",
  );

  const lost = initial.candidates[0];
  const excluded = new Set([lost.campsite.id]);
  const adapted = evaluateCampsites(intent, excluded);

  assert(
    adapted.kind === "full",
    `after loss, substitute should still be full — got ${adapted.kind}`,
  );
  assert(
    adapted.candidates[0].campsite.id !== lost.campsite.id,
    "the adapted top candidate must not be the lost site",
  );

  const { lossMessage, adaptedMessage } = buildRecoveryMessages(lost, adapted);
  console.log("  lossMessage:", lossMessage);
  console.log("  adaptedMessage:", adaptedMessage);
});

// 2. Preferred candidate becomes unavailable, only a compromise substitute exists.
run("Loss with only a compromise substitute", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["Pet-friendly", "Wifi"], // "Wifi" is unverifiable everywhere except the one site that lists it
  };
  const initial = evaluateCampsites(intent);
  assert(
    initial.kind === "full",
    `initial evaluation should be full — got ${initial.kind}`,
  );
  assert(
    initial.candidates.length === 1,
    "expect exactly one full-match candidate for this setup",
  );

  const lost = initial.candidates[0];
  const excluded = new Set([lost.campsite.id]);
  const adapted = evaluateCampsites(intent, excluded);

  assert(
    adapted.kind === "compromise",
    `after losing the only full match, best remaining should be compromise — got ${adapted.kind}`,
  );
  assert(
    adapted.candidates.length > 0,
    "expect at least one compromise candidate remaining",
  );

  const { lossMessage, adaptedMessage } = buildRecoveryMessages(lost, adapted);
  console.log("  lossMessage:", lossMessage);
  console.log("  adaptedMessage:", adaptedMessage);
});

// 3. Preferred candidate becomes unavailable, no viable recommendation remains.
run("Loss with no viable recommendation remaining", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Capacity for 4", "Tent"],
  };
  const initial = evaluateCampsites(intent);
  assert(
    initial.kind === "full",
    `initial evaluation should be full — got ${initial.kind}`,
  );
  assert(
    initial.candidates.length === 1,
    "expect exactly one full-match candidate for this setup",
  );

  const lost = initial.candidates[0];
  const excluded = new Set([lost.campsite.id]);
  const adapted = evaluateCampsites(intent, excluded);

  assert(
    adapted.kind === "no_match",
    `after losing the only viable candidate, nothing else should qualify — got ${adapted.kind}`,
  );

  const { lossMessage, adaptedMessage } = buildRecoveryMessages(lost, adapted);
  console.log("  lossMessage:", lossMessage);
  console.log("  adaptedMessage:", adaptedMessage);
});

// 4. Original TripIntent is unchanged across recovery.
run("TripIntent is not mutated during recovery", () => {
  const intent: TripIntent = Object.freeze({
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: Object.freeze([
      "Pet-friendly",
      "Capacity for 4",
    ]) as unknown as string[],
  });
  const before = JSON.stringify(intent);

  const initial = evaluateCampsites(intent);
  const lost = initial.candidates[0];
  const adapted = evaluateCampsites(intent, new Set([lost.campsite.id]));
  void adapted;

  const after = JSON.stringify(intent);
  assert(
    before === after,
    "TripIntent must be byte-identical before and after recovery",
  );
  // Object.freeze means any accidental mutation attempt would throw in
  // strict mode rather than silently succeed — reaching this line at all
  // is itself part of the proof.
});

// 5. Unavailable candidate cannot be recommended again.
run("Unavailable candidate never re-enters the candidate set", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Capacity for 4"],
  };
  const initial = evaluateCampsites(intent);
  const lost = initial.candidates[0];
  const excluded = new Set([lost.campsite.id]);

  // Re-evaluate multiple times (as a refinement loop would) and confirm the
  // excluded site never reappears anywhere in the candidate list, not even
  // ranked lower.
  for (let i = 0; i < 3; i++) {
    const result = evaluateCampsites(intent, excluded);
    const reentered = result.candidates.some(
      (c) => c.campsite.id === lost.campsite.id,
    );
    assert(
      !reentered,
      `pass ${i + 1}: excluded site must not appear anywhere in candidates`,
    );
  }
});

// 6. Repeated execution is deterministic for the scripted exception.
run("Repeated execution is deterministic", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Capacity for 4"],
  };
  const excluded = new Set(["blue-ridge-14"]);
  const first = evaluateCampsites(intent, excluded);
  const second = evaluateCampsites(intent, excluded);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "identical inputs must produce byte-identical evaluation results",
  );
});

if (failures > 0) {
  console.error(`\n${failures} recovery check(s) failed.`);
  process.exit(1);
}
console.log("\nAll recovery checks passed.");
