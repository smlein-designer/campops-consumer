/**
 * Regression coverage for the Exploratory Discovery Gate + Family-Friendly
 * Structured Enforcement correction (2026-09-07 — see
 * docs/implementation-decisions.md). Reproduced bug: "What are some quiet
 * campgrounds that are good for families?" jumped straight to a specific,
 * geographically arbitrary recommendation (Medina Lake) with no
 * area/destination clarification at all — "quiet"/"family-friendly"
 * preferences alone satisfied the recommendation-readiness gate's "any one
 * signal" leniency, which is correct for an AVAILABILITY-BACKED search but
 * wrong for exploratory discovery, which specifically needs a destination
 * to be a meaningfully narrowed answer. A second, related gap found during
 * live verification: an unsatisfied SOFT preference (e.g. "quiet" for a
 * site that isn't) was completely invisible — no compromise chip, no
 * acknowledgment it was even considered.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { checkRecommendationReadiness } from "../src/lib/recommendation-readiness";
import { CAMPSITES } from "../src/lib/campsites";
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

// --- The exact reproduced query, at the readiness-gate level (item 1/2/7) ---

run("Exploratory 'quiet + family-friendly' preferences alone do not satisfy exploratory readiness", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    preferences: ["quiet", "family-friendly"],
  };
  const result = checkRecommendationReadiness(intent, { availabilityBacked: false });
  assert(
    result.status === "insufficient",
    `this is the exact reproduced regression — must still require a destination — got "${result.status}"`,
  );
});

run("The SAME intent, availability-backed, is treated as ready (modes must not swallow each other)", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    preferences: ["quiet", "family-friendly"],
  };
  const result = checkRecommendationReadiness(intent, { availabilityBacked: true });
  assert(
    result.status === "ready",
    "an availability-backed request with a stated trip character is unaffected by the exploratory-specific rule",
  );
});

run("Once a destination is supplied, exploratory discovery can proceed", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    destinationRegion: "Hill Country",
    preferences: ["quiet", "family-friendly"],
  };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: false }).status === "ready",
    "destination + trip character together are ready for exploratory discovery",
  );
});

// --- Family-friendly must be grounded in structured familyFeatures (item 4) ---

run("'family-friendly' is enforced against real familyFeatures, not a generic boolean", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["family-friendly"],
  });
  assert(
    result.candidates.every((c) => c.campsite.familyFeatures.length > 0),
    "every matching candidate must actually have at least one real family feature",
  );
});

// --- Quiet must map to noiseLevel, never seclusion (item 6) ---

run("'quiet' maps to noiseLevel, not seclusion", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    hardRequirements: ["quiet"],
  });
  assert(
    result.candidates.every((c) => c.campsite.noiseLevel === "low"),
    "every matching candidate must actually have noiseLevel 'low'",
  );
  // A site that is highly SECLUDED but not quiet must not satisfy "quiet".
  const secludedButLoud = CAMPSITES.find((c) => c.seclusion === "high" && c.noiseLevel !== "low");
  if (secludedButLoud) {
    assert(
      !result.candidates.some((c) => c.campsite.id === secludedButLoud.id),
      `${secludedButLoud.id} is secluded but not quiet — must not satisfy a "quiet" requirement`,
    );
  }
});

// --- Combined quiet + family-friendly: satisfied-where-possible, visible either way (items 5/6) ---

const BOTH_SITE = CAMPSITES.find((c) => c.noiseLevel === "low" && c.familyFeatures.length > 0)!;
const FAMILY_ONLY_SITE = CAMPSITES.find(
  (c) => c.familyFeatures.length > 0 && c.noiseLevel !== "low",
)!;

run("A site satisfying BOTH quiet and family-friendly shows both as preserved", () => {
  assert(!!BOTH_SITE, "setup: a site satisfying both must exist in the dataset");
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    destinationRegion: BOTH_SITE.region,
    hardRequirements: ["quiet", "family-friendly"],
  });
  const top = result.candidates.find((c) => c.campsite.id === BOTH_SITE.id);
  assert(!!top, `${BOTH_SITE.id} should be a candidate`);
  assert(
    !!top && top.preserved.includes("quiet") && top.preserved.includes("family-friendly"),
    `both requirements should show as preserved — got ${JSON.stringify(top?.preserved)}`,
  );
});

run("A candidate that satisfies family-friendly but NOT quiet (soft tier) still surfaces the unmet preference, not silence", () => {
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    destinationRegion: FAMILY_ONLY_SITE.region,
    preferences: ["quiet", "family-friendly"],
  });
  const top = result.candidates.find((c) => c.campsite.id === FAMILY_ONLY_SITE.id);
  assert(!!top, `${FAMILY_ONLY_SITE.id} should be a candidate (soft misses never block a match)`);
  assert(
    !!top && top.preserved.includes("family-friendly"),
    "the satisfied soft preference is shown as preserved",
  );
  assert(
    !!top && top.compromises.some((m) => /didn.t fully match.*quiet/i.test(m)),
    `the unsatisfied soft preference must be visibly acknowledged, not silently dropped — got ${JSON.stringify(top?.compromises)}`,
  );
});

run("An unmet soft preference never contaminates no-match's confirmed-failing-hard-label logic", () => {
  // Regression guard for the exact risk introduced by making soft misses
  // visible: they must use a DIFFERENT prefix than confirmed hard
  // failures, so summarizeNoMatch/widenSearch (which scan specifically for
  // UNSATISFIED_PREFIX) never mistake a soft miss for a match-blocking one.
  const result = evaluateCampsites({
    ...EMPTY_TRIP_INTENT,
    guestCount: 20, // genuinely unsatisfiable by any site — forces no_match
    preferences: ["quiet"],
  });
  assert(result.kind === "no_match", "setup: guestCount 20 is unsatisfiable");
  for (const c of result.candidates) {
    assert(
      !c.compromises.some((m) => m.startsWith("Doesn't satisfy: quiet")),
      "an unsatisfied SOFT preference must never appear under the hard-failure prefix",
    );
  }
});

if (failures > 0) {
  console.error(`\n${failures} exploratory-gate check(s) failed.`);
  process.exit(1);
}
console.log("\nAll exploratory-gate checks passed.");
