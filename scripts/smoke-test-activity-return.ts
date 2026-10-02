/**
 * Regression coverage for Activity placement and Activity → "Back to trip"
 * (phone-QA corrections, 2026-10-01, revised for the latest Pages v2):
 *  - On mobile, Activity is reached from the Mobile Status Bar (not the
 *    Panel Header, not the Your Trip sheet).
 *  - "Back to trip" returns to the normal conversation state with the Your
 *    Trip sheet collapsed — no sheet-origin is tracked or restored.
 *  - Desktop keeps its Panel Header Activity action and has no sheet.
 *
 * Like the composer-focus suite, this is a STATIC SOURCE GUARD over the
 * wiring (the project's Node/tsx harness has no DOM/React renderer). Live
 * Playwright verification of the actual navigation was run separately.
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

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf-8");
const page = read("src", "app", "page.tsx");
const statusBar = read("src", "components", "campops", "trip-status-bar.tsx");
const sheet = read("src", "components", "campops", "trip-details-sheet.tsx");
const sectionFrom = (src: string, marker: string, length: number) =>
  src.slice(src.indexOf(marker), src.indexOf(marker) + length);

// Back to trip
const back = page.slice(
  page.indexOf("function handleBackToTrip()"),
  page.indexOf("\n  }\n", page.indexOf("function handleBackToTrip()")),
);
assert(/setView\("search"\);/.test(back), "Back to trip returns to the conversation view");
assert(
  !/handleTripSheetOpenChange|setShowTripDetailsSheet/.test(back),
  "Back to trip does not open the Your Trip sheet (it stays collapsed)",
);
assert(
  !/activityOpenedFrom|activityOrigin/.test(page),
  "no Activity-origin / sheet-return state remains",
);

// Activity placement
assert(
  /<IconAction label="View trip details" onClick=\{onViewDetails\}>[\s\S]*<IconAction label="View activity" onClick=\{onViewActivity\}>/.test(statusBar),
  "the Mobile Status Bar has Trip details then Activity, each with its DS accessible name",
);
assert(
  /<TripStatusBar[\s\S]*?onViewActivity=\{handleOpenActivity\}/.test(page),
  "the page wires Activity into the Mobile Status Bar",
);
assert(!/onViewActivity|View activity/.test(sheet), "the Your Trip sheet no longer offers Activity");
const candidateHeader = sectionFrom(page, "title={candidateHeading.title}", 400);
assert(
  /activityOnDesktopOnly/.test(candidateHeader),
  "the recommendation Panel Header shows Activity on desktop only",
);

if (failures > 0) {
  console.error(`\n${failures} activity check(s) failed.`);
  process.exit(1);
}
console.log("\nAll activity checks passed.");
