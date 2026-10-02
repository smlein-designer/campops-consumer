/**
 * Verifies direct-manipulation Requirement Chip removal (Handoff Spec 2.4's
 * removable-chip affordance): src/lib/requirements.ts's pure removal logic,
 * and src/lib/events.ts's requirement_removed event deriver. Distinct from
 * chat-driven refinement (requirement_refined) — see
 * docs/implementation-decisions.md for the actor/event-type reasoning.
 *
 * Also covers the 2026-09-01 design-resolution update: removal must be
 * consistently available wherever editable requirement chips are shown,
 * including the Candidate Card's preserved/compromise rows during a
 * recommendation/compromise state — gated by `isRemovableHardRequirement` so
 * synthetic checks (e.g. "Capacity for 4", derived from `guestCount`, not
 * from `hardRequirements` text) correctly stay non-removable this way.
 */
import { evaluateCampsites } from "../src/lib/evaluate";
import { deriveRequirementRemovedEvent } from "../src/lib/events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isRemovableHardRequirement,
  rawRequirementLabel,
  removeRequirement,
  requirementKeyFor,
  resolveChipSource,
  clearChipSource,
  getDerivedRequirements,
} from "../src/lib/requirements";
import {
  checkSearchPrerequisites,
  explicitSearchRequirements,
  isUnconstrainedDestinationAnswer,
  questionFor,
} from "../src/lib/prerequisites";
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

const BASE: TripIntent = {
  ...EMPTY_TRIP_INTENT,
  goalStatement: "A 4-person pet-friendly camping trip near water.",
  guestCount: 4,
  hardRequirements: ["Pet-friendly", "Near water"],
  flexibleConstraints: ["Under $150/night"],
  preferences: ["Wifi"],
  priorities: ["Willing to drive farther for more seclusion"],
};

// 1. Removing one chip changes only the intended tier/value — every other
//    field, including the other three requirement tiers, is untouched.
run("Removing one requirement touches only its own tier/value", () => {
  const { intent, changed } = removeRequirement(
    BASE,
    "hardRequirements",
    "Near water",
  );
  assert(changed, "removal of a present value should report changed: true");
  assert(
    JSON.stringify(intent.hardRequirements) === JSON.stringify(["Pet-friendly"]),
    "hardRequirements should retain only the untouched entry",
  );
  assert(
    JSON.stringify(intent.flexibleConstraints) ===
      JSON.stringify(BASE.flexibleConstraints),
    "flexibleConstraints must be byte-identical to the original",
  );
  assert(
    JSON.stringify(intent.preferences) === JSON.stringify(BASE.preferences),
    "preferences must be byte-identical to the original",
  );
  assert(
    JSON.stringify(intent.priorities) === JSON.stringify(BASE.priorities),
    "priorities must be byte-identical to the original",
  );
  assert(
    intent.guestCount === BASE.guestCount &&
      intent.goalStatement === BASE.goalStatement,
    "unrelated scalar fields (guestCount, goalStatement) must be untouched",
  );
});

// 2. Removing a value that isn't present is a no-op, not a silent mutation.
run("Removing an absent value is a no-op", () => {
  const { intent, changed } = removeRequirement(
    BASE,
    "hardRequirements",
    "Something never stated",
  );
  assert(!changed, "removal of an absent value should report changed: false");
  assert(
    JSON.stringify(intent) === JSON.stringify(BASE),
    "a no-op removal must return the intent unchanged",
  );
});

// 3. requirement_removed event language names the real removed value and tier.
run("requirement_removed event names the real change", () => {
  const event = deriveRequirementRemovedEvent("hard", "Near water");
  assert(event.type === "requirement_removed", "event type is requirement_removed");
  assert(event.actor === "user", "actor is 'user' — this is a direct action, not agent interpretation");
  assert(
    event.description.includes("Near water") &&
      event.description.includes("hard requirement"),
    `description should factually name the removed value and its tier — got "${event.description}"`,
  );
});

// 4. requirement_removed is distinct from requirement_refined (chat-driven
//    path) as an event type, even though both mutate TripIntent.
run("requirement_removed is a distinct event type from requirement_refined", () => {
  const event = deriveRequirementRemovedEvent("preference", "Wifi");
  assert(
    (event.type as string) !== "requirement_refined",
    "direct removal must never be logged under the chat-refinement event type",
  );
});

