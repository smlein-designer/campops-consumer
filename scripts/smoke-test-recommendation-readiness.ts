/**
 * Regression coverage for the recommendation-readiness gate
 * (src/lib/recommendation-readiness.ts — Search Truth correction,
 * 2026-09-02, extended by the Exploratory Discovery correction, 2026-09-07,
 * see docs/implementation-decisions.md). This is the THIRD gate ("does the
 * system have enough structured intent to make a non-arbitrary
 * recommendation?"), deliberately distinct from semantic status and
 * deterministic prerequisites. Fixes two reproduced bugs:
 *   - "Find me somewhere good for camping" + dates alone used to jump
 *     straight to a specific recommendation (Mossy Creek) with nothing
 *     else to explain it by (availability-backed path).
 *   - "What are some quiet campgrounds that are good for families?" used
 *     to jump straight to a specific, geographically arbitrary
 *     recommendation because "quiet"/"family-friendly" alone satisfied the
 *     availability-backed rule's "any one signal" leniency — even though
 *     exploratory discovery specifically needs a destination to be a
 *     meaningfully narrowed answer (exploratory path).
 */
import { checkRecommendationReadiness } from "../src/lib/recommendation-readiness";
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

// --- Availability-backed path (unchanged rule: any one signal suffices) ---

run("Dates alone are not sufficient for recommendation readiness (availability-backed)", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    checkIn: "Sept 12",
    checkOut: "Sept 14",
  };
  const result = checkRecommendationReadiness(intent, { availabilityBacked: true });
  assert(
    result.status === "insufficient",
    `dates alone (no destination/party size/preference) must be insufficient — got "${result.status}"`,
  );
});

run("An empty intent (nothing at all) is insufficient (availability-backed)", () => {
  const result = checkRecommendationReadiness(EMPTY_TRIP_INTENT, { availabilityBacked: true });
  assert(result.status === "insufficient", "an empty intent must be insufficient");
});

run("A destination region alone is sufficient (availability-backed)", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, destinationRegion: "Hill Country" };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: true }).status === "ready",
    "a named destination region is one of the acceptable dimensions on its own",
  );
});

run("An origin ZIP alone is sufficient (availability-backed — it's itself a destination-shaping signal)", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, originZip: "78701" };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: true }).status === "ready",
    "an origin ZIP counts as a destination-shaping signal on its own",
  );
});

run("A party size alone is sufficient (availability-backed)", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4 };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: true }).status === "ready",
    "party size is one of the acceptable dimensions on its own",
  );
});

run("A single stated preference/requirement alone is sufficient (availability-backed)", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    preferences: ["Quiet"],
  };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: true }).status === "ready",
    "an important preference/trip character is one of the acceptable dimensions on its own",
  );
});

run("Readiness does not require every dimension at once (availability-backed)", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    checkIn: "Sept 12",
    checkOut: "Sept 14",
    guestCount: 4,
  };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: true }).status === "ready",
    "dates + party size together should already be ready — no need for a destination too",
  );
});

run("The insufficient question never exposes a confidence score", () => {
  const result = checkRecommendationReadiness(EMPTY_TRIP_INTENT, { availabilityBacked: true });
  if (result.status === "insufficient") {
    assert(
      !/\d+%|confidence/i.test(result.question),
      "the readiness question must be plain language, never a numeric confidence score",
    );
  }
});

// --- Exploratory discovery path (2026-09-07 correction: destination REQUIRED) ---

run("Quiet + family-friendly preferences alone are NOT sufficient for exploratory discovery", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    preferences: ["quiet", "family-friendly"],
  };
  const result = checkRecommendationReadiness(intent, { availabilityBacked: false });
  assert(
    result.status === "insufficient",
    `exploratory discovery with trip-character preferences but no destination must still be insufficient — got "${result.status}" (this is the exact reproduced regression: "What are some quiet campgrounds that are good for families?")`,
  );
});

run("The exploratory insufficient question asks for area/destination specifically", () => {
  const result = checkRecommendationReadiness(EMPTY_TRIP_INTENT, { availabilityBacked: false });
  assert(
    result.status === "insufficient" && /area|destination/i.test(result.question),
    `expected a destination-specific question — got: ${JSON.stringify(result)}`,
  );
});

run("The exploratory insufficient question offers a deterministic 'A specific park/region' branch quick reply", () => {
  const result = checkRecommendationReadiness(EMPTY_TRIP_INTENT, { availabilityBacked: false });
  assert(result.status === "insufficient", "setup: insufficient");
  if (result.status === "insufficient") {
    const branch = result.quickReplies?.find((q) => /specific park/i.test(q.label));
    assert(!!branch, "a 'A specific park/region' quick reply must be offered");
    assert(
      !!branch?.followUpQuestion && /which park or region/i.test(branch.followUpQuestion),
      `the branch's followUpQuestion must ask which park/region — got: "${branch?.followUpQuestion}"`,
    );
  }
});

run("A destination region satisfies exploratory readiness", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    destinationRegion: "Hill Country",
    preferences: ["quiet", "family-friendly"],
  };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: false }).status === "ready",
    "once a destination is known, exploratory discovery can proceed",
  );
});

run("An origin ZIP alone also satisfies exploratory readiness", () => {
  const intent: TripIntent = { ...EMPTY_TRIP_INTENT, originZip: "78701" };
  assert(
    checkRecommendationReadiness(intent, { availabilityBacked: false }).status === "ready",
    "an origin ZIP is itself a geographic anchor, sufficient for exploratory discovery too",
  );
});

if (failures > 0) {
  console.error(`\n${failures} recommendation-readiness check(s) failed.`);
  process.exit(1);
}
console.log("\nAll recommendation-readiness checks passed.");
