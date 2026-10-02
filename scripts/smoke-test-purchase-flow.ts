/**
 * Regression coverage for the reservation flow (Figma "Staging and
 * Authorization", 2026-10-01):
 *   Complete conversational trip → Review → Add payment (only without a
 *   saved method) → Confirm your reservation → Processing → Confirmed.
 *  - Reservation readiness belongs to the conversation: Choose stages a
 *    reservation only once dates AND party size are known; otherwise
 *    CampOps asks in the conversation and finishes the same Choose.
 *  - Payment is a prerequisite resolved inside the flow before
 *    confirmation — never a reserve attempt that fails.
 *  - The legacy Missing Info / payment-error screens are unreachable.
 *
 * State-machine invariants are covered in smoke-test-reservation.ts and
 * the prerequisite logic in smoke-test-prerequisites.ts; this is a STATIC
 * SOURCE GUARD over the wiring (no DOM renderer in this harness — the live
 * flow is verified separately in a browser).
 */
import { existsSync, readFileSync } from "node:fs";
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

const root = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf-8");
const flow = read("src", "components", "campops", "reservation-review.tsx");
const page = read("src", "app", "page.tsx");
const reservation = read("src", "lib", "reservation.ts");
const schemas = read("src", "lib", "schemas.ts");
const fnBody = (src: string, signature: string) =>
  src.slice(src.indexOf(signature), src.indexOf("\n  }\n", src.indexOf(signature)));