// 5. rawRequirementLabel strips known compromise-description prefixes and
//    leaves already-raw (preserved-style) labels untouched.
run("rawRequirementLabel recovers the underlying label", () => {
  assert(
    rawRequirementLabel("Doesn't satisfy: Pet-friendly") === "Pet-friendly",
    "strips the 'Doesn't satisfy:' prefix",
  );
  assert(
    rawRequirementLabel("Couldn't verify: Wifi") === "Wifi",
    "strips the 'Couldn't verify:' prefix",
  );
  assert(
    rawRequirementLabel("Pet-friendly") === "Pet-friendly",
    "an already-raw (preserved-style) label is returned unchanged",
  );
});

// 6. isRemovableHardRequirement gates on literal hardRequirements membership
//    — a synthetic, structurally-derived check (capacity) is never removable
//    this way, since there is nothing in hardRequirements text to remove.
run("isRemovableHardRequirement distinguishes real entries from synthetic checks", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly"],
  };
  assert(
    isRemovableHardRequirement(intent, "Pet-friendly"),
    "a literal hardRequirements entry (preserved-style, unprefixed) is removable",
  );
  assert(
    isRemovableHardRequirement(intent, "Doesn't satisfy: Pet-friendly"),
    "the same entry is still recognized through its compromise-prefixed form",
  );
  assert(
    !isRemovableHardRequirement(intent, "Capacity for 4"),
    "a synthetic capacity check is NOT removable — it isn't literal hardRequirements text",
  );
  assert(
    !isRemovableHardRequirement(intent, "Never stated"),
    "a label with no matching hardRequirements entry is not removable",
  );
});

// 7. End-to-end against a real evaluation: exactly the expected Candidate
//    Card chips are flagged removable, both in a full-match's "preserved"
//    row and a compromise's mixed preserved/compromise rows.
run("Real evaluation output: only literal hardRequirements chips are removable", () => {
  const intent: TripIntent = {
    ...EMPTY_TRIP_INTENT,
    guestCount: 4,
    hardRequirements: ["Pet-friendly", "Wifi"],
  };
  const result = evaluateCampsites(intent);
  const top = result.candidates[0];
  assert(!!top, "setup: an evaluation result should exist");
  if (top) {
    const removable = [...top.preserved, ...top.compromises].filter((l) =>
      isRemovableHardRequirement(intent, l),
    );
    const nonRemovable = [...top.preserved, ...top.compromises].filter(
      (l) => !isRemovableHardRequirement(intent, l),
    );
    assert(
      removable.some((l) => rawRequirementLabel(l) === "Pet-friendly"),
      "Pet-friendly (a literal hardRequirements entry) should be flagged removable",
    );
    // "Capacity for 4" is always present (guestCount: 4) and never removable.
    assert(
      nonRemovable.some((l) => l === "Capacity for 4"),
      "Capacity for 4 (synthetic, guestCount-derived) should never be flagged removable",
    );
  }
});

// --- Requirement-removal model (2026-10-01): X means "CampOps, don't assume
// this anymore" for EVERY trip chip. It clears the chip's semantic source;
// whether the search can still run is decided by the existing search
// prerequisites (destination/dates/party size gaps → ask, don't search).
const TRIP: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4, checkIn: "Oct 16", checkOut: "Oct 18" };
const count = (i: TripIntent) => {
  const r = evaluateCampsites(i);
  return r.kind === "no_match" ? 0 : r.candidates.length;
};
const removeChip = (intent: TripIntent, label: string) => {
  const source = resolveChipSource(intent, label);
  return { source, intent: source ? clearChipSource(intent, source) : intent };
};
const gapAfter = (intent: TripIntent, source: ReturnType<typeof resolveChipSource>) =>
  checkSearchPrerequisites(intent, {
    availabilityBacked: true,
    required: [
      ...(source?.kind === "destination" ? (["destination"] as const) : []),
      ...(source?.kind === "party_size" ? (["guest_count"] as const) : []),
    ],
  });

