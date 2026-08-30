# CampOps Consumer — Implementation Decisions

Decisions arising during implementation that aren't yet reflected in the Drive-sourced
documents under `docs/source/`. This file is a companion to the Case Study Notes
decision log, not a replacement — entries here should be merged into that document
(or superseded by it) rather than treated as a separate parallel source of truth.
Format follows the Case Study Notes' "Decision N" convention for easy merging.

---

**Decision: Priority-tier extraction requires explicit relative tradeoff language**
Date: 2026-08-30
Context: Live GPT-5.4 mini verification of `/api/intent` surfaced a case where qualitative
descriptors alone ("peaceful", "off the beaten path", "somewhere we can unplug") caused the
model to also infer a `priorities` entry ("seclusion over convenience") that the user never
stated as an explicit tradeoff — only implied by word choice.
Options considered: leave as-is (qualitative language can imply priorities); require the
user to state which side of a tradeoff wins before classifying anything as a priority.
Choice: Priorities require explicit or strongly supported relative tradeoff language. Qualitative
descriptors alone remain Preferences unless the user clearly expresses what should win over what.
Why: The PRD requires priority-tier inference only "with sufficient support"; inferring a tradeoff
from mood-setting language alone risks the model presenting an invented judgment as the user's
stated priority, which the Design Brief's "Silent Compromise" risk explicitly warns against.
Impact on product/build: `/api/intent`'s system prompt (`src/app/api/intent/route.ts`) now states
this rule explicitly. No schema change was needed — `priorities` remains a plain string array.

---

**Decision: Separate intent-interpretation status from TripIntent (deferred, not yet implemented)**
Date: 2026-08-30
Context: The current `TripIntentSchema` has no way to represent "this request is too ambiguous to
act on" — an underspecified message ("We want to go camping soon") and a message where the user
simply hasn't specified anything yet produce structurally identical output. Before building the
Clarification screen, the system needs an explicit, structured way to distinguish `actionable` from
`needs_clarification` intent-interpretation states, rather than inferring ambiguity from an opaque
confidence score.
Options considered: bolt a confidence score onto TripIntent; add an explicit status enum as a
sibling of TripIntent rather than a field inside it; defer the whole question until Clarification
is actually built.
Choice: Captured as a requirement for the Clarification slice — TripIntent should stay a pure
representation of what CampOps understood; a separate `status: "actionable" | "needs_clarification"`
(plus perhaps a reason) should wrap it, produced by the same extraction call.
Why: A confidence score is opaque and doesn't tell the UI _what_ is ambiguous or why; an explicit
status the model must commit to is inspectable, testable, and matches the PRD's requirement to
"request clarification when ambiguity materially prevents a useful result" as a discrete decision
rather than a fuzzy threshold.
What would change this decision: If Clarification turns out to need finer-grained states than a
binary actionable/needs_clarification split (e.g. partial actionability).
Status: **Not implemented.** Deferred until the Clarification screen is actually being built, per
explicit instruction not to build Clarification ahead of schedule. This entry exists so the
decision isn't lost or re-litigated when that slice starts.

---