// --- Conversation owns reservation readiness.
const accept = fnBody(page, "function handleAccept()");
assert(/checkBookingPrerequisites\(intent\)/.test(accept), "Choose checks the booking prerequisites (dates + party size) first");
const holdAt = accept.indexOf("setPendingBookingRequest(true)");
assert(
  holdAt > -1 && accept.indexOf("finishAccept(") > accept.indexOf("return;", holdAt),
  "a missing prerequisite keeps the user in the conversation — nothing is staged",
);
assert(/pushAttention\(\s*"clarification"/.test(accept), "the missing prerequisite is asked as an ordinary clarification");
const resume = page.slice(page.indexOf("if (wasPendingBookingRequest) {"), page.indexOf("// Which prerequisite SET applies"));
assert(/checkBookingPrerequisites\(normalizedIntent\)/.test(resume), "the answer updates the trip context and is re-checked");
assert(/finishAccept\(acceptedCandidateOnHold, normalizedIntent\)/.test(resume), "once satisfied, the same Choose finishes into Review");
assert(/campsite\.capacity >= /.test(resume), "a party larger than the chosen site never stages a reservation");
assert(/parsePartySizeAnswer\(userMessage\)/.test(page), "a bare party-size reply is read deterministically");
assert(/guestCount: number;/.test(schemas), "Reservation.guestCount is never null");

// --- Review → Add payment → Confirm.
assert(
  /hasPayment \? \([\s\S]*?onClick=\{onContinueToConfirmation\}[\s\S]*?\) : \([\s\S]*?onClick=\{onAddPaymentMethod\}>\s*Add payment method/.test(flow),
  "Review offers Add payment method until a payment method exists",
);
assert(/BEGIN_ADD_PAYMENT/.test(page) && /CANCEL_ADD_PAYMENT/.test(page), "Review → Add payment and back are wired");
assert(/status === "adding_payment"/.test(flow) && flow.includes("Enter your payment method"), "Add payment screen exists");
assert(flow.includes("Save payment method"), "Add payment's primary action is Save payment method");
assert(
  /case "ADD_PAYMENT_METHOD": \{[\s\S]*?status: "ready_for_authorization"/.test(reservation),
  "saving a payment method continues into Confirm your reservation",
);
assert(
  /status === "ready_for_authorization"/.test(flow) && flow.includes("Confirm your reservation"),
  "Confirm your reservation is its own screen (not collapsed into Add payment)",
);
assert(/onClick=\{onAuthorize\}>\s*Reserve \{campsite\.siteName\} — \{total\}/.test(flow), "Confirm names the action and charge");
assert((flow.match(/onClick=\{onAuthorize\}/g) ?? []).length === 1, "authorization is offered in exactly one place (Confirm)");
assert(/status === "authorizing"/.test(flow) && flow.includes("Processing payment"), "authorization enters Processing payment");
assert(/<Page campgroundName=\{campsite\.campgroundName\} busy>/.test(flow), "Processing is marked aria-busy");
assert(/status === "reserved"/.test(flow) && flow.includes("You’re all set"), "Booking confirmed screen");

// --- Obsolete paths are gone.
assert(!/"incomplete"/.test(schemas) && !/"incomplete"/.test(flow), "no incomplete / missing-info reservation status");
assert(!/missing_info_detected/.test(schemas), "no missing-info event type");
assert(!/computeMissingFields/.test(reservation + page + flow), "no missing-fields computation");
assert(!/RESERVE_ATTEMPT/.test(reservation + page + schemas), "no reserve attempt that can fail on a known prerequisite");
assert(!/Add a payment method to reserve this site/.test(flow), "the old missing-payment banner is gone");
assert(!/missing=\{/.test(flow), "no flagged missing-field rows");
assert(!existsSync(join(root, "src", "components", "campops", "authorize-booking-dialog.tsx")), "the old Authorize Booking dialog is gone");
assert(
  /if \(!reservation\.paymentMethodLabel\) \{\s*throw new Error\(/.test(reservation),
  "the state machine refuses confirmation without payment (unreachable from the UI)",
);

// --- Cleanup pass (2026-10-01): no inert controls, honest copy, no silent demo card.
assert(!/cursor-not-allowed/.test(flow) && !/InertCancelReservation/.test(flow), "Cancel reservation is never inert");
assert(
  flow.includes("Cancel this reservation?") && flow.includes("Keep reservation") && /variant="destructive"/.test(flow),
  "Cancel reservation opens the Figma confirmation dialog/sheet (Keep / Cancel reservation)",
);
assert(/DialogTitle/.test(flow) && /DialogDescription/.test(flow), "the cancel confirmation is an accessible dialog");
const cancelFn = fnBody(page, "function handleCancelReservation()");
assert(
  /discardStagedReservation\(reservation, "cancelled"\)/.test(cancelFn) && /setView\("search"\)/.test(cancelFn) && !/handleStartNewSearch|setIntent|setEvaluation/.test(cancelFn),
  "confirmed cancel discards the staged reservation and returns to the conversation with the trip intact",
);
assert(/onClick=\{onEditReservation\}>\s*Edit reservation/.test(flow) && !/disabled>\s*Edit reservation/.test(flow), "Edit reservation is functional");
const editFn = fnBody(page, "function handleEditReservation()");
assert(
  /setEditingTrip\(true\)/.test(editFn) && /setView\("search"\)/.test(editFn) && /composerInputRef\.current\?\.focus\(\)/.test(editFn) && !/handleStartNewSearch|setIntent|setEvaluation|setPendingBookingRequest/.test(editFn),
  "Edit returns to the conversation in a deliberate editing state, trip/search preserved (not missing-info recovery)",
);
assert(/placeholder=\{editingTrip \?/.test(page), "the composer invites the edit while editing");
assert(/savedPaymentMethod,\n\s*\);/.test(page), "a payment method saved earlier carries into a re-staged reservation");
assert(!/Visa •••• 4471/.test(flow.replace(/DEMO_CARD[^\n]*/, "")), "no hidden demo card fallback — an empty form is never saved as a card");
assert(/Use a demo card/.test(flow) && /setCard\(DEMO_CARD\)/.test(flow), "demo payment is an explicit, visible fill");
assert(/const found = validateCard\(card\);/.test(flow) && /aria-invalid/.test(flow), "card fields are checked before saving, with accessible inline errors");
assert(!/try again without losing your reservation/.test(flow), "no promise of a payment-failure retry path that doesn't exist");
assert(/priceRows\("Total due today"\)/.test(flow), "Confirm's summary reads Total due today (desktop and mobile)");

// --- Booking confirmed offers no disabled/inert actions (no reservation-
// details destination exists in this POC, so no CTA invites one).
const confirmed = flow.slice(flow.indexOf('if (status === "reserved") {'), flow.indexOf('if (status === "authorizing") {'));
assert(confirmed.includes("You’re all set") && confirmed.includes("Confirmation number"), "confirmed state keeps its content and summary");
assert(!/<Button|<button|disabled|cursor-not-allowed/.test(confirmed), "confirmed state has no disabled or inert actions");
assert(!flow.includes("View reservation details"), "no View reservation details CTA");

// --- CTA copy.
assert(page.includes("Choose this site") && !/Choose \{activeCandidate/.test(page), "Choose this site — no fixture numbering in the CTA");
assert(page.includes("No thanks, I’ll pass") || page.includes("No thanks, I&rsquo;ll pass"), "No thanks, I'll pass is kept");

if (failures > 0) {
  console.error(`\n${failures} purchase-flow check(s) failed.`);
  process.exit(1);
}
console.log("\nAll purchase-flow checks passed.");
