/**
 * Regression coverage for Persistent Composer Focus (2026-09-09 — see
 * docs/implementation-decisions.md). This project's test harness is plain
 * Node/tsx scripts against `src/lib/*` pure functions — there is no
 * jsdom/React Testing Library configured, so real focus/DOM behavior
 * (does `.focus()` actually move `document.activeElement`, does the
 * mobile keyboard reopen, does a dialog's own focus trap still work)
 * CANNOT be exercised by this script. Per the same pattern already
 * established for the rate-limiting slice, this is a STATIC SOURCE GUARD
 * over the key structural invariants — it proves the implementation is
 * wired the way this document claims, not that a browser actually behaves
 * as expected. Live Playwright (desktop + mobile) is the authoritative
 * check for the real behavior and was run separately — see
 * docs/implementation-decisions.md for that verification, explicitly
 * recorded as manual/live rather than part of this automated script.
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

const pageSource = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");
const composerSource = readFileSync(
  join(__dirname, "..", "src", "components", "campops", "composer.tsx"),
  "utf-8",
);

run("Composer forwards a real ref to the actual <input> DOM node", () => {
  assert(/forwardRef</.test(composerSource), "Composer must use forwardRef, not a plain function component");
  assert(/<input\s+ref={ref}/.test(composerSource), "the forwarded ref must be attached to the real <input>");
});

run("page.tsx uses a real ref (composerInputRef) to the composer, not global DOM queries", () => {
  assert(/const composerInputRef = useRef<HTMLInputElement>/.test(pageSource), "a typed input ref must exist");
  assert(
    !/document\.getElementById\(COMPOSER_INPUT_ID\)/.test(pageSource),
    "the old document.getElementById lookup must be gone — composerInputRef replaces it",
  );
  assert(!/document\.querySelector/.test(pageSource), "no querySelector-based focus lookups");
});

run("No brittle setTimeout-based focus restoration", () => {
  const focusRelatedSection = pageSource.slice(
    pageSource.indexOf("composerInputRef = useRef"),
    pageSource.indexOf("composerInputRef = useRef") + 3000,
  );
  assert(
    !/setTimeout/.test(focusRelatedSection),
    "focus restoration must be driven by the isWorking transition, never an arbitrary timer",
  );
});

run("Both Composer render sites pass the same ref", () => {
  const matches = pageSource.match(/ref={composerInputRef}/g) ?? [];
  assert(
    matches.length === 2,
    `expected the landing-screen AND active-conversation Composer instances to both receive the ref — found ${matches.length}`,
  );
});

run("Focus restoration is keyed on the isWorking transition, not fired unconditionally on submit", () => {
  const effectSection = pageSource.slice(
    pageSource.indexOf("Restores focus the moment"),
    pageSource.indexOf("Restores focus the moment") + 1200,
  );
  assert(/useEffect\(/.test(effectSection), "a useEffect must drive focus restoration");
  assert(/if \(isWorking\) return;/.test(effectSection), "must bail out while still working (the input is disabled and cannot hold focus)");
  assert(/\[isWorking\]/.test(effectSection), "the effect must be dependent on isWorking specifically");
});

run("Focus restoration is one-shot and gated on the pending flag (never unconditional)", () => {
  const effectSection = pageSource.slice(
    pageSource.indexOf("Restores focus the moment"),
    pageSource.indexOf("Restores focus the moment") + 1200,
  );
  assert(
    /if \(!pendingComposerFocusRef\.current\) return;/.test(effectSection),
    "must check the pending flag before ever calling .focus()",
  );
  assert(
    /pendingComposerFocusRef\.current = false;/.test(effectSection),
    "the flag must be consumed (reset to false) so this never fires more than once per submission",
  );
});

run("handleSubmit (Send click AND Enter, both routed through the same form) marks focus as pending", () => {
  const handleSubmitSection = pageSource.slice(
    pageSource.indexOf("function handleSubmit()"),
    pageSource.indexOf("function handleSubmit()") + 600,
  );
  assert(
    /pendingComposerFocusRef\.current = true;/.test(handleSubmitSection),
    "handleSubmit must set the pending-focus flag — this is the single choke point for both Send-click and Enter, since both submit the same <form>",
  );
});

run("handleQuickReply does NOT mark focus as pending (clicking a button is an explicit focus choice)", () => {
  const handleQuickReplySection = pageSource.slice(
    pageSource.indexOf("function handleQuickReply("),
    pageSource.indexOf("function handleQuickReply(") + 600,
  );
  assert(
    !/pendingComposerFocusRef\.current = true;/.test(handleQuickReplySection),
    "a quick-reply click must not queue a composer refocus — the user explicitly clicked a different control",
  );
});

run("A document-level listener cancels pending focus on interaction with anything other than the composer", () => {
  const listenerSection = pageSource.slice(
    pageSource.indexOf("function cancelPendingFocusIfElsewhere"),
    pageSource.indexOf("function cancelPendingFocusIfElsewhere") + 1100,
  );
  assert(
    /e\.target !== composerInputRef\.current/.test(listenerSection),
    "the cancellation check must compare the event target against the real composer input ref",
  );
  assert(/pointerdown/.test(pageSource) && /keydown/.test(pageSource), "both pointer and keyboard interactions must be able to cancel pending focus");
});

run("The listener is registered in the capture phase (sees the interaction before a dialog's own focus trap can intercept it)", () => {
  assert(
    /addEventListener\("pointerdown", cancelPendingFocusIfElsewhere, true\)/.test(pageSource),
    "pointerdown listener must use capture: true",
  );
  assert(
    /addEventListener\("keydown", cancelPendingFocusIfElsewhere, true\)/.test(pageSource),
    "keydown listener must use capture: true",
  );
});

run("The focus-tracking effect cleans up its listeners on unmount (no leaked global listeners)", () => {
  const idx = pageSource.indexOf("function cancelPendingFocusIfElsewhere");
  const section = pageSource.slice(idx, idx + 1500);
  assert(/removeEventListener\("pointerdown"/.test(section), "pointerdown listener must be removed in the cleanup function");
  assert(/removeEventListener\("keydown"/.test(section), "keydown listener must be removed in the cleanup function");
});

run("handleChangeRequirement (an explicit 'let me type' action) still focuses the composer directly, via the same real ref", () => {
  const section = pageSource.slice(
    pageSource.indexOf("function handleChangeRequirement()"),
    pageSource.indexOf("function handleChangeRequirement()") + 600,
  );
  assert(/composerInputRef\.current\?\.focus\(\)/.test(section), "must use the real ref, not a DOM query");
});

run("Dialog/sheet components are untouched by this slice (existing focus-trap/return behavior is not modified)", () => {
  // Structural guard: none of this slice's new identifiers should appear
  // in the shared Dialog primitive or the sheet/dialog-using components —
  // this feature is entirely additive in page.tsx/composer.tsx and must
  // never need to reach into modal internals.
  const dialogSource = readFileSync(join(__dirname, "..", "src", "components", "ui", "dialog.tsx"), "utf-8");
  assert(
    !/composerInputRef|pendingComposerFocusRef/.test(dialogSource),
    "the shared Dialog primitive must remain completely unaware of composer focus state",
  );
});

if (failures > 0) {
  console.error(`\n${failures} composer-focus check(s) failed.`);
  process.exit(1);
}
console.log("\nAll composer-focus checks passed.");
