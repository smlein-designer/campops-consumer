/**
 * Regression coverage for recommendation result-set position (2026-10-01):
 *   0 results            → the existing No Match recovery (unchanged)
 *   1 result             → "only match" copy; Choose + Change my requirements
 *   2+ with unseen       → Show me another option
 *   2+ at the final one  → "last of X" copy; Choose + Start over with the
 *                          first option + Change my requirements
 * Never a disabled "Show me another option".
 *
 * The real result-set sizes come from the evaluator (data-level checks);
 * the UI wiring is a STATIC SOURCE GUARD over page.tsx (no DOM renderer in
 * this harness — the live behavior is verified separately in a browser).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateCampsites } from "../src/lib/evaluate";
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

// --- Data: the result set is the matching pool, so its size is X.
const base: TripIntent = { ...EMPTY_TRIP_INTENT, guestCount: 4, checkIn: "Oct 16", checkOut: "Oct 18" };
const many = evaluateCampsites({ ...base, destinationRegion: "Hill Country", hardRequirements: ["Near water"] });
assert(many.kind !== "no_match" && many.candidates.length >= 2, `a multi-match search exists (${many.candidates.length} matches)`);
assert(
  many.candidates.every((c) => c.compromises.length === many.candidates[0].compromises.length || many.kind === "compromise"),
  "every candidate in a full result set is a genuine match (single match tier)",
);
const none = evaluateCampsites({ ...base, guestCount: 30, destinationRegion: "Hill Country", travelingWithPets: true, petCount: 1, hardRequirements: ["Near water"] });
assert(none.kind === "no_match", "an impossible search yields No Match (its candidates are non-matches, not a result set)");

// --- UI wiring.
const page = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");
assert(
  /const matchCount =\s*evaluation && evaluation\.kind !== "no_match" \? evaluation\.candidates\.length : 0;/.test(page),
  "X is the real result-set size, and 0 for No Match",
);
assert(/const isOnlyMatch = showCandidateCard && matchCount === 1;/.test(page), "exactly one match is its own state");
assert(
  /const isLastOfMatches =\s*showCandidateCard && matchCount > 1 && candidateIndex === matchCount - 1;/.test(page),
  "the final of several matches is its own state",
);
assert(page.includes('"This is the only site that matches your current search."'), "only-match copy");
assert(page.includes("`That’s the last of ${matchCount} matches.`"), "last-of-X copy uses the real count");
assert(/\{canRequestAlternative && \(\s*<Button[\s\S]*?Show me another option/.test(page), "Show me another option appears only while unseen options remain");
assert(!/disabled=\{!canRequestAlternative\}/.test(page), "no disabled Show me another option");
assert(/\{isLastOfMatches && \(\s*<Button[\s\S]*?onClick=\{handleRestartOptions\}[\s\S]*?Start over with the first option/.test(page), "final option offers Start over with the first option");
assert(
  /\{\(isOnlyMatch \|\| isLastOfMatches\) && \(\s*<Button[\s\S]*?onClick=\{handleChangeRequirement\}[\s\S]*?Change my requirements/.test(page),
  "only-match and final-option states offer Change my requirements",
);
const change = page.slice(page.indexOf("function handleChangeRequirement()"), page.indexOf("\n  }\n", page.indexOf("function handleChangeRequirement()")));
assert(/composerInputRef\.current\?\.focus\(\)/.test(change), "Change my requirements enters conversational refinement (focuses the composer)");
assert(!/handleStartNewSearch|setIntent|setEvaluation|setMessages/.test(change), "Change my requirements never resets the trip or search");
const restart = page.slice(page.indexOf("async function handleRestartOptions()"), page.indexOf("\n  }\n", page.indexOf("async function handleRestartOptions()")));
assert(/simulateCampsiteQuery\(\(\) => 0\)/.test(restart) && /setCandidateIndex\(firstIndex\)/.test(restart), "Start over returns to the first candidate through the async transition");
assert(!/evaluateCampsites|setIntent/.test(restart), "Start over is not a new search and doesn't change requirements");
assert(/setRecommendationOrigin\(firstCandidateOriginRef\.current\)/.test(restart), "the first option keeps its original heading");

if (failures > 0) {
  console.error(`\n${failures} recommendation-result check(s) failed.`);
  process.exit(1);
}
console.log("\nAll recommendation-result checks passed.");
