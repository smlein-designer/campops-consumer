/**
 * Verifies the compromise/tradeoff explanation UI (src/lib/v3/fit.ts,
 * wired into agent-loop.ts's continueTrip and scripted-events.ts's
 * fireCampsiteUnavailable/resolveCampsiteUnavailableHold) — PRD v3 §5.4
 * "which requirements are kept, which are traded off... must name any
 * must-have that is missed" and §7.3 "communicate meaningful differences
 * from the original option." Previously this existed only as a
 * presentational component (CampsiteOption/FitRow) used by static Figma
 * fixtures — never computed or shown by the live agent loop.
 */
import { applyTurn } from "../src/lib/v3/agent-loop";
import { fireCampsiteUnavailable, resolveCampsiteUnavailableHold } from "../src/lib/v3/scripted-events";
import { emptyTrip } from "../src/lib/v3/trip-factory";
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

function extraction(overrides: Partial<V3IntentExtraction>): V3IntentExtraction {
  return {
    checkIn: null,
    checkOut: null,
    adults: null,
    pets: null,
    originZip: null,
    driveLimitHours: null,
    budgetUsd: null,
    requirements: [],
    status: "actionable",
    clarificationQuestion: null,
    unsupportedReason: null,
    clarificationOptions: null,
    ...overrides,
  };
}

run("No-match: the closest option is shown with exactly what it misses", () => {
  const { trip } = applyTurn(
    emptyTrip(),
    extraction({
      checkIn: "Apr 16",
      checkOut: "Apr 18",
      adults: 4,
      requirements: [
        { label: "Tent site", tier: "must" },
        { label: "Cabin", tier: "must" },
      ],
    }),
    now,
    "a tent site that's also a cabin, for 4",
  );
  assert(!!trip.campsiteComparison, "a campsite comparison is attached");
  assert(!trip.campsiteComparison?.lost, "no-match has no 'lost' side — just the closest option");
  assert(trip.campsiteComparison?.recommended.eyebrow === "Closest option", "the recommended side is labeled Closest option");
  const fit = trip.campsiteComparison?.recommended.fit ?? [];
  assert(
    fit.some((r) => r.state === "missed"),
    `at least one must-have is named as missed, got ${JSON.stringify(fit)}`,
  );
});

run("Campsite unavailable: the lost site and the replacement are compared with fit rows", () => {
  const { trip: held } = applyTurn(
    emptyTrip(),
    extraction({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 4, requirements: [{ label: "Waterfront", tier: "must" }, { label: "Dog allowed", tier: "must" }] }),
    now,
    "A waterfront, dog-friendly site for 4, Apr 16 to 18",
  );
  const campsiteId = held.bookings.find((b) => b.kind === "campsite")!.refId;

  const { trip: lostTrip } = fireCampsiteUnavailable(held, campsiteId, now);
  assert(!!lostTrip.campsiteComparison, "a comparison is attached when the preferred site is lost");
  assert(lostTrip.campsiteComparison?.lost?.unavailable === true, "the lost side is marked unavailable (struck through)");
  assert(
    lostTrip.campsiteComparison?.lost?.fit.some((r) => r.state === "missed" && r.requirement === "Availability"),
    "the lost side names availability as the missed requirement",
  );
  const recommendedFit = lostTrip.campsiteComparison?.recommended.fit ?? [];
  assert(
    recommendedFit.some((r) => r.state === "kept" && r.requirement === "Waterfront"),
    `the replacement's kept must-haves are named, got ${JSON.stringify(recommendedFit)}`,
  );

  const item = lostTrip.needsYouQueue.find((n) => n.kind === "campsite_unavailable")!;
  const recommendedId = item.payload?.campsiteId ?? "";
  const { trip: resolved } = resolveCampsiteUnavailableHold(lostTrip, item.id, recommendedId, now);
  assert(resolved.campsiteComparison === null, "the comparison clears once the replacement is held");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll v3 fit-explanation checks passed.");
