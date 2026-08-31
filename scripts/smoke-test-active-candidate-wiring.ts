/**
 * Structural invariant guard (Live Active-Candidate Context Wiring
 * correction, 2026-09-06 — see docs/implementation-decisions.md): "a
 * visible active recommendation must never coexist with an interpretation
 * request that says there is no active candidate."
 *
 * Live instrumented testing (intercepting the real /api/intent request
 * payloads) already confirmed `hasActiveCandidate` was being sent
 * correctly on every post-recommendation turn — the reported live failure
 * traced to the MODEL's own classification reliability, not this wiring
 * (see smoke-test-candidate-question-detection.ts for that fix). This
 * script is a permanent, lightweight guard against the wiring itself
 * silently regressing: it inspects page.tsx's own source to confirm
 * `hasActiveCandidate` is computed from the SAME `activeCandidate` value
 * the Candidate Card render path uses — one canonical source of truth
 * (standing rule), not two independently-maintained flags that could
 * drift apart. This is a static-source guard, not a runtime/browser test,
 * because this project doesn't carry a browser-test framework as a
 * dependency (see docs/implementation-decisions.md for why a full
 * integration harness wasn't added) — live Playwright verification with
 * real request interception remains the authoritative check, re-run for
 * every slice that touches this path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const source = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");

run("Exactly one canonical `activeCandidate` declaration exists", () => {
  const matches = source.match(/const activeCandidate\s*=/g) ?? [];
  assert(
    matches.length === 1,
    `expected exactly one \`const activeCandidate =\` declaration — found ${matches.length} (a second one would be an independent, driftable source of truth)`,
  );
});

run("showCandidateCard (the Candidate Card's own render gate) is derived from activeCandidate", () => {
  const match = source.match(/const showCandidateCard\s*=\s*\n?\s*!!activeCandidate/);
  assert(
    !!match,
    "showCandidateCard must read the same `activeCandidate` value, not a separately-tracked flag",
  );
});

run("hasActiveCandidateAtSubmit (sent to /api/intent) is derived from activeCandidate, not a separate flag", () => {
  const match = source.match(/const hasActiveCandidateAtSubmit\s*=\s*!!activeCandidate/);
  assert(
    !!match,
    "hasActiveCandidateAtSubmit must be a direct boolean cast of the SAME activeCandidate the UI renders from",
  );
});

run("The /api/intent request body actually includes hasActiveCandidate", () => {
  assert(
    /hasActiveCandidate:\s*hasActiveCandidateAtSubmit/.test(source),
    "the fetch body must forward hasActiveCandidateAtSubmit under the field name the API route reads",
  );
});

if (failures > 0) {
  console.error(`\n${failures} active-candidate wiring check(s) failed.`);
  process.exit(1);
}
console.log("\nAll active-candidate wiring checks passed.");