run("Every card chip resolves to the trip fact it stands for", () => {
  const intent: TripIntent = {
    ...TRIP,
    guestCount: 10,
    destinationRegion: "San Antonio",
    travelingWithPets: true,
    petCount: 1,
    budget: { maxPerNight: 150, maxTotal: null },
    hardRequirements: ["RV site"],
    flexibleConstraints: ["near water"],
    preferences: ["hookups"],
  };
  const top = evaluateCampsites(intent).candidates[0];
  const labels = [...top.preserved, ...top.compromises];
  const unresolved = labels.filter((l) => !resolveChipSource(intent, l));
  assert(unresolved.length === 0, `no chip shows an X without a source — unresolved: ${JSON.stringify(unresolved)}`);
  const kinds = Object.fromEntries(labels.map((l) => [l.replace(/^[^:]+: /, ""), resolveChipSource(intent, l)?.kind]));
  assert(
    kinds["Capacity for 10"] === "party_size" &&
      kinds["In San Antonio"] === "destination" &&
      kinds["Available for your dates"] === "dates" &&
      kinds["Pet-friendly"] === "pets" &&
      kinds["Nightly rate under $150"] === "budget" &&
      kinds["RV site"] === "requirement" &&
      kinds["near water"] === "requirement",
    `derived chips map to their semantic source — ${JSON.stringify(kinds)}`,
  );
  for (const d of getDerivedRequirements(intent)) {
    assert(!!d.source, `Your Trip's derived chip "${d.label}" is removable too`);
  }
  assert(requirementKeyFor(intent, "near water") === "flexibleConstraints", "literal chips resolve to the tier that holds them");
  assert(rawRequirementLabel("Didn't fully match: shade") === "shade", "unmet-preference chips resolve too");
});

run("Optional removal: the search can run immediately against the relaxed request", () => {
  const withQuiet: TripIntent = { ...TRIP, destinationRegion: "East Texas", flexibleConstraints: ["near a lake"], preferences: ["quiet", "shade"] };
  const { intent } = removeChip(withQuiet, "quiet");
  assert(gapAfter(intent, resolveChipSource(withQuiet, "quiet")).status === "actionable", "no information gap");
  const before = evaluateCampsites(withQuiet).candidates[0].campsite.id;
  const after = evaluateCampsites(intent).candidates[0].campsite.id;
  assert(before !== after, `removing "quiet" changes the best match (${before} → ${after})`);
  assert(
    JSON.stringify(intent.flexibleConstraints) === JSON.stringify(["near a lake"]) && JSON.stringify(intent.preferences) === JSON.stringify(["shade"]),
    "other requirements stay intact",
  );
  const pets = removeChip({ ...TRIP, travelingWithPets: true, petCount: 2 }, "Pet-friendly");
  assert(pets.intent.travelingWithPets === false && pets.intent.petCount === null, "removing Pet-friendly clears the pet fact itself");
  assert(gapAfter(pets.intent, pets.source).status === "actionable", "…and needs nothing more to search");
  // 0 → many / 0 → 1 / 1 → many.
  const none: TripIntent = { ...TRIP, destinationRegion: "Hill Country", hardRequirements: ["Near water", "RV site"] };
  assert(count(none) === 0, "Hill Country + water + RV: No Match");
  assert(count(removeChip(none, "RV site").intent) === 4, "remove RV site → 4 matches");
  assert(count(removeChip(none, "Near water").intent) === 1, "remove Near water → the single-result state");
  const one: TripIntent = { ...TRIP, destinationRegion: "West Texas", hardRequirements: ["RV site"] };
  assert(count(one) === 1 && count(removeChip(one, "RV site").intent) === 2, "1 match → remove → 2 matches");
});