**Finding: `guestCount` was never enforced as a hard capacity constraint**
Date: 2026-08-30
Context: Live end-to-end verification of the constraint-integrity slice — "20 people, pet-friendly" —
timed out waiting for the expected No Match state. The live model correctly extracted
`guestCount: 20` as a structured field and correctly did _not_ also duplicate it into
`hardRequirements` as text (nothing in the system prompt asked it to). The evaluator, however, only
ever checked capacity when a hard-requirement _label_ happened to contain a capacity/guest keyword —
so with `guestCount` set but no matching text label, capacity was silently never checked at all, and
a 20-person request was incorrectly returning a "full match" against sites with 4–6 person capacity.
Resolution: `evaluateCampsites` now always derives a synthetic `"Capacity for {n}"` hard check from
`intent.guestCount` directly whenever it's set, independent of `hardRequirements` text content.
Impact on process: This is exactly the class of gap the constraint-integrity slice was meant to
catch — a structured field silently not being enforced is a more dangerous variant of "unverifiable
treated as satisfied," since it doesn't even surface as a visible compromise. Worth keeping in mind
for any other structured `TripIntent` field that could similarly go unenforced (e.g. `checkIn`/
`checkOut` dates aren't currently checked against `datesAvailable` at all — flagging, not fixing,
since date-range matching wasn't in scope for this slice).

---

**Decision: Availability-loss explanations stay deterministic, no new GPT call for this slice**
Date: 2026-08-30
Context: The availability-loss recovery slice's requirements explicitly permit GPT-5.4 mini to
phrase deterministic comparison facts for the "what was preserved, what changed" explanation, with
a hard constraint that it may never invent availability, pricing, amenities, or tradeoffs.
Options considered: add a new API route that asks the model to phrase the preserved/changed diff
from structured facts; keep the diff entirely template-based, as the existing recommendation
explanation already is.
Choice: Kept fully deterministic (`src/lib/recovery.ts`'s `describeChange`) — no new model call was
added for this slice.
Why: The permission was worded as a constraint on how GPT _may_ be used if used, not a requirement
that it must be. A template built directly from the same Candidate facts already driving the rest of
the UI is simpler, has no new latency/failure surface, and is trivially testable without a live key
(see scripts/smoke-test-recovery.ts) — consistent with the Build Brief's "deterministic where
reliability matters" principle. Revisit if the deterministic phrasing proves too mechanical for real
user testing.
Impact on product/build: No new API route. `buildRecoveryMessages`/`describeChange` in
`src/lib/recovery.ts` produce both agent messages entirely from facts already on the two Candidate
records being compared.

---

**Decision: Scripted availability-loss trigger is a visible demo control, not hidden**
Date: 2026-08-30
Context: Build Brief §13 lists "developer/demo control that triggers the exception" as one acceptable
mechanism for the scripted availability-loss exception. The trigger needs to be something a person
(or an automated UI test) can actually invoke in the running app, deterministically and repeatably.
Choice: A plainly-labeled text link under the candidate's action row — "Simulate: this site just
became unavailable" — visible whenever an active candidate exists. Not styled as a DS component,
not hidden behind a dev flag.
Why: It needs to be real and clickable to verify the full interaction end-to-end (including in the
browser, not just via `evaluateCampsites` directly), and mislabeling it as organic product behavior
would misrepresent a scripted exception as real backend integration. Explicit and honest labeling
was judged better than a fake "real" trigger for a POC.
What would change this decision: Once the POC needs true random/backend-driven availability changes,
or once a design actually specifies this control, replace it with that.

---

**Finding: Composer conflated "actively processing" with "not accepting input"**
Date: 2026-08-30
Context: Visual verification of the Accept/Reject flow showed the Composer rendering its Stop
control (not a disabled Send button) once a search was accepted or rejected — implying work was
in progress and interruptible when nothing was actually running.
Resolution: `Composer` now takes `isWorking` and `disabled` as distinct props — `isWorking` alone
controls the Send/Stop swap; `disabled` (used for the accepted/rejected locked state) always renders
a plain disabled Send button, never Stop.
Impact on process: A reminder that reusing one loading-ish boolean for two different meanings
("processing" vs. "locked for another reason") is an easy way to send the wrong signal about agent
activity — exactly the kind of legibility problem the Design Brief's "Invisible Agency" risk warns
about, just inverted (implying activity that isn't happening, rather than hiding activity that is).

---

**Flag (not silently resolved): `destructive` red differs between the Style Guide page and the
live Authorize/Reservation Review screens**
Date: 2026-08-30
Context: The DS Style Guide page's swatch for the invalid/border-invalid state is `#DC2626`
(already the value this codebase's `--destructive` token uses). The live Authorize Booking,
Reservation Review, and Cancel Reservation screens' consequence/error text all resolve, via
`get_design_context`, to a raw fallback of `#b21d1d` instead of a bound variable reference — the
same pattern previously seen on the "Staged" badge (a raw literal where a token reference was
likely intended).
Choice made (not asked first, since this is a pixel-value nuance, not a product/design behavior
question): kept `#dc2626`, the Style Guide's canonical token value, on the theory that the raw
`#b21d1d` fallbacks are unlinked instance literals rather than an intentional second red.
Flagging rather than asserting this is correct: if `#b21d1d` is actually the intended, more
recent value across the authorization-flow screens specifically, the fix is a one-line token change
in `globals.css` — please confirm which is right.

**Flag (not silently resolved): "Staged · Not yet booked" badge uses a raw neutral gray in Figma,
not this project's documented `secondary` token**
Date: 2026-08-30
Context: The Handoff Spec documents `secondary` as resolving to `earth/tint` (`#F3ECE4`). The live
Reservation Review screens' "Staged" badge instance resolves to a generic shadcn neutral
(`#f5f5f5`) instead, not bound to any of this project's brand tokens.
Choice made: implemented the badge with the existing `neutral-soft` token (`#f3f4f6`, already used
for the Preference requirement-chip tier) rather than either the brand `secondary` token or a new
raw hex — visually very close to Figma's literal value and reuses an existing token rather than
introducing a new one just for this badge.
Flagging because I'm not confident this badge was ever meant to bind to a real semantic token at
all, versus being an unbound instance in the file — worth a design-side check next time the DS file
is touched.

---

**Decision: `computeMissingFields` also guards `guestCount`, beyond what the live Figma mock shows**
Date: 2026-08-31
Context: The live Reservation Review/Missing Info screens only ever model payment method as
capable of being missing — the mock's guest count is always present (4). But `guestCount` is a
structured `TripIntent` field with deterministic meaning (it already gates capacity during
evaluation), and this project's standing rule is that every such field needs an explicit
enforcement path. A user could reach an accepted candidate without ever having stated a headcount
(evaluation doesn't strictly require `guestCount` to rank a candidate).
Choice: `computeMissingFields` treats a null `guestCount` the same as a missing payment method —
an authorization-blocking "incomplete" condition, using the identical visual treatment
(`SummaryRow`'s `missing` state) already established for payment method.
Why: Consistent with the standing "every structured field with deterministic meaning must have an
explicit enforcement path" rule, and with this slice's own point — a booking-ready state must
contain guest count (PRD §6). This is a low-frequency edge case (guest count is present in every
realistic conversational flow) but a real gap if left unguarded.
**Flagging this explicitly rather than treating it as settled**: this extends observable product
behavior beyond what any current design artifact literally shows, which borders on a
product-behavior decision I'd normally stop and confirm before making. I judged it a defensible,
low-risk default consistent with your own standing rules rather than a novel product decision, and
kept moving rather than blocking the slice on it — but please tell me if you'd rather this reverted
to payment-method-only, matching the literal mock exactly.

---

**Decision: "Cancel reservation" discards immediately; no separate confirm dialog built this slice**
Date: 2026-08-31
Context: Live Figma has a dedicated "Cancel Reservation" confirmation dialog (destructive confirm,
reachable from the "Cancel reservation" link). It was not in this slice's listed component set
("Summary Row, Reservation Review, Missing Info treatment, Authorize Booking dialog, Reserved
status treatment").
Choice: The "Cancel reservation" link discards the staged reservation and returns to the search
view immediately, with no intermediate confirmation step.
Why: Building that dialog wasn't part of the approved component list for this slice; a staged
(not yet paid/booked) reservation is low-consequence to discard, unlike the authorization boundary
itself, which does have its full dialog. "Edit reservation" is similarly left inert (disabled) —
no edit-fields form exists yet, and a clickable button that does nothing would be worse than an
honestly disabled one.
What would change this decision: If Cancel Reservation's dialog becomes an explicitly approved
future slice, or if user testing shows the immediate discard feels too easy to trigger by accident.

---

**Decision: Reservation Review and Booking Confirmed share one component, switched by status**
Date: 2026-08-31
Context: Figma treats "Reservation Review", "Reservation Review (Missing Info)", and "Booking
Confirmed" as three separate screens/frames.
Choice: `ReservationReview` (`src/components/campops/reservation-review.tsx`) renders all three as
one component, branching internally on `reservation.status`, rather than three separate files.
Why: They share the same page shell and card layout closely enough (single centered column, same
Summary Row list shape, same badge position) that duplicating the shell three times seemed like
needless repetition for a POC; the underlying `Reservation` state model still keeps every status
distinct, which is the part that actually matters for the slice's invariants.
