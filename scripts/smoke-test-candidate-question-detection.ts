/**
 * Regression coverage for the deterministic candidate-question backstop
 * (Live Active-Candidate Context Wiring correction, 2026-09-06 — see
 * docs/implementation-decisions.md). Live manual testing found the MODEL's
 * own `candidateQuestion` classification unreliable run-to-run for the
 * exact same message — this backstop (`detectCandidateQuestion`) resolves
 * high-confidence canonical phrasings deterministically, so the exact
 * live-reproduction sequence no longer depends on model luck.
 */
import { detectCandidateQuestion } from "../src/lib/candidate-facts";

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

// --- The exact live-reproduction phrasings (item 11) ---

run("'is it near water?' deterministically resolves to a water question", () => {
  const result = detectCandidateQuestion("is it near water?");
  assert(result.kind === "question" && result.topic === "water", `expected water question — got ${JSON.stringify(result)}`);
});

run("'but is it near water?' still resolves (a leading 'but' doesn't break the pattern)", () => {
  const result = detectCandidateQuestion("but is it near water?");
  assert(result.kind === "question" && result.topic === "water", `expected water question — got ${JSON.stringify(result)}`);
});

run("'does it have showers?' resolves to an amenity question", () => {
  const result = detectCandidateQuestion("does it have showers?");
  assert(result.kind === "question" && result.topic === "amenity", `expected amenity question — got ${JSON.stringify(result)}`);
});

run("'does it allow two dogs?' resolves to a pet question", () => {
  const result = detectCandidateQuestion("does it allow two dogs?");
  assert(result.kind === "question" && result.topic === "pet", `expected pet question — got ${JSON.stringify(result)}`);
});

run("'is it quiet?' resolves to a noise question", () => {
  const result = detectCandidateQuestion("is it quiet?");
  assert(result.kind === "question" && result.topic === "noise", `expected noise question — got ${JSON.stringify(result)}`);
});

run("'is it secluded?' resolves to a seclusion question", () => {
  const result = detectCandidateQuestion("is it secluded?");
  assert(result.kind === "question" && result.topic === "seclusion", `expected seclusion question — got ${JSON.stringify(result)}`);
});

run("'how far is it from me?' resolves to a distance question", () => {
  const result = detectCandidateQuestion("how far is it from me?");
  assert(result.kind === "question" && result.topic === "distance", `expected distance question — got ${JSON.stringify(result)}`);
});

// --- Refinement verbs win even in question-shaped sentences (item 4/7) ---

run("'i'd prefer it to be near water' is a refinement, never a question", () => {
  const result = detectCandidateQuestion("i'd prefer it to be near water");
  assert(result.kind === "refinement", `expected refinement — got ${JSON.stringify(result)}`);
});

run("'make sure dogs are allowed' is a refinement", () => {
  const result = detectCandidateQuestion("make sure dogs are allowed");
  assert(result.kind === "refinement", `expected refinement — got ${JSON.stringify(result)}`);
});

run("'i need showers' is a refinement, not an amenity question", () => {
  const result = detectCandidateQuestion("i need showers");
  assert(result.kind === "refinement", `expected refinement — got ${JSON.stringify(result)}`);
});

// --- Messages the backstop correctly defers on (item 3/4's "meaning, not punctuation") ---

run("A statement with no question shape and no referent is 'unclear' (defers to the model)", () => {
  const result = detectCandidateQuestion("4 people, pet-friendly, Sept 12 to Sept 14");
  assert(result.kind === "unclear", `expected unclear — got ${JSON.stringify(result)}`);
});

run("'The current campsite' alone (no question content) is 'unclear'", () => {
  const result = detectCandidateQuestion("The current campsite");
  assert(result.kind === "unclear", `expected unclear (it names a referent but asks nothing) — got ${JSON.stringify(result)}`);
});

run("A question with no referent to the current candidate is 'unclear'", () => {
  const result = detectCandidateQuestion("what campgrounds are near Austin?");
  assert(result.kind === "unclear", `expected unclear (no 'it'/'this site' referent) — got ${JSON.stringify(result)}`);
});

// --- Robustness: case-insensitivity, punctuation variance ---

run("Detection is case-insensitive", () => {
  const result = detectCandidateQuestion("IS IT NEAR WATER?");
  assert(result.kind === "question" && result.topic === "water", "uppercase input still resolves correctly");
});

run("A question shape without a trailing '?' still resolves (meaning over punctuation)", () => {
  const result = detectCandidateQuestion("is it near water");
  assert(result.kind === "question" && result.topic === "water", "missing question mark doesn't block detection");
});

if (failures > 0) {
  console.error(`\n${failures} candidate-question-detection check(s) failed.`);
  process.exit(1);
}
console.log("\nAll candidate-question-detection checks passed.");