run("Required-information removal: cleared, then asked for — never searched on stale values", () => {
  const trip: TripIntent = {
    ...TRIP,
    guestCount: 10,
    destinationRegion: "San Antonio",
    hardRequirements: ["RV site"],
    flexibleConstraints: ["near water"],
    preferences: ["hookups"],
  };
  const keep = (i: TripIntent) =>
    JSON.stringify([i.hardRequirements, i.flexibleConstraints, i.preferences]) ===
    JSON.stringify([trip.hardRequirements, trip.flexibleConstraints, trip.preferences]);

  const dest = removeChip(trip, "In San Antonio");
  const destGap = gapAfter(dest.intent, dest.source);
  assert(dest.intent.destinationRegion === null && dest.intent.guestCount === 10 && keep(dest.intent), "destination cleared; party size and requirements survive");
  assert(destGap.status === "missing_prerequisites" && destGap.missing[0] === "destination", "destination is now a gap");
  if (destGap.status === "missing_prerequisites") {
    assert(questionFor(destGap.missing, "search") === "Where would you like to search instead?", "CampOps asks where to search instead");
    // The answer: the gap stays required until supplied, then resolves.
    const required = explicitSearchRequirements(destGap.missing);
    assert(checkSearchPrerequisites(dest.intent, { availabilityBacked: true, required }).status === "missing_prerequisites", "a reply without a destination keeps asking");
    const austin = { ...dest.intent, destinationRegion: "Austin" };
    assert(checkSearchPrerequisites(austin, { availabilityBacked: true, required }).status === "actionable", "supplying Austin makes the search runnable");
    assert(austin.guestCount === 10 && keep(austin), "Austin + 10 people + RV + near water + hookups");
  }

  const party = removeChip(trip, "Capacity for 10");
  const partyGap = gapAfter(party.intent, party.source);
  assert(party.intent.guestCount === null && party.intent.destinationRegion === "San Antonio" && keep(party.intent), "party size cleared (not just the words); everything else survives");
  assert(partyGap.status === "missing_prerequisites" && partyGap.missing[0] === "guest_count", "party size is now a gap");
  if (partyGap.status === "missing_prerequisites") {
    assert(questionFor(partyGap.missing, "search") === "How many people are camping?", "CampOps asks how many people are camping");
  }

  const dates = removeChip(trip, "Available for your dates");
  const datesGap = gapAfter(dates.intent, dates.source);
  assert(dates.intent.checkIn === null && dates.intent.checkOut === null && dates.intent.guestCount === 10 && keep(dates.intent), "dates cleared; everything else survives");
  assert(datesGap.status === "missing_prerequisites" && datesGap.missing.includes("check_in_date"), "dates are now a gap (existing date prerequisite)");
});

run("Rapid removals compose — none undoes another", () => {
  const trip: TripIntent = { ...TRIP, guestCount: 10, destinationRegion: "San Antonio", preferences: ["quiet", "shade"] };
  const a = removeChip(trip, "In San Antonio");
  const b = removeChip(a.intent, "Capacity for 10");
  const c = removeChip(b.intent, "quiet");
  assert(c.intent.destinationRegion === null && c.intent.guestCount === null && JSON.stringify(c.intent.preferences) === JSON.stringify(["shade"]), "all three removals are kept");
  const gap = checkSearchPrerequisites(c.intent, { availabilityBacked: true, required: ["destination", "guest_count"] });
  assert(gap.status === "missing_prerequisites" && JSON.stringify(gap.missing) === JSON.stringify(["destination", "guest_count"]), "both gaps resolved coherently, destination first, then party size");
});

