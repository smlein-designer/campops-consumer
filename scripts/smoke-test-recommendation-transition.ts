/**
 * Regression coverage for the recommendation transition (2026-10-01):
 * "Show me another option" and the availability-change simulation run as a
 * real transient state driven by an awaited (simulated) campsite query —
 * panel reset to top first, then loading, then the next campsite — with a
 * synchronous action lock and supersession of stale results.
 *
 * STATIC SOURCE GUARD over page.tsx (the project's Node/tsx harness has no
 * DOM/React renderer); the live sequence is verified separately in a
 * browser.
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

const page = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");
const fn = (signature: string) => {
  const start = page.indexOf(signature);
  return start < 0 ? "" : page.slice(start, page.indexOf("\n  }\n", start));
};

assert(/const RECOMMENDATION_QUERY_DELAY_MS = 900;/.test(page), "simulated query latency is 900ms");
assert(
  /function simulateCampsiteQuery<T>\(query: \(\) => T\): Promise<T>/.test(page),
  "the transition is driven by an awaitable query (replaceable by a real async request)",
);

for (const [name, signature] of [
  ["Show me another option", "async function handleRequestAlternative()"],
  ["Simulate unavailable", "async function handleSimulateAvailabilityLoss()"],
  ["Start over with the first option", "async function handleRestartOptions()"],
] as const) {
  const body = fn(signature);
  assert(body.length > 0, `${name}: handler is async`);
  assert(
    /^[^\n]*\n\s*if \(recommendationQueryActiveRef\.current/.test(body),
    `${name}: first statement refuses to start while a transition is active (synchronous lock)`,
  );
  const begin = body.indexOf("beginRecommendationQuery(");
  const wait = body.indexOf("await simulateCampsiteQuery(");
  const finish = body.indexOf("if (!finishRecommendationQuery(query)) return;");
  const apply = body.search(/setCandidateIndex\(|setEvaluation\(/);
  assert(begin > -1 && wait > begin, `${name}: transition begins before the query is awaited`);
  assert(finish > wait && apply > finish, `${name}: the result is applied only if this query is still current`);
}

const begin = fn("function beginRecommendationQuery(");
assert(
  begin.indexOf("scrollTripPanelToTop()") > -1 &&
    begin.indexOf("scrollTripPanelToTop()") < begin.indexOf("setRecommendationLoading(true)"),
  "the panel is reset to the top BEFORE the loading state is shown",
);
assert(/recommendationQueryActiveRef\.current = true;/.test(begin), "beginning a transition takes the lock");

const finish = fn("function finishRecommendationQuery(query: number)");
assert(/if \(query !== recommendationQueryRef\.current\) return false;/.test(finish), "superseded results are discarded");
assert(/pinPanelTopAfterRenderRef\.current = true;/.test(finish), "the new campsite is re-pinned to the top after it renders");

const scroll = fn("function scrollTripPanelToTop()");
assert(/panel\.scrollTop = 0;/.test(scroll), "desktop scrolls only the Trip Panel");
assert(!/chatColumnRef/.test(scroll), "the conversation column is never scrolled by the transition");

// Chip removal supersedes by STARTING its own transition (new query token).
assert(
  fn("async function handleRemoveTripDetail(").includes('beginRecommendationQuery("recommendation")'),
  "chip removal supersedes an in-flight transition by starting its own",
);
for (const signature of [
  "async function submitMessage(",
  "function handleWidenSearch()",
  "function handleStartNewSearch()",
]) {
  assert(fn(signature).includes("cancelRecommendationQuery();"), `${signature} supersedes an in-flight transition`);
}

assert(
  /\{!recommendationLoading && \(\s*<>/.test(page),
  "the current campsite and its actions are not rendered while loading (no stale choice, no duplicate action)",
);
assert(/aria-busy=\{recommendationLoading\}/.test(page), "the panel is marked busy while loading");
assert(/label: "Working: Finding another option"/.test(page), "the loader uses the DS Working badge copy");
const candidateHeader = page.slice(page.indexOf("title={candidateHeading.title}"), page.indexOf("title={candidateHeading.title}") + 300);
assert(
  /badgeClassName="hidden lg:block"/.test(candidateHeader),
  "the panel's Working badge shows on desktop only — on mobile the Status Bar is the single Working indicator",
);
assert(
  /\{recommendationLoading && \(\s*<p className=\{`\$\{text\.bodySm\} text-muted-foreground lg:hidden`\}>\s*Finding another option…/.test(page),
  "mobile keeps panel loading content (plain text, no second badge)",
);

// Reveal target: user-initiated changes reveal the RESULT; the
// system-initiated availability change reveals the EXPLANATION first.
const loss = fn("async function handleSimulateAvailabilityLoss()");
assert(/beginRecommendationQuery\("explanation"\)/.test(loss), "availability change is an explanation-first transition");
const lossBeforeAttention = loss.slice(0, loss.indexOf('pushAttention("availability_loss"'));
assert(
  !/suppressRevealRef\.current = /.test(lossBeforeAttention.slice(lossBeforeAttention.indexOf("beginRecommendationQuery"))),
  "the Availability changed card is NOT suppressed — the normal reveal scrolls it into view above the composer",
);
assert(
  /suppressRevealRef\.current = "mobile";\s*pushChat\("agent", buildRecoveryMessages/.test(loss),
  "on mobile the replacement's arrival doesn't pull the view off the explanation",
);
for (const signature of ["async function handleRequestAlternative()", "async function handleRestartOptions()"]) {
  assert(/beginRecommendationQuery\("recommendation"\)/.test(fn(signature)), `${signature}: result-first transition`);
  assert(/suppressRevealRef\.current = "all";/.test(fn(signature)), `${signature}: its acknowledgment never scrolls the conversation`);
}
assert(
  /if \(transitionRevealRef\.current === "explanation"\) return;/.test(scroll),
  "mobile never scrolls the shared plane to the panel during an explanation-first transition",
);
assert(/if \(window\.matchMedia\("\(min-width: 1024px\)"\)\.matches\) \{\s*panel\.scrollTop = 0;/.test(scroll), "desktop panel still resets independently in both modes");

// A reveal scroll (e.g. CampOps asking for the party size after Choose)
// must not be undone by the mobile viewport hook: it keeps the end in view
// only when the visible height actually changes (keyboard open/close), never
// on a plain focus change such as tapping a button.
const viewportHook = readFileSync(join(__dirname, "..", "src", "lib", "use-visual-viewport.ts"), "utf-8");
assert(
  viewportHook.includes("if (wasAtEnd && resized) scroller.scrollTop = scroller.scrollHeight;"),
  "end-pinning happens only on a real viewport resize, not on focus changes",
);

if (failures > 0) {
  console.error(`\n${failures} recommendation-transition check(s) failed.`);
  process.exit(1);
}
console.log("\nAll recommendation-transition checks passed.");