run('Destination removed → "Anywhere is fine" → broad fresh search, no clarification loop', () => {
  for (const yes of ["Anywhere", "Anywhere is fine", "I don't care", "I don’t care", "No preference", "doesn't matter", "wherever works"]) {
    assert(isUnconstrainedDestinationAnswer(yes), `"${yes}" means location is unconstrained`);
  }
  for (const no of ["Austin", "somewhere near Austin", "the coast", "6"]) {
    assert(!isUnconstrainedDestinationAnswer(no), `"${no}" is not "anywhere"`);
  }
  const trip: TripIntent = { ...TRIP, guestCount: 6, destinationRegion: "San Antonio", hardRequirements: ["RV site"], flexibleConstraints: ["near water"] };
  const removed = removeChip(trip, "In San Antonio");
  const gap = gapAfter(removed.intent, removed.source);
  assert(gap.status === "missing_prerequisites" && gap.missing[0] === "destination", "unknown destination → CampOps asks");
  // "Anywhere": the destination stays null and is no longer required — the
  // same state a fresh broad request has — so the search can run.
  const required = explicitSearchRequirements(gap.status === "missing_prerequisites" ? gap.missing : []).filter((k) => k !== "destination");
  assert(checkSearchPrerequisites(removed.intent, { availabilityBacked: true, required }).status === "actionable", "unconstrained destination → no further destination question");
  const broad = evaluateCampsites(removed.intent);
  const regions = new Set(broad.candidates.map((c) => c.campsite.region));
  assert(broad.kind !== "no_match" && regions.size > 1, `broad search across regions (${[...regions].join(", ")})`);
  const chips = [...broad.candidates[0].preserved, ...broad.candidates[0].compromises];
  assert(!chips.some((l) => l.startsWith("In ")), `no "In [destination]" chip comes back — ${JSON.stringify(chips)}`);
  assert(chips.includes("Capacity for 6") && chips.includes("RV site"), "other requirements still drive the result");
  assert(removed.intent.guestCount === 6 && JSON.stringify(removed.intent.flexibleConstraints) === JSON.stringify(["near water"]), "all other trip facts preserved");

  const page = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");
  assert(/wasPendingSearchMissing\?\.\[0\] === "destination" && isUnconstrainedDestinationAnswer\(userMessage\)/.test(page), "only an answer to the destination question is read this way");
  assert(/\? \{ \.\.\.partySized, destinationRegion: null \}/.test(page), "never stores a fake 'Anywhere' destination (even if the interpreter returns one)");
  assert(/required: suppliedKinds\(explicitSearchRequirements\(wasPendingSearchMissing\)\)/.test(page), "the waived destination stops being required (no loop)");
  assert(/if \(destinationUnconstrained\) pushEvent\(deriveDestinationUnconstrainedEvent\(\)\);/.test(page) && (page.match(/suppliedKinds\(/g) ?? []).length >= 4, "Activity says the destination was relaxed — never 'Provided the destination'");
});

run("Page wiring: one removal path for every chip, existing clarification architecture", () => {
  const page = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");
  const card = readFileSync(join(__dirname, "..", "src", "components", "campops", "candidate-card.tsx"), "utf-8");
  const list = readFileSync(join(__dirname, "..", "src", "components", "campops", "trip-requirements-list.tsx"), "utf-8");
  assert(/chipSourceFor=\{\(label\) => resolveChipSource\(intent, label\)\}/.test(page) && /onRemoveChip=\{handleRemoveTripDetail\}/.test(page), "card chips resolve their source and use the one handler");
  assert((page.match(/onRemove=\{handleRemoveTripDetail\}/g) ?? []).length === 2, "Your Trip (desktop panel + mobile sheet) use the same handler");
  assert(/onRemove=\{\(\) => onRemove\(d\.source, d\.label\)\}/.test(list), "Your Trip's derived chips are removable");
  assert(!/removableHardLabels|hardRequirementsSet|handleRemoveRequirement/.test(page + card), "no hard-requirements-only gate remains");
  const fn = page.slice(page.indexOf("async function handleRemoveTripDetail("), page.indexOf("\n  }\n", page.indexOf("async function handleRemoveTripDetail(")));
  const gap = fn.slice(fn.indexOf('if (prereq.status === "missing_prerequisites") {'), fn.indexOf("return;", fn.indexOf('if (prereq.status === "missing_prerequisites") {')));
  assert(/setIntent\(nextIntent\)/.test(fn) && fn.indexOf("setIntent(nextIntent)") < fn.indexOf("checkSearchPrerequisites("), "canonical trip changes first");
  assert(/cancelRecommendationQuery\(\)/.test(gap) && /setEvaluation\(null\)/.test(gap), "a gap withdraws the old recommendation and any in-flight search");
  assert(/pushAttention\("clarification", "Needs your input", questionFor\(prereq\.missing, "search"\)\)/.test(gap) && /setPendingSearchMissing\(prereq\.missing\)/.test(gap), "…and asks via the existing search-prerequisite clarification");
  assert(!/beginRecommendationQuery|simulateCampsiteQuery/.test(gap), "no Working state while waiting for the user");
  const after = fn.slice(fn.indexOf("return;", fn.indexOf('if (prereq.status === "missing_prerequisites") {')));
  const order = ["pushChat(", 'beginRecommendationQuery("recommendation")', "await simulateCampsiteQuery(() => evaluateCampsites(nextIntent", "if (!finishRecommendationQuery(query)) return;", "setEvaluation(result)", "setCandidateIndex(0)"];
  const at = order.map((x) => after.indexOf(x));
  assert(at.every((i, n) => i > -1 && (n === 0 || i > at[n - 1])), `optional removal: acknowledged, then Working, then a fresh result set from the NEW trip — ${JSON.stringify(at)}`);
  assert(!/setIntent\(/.test(after.slice(after.indexOf("await"))), "nothing after the wait can write the trip back");
  assert(/required: suppliedKinds\(explicitSearchRequirements\(wasPendingSearchMissing\)\)/.test(page), "answering the question resumes through the existing search-prerequisite gate");
  assert(/wasPendingSearchMissing\?\.\[0\] === "guest_count"/.test(page), "a bare party-size reply is read deterministically");
});

if (failures > 0) {
  console.error(`\n${failures} requirement-removal check(s) failed.`);
  process.exit(1);
}
console.log("\nAll requirement-removal checks passed.");
