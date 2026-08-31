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
Status: **Implemented 2026-08-31** as planned — a three-value `status: "actionable" |
"needs_clarification" | "unsupported"` (the third value added once Unsupported was in scope too),
wrapping TripIntent in `IntentInterpretation` (`src/lib/schemas.ts`), produced by the same
structured-output call. No confidence field was added. See the new decisions below for what changed
in the implementation.

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

**RESOLVED (2026-08-31):** kept `#dc2626`, the Style Guide token. Confirmed: treat the Figma
mismatch as a design-file cleanup item (the individual authorization screens' raw `#b21d1d`
fallback should eventually be re-bound to the shared token) rather than a code change. No further
action needed here.

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

**RESOLVED (2026-08-31):** kept `neutral-soft` for the Staged badge. Confirmed: no new semantic
token should be invented solely to reproduce Figma's current raw gray — document as a design-system
cleanup item (the badge instance should eventually bind to a real token) rather than a code change.

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

**RESOLVED (2026-08-31):** confirmed intentional — guestCount stays required booking information,
per the PRD's explicit requirement that guest count be part of the booking-ready state. Not reverted.

---

**SUPERSEDED (2026-08-31):** the immediate-discard behavior below was removed per explicit
instruction. Cancellation is consequential and must not happen without explicit authorization; since
the full cancellation confirmation flow is still out of scope, "Cancel reservation" is now rendered
as an inert, non-interactive label (a `<span>`, not a button — verified via Playwright that clicking
it has no effect and the user stays on Reservation Review) rather than a functional immediate
discard. It will become functional only when its proper confirmation flow is intentionally built.
"Edit reservation" remains inert for the same reason it always was (no edit-fields form exists).

**Decision (superseded, kept for history): "Cancel reservation" discards immediately; no separate
confirm dialog built this slice**
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

---

**Decision: No Match moved from the Trip Panel into a chat-column Attention Card**
Date: 2026-08-31
Context: The prior slice's No Match implementation rendered its summary as an ad hoc block inside
the Trip Panel — the real Attention Card component didn't exist yet at that point. Live Figma
(node 50:259) places No Match's Attention Card in the Messages/chat column instead, exactly like
Clarification and Unsupported, with the Trip Panel falling back to plain requirement chips.
Choice: Rebuilt No Match to push an `AttentionCard` entry into the same chat timeline as
Clarification/Unsupported (eyebrow "No exact match found"), and reverted the Trip Panel to its
plain chip fallback whenever `evaluation.kind !== "full"/"compromise"` — matching Figma exactly and
satisfying this slice's explicit requirement that all three states share one Attention Card
treatment rather than three different visual patterns.
Impact on product/build: `src/app/page.tsx`'s message model became a tagged union (`kind: "chat" |
"attention"`) instead of a flat chat-only list; only the latest message renders live action buttons
(clarification quick replies / unsupported Continue+Never mind / no-match Widen+Change+decline),
since once a newer message is pushed the prior attention state is naturally superseded — no
separate "resolved" flag was needed.

---

**Decision: Widen Search and Change a Requirement are deterministic, not model calls**
Date: 2026-08-31
Context: Figma's No Match example shows a concrete action, "Widen search to 100 mi" — a specific,
targeted change, not a vague "try something else."
Choice: `widenSearch` (`src/lib/no-match.ts`) is a pure function that moves exactly one
confirmed-failing hard requirement (one already known, from `evaluateCampsites`'s own compromise
labels, to be blocking every candidate) into `flexibleConstraints`, then the app re-evaluates. If
nothing failing maps to a literal `hardRequirements` entry (e.g. only the synthetic capacity check
is failing), it's a safe no-op rather than a guess. "Change a requirement" simply focuses the
composer — CampOps' established edit surface (Case Study Decision 14) — rather than opening any new
UI.
Why: This is a real state transition driven by facts the evaluator already proved, not a screen-only
simulation or an invented model action — consistent with the standing rule that Authorization and
other consequence-adjacent controls must be enforced in transition logic. Widening happens to be
low-consequence, but the same discipline (touch only what's proven to be the cause, never guess)
applies.
Impact on product/build: `scripts/smoke-test-no-match.ts` asserts Widen Search changes exactly one
field and that the no-op case leaves intent byte-identical.

---

**Decision: Unsupported turns cannot mutate TripIntent, enforced in code, not just prompted**
Date: 2026-08-31
Context: The model is instructed to always return its best merged TripIntent regardless of status,
including on unsupported turns (useful for defense-in-depth logging/visibility), and live testing
confirmed it reliably does echo the prior intent unchanged. But "an unsupported side request must
not destroy or silently replace the active camping intent" is a consequence-sensitive guarantee this
project should not rest on model behavior alone for.
Choice: `submitMessage` in `src/app/page.tsx` never calls `setIntent()` when
`interpretation.status === "unsupported"` — the returned `intent` field is read only for the
(passing) live-test assertion that the model itself preserves it, never applied to state.
Why: "Application handles truth and consequence-sensitive state" — even though the model behaved
correctly in testing, trusting it to never touch intent on an unsupported turn is exactly the kind
of assumption this project has repeatedly found worth replacing with a deterministic guard (see the
guestCount capacity-enforcement finding from the constraint-integrity slice).

---

**Finding: live model calibration for status classification (verified, no changes needed)**
Date: 2026-08-31
`scripts/smoke-test-intent-status.ts` verified against the real GPT-5.4 mini endpoint:

- A contentless message ("We want to go camping soon.") correctly produced `needs_clarification`
  with a specific question and sensible quick replies.
- A two-turn clarification exchange correctly merged the answer into the existing intent
  (`guestCount` and the pet-friendly hard requirement survived from turn A into turn B untouched)
  and correctly flipped to `actionable` once dates were supplied.
- "Can you also book my flights and rental car?" correctly produced `unsupported` (not
  `needs_clarification`) with a calm, plain-language reason, both as a fresh request and as a
  follow-up after an established trip — and in the latter case the model's own returned `intent`
  still carried the established guestCount/dates/requirements unchanged, matching the code-level
  guard above.
  No prompt or schema changes were needed as a result — recorded here as evidence the calibration
  guidance in the system prompt (don't ask about already-known fields, distinguish task-scope from
  match-quality) is working as intended, not as a gap that needed fixing.

---

**Decision: Reservation transitions return their TaskEvent from the same guarded call, not a
separate emission step**
Date: 2026-09-01
Context: The standing rule for this slice is that a transition already guarded by a state-machine
function should have its event derived at that same architectural boundary, not reproduced
separately in the UI. `transitionReservation`/`stageReservation` were the two functions in this
codebase that already fit that description exactly.
Choice: Both functions now return `{ reservation, event }` instead of a bare `Reservation` — the
event is computed inside the same switch/branch that decides the new status, using the same guard
that would otherwise throw. Every existing call site (`page.tsx`, `smoke-test-reservation.ts`) was
updated to destructure both fields.
Why: This makes the invariant "no `reservation_reserved` event without a valid AUTHORIZE
transition" true by construction — the only way to get that event object is to call
`transitionReservation` with `{ type: "AUTHORIZE" }` on a reservation already `"authorizing"`, which
is exactly the existing guard for the status itself. There is no code path that can produce the
event without producing the (identically-guarded) state change alongside it.
Impact on product/build: `scripts/smoke-test-reservation.ts` now asserts on `event.type` at every
transition, not just `reservation.status`.

---

**Decision: evaluateCampsites stays a pure function; evaluation/recommendation events are derived
at the page-level call site instead**
Date: 2026-09-01
Context: Unlike the reservation state machine, `evaluateCampsites` has no "guarded transition"
concept — it's a stateless computation, and it has no way to know whether it's being called for a
first search, a widen-search retry, an availability-loss recovery, or a request-alternative cycle,
all of which need differently-typed events (`recommendation_selected` vs. `replacement_selected`).
Choice: Kept `evaluateCampsites` unchanged and pure. All evaluation/recommendation/availability
events are derived by dedicated pure functions in `src/lib/events.ts` (`deriveEvaluationPerformedEvent`,
`deriveRecommendationSelectedEvent`, `deriveReplacementSelectedEvent`, etc.), called immediately
after each real `evaluateCampsites`/state-mutation call site in `page.tsx` — never reconstructed
later from chat messages.
Why: Forcing `evaluateCampsites` to also know "why" it's being called would couple a deterministic
data computation to UI/orchestration concerns it shouldn't need to know about. The derivers still
satisfy the same principle (derive from real before/after facts, one clear place per concern) —
they're just a sibling module to the evaluator rather than living inside it, which is the right
boundary here since the "guard" that matters (never letting an excluded site re-enter, never
letting an unverifiable requirement pass as satisfied) already lives inside `evaluateCampsites`
itself; these events do not add a second copy of that logic, they only describe its output.

---

**Decision: two additional event types beyond the explicit minimum list, both directly justified**
Date: 2026-09-01
Context: The required event list was described as "at least" a floor, not a ceiling.
Choice: Added `payment_method_added` (fired from `transitionReservation`'s `ADD_PAYMENT_METHOD` case)
and `task_closed` (fired both when a decline path reaches Closing and when a reservation is actually
reserved).
Why: `payment_method_added` closes an otherwise-visible gap in the narrative — Missing Info detected,
then nothing, then Authorize Booking presented with a payment method that appeared from nowhere;
logging the moment it was added is exactly "distinguish what CampOps has done from what has only
been proposed." `task_closed` marks a real terminal-state boundary distinct from *why* the task
ended (declined vs. reserved) — useful if this Activity Log is ever extended to summarize completed
tasks, and cheap to emit now since the terminal transition already exists.
What would change this decision: If either event proves noisy in practice rather than clarifying —
neither is a developer-telemetry event; both describe something a person would recognize as
"something just happened."

---

**Decision: no "requirement removed" event — the underlying direct-manipulation interaction was
never built**
Date: 2026-09-01
Context: The Design Brief and Case Study Notes describe two distinct paths for changing a
requirement: a chat-driven "Constraint Refined" path and a direct-manipulation "Constraint Removed"
path (clicking a chip's own remove icon). Only the chat-driven path has ever been implemented —
`RequirementChip`'s `onRemove` prop exists on the component but has never been wired up in
`page.tsx`; the chips rendered in the Trip Panel are display-only.
Choice: `deriveIntentEvent` only ever produces `trip_established`/`requirement_refined` (both via
the chat-driven merge path). No `requirement_removed` event type was added.
Why: Per this slice's own rule 3 — "if a transition does not happen, its corresponding event must
not appear" — there is no real removed-via-chip transition to describe. Building that interaction
is out of scope for this slice (not requested, and it touches the Trip Panel's existing chip
rendering, not the Activity Log). Flagging so it isn't mistaken for an oversight: this is a gap in
an earlier slice's scope, not something silently dropped from this one.

---

**Decision: "View activity" appears only on the search view's Trip Panel**
Date: 2026-09-01
Context: The instruction was to add the entry point "to every currently implemented screen/state
that has the persistent trip panel." Live Figma confirms Reservation Review, Authorize Booking, and
Booking Confirmed have no Trip Panel at all (single centered column, no side panel) — only the
search view's Clarification/Unsupported/No Match/Recommendation/Closest-match states do.
Choice: Added exactly one "View activity" link, in the search view's Trip Panel header, reachable
from every one of its sub-states. `handleBackToTrip` returns unconditionally to `"search"` since
that is the only view with an entry point at all.
Why: Matches the live design exactly rather than inventing a Trip-Panel-equivalent for screens that
don't have one.

---

**Finding: React Strict Mode hazard avoided in the simulated-authorize timeout**
Date: 2026-09-01
Context: The dialog's Reserve click starts a deterministic delay before AUTHORIZE actually fires
(Handoff Spec §5's Pressed/Loading requirement). The timeout callback needs the freshest
`reservation` value (in case the user cancelled during the delay) and must push exactly one
`reservation_reserved` event when it does fire — never zero, never two.
Finding: A functional `setState` updater (`setReservation((current) => ...)`) is the idiomatic way
to read fresh state inside a timeout, but React's Strict Mode intentionally invokes updater
functions twice in development to catch impure ones — which would have called `pushEvent` (a side
effect) twice, double-logging the reservation and the task_closed event on every real booking.
Resolution: Introduced `reservationRef`, a ref mirrored alongside every `setReservation` call via a
single `updateReservation()` wrapper. The timeout reads `reservationRef.current` (a plain value
read, not a functional updater) and calls `setReservation`/`pushEvent` directly, exactly once.
Impact on process: A reusable pattern worth remembering for this codebase — anywhere a delayed
callback needs to both read fresh state and produce a side effect (event, network call), prefer a
ref mirror over a functional state updater with side effects inside it.

---

**Decision: direct-manipulation Requirement Chip removal implemented — supersedes the 2026-09-01
"no requirement_removed event" gap**
Date: 2026-09-01 (later same day)
Context: The 2026-09-01 entry above flagged that `RequirementChip`'s `onRemove` prop was never wired
up, so no `requirement_removed` event existed. This slice closes that gap.
Choice:
- Added `EventType` member `requirement_removed` (`schemas.ts`) and a pure deriver,
  `deriveRequirementRemovedEvent(tier, label)` (`events.ts`), with actor `"user"` — a direct action
  by the person, not an agent interpretation. Its copy ("Removed \"X\" as a hard requirement.") is
  deliberately distinct in wording from `requirement_refined`'s "Updated trip requirements." so the
  Activity Log itself tells the two paths apart without a new visual affordance or product concept.
- Extracted the removal itself into a pure, testable function, `removeRequirement(intent, key,
  value)` (new file `src/lib/requirements.ts`), mirroring the existing `widenSearch` pattern in
  `no-match.ts`: touches only the one targeted tier array/value, returns `{intent, changed}` so a
  no-op (value already absent) is explicit rather than inferred, and never mutates the input.
- Wired `onRemove={() => handleRemoveRequirement(key, v)}` onto the chip in `page.tsx`'s
  `TIER_SECTIONS.map`. The handler: calls `removeRequirement`, bails out on `changed: false` (no
  event, no re-evaluation, no chat message for a no-op), then — in the same order as the existing
  `handleWidenSearch` pattern — pushes `requirement_removed`, updates `intent`, pushes
  `evaluation_performed`, re-runs `evaluateCampsites`, and posts **only one agent chat bubble**
  acknowledging the change (`announceEvaluation` handles the no_match/recommendation split). No
  `pushChat("user", ...)` call exists on this path, by construction — there is nothing that could
  accidentally add one.
- No dedicated Undo control was added, per explicit instruction. Restoration remains a normal
  chat/composer edit; verified live (see below) that the existing refinement pipeline
  (`deriveIntentEvent` → `requirement_refined`) handles restoring a directly-removed requirement
  with no special-case code.
Why: Matches Handoff Spec 2.4's removable-chip affordance and this slice's explicit constraint that
direct manipulation and chat-driven refinement must stay visually/behaviorally distinct without
inventing a second product concept — the distinction is carried entirely by event type, actor, and
wording, not a new component or state.
Verification: New pure-logic suite `scripts/smoke-test-requirement-removal.ts` (tier/value
isolation, no-op-on-absent-value, event actor/wording, event-type distinctness) and a live/mocked
Playwright run confirming: the chip only renders where the existing Trip-Panel toggle already shows
chips (i.e., whenever `evaluation.kind !== "full"/"compromise"` — the 2026-09-01 "No Match moved to
Attention Card" decision's chip-fallback state, unchanged by this slice); removing a chip produces
no new "You" chat bubble; the agent's own acknowledgment names the real removed value; evaluation
re-runs and the recommendation/no-match state updates honestly (a no_match → full-match recovery
was used as the live demonstration); the Activity Log orders `requirement_removed` (actor "You")
before the resulting `evaluation_performed`/recommendation event, and visually distinguishes it from
a later chat-driven `requirement_refined` ("Updated trip requirements.", actor "CampOps") in the
same log; and chat-based restoration ("add RV site back") round-trips correctly back to no_match
with zero special-case restoration code. Zero console errors across the run.
**Superseded** (see the later 2026-09-01 "Requirement Chip removal is now consistently available…"
entry below): the paragraph originally here said direct chip removal was scoped only to the Trip
Panel's no-match/plain-chip fallback, and that a recommendation's Candidate Card had no working
remove control. A design resolution the same day overturned that scoping — removal is now also
available on the Candidate Card's preserved/compromise chips whenever they map to a literal
`hardRequirements` entry. Left in place above for the historical record of what this slice actually
built at the time; do not read it as current behavior.

---

**Decision: campsite dataset expanded from 5 to 10 records (PRD §8 representative POC dataset)**
Date: 2026-09-01
Context: The original 5-record dataset (unchanged, all preserved exactly) was an intentionally
small vertical-slice seed. This slice expands it toward PRD §8's ~8–15-record target, each new
record earning its place with a distinct evaluation-scenario purpose rather than padding:
- `lakeview-11` (Cabin, cap 5, $185, pet:true, water:true, low seclusion, 12 mi, "Boat launch"):
  closest/cheapest of the pet-friendly qualifying sites for most default scenarios — deliberately
  capacity 5 (not 6), so it does NOT collide with the existing "Widen Search" no-match fixture
  (`guestCount: 6, hardRequirements: ["Pet-friendly"]` in `smoke-test-no-match.ts`), which depends
  on no site besides `blue-ridge-22` qualifying at capacity 6.
- `timber-hollow-2` (Tent, cap 4, $110, pet:true, water:false, high seclusion, 65 mi): a second
  full-match candidate for "Pet-friendly + Capacity for 4 + Tent," which is exactly the kind of
  larger-dataset ranking scenario the slice asked for — but it collided with
  `smoke-test-recovery.ts`'s "Loss with no viable recommendation remaining" fixture, which assumed
  exactly one full match for that combination. Fixed by adding "Near water" to that fixture's
  `hardRequirements` (isolating `blue-ridge-14`, the only nearWater:true site in that combination) —
  the fixture's intent, not the dataset, was the thing tied to the old 5-record assumption.
- `eagle-point-5` (RV, cap 8, $195, pet:false, water:false, low seclusion, 40 mi, "Wifi"): a large,
  amenity-rich RV site — exercises the higher-capacity / non-pet-friendly / RV-type combination and
  gives the RV tier a second record.
- `mossy-creek-4` (Tent, cap 3, $105, pet:true, water:true, medium seclusion, 22 mi): the intended
  compromise-recovery destination when the sole full match on a "Pet-friendly + Wifi" search
  (`silver-creek-7`, the only pet-friendly site actually listing Wifi) becomes unavailable — every
  other pet-friendly site is compromise-only (Wifi unverifiable), and `mossy-creek-4`'s price/
  distance combination scores highest among them.
- `north-ridge-1` (Cabin, cap 4, $230, pet:false, water:false, high seclusion, 75 mi,
  `available: false`): the one record exercising the dataset's own static/seasonal-closure
  availability path, distinct from the runtime `unavailableIds` simulated-loss mechanism — proves
  exclusion-before-scoring works for a permanently-closed record, not only a scripted one.
All ripple effects were confirmed empirically (not just hand-traced) by running every existing
smoke/regression suite after the expansion; only the one fixture above needed updating, and no
evaluator logic changed.
New coverage: `scripts/smoke-test-dataset.ts` — known full-match scenario ranks the intended
candidate first, structured capacity check excludes undersized sites, pet-policy hard failure
excludes non-pet-friendly sites, the statically-unavailable record never appears under any intent,
a hard-requirement change alters which candidates qualify, a relative-priority change alters the
top-ranked candidate (Wifi priority flips the lead to `silver-creek-7`), repeated evaluation of the
same intent is deterministic, and a genuinely unsatisfiable combination still yields `no_match`.

---

**Finding: qualitative campsite attributes (`seclusion`) — Build Brief's pre-tagged-vs-inferred
question resolves to no change**
Date: 2026-09-01
Context: This slice's instructions required inspecting the Build Brief's previously-unresolved
decision between pre-tagged deterministic qualitative attributes and GPT-inferred-at-judgment-time
attributes before touching the dataset's qualitative fields, defaulting to the lowest-complexity
option that preserves repeatability and model/application separation, and stopping to flag rather
than silently resolving it if doing so would materially change the architecture.
Finding: `Campsite.seclusion` (`"high" | "medium" | "low"`) has been a plain pre-tagged deterministic
field on the `Campsite` type since the very first vertical-slice dataset — it was never
GPT-inferred, and `evaluate.ts`'s `checkConstraint` already reads it as ordinary structured data
(the "seclu"/"quiet"/"private" keyword branch). Expanding the dataset to 10 records added more
pre-tagged `seclusion` values in the same shape; it did not introduce, and did not need to resolve,
any new pre-tagged-vs-inferred question.
Resolution: No architecture change made or needed. This is recorded as a confirmed inspection, not
a new decision — the Build Brief's open question was already answered by the codebase's existing
(and unchanged) representation, and this satisfies the instruction to inspect before touching
qualitative fields.

---

**Finding: full regression suite re-verified against the expanded (10-record) dataset**
Date: 2026-09-01
Context: Per this slice's explicit rule to protect existing evaluation behavior and update tests
that accidentally depended on the old 5-record dataset (rather than casually re-tuning the
evaluator), every existing smoke/regression script was run end-to-end after the dataset expansion
and the chip-removal implementation.
Finding: All of `regression-structured-fields.ts`, `smoke-test-evaluate.ts`, `smoke-test-events.ts`,
`smoke-test-intent-status.ts`, `smoke-test-no-match.ts`, `smoke-test-recovery.ts`, and
`smoke-test-reservation.ts` passed unchanged except for the one fixture noted above
(`smoke-test-recovery.ts`'s "Loss with no viable recommendation remaining," which needed "Near
water" added to isolate its intended single full match). `tsc --noEmit`, `eslint .`, and `next
build` all completed clean. Live/mocked Playwright verification covered: a normal full-match
recommendation, direct chip removal and its re-evaluation, chat-based restoration, the Activity Log
distinguishing both paths, Request Alternative cycling correctly across the larger dataset without
reintroducing an excluded candidate, availability-loss recovery to both a full-match substitute and
a compromise-only substitute, a true no-match across the expanded set, and the new-search reset —
with zero console errors throughout.
Impact on process: No evaluator weights or ranking rules were changed. The dataset expansion did not
expose a ranking weakness requiring recalibration.

---

**Design resolution: Requirement Chip removal is now consistently available wherever editable
requirement chips are shown, superseding the narrower "no-match/trip-detail only" behavior above**
Date: 2026-09-01 (later same day)
Context: The chip-removal work above (see "direct-manipulation Requirement Chip removal
implemented") wired `onRemove` only onto the Trip Panel's plain-chip fallback (visible whenever
`evaluation.kind !== "full"/"compromise"`). It left an interaction inconsistency: the Candidate
Card's "How this fits" row (Handoff Spec 2.7 / Figma DS node 2085:6) already rendered its
preserved/compromise chips with a visible X icon (the same `RequirementChip` component, tier
styling and all), but that icon was purely decorative there — `candidate-card.tsx` never passed
`onRemove`, so a user looking at a live recommendation saw what looks like a remove affordance that
silently does nothing. Per explicit direction, this is a design resolution: chip removal must be
consistently available whenever editable trip requirement chips are shown, including during
recommendation/compromise states, not only in the no-match/trip-detail chip-list state. This
replaces (does not merely add to) the earlier narrower behavior.
Choice:
- Extracted the shared decision logic into `src/lib/requirements.ts` rather than duplicating it per
  screen: `rawRequirementLabel(displayLabel)` strips a compromise description's prefix ("Doesn't
  satisfy: " / "Couldn't verify: ", now exported as `UNVERIFIABLE_PREFIX`/`UNSATISFIED_PREFIX` from
  `evaluate.ts` — the one place that actually builds these strings — and reused by `no-match.ts`'s
  own failing-label extraction, replacing what had been a second, independently-maintained copy of
  the same prefix) back to the raw label; `isRemovableHardRequirement(intent, displayLabel)` checks
  whether that raw label is a literal entry in `intent.hardRequirements`.
- `candidate-card.tsx` now accepts optional `removableHardLabels`/`onRemoveRequirement` props. Each
  preserved/compromise chip gets a working remove control only when its raw label passes
  `isRemovableHardRequirement` — otherwise it renders exactly as before (visible tier icon,
  non-interactive).
- `page.tsx` passes `hardRequirementsSet = new Set(intent.hardRequirements)` and
  `onRemoveRequirement={(label) => handleRemoveRequirement("hardRequirements", label)}` — the
  *same* `handleRemoveRequirement` function, same `requirement_removed` event deriver, same
  re-evaluation call already used by the Trip Panel's plain chips. No parallel chip-removal
  implementation was written for the Candidate Card; only the label-to-chip mapping differs between
  the two rendering contexts, because the two contexts format labels differently (a plain chip's
  label is already the raw stored value; a compromise chip's label is that value wrapped in a
  human-readable prefix) — the removal mechanism itself is identical.
Why NOT every visible chip is removable: a synthetic, structurally-derived check like "Capacity for
4" is built from `guestCount`, not from literal `hardRequirements` text (see `evaluate.ts`'s
`capacityCheck`) — there is no stored array entry for a chip-removal action to delete, and pretending
otherwise would either silently do nothing or require inventing a second, unrelated mutation (e.g.
clearing `guestCount` entirely) under the same control. Rather than resolving that quietly, this is
being flagged explicitly here: only labels with a literal `hardRequirements` counterpart expose a
working remove icon; synthetic checks keep their existing non-interactive rendering everywhere they
appear. This preserves "every structured field with deterministic meaning must have an explicit
enforcement path" — `guestCount`'s own path (composer/refinement) is untouched by this change.
Verification: Expanded `scripts/smoke-test-requirement-removal.ts` with coverage for
`rawRequirementLabel`, `isRemovableHardRequirement` (including the capacity-synthetic-check
exclusion, both directly and against a real `evaluateCampsites` output), plus a live/mocked
Playwright run against the recommendation state confirming: the synthetic "Capacity for 4" chip has
no remove button; a literal hard requirement's chip (satisfied, in the "preserved" row) does; direct
removal there produces no new User chat bubble and exactly one agent acknowledgment; re-evaluation
correctly re-classifies (still full match, new top candidate); the Activity Log logs
`requirement_removed` (actor "You") ahead of the resulting evaluation/recommendation, distinct from
a later chat-driven refinement; and chat-based restoration from the recommendation state round-trips
correctly with no special-case code. Also re-ran the full existing regression/smoke suite plus
`tsc`/`eslint`/`next build` — zero regressions, zero console errors.
**Figma flag — design source of truth now needs updating to match:** the live Figma Candidate Card
frame (Figma DS node 2085:6, Handoff Spec 2.7) and the `RequirementChip` component's Preserved/
Compromise usage there (Figma DS node 2056:135, Handoff Spec 2.4) currently specify the chip's
Preserved/Compromise rendering as non-interactive by design (the code comment this superseded said
so explicitly, and the visible X icon in that context was previously understood as decorative tier
styling only). Implementation has now moved ahead of Figma for this interaction: the "Recommended
for you" and "Closest match" screens' Candidate Card should be updated in Figma to show the same
live remove affordance the no-match/trip-detail chip list already carries, for every chip that maps
to a literal hard requirement (not the synthetic "Capacity for N" chip). This was not performed in
this pass — no Figma write access was invoked this session — and is called out explicitly per the
standing rule against silently leaving code and Figma divergent. Recommend a follow-up
design-to-code/code-to-design sync pass against these two frames before this is treated as fully
closed.

---

**Mobile/responsive implementation slice**
Date: 2026-09-01 (later same day)
Context: Header, Reservation Review, and Authorize Booking's docstrings had all explicitly deferred
their Mobile breakpoint ("Desktop only for this vertical slice... deferred along with the rest of
responsive parity"). This slice implements that deferred parity across the app, using the Handoff
Spec (2.1 Header, 2.3 Chat Bubble, §5 Authorize Booking, 4.1/4.2/4.3 per-screen notes) and the live
"CampOps Consumer — Pages" Figma file's Mobile frames (fetched via `get_metadata` for exact
per-breakpoint measurements — Intent & Search node 33:215, Recommendation and Adaptation node
33:216, Staging and Authorization node 0:1) as source of truth, per the standing source-of-truth
hierarchy.

**Breakpoint decision:** the Handoff Spec defines only two breakpoints — Desktop (≥1024px) and
Mobile (<600px) — leaving 600–1024px unspecified (no third layout was ever designed for it).
Tailwind's default `lg` breakpoint is exactly 1024px, matching the spec's Desktop threshold, so this
slice treats "below `lg`" uniformly as the mobile/compact layout rather than opening an undesigned
third in-between layout. This is an engineering-discretion call to fill a genuine spec gap, not a
silent reinterpretation of a decision the spec actually made — flagged here per the standing rule.

**What changed, screen by screen:**
- **Header** (`header.tsx`): 56px mobile / 64px desktop (Handoff Spec 2.1 exactly). Mobile shows
  hamburger + wordmark instead of the full nav; the hamburger is an inert, disabled placeholder — its
  open/menu state was never designed (Handoff Spec 2.1: "out of scope per the PRD — no multi-page
  navigation"), so it's honestly non-functional rather than faking a menu that doesn't exist.
- **Main layout** (`page.tsx`): the chat-column/Trip-Panel two-column layout becomes a single stacked
  column below `lg` (`flex-col lg:flex-row`), matching every Mobile frame in the Pages file. The
  persistent side Trip Panel (`border-l`, fixed `420px` width) only takes that shape at `lg`+.
- **Trip Panel content below `lg`, split by state** (this is the one place mobile isn't simply a
  reflow of desktop — the live Figma itself specifies two different mobile treatments depending on
  state, and this slice followed both rather than picking one and inventing the other):
  - **Recommendation/Compromise** (Candidate Card active): Figma's "Recommendation — Mobile" (node
    70:512) and "Alternative"/"Availability Lost" Mobile frames show the Panel Header, Candidate
    Card, and Actions inline in the single column, unchanged in kind from desktop — just reflowed.
    Implemented as-is; Action buttons (Accept/Request Alternative/Reject) stack full-width below
    `lg` (`flex-col lg:flex-row`) per those frames' stacked-button layout.
  - **No active candidate** (pre-evaluation "Working" state, or "No Match"): Figma's "Working —
    Mobile" (51:241) and "No Match — Mobile" (52:346) frames show neither the Panel Header nor the
    chip list inline — instead a collapsed one-line **Status Bar** ("Working: Searching campsites" /
    "Needs attention" + a "View details ›" link) sits below the Header, and the real content (goal
    statement + the full tiered chip list) lives in a separate **Trip Details** bottom sheet reached
    from that link — Figma's "Working (Trip Details Expanded) — Mobile" (54:356). Implemented as
    `TripStatusBar` (new component) + `TripDetailsSheet` (new component, reusing the shared Dialog
    primitive rather than a new Sheet dependency — same approach as Authorize Booking below).
    `tripStatusLabel` is computed from real state (the last message's actual kind/attentionType, and
    the real evaluation result) — never a separately-tracked display-only flag — matching the
    standing rule that user-facing status must derive from actual state.
  - **Figma inconsistency flagged, not resolved into a third pattern:** the "Constraint Removed —
    Mobile" frame (87:459) — the one demonstrating direct chip removal — shows the full tiered chip
    list rendered inline (no status bar, no sheet), unlike "Working"/"No Match" Mobile which both use
    the collapsed-bar-plus-sheet pattern. Per the standing rule ("if the inconsistency exists inside
    Figma itself between the design system and individual screens, flag it rather than creating
    parallel implementation tokens or behaviors"), this slice did NOT build a third mobile pattern
    for that one frame. It adopts the collapsed-bar-plus-sheet pattern consistently for every
    no-active-candidate state (matching 2 of the 3 examined frames, and the more scalable choice for
    a small screen), and flags the "Constraint Removed" frame's divergence here for design to
    reconcile in Figma — the underlying interaction (remove the chip, see the acknowledgment, see the
    evaluation update) is identical either way; only the chip list's mobile container differs.
- **No new/separate chip-removal logic for mobile:** `TripRequirementsList` (new file,
  `trip-requirements-list.tsx`) is the one component both the desktop persistent panel and the
  mobile `TripDetailsSheet` render — same `TIER_SECTIONS` loop, same `onRemove` callback wired to the
  same `handleRemoveRequirement`, same `requirement_removed` event and re-evaluation path. Extracting
  this was necessary to satisfy "do not create separate chip-removal logic per screen" once a second
  screen (the sheet) needed to render the identical list.
- **Chat Bubble** (`chat-bubble.tsx`): default max-width cap is now responsive
  (`max-w-[280px] lg:max-w-[640px]`, per Handoff Spec 2.3's explicit "280px mobile, 640px desktop, set
  per placement"). The Closing screen's narrower 480px desktop cap became
  `max-w-[280px] lg:max-w-[480px]`.
- **Reservation Review** (`reservation-review.tsx`): single-column card layout is identical at every
  width (Handoff Spec 4.3's Desktop/Mobile frames differ only in page margins, not structure) — fixed
  `w-[560px]` became `w-full max-w-[560px]` with responsive padding. **Bug found and fixed in this
  pass:** the title+Badge header row (both "Review your reservation"/"Staged" and "You're all
  set"/"Reserved") was a plain `flex justify-between` row with no ability for either child to shrink
  or wrap — on a 390px viewport this measurably overflowed the viewport width (confirmed via a
  Playwright bounding-box check, not just visual inspection), a real bug this slice's responsive pass
  exists to catch. Fixed to `flex-col` below `lg`, `flex-row` at `lg`+, matching the Figma Mobile
  frame (node 11:14) which shows the Badge on its own line below the title on mobile.
- **Authorize Booking** (`authorize-booking-dialog.tsx`): Desktop centered modal / Mobile bottom sheet
  from one `Dialog`/`DialogContent` (reused, not a new Sheet component), using responsive Tailwind
  variants on the Popup's own position/size classes (`max-lg:bottom-0 max-lg:left-0
  max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-xl`, `lg:top-1/2 lg:left-1/2
  lg:-translate-x-1/2 lg:-translate-y-1/2`) plus a decorative drag-handle bar shown only below `lg` —
  matching Handoff Spec §5's exemplar Responsive Behavior table exactly (radius/md all corners at
  desktop, radius/xl top-only + drag handle at mobile). Verified via an actual bounding-box check
  (`getBoundingClientRect`) that the Popup lands at `x:0, width:390` (full viewport, no overflow) at
  a 390px viewport, not just by eyeballing a screenshot.
- **Trip Details sheet** (new, mobile-only) uses the same Dialog-reuse approach as Authorize Booking.

**Verification method note:** two live screenshots during this pass showed an apparent "ghosted
double-exposure" (background content visibly overlapping dialog content). Investigated via
`getBoundingClientRect`/computed-style rather than assumed to be a bug: both were confirmed to be
screenshots captured mid-CSS-transition (Base UI's `data-open:zoom-in-95`/`fade-in-0`, ~100ms) — the
dialog's actual settled position/size (`x:0, width:390, transform:none`, confirmed after a short
settle wait) was correct throughout. Recorded here so a future pass doesn't misdiagnose the same
capture-timing artifact as a layout regression.

**Verification performed:** `tsc --noEmit`, `eslint .`, `next build` all clean. Full existing
smoke/regression suite (all 9 scripts, unaffected — this slice touched only presentation, not
evaluator/event/reservation logic) still passes. Live Playwright verification at a 390×844 mobile
viewport covering: chip removal from the Candidate Card during a Recommendation state (mobile,
inline — no status bar); chip removal from the Trip Details sheet during a No Match/trip-detail
state (mobile, via the collapsed Status Bar's "View details"); re-evaluation and honest
recommendation/no-match reclassification after each; the Activity Log distinguishing direct removal
from chat-driven refinement on mobile exactly as it does on desktop; chat-based restoration of a
directly-removed requirement from both mobile states; the synthetic "Capacity for N" chip correctly
carrying no remove control in the mobile Candidate Card (same gating as desktop); Reservation Review,
Authorize Booking (bottom sheet), and Booking Confirmed on mobile; and a desktop sanity pass
confirming the two-column layout is visually unchanged. Zero console errors across every run.

---

**Final evaluation phase: defects found and fixed**
Date: 2026-09-01 (later same day)
Context: The full PRD evaluation matrix, model/application boundary review, accessibility audit, and
visual-fidelity pass against live Figma (see `docs/final-evaluation.md` for the complete writeup)
surfaced five real defects. All five were fixed and re-verified; none required a product-behavior
decision, so none needed to stop-and-ask.

1. **Race condition: a direct chip removal could be silently undone by a stale in-flight response**
(PRD's "user changes a constraint while CampOps is working" scenario). The Composer disables
composer input while `isWorking`, but direct chip removal and Widen Search are NOT gated by
`isWorking` — a user can remove a chip while a previous `submitMessage` call is still awaiting the
model. That response was interpreted against the intent as it stood BEFORE the direct change;
applying it unconditionally on resolve silently resurrected the just-removed requirement (confirmed
live: removed "RV site" mid-flight, the stale response restored it). Fixed with a monotonic
`intentGenerationRef`, bumped by every direct-manipulation intent mutation; `submitMessage` snapshots
it at request time and discards its own response (posting a plain, honest "your trip changed while I
was working on that" message instead of applying `setIntent`) if the generation moved on. Re-verified
live: the direct removal now survives, guestCount from the stale message is correctly NOT applied.
No component-test harness exists in this project (pure-lib smoke tests + ad hoc Playwright are the
established pattern), so this is verified by a repeatable live Playwright script rather than a
committed unit test — noted here so the coverage gap is transparent rather than silently absent.

2. **Real horizontal overflow bug in `ReservationReview`'s default (staged/incomplete) branch**: its
outer container still had the pre-responsive fixed `w-[560px]` class — the earlier mobile/responsive
slice's fix had only landed on the `isReserved` branch's identical-looking div, not this one (the two
branches' matching text apparently diverged before the fix was applied, so only one branch actually
matched and got replaced). Confirmed via live render at 390px, not just code inspection. Fixed to
match the already-corrected `isReserved` branch (`w-full max-w-[560px]`, responsive padding).

3. **Missing focus-visible state on the Composer's text input**: `focus:outline-none` with no
replacement — a real WCAG 2.4.7 gap, keyboard users got zero visual indication the composer had
focus. Fixed with `focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50` on the
composer's outer bar (the input itself keeps `outline-none`, but the whole bar now rings on focus).

4. **Focus trap intermittently failed in both dialogs (Authorize Booking and the mobile Trip Details
sheet)**: confirmed via a live Tab-cycling test (`getBoundingClientRect`/`document.activeElement`
checks, not a visual guess) that focus could escape from the modal Popup into background page
content (as far as `<body>` and a duplicate-labeled background button). Base UI's Dialog is modal by
default and normally traps focus itself; both of this app's dialogs are opened via an external state
change rather than a rendered `DialogTrigger`, which this project didn't have the tooling/time budget
to root-cause inside a third-party library with no network access to its docs/issue tracker. Fixed
with a defensive, self-contained Tab/Shift+Tab wrap added to the shared `DialogContent` (one fix,
both dialogs, since they share this component) rather than replacing the library's own modal
machinery. Re-verified: 12 consecutive Tab presses stay inside the dialog in both places.

5. **No shadcn Button variant actually reached the Handoff Spec's explicit "44px minimum height"
component contract** (Handoff Spec 2.9): the base-nova preset's own `default` size was 32px (`h-8`),
confirmed via a measured bounding box on live Accept/Reserve/Authorize buttons, not a visual guess.
Fixed by raising `size: "default"` to `h-11` (44px) and `size: "lg"` to `h-12` (keeping the scale
non-inverted). Left `size: "sm"` alone — the Composer's Send button is explicitly spec'd as "Primary,
small" (Handoff Spec 2.2), not an oversight — and left the Stop control alone (it's a plain `<button
size-11>`, not a `<Button>` instance, and was already correctly 44px).

**Two additional visual-fidelity gaps found and closed** (confirmed against live Figma screenshots of
the Recommendation and No Match desktop frames, not guessed): the Trip Panel header was missing its
status Badge ("Best match" on a full-match recommendation, confirmed via screenshot; "Needs
attention" on No Match, confirmed via screenshot; the no-candidate "Working"/"Waiting for you" states
reuse the same `tripStatusLabel` value the mobile status bar already used, for one shared source of
truth rather than two copies of the same wording) and the "Availability verified just now" indicator
(Handoff Spec 1.2 already reserved a `success` color token for exactly this, with the code comment
"'Availability verified' indicator only" — the token existed, the UI element that was supposed to use
it was never built). Both are purely presentational, derived from real state (`evaluation.kind`, and
the fact that every candidate in a result already passed `evaluateCampsites`' own `site.available`
check), and were confirmed present consistently across the two live Figma frames actually inspected —
not invented. Compromise/Alternative/Availability-Lost's exact badge copy was not independently
confirmed via Figma (effort-bounded); this slice reused the existing panel-title wording
("Closest match") for the badge in that state as the lowest-risk, self-consistent choice, flagged
here rather than asserted as confirmed-correct.

**Figma-vs-decision-history conflict identified and NOT changed**: the same live No Match screenshot
that confirmed the "Needs attention" badge also shows `Sept 12–14 ×` and `4 guests ×` rendered as
literal, removable hard-requirement chips — meaning Figma's own design treats dates AND guest count
as directly-removable chips in the plain Trip Panel list, on equal footing with "Pet-friendly". This
implementation does not do that: `guestCount` is a scalar field (with its own dedicated capacity
enforcement path, deliberately kept required per the standing "guestCount remains required"
resolution — explicitly listed in this phase's own instructions as a resolution to preserve, not
revert to a stale Figma state), and `checkIn`/`checkOut` are scalar fields with no chip representation
and no enforcement (see the "known deferred" note in `docs/final-evaluation.md`). Making either one a
removable chip would be a real product-behavior change (what does "removing" a guest count or a date
even mean — clearing it entirely? reverting to null and re-opening Missing Info?), not a visual
fidelity fix, so it was flagged here rather than implemented.

**Amended 2026-09-10** (Trip Requirement Projection + Party-Composition Inference, below): "no chip
representation" for `guestCount` was true at the time this was written but became a real, live bug —
a live report showed a No Match Attention Card correctly citing "Capacity for 6" while the Trip
Requirements panel showed nothing about capacity at all, because there was still no chip for it
anywhere in this file's list. That gap is now closed, in exactly the way this entry already anticipated
it should be if it ever were closed: `guestCount` (and `travelingWithPets`/`petCount`, the same
situation) now project as **non-removable** hard chips — real visibility into structured state, without
reopening the "what does removing a guest count even mean" question this entry correctly flagged as out
of scope for a chip-removal affordance. `checkIn`/`checkOut` remain deliberately un-projected, unchanged
— see the 2026-09-10 entry's item 8 for why dates specifically stay out of the chip section.
Verification for this phase overall: all 8 PRD evaluation scenarios exercised live (desktop, with
mobile spot-checks on the direct-manipulation ones); full existing regression/smoke suite (all 9
scripts) unaffected; `tsc --noEmit`, `eslint .`, `next build` all clean; zero console errors across
every live run, including the newly-added race-condition and focus-trap checks.

---

**User-reported visual defects vs. Figma: three real, fixed; one flagged as a known asset gap**
Date: 2026-09-01 (later same day)
Context: User visual comparison against live Figma flagged the header background, the Trip Panel's
background color, and the Send button's height.

1. **Trip Panel background** (real defect, fixed): Figma's panel is pure white (`card`/`#ffffff`),
distinct from the chat column's off-white page background (`background`/`#faf8f5`) — confirmed via
Figma screenshot. The implementation gave both columns the same inherited page background with no
distinction. Fixed by restructuring `page.tsx`'s padding: `<main>` and the two-column row no longer
carry shared padding; the chat column and Trip Panel each own their padding now, and the panel adds
`lg:bg-card` so the white surface reads clearly against the chat column, matching Figma. Mobile is
unaffected (`lg:` only) — mobile's single continuous scroll never had this white/off-white split in
Figma either.
   - Side effect caught and fixed: the panel's own new right-padding (needed for a visual gutter
     before the container edge) narrowed the Candidate Card's available width enough that its
     4-item fact grid (Capacity/Distance/Dates/Price) could crowd together with zero gap when it
     wrapped to two rows. Fixed by giving that fact grid an explicit `gap-x-4` (it previously relied
     entirely on `justify-between`, which collapses to zero gap under exactly this condition) —
     a small, permanent robustness fix, not merely a workaround for this one padding value.
2. **Send button height** (real defect, fixed): Composer's Send button used the Button component's
`sm` size. The Handoff Spec's own text calls it "Send button (Primary, small)", but the live Figma
render — source of truth when the two disagree — shows it filling nearly the full composer bar
height, matching the (now-corrected, see the button-height entry above) default 44px size, not the
~28px small one. Switched Composer's Send to the default size; corrected the component's own comment
to note the Handoff Spec text is superseded here by the live render.
3. **Header background** (confirmed real; NOW RESOLVED, 2026-09-01, later same day): the header's
base fill color (`#4C7A3A`, the `trees` token) was already byte-correct against the DS Style Guide —
the visible gap was Figma's decorative mountain/pine silhouette texture layered behind the header
content, never implemented. This session's Figma MCP access could fetch screenshots but not
`get_design_context`/asset exports (no live Figma desktop selection available), so the real vector
art couldn't be extracted at the time, and per the design-to-code skill's own rule ("never
hand-write or inline `<svg>`/`<path>` — you don't have the real vector data, so anything you draw is
wrong") no approximation was fabricated; it was flagged as a known, asset-access-limited gap instead.
**Resolved once the user supplied the real exported assets directly**: `Mountain
Silhouette-desktop.svg` (1440×64, native design width) and `Mountain Silhouette-mobile.svg` (390×56),
added verbatim (not recreated, recolored, or simplified — same paths, same baked-in 32% opacity,
same `#2F4F25` fill) to `public/assets/`. `Header` now layers the matching asset per breakpoint
(`lg:hidden`/`lg:block`, the project's existing breakpoint convention) as an `aria-hidden`,
`pointer-events-none` `<img>` between the solid `bg-trees` fill and the real header content (which
keeps its own `z-10`, unaffected) — `object-cover object-bottom` so the composition scales
uniformly (no non-uniform stretch/distortion) and anchors on the artwork's bottom edge, where its
solid mass sits, at viewport widths other than the assets' exact native ones. No CSS opacity was
added on top of the SVGs' own baked-in 32% (would have double-darkened/washed out the art).
Verified live at 390px, 1024px, and 1440px: correct asset per breakpoint, header heights unchanged
(56px/64px, confirmed via a real `getBoundingClientRect` measurement, not a visual guess), avatar
still clickable (the decorative layer never intercepts pointer events), zero console errors. Visual
comparison against the live Figma header screenshot now shows a close match at both breakpoints.
Verification: `tsc --noEmit`, `eslint .`, `next build` clean; full regression suite (all 9 scripts)
unaffected; live Playwright re-verification of the full PRD scenario set, the mobile chip-removal
flows, and a fresh Recommendation/No Match desktop screenshot comparison against the Figma reference
images — zero console errors throughout.

---

**Landing/background illustration: previously-missing gap RESOLVED — full-color and tinted share
one canonical asset**
Date: 2026-09-01 (later same day)
Context: The landing (Start) screen and every active-task screen's chat column had no illustration
at all — plain page background, a gap that predates this session (never implemented in any prior
slice). User supplied the real exported assets: `Camp Illustration — Full Color-desktop.svg`
(1440×960) and `-mobile.svg` (390×788), added verbatim to `public/assets/` — same paths, same
baked-in colors/gradient, nothing redrawn or recolored.

**One canonical asset, two treatments** — new `CampIllustration` component
(`src/components/campops/camp-illustration.tsx`), takes a `tinted` boolean:
- **Full color** (landing/Start screen): the asset alone, no overlay.
- **Tinted** (behind every active-task chat column): the identical asset plus one additional CSS
  layer — `bg-background` (the app's own off-white token, `#faf8f5`) at 82% opacity — stacked on top,
  not baked into a second copy of the artwork.

**How the tint value was determined without guessing**: live Figma's "Camp Illustration — Tinted"
node was exported and pixel-sampled (via a headless-browser canvas read, not eyeballed) against this
same canonical SVG's own known, exact fill colors. The ground shape's fill is `#6B4A2F` at full
opacity in the source; the tinted export sampled at the equivalent point as `rgb(230,223,217)`.
Solving `tinted = a·white + (1−a)·original` independently per channel gave `a ≈ 0.83, 0.82, 0.82`
for R/G/B respectively — tightly consistent across all three, which is exactly what a plain
translucent overlay (not a blend mode, not separately-recolored vector fills) produces; a blend mode
or per-shape recolor would not agree this closely per-channel from one flat blend model. That
consistency is the evidence this is "a simple translucent solid overlay" per the user's own
fallback instruction, not a guess. Used the app's existing `--background` token (`#faf8f5`) rather
than introducing a literal `white`, since at 82% opacity the two are visually indistinguishable and
reusing the existing token avoids a second hardcoded near-white value.

**Placement**: `CampIllustration` (untinted) sits behind the Start screen's content; `CampIllustration
tinted` sits behind the chat column specifically (not the Trip Panel, which is white per the earlier
background fix, and not the whole page) — matching Figma's own "Camp Illustration — Tinted" being
scoped to the Chat Column frame, not the full canvas. Both are `aria-hidden`, `pointer-events-none`,
absolutely positioned behind real content that keeps `relative z-10` (the same layering convention
established for the header's mountain silhouette) — never intercepts focus, click, or touch.

**Real defect found and fixed during verification — asset breakpoint**: initially wired the
mobile/desktop asset swap to this app's usual `lg` (1024px) layout breakpoint, matching the header
silhouette's convention. Live-checked at a "narrow/intermediate" 768px width (one of the four widths
this task explicitly asks to verify) and found the landing headline sitting entirely over solid brown
ground instead of sky — the portrait-oriented mobile asset (390×788, aspect ≈0.5), `object-cover`ed
into a much wider-aspect 768px-tall container, crops away nearly all of its sky band. Fixed by moving
the asset (not layout) breakpoint down to `md` (768px) — the desktop asset's wider native aspect
(1440×960 ≈1.5) tolerates that range far better, confirmed by re-screenshotting at 768px. The app's
actual two-column layout breakpoint (`lg`) is untouched; only which illustration asset loads changed.

**Real, minor, accepted trade-off — Start screen positioning**: the existing Start screen centered
its heading/subhead/composer vertically (`justify-center`), which — once the illustration made the
mountain/ground horizon actually visible — placed that text directly across the horizon line,
fighting the artwork for contrast (worst on the ground, dark brown). Live Figma's own Start screen
(both breakpoints, screenshotted directly) anchors this content in the sky band near the top, not
center — repositioned to `justify-start` with top padding, matching that intent, WITHOUT changing the
existing copy or center-text-alignment (both are separate, pre-existing divergences from Figma's
actual left-aligned copy/wording, out of scope for an illustration task — flagged below, not
silently changed). At 390px specifically, one line of the subhead still lightly touches the pale
mountain band (not the dark ground) — an acceptable residual trade-off given mobile's much shorter
sky proportion, not a hard legibility failure like the pre-fix state.
**Flagged, not changed** (separate, pre-existing divergence from live Figma, unrelated to the
illustration itself): the Start screen's actual headline/subhead copy ("Your next campsite, without
the search grind..." / left-aligned, top-anchored, composer pinned lower) differs from this app's
existing copy and center-aligned layout. This predates the illustration work and is a content/product
decision, not a visual-fidelity asset gap — not touched here.

Verified live at 390px, 600px, 768px, 1024px, and 1440px: correct asset per breakpoint at every
width, zero horizontal overflow at any of them (`scrollWidth − clientWidth`, measured, not assumed),
full-color renders correctly on the landing screen, tinted renders correctly and legibly behind an
active Recommendation's chat column on both desktop and mobile, real content stays clickable through
the tint (an "Accept" button interactability check, not just a visual check), and the tinted result
visually matches the "Working" screen's live Figma screenshot closely. `tsc --noEmit`, `eslint .`,
`next build` clean; full regression suite (all 9 scripts) and the mobile chip-removal Playwright
suite unaffected; zero console errors throughout.

---

**Deterministic Action Prerequisites — substantive architecture resolution**
Date: 2026-09-01 (later same day)
Context: GPT sometimes recognized a missing objectively-required prerequisite (an origin for a
self-referential distance constraint; concrete dates before booking) and asked about it, and
sometimes did not — a real product gap, since these are not cases of ordinary semantic ambiguity the
model is entitled to judge; they are structural facts the application already knows. Standing rule
added this slice: "objectively required action prerequisites are deterministic application rules,
not probabilistic model judgments."

**New module, `src/lib/prerequisites.ts`** — the single source of truth for this boundary:
- `PrerequisiteKind`: `"origin_location" | "check_in_date" | "check_out_date" | "guest_count" |
  "payment_method"` — a closed, named set, deliberately not a confidence score and not inferred from
  chat copy after the fact; every check reads only real `TripIntent`/`Reservation` fields.
- `checkSearchPrerequisites(intent)`: **action-sensitive**, not a global required-fields gate. An
  ordinary search ("show me quiet campsites") needs nothing extra. The only thing that can block a
  search is a self-referential distance/travel-time constraint with no `originZip` — detected via
  `isOriginRelativeDistanceLabel`, a plain keyword/pattern match (self-referential phrase — "me",
  "myself", "my home", "my house", "my place", "home" — combined with either an explicit distance/
  time unit — mile, km, minute, hour — OR a qualitative proximity word — close, near, nearby, within,
  far, farther, distance — since the PRD's own example "somewhere close to home" carries no unit at
  all). A distance phrase anchored to a NAMED place ("near downtown Denver") never matches — it
  doesn't need an origin, and correctly isn't flagged. A false negative here (an unusual phrasing this
  keyword approach misses) is a known POC-level limitation, not a silent "satisfied" claim — the
  evaluator's own fallback already marks anything it doesn't recognize as "unverifiable", never
  "satisfied" (see below), so a missed match only means a missed clarification opportunity, not a
  false positive.
- `checkBookingDatePrerequisites(intent)`: gates the Accept action itself (staging), independent of
  the pre-existing `computeMissingFields` (guest count / payment method) gate at
  `RESERVE_ATTEMPT`/`ready_for_authorization`. A reservation must never be staged from a candidate the
  user never attached concrete dates to.
- `questionFor(missing)`: deterministic, factual question text for each `PrerequisiteKind` (the exact
  required wording, "What ZIP code should I use as your starting point?", is defined here, not left
  to the model to phrase-and-maybe-ask).

**New `TripIntent` field: `originZip: string | null`** — model-extracted ONLY when the user
explicitly states their own ZIP ("my zip is 10001"); never inferred, never a device/browser location,
never a placeholder (system prompt updated accordingly). The model decides nothing about WHETHER an
origin is required — only the deterministic layer does that; the model's only job here is the
same kind of plain extraction it already does for `checkIn`/`checkOut`/`guestCount`.

**Two new event types**, `prerequisite_missing`/`prerequisite_resolved` (actor `"system"`) —
deliberately distinct from `clarification_requested`/`clarification_resolved` (actor `"agent"`), per
the standing architectural distinction: one is the model's own semantic judgment, the other is the
application refusing to proceed because a structured field is objectively absent. Both currently
render through the same "clarification"-styled Attention Card (per the instruction: "do not make the
UI expose this internal distinction to the user unless necessary... both should feel like the same
coherent CampOps conversation") — the distinction lives in the event data (verifiable in the Activity
Log's underlying `TaskEvent.type`), not in a second visual treatment.

**Integration in `page.tsx`'s `submitMessage`** — ordering, and why: (1) the existing stale-response
generation guard (unchanged, still fires first); (2) the "unsupported" guard (unchanged); (3)
`setIntent(interpretation.intent)`; (4) **new** — if a booking-dates request was pending, re-check
`checkBookingDatePrerequisites` against the fresh intent: if now satisfied, complete the SAME held
Accept action automatically (`finishAccept`, factored out of `handleAccept` for exactly this reuse)
and return — the user asked once, not twice; if still missing, re-ask and return; (5) **new** — run
`checkSearchPrerequisites`: if missing, show the deterministic question and return (never reaching
evaluation); if an origin request was pending and is now satisfied, emit the resolved event and fall
through; (6) only then the existing `needs_clarification`/`actionable` branches. Deterministic
prerequisites are checked unconditionally against real state — they are never skipped because the
model itself said "actionable" for a request that is still missing something the application knows
it needs.

Two new pieces of state, deliberately NOT reusing `pendingClarification` (a different concept, a
different actor, and a different resolution behavior each): `pendingOriginRequest` (resolving just
lets the normal evaluate-and-announce flow proceed) and `pendingBookingDatesRequest` (resolving must
finish the specific interrupted Accept). Both reset on "Start a new search."

**`handleAccept` rewritten**: checks `checkBookingDatePrerequisites(intent)` before staging anything.
If missing, no `stageReservation` call happens at all (the selected candidate/evaluation state is
untouched — nothing to preserve because nothing was disturbed), a deterministic question is shown,
and `pendingBookingDatesRequest` remembers to finish the SAME acceptance once dates arrive. The actual
staging logic was factored into `finishAccept(candidate, intent)` so both the normal Accept-click path
and the resumed-after-dates path go through the identical transition — not two copies of "how to
stage a reservation."

**`stageReservation` signature changed**: `checkIn`/`checkOut` are now REQUIRED (non-nullable)
parameters, not optional — this makes "a reservation was staged without concrete dates"
unrepresentable at the type level, not just guarded by a runtime `if`. All call sites (the app itself,
`smoke-test-events.ts`, `smoke-test-reservation.ts`) updated accordingly. `Reservation` gained
`checkIn`/`checkOut` fields (the user's actual stated dates, preserved verbatim) alongside the
existing `dates` display string, whose computation changed too: **`dates` is now built from
`checkIn`/`checkOut` (the user's own stated dates), not from `campsite.datesAvailable`** — "the
authorization surface must display those exact dates" means the dates the user actually asked for,
not a campsite default they never confirmed. `AuthorizeBookingDialog`'s own consent sentence had a
second copy of this bug (it read `campsite.datesAvailable` directly, bypassing `reservation.dates`
entirely) — found and fixed during this pass, not assumed away. `nights` (and therefore nightly-rate
pricing math) still uses the campsite record's own fixed night count — see the described limitation below.

**Distance/travel-time truth — explicit, honest limitation, not fabricated**: `evaluate.ts`'s
`checkConstraint` gained an explicit branch (not just a fallthrough) recognizing
`isOriginRelativeDistanceLabel` and marking it `"unverifiable"` — deliberately, on purpose, **with or
without an `originZip` present**. This POC has zero deterministic distance/drive-time-from-ZIP
calculation capability. Collecting a ZIP unblocks the search (satisfies the PREREQUISITE — "does an
origin exist to reason from at all") — it does not, and must not, manufacture a distance TRUTH the
application doesn't actually possess. A candidate can therefore never be `"full"` on a self-referential
distance requirement, and its "How this fits" chips never claim that dimension as preserved, with or
without a ZIP on file. This is the direct, literal implementation of "do not fabricate distance or
drive-time truth simply because an origin ZIP has been collected."

**Dates: the enforcement decision, made explicit** — narrowing the previously-documented "checkIn/
checkOut are stored but not deterministically enforced" gap (see `docs/final-evaluation.md`, updated
alongside this entry): dates required to CREATE a reservation are now enforced (this slice); dates
required to verify date-SPECIFIC availability against a particular campsite's calendar remain
unenforced — the dataset has no per-date availability model at all (every record carries one static
window), so there is nothing to check against, and this document does not claim otherwise.

**Regression coverage**: new `scripts/smoke-test-prerequisites.ts` — pattern-matcher precision
(positive and negative cases, including the unit-less "close to home" example and the
named-place-should-NOT-match "near downtown" case), all four tiers scanned, action-sensitivity
(ordinary search vs. distance-constrained search vs. booking), the "never satisfied" invariant
checked with AND without an origin present, `stageReservation`'s user-dates-not-campsite-dates
behavior, and the full minimum-booking-prerequisites chain (dates alone insufficient without guest
count). Live Playwright coverage (ad hoc scripts, this project's established pattern — no component
test harness exists) proved: a missing origin blocks search and shows the exact required question;
supplying a ZIP resumes evaluation with every other requirement byte-for-byte preserved; a missing-
dates Accept is blocked with the candidate/evaluation fully preserved; supplying dates auto-completes
the SAME accept without a second click, and the resulting Reservation Review shows the user's actual
stated dates; the existing stale-in-flight-response guard (from the earlier race-condition fix)
composes correctly with the new prerequisite flow with no additional code — proven by directly
removing a distance-constraint chip while a slow ZIP-supplying request was in flight, confirming the
stale response could not resurrect the just-removed requirement; an ordinary search is never blocked
by missing dates; and the Activity Log visibly distinguishes a deterministic prerequisite exchange
from an ordinary model-driven refinement in the same timeline, in plain factual language.

**Live-model calibration (real GPT-5.4-mini, not mocked)** against the required prompt set: "Find me
a campsite within an hour of my home" and "I want somewhere secluded less than 50 miles from me" both
correctly triggered the deterministic ZIP question regardless of the model's own phrasing. "Book that
campsite" (with no active candidate) was safely handled by the model's own legitimate
`needs_clarification` judgment ("Which campsite would you like me to book?") — a real ambiguity, not a
missing structured prerequisite, and correctly left to the model. "Reserve it for us" (also no active
candidate) was classified `unsupported` by the model, again a legitimate, safe judgment, distinct from
and not confused with the deterministic prerequisite path. "Find me something quiet" proceeded as an
ordinary, unblocked search. Zero console errors across every live call; the deterministic layer never
needed to intervene incorrectly, and never failed to intervene where it must.

---

**Deterministic Search-Date Prerequisites + Availability Truthfulness — correction to the previous
slice**
Date: 2026-09-01 (later same day)
Context: Live testing reproduced a real gap the previous Deterministic Action Prerequisites slice
left open: "a campsite for 4 adults, two kids, and two dogs within an hour from my home" correctly
triggered the origin (ZIP) question, but once the ZIP was supplied, CampOps immediately produced a
specific campsite recommendation — with a `DATES` fact and an "Availability verified just now"
indicator — without ever having asked for check-in/check-out. The previous slice's date gate only
protected the BOOKING path (`checkBookingDatePrerequisites`, checked at Accept); it never protected
the SEARCH path itself, which is where an availability-backed recommendation — and its implicit
availability claim — is actually produced. **Refined rule: dates are a deterministic prerequisite
for an availability-backed campsite SEARCH, not merely for reservation staging.**

**Action classification, not a global gate**: per the standing rule "requirements are action-
specific," a blanket "all searches require dates" would have broken legitimate exploratory browsing
("What are some quiet campgrounds?"). New `isExploratoryDiscoveryMessage(message)` in
`src/lib/prerequisites.ts` — a plain, deterministic text heuristic on the user's own raw message
(the same kind of documented, POC-scale pattern match as `isOriginRelativeDistanceLabel`, not an LLM
judgment): a message must clearly read as a general/plural browsing question ("what"/"which"/"show
me" + "campgrounds"/"campsites"/"places"/"spots"/"areas", and not a specific-request verb like "find
me"/"book"/"reserve"/"I need") to be classified exploratory. **Deliberately errs toward the safer,
stricter default** — anything that doesn't clearly read as browsing is treated as availability-backed
(dates required). The reproduced bug's own phrasing ("a campsite for 4 adults... within an hour from
my home") contains no explicit "find me" verb at all and is correctly classified availability-backed
by this default-safe design, not by a lucky keyword match.

**`checkSearchPrerequisites` signature changed** to be action-sensitive:
`checkSearchPrerequisites(intent, { availabilityBacked: boolean })`. When `availabilityBacked` is
true (the default for anything not clearly exploratory), concrete `checkIn`/`checkOut` are now
required in addition to the existing origin check — same function, same event types
(`prerequisite_missing`/`prerequisite_resolved`), same "GPT does not decide" boundary, just aware of
which action is being attempted. When false (exploratory), only the origin check applies — a
self-referential distance phrase is unverifiable regardless of whether the user is browsing or
committing to a booking.

**Multiple missing prerequisites, correctly composed**: the reproduced flow needs BOTH an origin
and dates. `checkSearchPrerequisites` now returns every currently-missing prerequisite together in
one call (`["origin_location", "check_in_date", "check_out_date"]` all at once, origin ordered
first) — satisfying "the deterministic prerequisite layer should be able to identify all currently
missing prerequisites... even if the UI chooses to request them one at a time." `page.tsx` still asks
sequentially (ZIP first, matching the reproduced flow's own expected behavior), but the STATE it
carries between turns is now the full missing list (`pendingSearchMissing: PrerequisiteKind[] |
null`, replacing the previous slice's plain `pendingOriginRequest` boolean), not a single flag — so
re-checking after the ZIP arrives correctly reveals that dates are STILL missing rather than treating
partial completion as full completion. This is the direct fix for "completing one prerequisite does
not make an action actionable while other deterministic prerequisites remain unresolved," and is
regression-tested explicitly (`scripts/smoke-test-prerequisites.ts`: "supplying ONLY originZip does
not mark the action actionable while dates remain missing").
`pendingSearchAvailabilityBacked` remembers which action classification triggered the block, so a
later turn that merely supplies the missing ZIP or dates isn't reclassified by its own (unrelated,
often very short) phrasing — a bare "78660" would trivially fail `isExploratoryDiscoveryMessage`'s
own heuristic in either direction, so the ORIGINAL message's classification is what must persist
across the resumed sequence, not each intermediate answer's.

**Context-aware question wording**: `questionFor(missing, context: "search" | "booking")` — the same
`check_in_date`/`check_out_date` prerequisite now has two honest phrasings depending on which action
is asking ("What dates are you planning to camp?" for a search, "What check-in and check-out dates
should I use for this reservation?" for booking) — one underlying structured requirement, two
contextually-appropriate deterministic questions, matching the task's own example wording exactly.

**Never substitute inventory/default dates for user intent — audited and fixed**: grepped every use
of `datesAvailable`/campsite-fixture dates across the codebase. Found exactly one leak:
`CandidateCard`'s `datesValue` prop in `page.tsx` was reading `activeCandidate.campsite.datesAvailable`
(the campsite record's fixed inventory window) instead of the user's actual `intent.checkIn`/
`checkOut` — meaning the reproduced screenshot's "Sept 12–14" wasn't a coincidence, it was the
campsite's own static fixture data being displayed as though the user had requested it, every single
time (every dataset record happens to share the exact same static window, which is exactly why this
went unnoticed for two whole slices). Fixed: `datesValue` now reads the user's own `checkIn`/
`checkOut`, falling back to an honest `"Not yet set"` — never a specific fabricated date — for the
one legitimate case where a Candidate Card can exist without them (an exploratory recommendation).
`stageReservation`/`Reservation.dates`/the Authorize dialog's consent sentence were already fixed to
use user-stated dates in the prior slice and needed no further change; this audit re-confirmed they
still do (regression-tested).

**"Availability verified just now" — audited, found honest-but-risky, FLAGGED per the standing rule
rather than silently changed**: this POC has zero date-specific availability verification — the
indicator has only ever reflected `campsite.available` (a static per-record boolean, checked in
`evaluateCampsites`, completely independent of `checkIn`/`checkOut`). The copy itself doesn't
literally claim "for your dates" — it's not a fabricated capability — but a user could reasonably
read "verified" as date-specific, which this app cannot substantiate, and live Figma specifies this
exact wording for the Recommendation screen. Per the standing rule "if a Figma element makes a claim
the system cannot substantiate, flag the conflict rather than fabricating the underlying capability"
and "if resolving the copy requires a product/design decision... stop and flag that exact conflict":
**this copy was NOT changed.** Flagged in-code (the render site in `page.tsx`) and here, and called
out explicitly to the user in this slice's report, as a live, open question — not silently resolved
either direction. Now correctly gated so it can only ever appear once a search has actually reached
an availability-backed, fully-prerequisite-satisfied recommendation (never mid-clarification, and
never for an exploratory result with unresolved dates) — the truthfulness of what it checks is
unchanged from before, but it can no longer appear prematurely, which was the concrete, reproduced
harm.

**Regression coverage**: `scripts/smoke-test-prerequisites.ts` extended with
`isExploratoryDiscoveryMessage` (positive/negative cases including the exact reproduced phrasing),
the exact reproduced scenario's `checkSearchPrerequisites` call (all three prerequisites reported
together), the partial-resolution non-actionable invariant, the full ZIP+dates resolution preserving
guest count/pet requirement/the distance constraint itself, and a fully-specified request never
triggering unnecessary clarification. Live Playwright (both desktop and mobile) re-ran the EXACT
reproduced sequence end to end: origin asked → ZIP supplied → dates asked (not a recommendation) →
dates supplied → search resumes automatically with the original pet/distance/capacity requirements
intact → the recommendation's DATES fact shows the user's own supplied dates, not "Sept 12–14" by
coincidence of matching campsite fixture data → zero console errors. The existing stale-in-flight-
response guard (unchanged, no new code needed) was re-verified to compose correctly with the new
multi-step search-prerequisite flow, matching the prior slice's finding that this mechanism
generalizes across prerequisite types without modification.

---

**Slice: Search Truth + Multi-Step Clarification + Booking Completeness + Dataset Expansion**
Date: 2026-09-02
Context: Live demo testing surfaced seven distinct, reproduced failures, all tracing back to one
broader gap the user summarized as: "the model understood the sentence" was being treated as
equivalent to "we have enough information/capability to act on it" — for geographic constraints,
for multi-step clarification branches, and for recommendation-worthiness itself. Fixed as one
coordinated corrective slice; each finding below is one reproduced failure and its fix.

**Finding 1 — travel-time constraints were permanently unverifiable, never actually evaluated.**
`checkConstraint` correctly required an origin ZIP before proceeding, but had no geographic
capability at all behind it — every "within an hour"/"within 2 hours" hard requirement was
hard-coded to `"unverifiable"`, and per the constraint-integrity rule (unverifiable never counts
as satisfied), every candidate silently failed regardless of the stated radius or the ZIP given.
Choice: gave the POC a real, deterministic, documented geographic capability rather than relaxing
the constraint. New `src/lib/geo.ts`: a bundled, LOCAL ZIP-prefix (first 3 digits, not a full
5-digit database) centroid lookup for Texas regions; a standard haversine great-circle distance;
and an explicit, documented demo approximation — `ROAD_DISTANCE_FACTOR = 1.3` and
`AVERAGE_ROAD_SPEED_MPH = 50` — converting straight-line distance to an estimated road distance and
travel time. `parseDistanceBudget` deterministically parses the stated radius (hours, minutes, or
miles) out of the requirement's own text. No LLM call is used anywhere in this path. `checkConstraint`
now genuinely returns `"satisfied"`/`"unsatisfied"` for a distance constraint once both the ZIP and
the budget resolve — it falls back to `"unverifiable"` (never a guessed `"satisfied"`) only when the
ZIP falls outside the bundled table's coverage or the budget text can't be parsed at all.
Why: "Do not solve this by relaxing the constraint" was explicit in the request, and unverifiable
must never equal satisfied — the only way to make the constraint genuinely evaluable is to give the
application real (if approximated) geographic truth, not to loosen what "satisfied" means.
Verified: `scripts/smoke-test-geo.ts` — a 1-hour Austin-ZIP search yields real qualifying
candidates; the identical search at 2 hours yields a strictly larger set (radius materially
matters); a genuinely distant campground (Guadalupe Mountains, ~460 mi) fails both radii; the
constraint resolves to satisfied/unsatisfied (never stays unverifiable) once ZIP+budget resolve; no
origin ZIP still leaves it unverifiable. Live Playwright reproduced the exact complaint end to end
(ZIP asked → dates asked → real 1-hour recommendation; a fresh 2-hour run also recommends).

**Finding 2 — the dataset was too small/sparse to support real geographic and attribute variation.**
Choice: expanded `src/lib/campsites.ts` from 10 to 25 records. The original 10 were ENRICHED in
place (real Texas address/city/state/zip/region/latitude/longitude, plus a new `familyFriendly`
boolean) rather than replaced — every existing behavioral attribute (capacity, petFriendly,
nearWater, seclusion, price, amenities, availability) is byte-identical to before, so every
regression scenario tuned to the original 10 keeps its original meaning (a few needed their
hardRequirements combination adjusted once the larger dataset made the old combination newly
satisfiable — see "Regression coverage" below). 15 new records were added spanning all seven named
regions (Austin/Central Texas, Hill Country, San Antonio, Houston/Gulf, Dallas/North Texas, East
Texas, West Texas), each with a distinct combination of pet-friendly/family-friendly/seclusion/site
type/water proximity so pet-friendly, family-friendly, and quiet/secluded queries genuinely filter
and rank, and so travel-time from Austin genuinely varies (~0.17h to ~11.3h across the set).
`distanceMiles` (the pre-existing, origin-independent "how far is this" display fact used in
explanation/recovery copy) was left completely unchanged — it answers a different question than the
new `latitude`/`longitude` pair does, and touching it risked silently changing unrelated,
already-verified explanation copy for no reason.
Why: "the goal is not volume for its own sake... enough to support realistic query variation" — a
tiny, England-named 10-record dataset couldn't demonstrate real region/travel/family variety no
matter how the evaluator logic improved.
Verified: `scripts/smoke-test-dataset.ts` (updated for the larger dataset), plus every existing
smoke-test-{no-match,recovery}.ts scenario re-verified to still isolate the intended candidate(s)
against the full 25-record set (three fixtures needed a stricter/different combination to remain
uniquely isolating — documented inline in each script). Live Playwright: pet-friendly, quiet+
secluded+family-friendly, and a named-region ("East Texas") query each produced a real, structurally
explained recommendation; a structurally impossible combination ("RV site" + "Cabin" — no record can
ever be both) still correctly produced No Match.

**Finding 3 — a quick-reply branch selection was treated as though it supplied a concrete value.**
Reproduced: CampOps asks "What area or destination should I search in?"; the user picks the quick
reply "A specific park/region" (itself names no park or region); CampOps never followed up asking
which one.
Choice: `IntentInterpretationSchema.clarification.quickReplies` changed from `string[]` to
`{label, followUpQuestion: string | null}[]` — the model marks each option as either a COMPLETE
answer (`followUpQuestion: null`) or a BRANCH that still needs a concrete value
(`followUpQuestion` = the exact next question). The application enforces this deterministically,
not just via prompting: `page.tsx`'s `handleQuickReply` passes the clicked option's
`followUpQuestion` through to `submitMessage`, which — if present — ALWAYS forces that exact
follow-up question, before even looking at the model's new status/intent for that turn. This is not
optional/best-effort: the user's message THAT TURN was only the branch label text, which cannot
possibly have supplied a concrete value, so the override is unconditional by construction, never a
"trust the model most of the time" heuristic.
Why: "quick-reply branch selection is not equivalent to supplying the concrete value that branch
requires" is now a standing rule, not just a bug fix for park/region specifically — the mechanism is
generic (any clarification's quick replies can mark themselves as branches), not special-cased.
Verified: `scripts/smoke-test-intent-status.ts`'s live model call already returns the new
`{label, followUpQuestion}` shape unprompted-further (confirms the system-prompt change alone gets
the model most of the way there); live Playwright reproduced the exact complaint — "A specific park
or region" reliably produces "Which park or region?" as a forced follow-up regardless of what the
model itself returns that turn.

**Finding 4 (a real regression found WHILE fixing Finding 3) — exploratory classification did not
persist across a multi-turn clarification chain.** Once Finding 3's fix correctly asked "Which park
or region?" and the user answered "Hill Country", CampOps incorrectly asked for dates next — because
`isExploratoryDiscoveryMessage` was being re-evaluated fresh against each turn's own short reply
text ("A specific park or region", then "Hill Country"), neither of which look exploratory by the
heuristic in isolation, even though the ORIGINAL triggering message ("What are some quiet
campgrounds...") clearly was. Fixed with a new `currentRequestAvailabilityBacked` state,
persisted across an entire pending-clarification chain (not just the `pendingSearchMissing` leg) and
only re-classified fresh when a genuinely new top-level message arrives (i.e., no clarification is
currently pending). Verified live: the full branch → follow-up → region-name chain now correctly
skips the date ask throughout, per Finding 3's own Playwright reproduction above.

**Finding 5 — a new `destinationRegion` field was needed; TripIntent had no way to represent it.**
`originZip` only ever meant "the user's own starting point for a distance constraint" — there was no
structured field for "the place/region/park the user wants to camp IN", which findings 3 and 6 both
need and which the No-Match/dataset expansion also wanted for genuine region filtering. Added
`destinationRegion: string | null` to `TripIntentSchema`, extracted by the model only when the user
actually names a destination area, and a synthetic hard check in `evaluateCampsites` (same pattern as
the existing synthetic `Capacity for N` check — not literal `hardRequirements` text, so not
independently chip-removable) matching it against each campsite's `region`/`city`/`campgroundName`.

**Finding 6 — "Find me somewhere good for camping" jumped straight to an arbitrary recommendation
once dates alone were known.** This is the user's own stated "biggest change": semantic
understanding (the model's `status`) and deterministic prerequisites (origin/dates) were being
treated as jointly sufficient for a recommendation, with no check for whether there was enough
structured intent to make that recommendation non-arbitrary. Added a genuinely separate THIRD gate —
new `src/lib/recommendation-readiness.ts`, `checkRecommendationReadiness` — deliberately not a
confidence score: a plain, deterministic check of whether AT LEAST ONE of {a destination signal
(`destinationRegion` or `originZip`), a party size (`guestCount`), or any stated
requirement/constraint/preference/priority} is present. Any one suffices (the PRD's own dimensions
are interchangeable, not cumulative); dates alone satisfy none of them.
**Amendment (2026-09-07 — see that slice's own entry below for the full correction): this
"any one of three is interchangeable" rule is correct for an AVAILABILITY-BACKED search, but was
later found to also apply — incorrectly — to EXPLORATORY discovery, letting "quiet"/"family-friendly"
alone (with no destination at all) satisfy readiness for a browsing question and produce a
geographically arbitrary recommendation. `checkRecommendationReadiness` now takes an
`availabilityBacked` flag and requires a destination specifically for the exploratory path; the
"any one of three" rule described here remains exactly as documented, unchanged, for the
availability-backed path only.** Wired into `page.tsx`
between the `needs_clarification` branch and the final `evaluateCampsites` call — reachable only once
semantic status is actionable AND every deterministic prerequisite is met, and never conflated with
either (see the `EventType`s `recommendation_readiness_insufficient`/`_satisfied`, actor `"system"`,
mirroring the `prerequisite_missing`/`_resolved` pattern but a genuinely distinct concept).
Verified: `scripts/smoke-test-recommendation-readiness.ts` (dates alone insufficient; an empty intent
insufficient; each of the three dimensions sufficient alone; no single dimension is required if
another is present; the question text never exposes a confidence score). Live Playwright: "Find me
somewhere good for camping" + dates alone continues clarification (does NOT recommend); supplying a
party size afterward reaches a real, structurally-explained recommendation.

**Finding 7 — natural date phrases ("Labor Day weekend", "this weekend") sometimes failed to
resolve, risking a repeated identical-question loop.** The model could identify the phrase but had
no consistent, deterministic way to turn it into concrete dates. Added `src/lib/dates.ts`:
`normalizeDatePhrase` resolves Labor Day weekend (1st Monday of September) and Memorial Day weekend
(last Monday of May) via real calendar-rule math for the relevant year (rolling forward to next year
if this year's occurrence has already passed), "this weekend"/"next weekend" relative to the current
date, and an explicit weekday-range phrase ("Friday through Sunday"). Wired into `page.tsx` right
after the model's response, before any prerequisite check, via `normalizeIntentDates` — a genuinely
unrecognized phrase is left exactly as-is (still "missing" a concrete date, never guessed). Loop
protection: a new `dateAskAttempts` counter (reset the moment dates resolve) increments whenever the
user's reply LOOKS like a date attempt (`looksLikeDateAttempt` — month names, weekday names,
"weekend", named holidays, or digit-slash patterns) but still leaves `checkIn`/`checkOut` unresolved;
`questionFor`'s new `dateAttempt` parameter switches to a more specific follow-up
("I couldn't quite pin down exact dates from that...") once that count reaches 2, rather than
repeating the identical generic question indefinitely.
Verified: `scripts/smoke-test-dates.ts` (Labor Day/Memorial Day resolve to the correct
calendar-derived Saturday-through-Monday; "this weekend"/"next weekend" resolve to distinct dates;
"Friday through Sunday" resolves to a concrete pair; a genuinely ambiguous phrase like "sometime in
the fall" is correctly left unresolved; normalization is deterministic; `looksLikeDateAttempt`
correctly distinguishes a date-shaped reply from an unrelated one). Live Playwright: "Labor Day
weekend" resolved to a concrete date range on the first turn, with the generic date question never
repeated.

**Finding 8 — the availability-loss recovery message rendered as ordinary chat, not the approved
Attention Card.** `handleSimulateAvailabilityLoss` was pushing two plain `kind: "chat"` messages via
`setMessages` directly, bypassing `pushAttention` entirely — a real, live regression from how
ordinary chat and Attention Card messages diverged as separate code paths grew over several slices.
Fixed by routing the loss+adapted-pick text through `pushAttention` with a new `AttentionType`,
`"availability_loss"` — reusing the SAME shared `AttentionCard` component every other attention state
uses (no new one-off component), with a distinct eyebrow ("Availability changed"). The loss statement
and the adapted pick are still built by the same `buildRecoveryMessages` (unchanged) and shown
together in one card, in the same recovery interaction, per the approved design; the adapted
candidate itself continues to render in the Trip Panel exactly as any other active recommendation
does. `renderAttentionActions` returns `null` for this type — it's pure narration, not a decision
point (Accept/Request Alternative/etc. already exist for the adapted candidate).
Verified live: the shared `AttentionCard`'s eyebrow ("AVAILABILITY CHANGED") renders for the
Simulate trigger; the card states the loss and presents the adapted pick together; zero console
errors.

**Finding 9 — Reservation Review had no visible Payment Method row in its resting (staged) state.**
The `SummaryRow` for Payment Method, and the "Add payment method" button, were both gated on
`isIncomplete && missingPayment` — meaning a fresh, never-yet-attempted reservation showed nothing
at all about payment, and the user had to attempt-and-fail a Reserve, or open the Authorize Booking
modal, just to discover whether a payment method was on file. Fixed: `missingPayment` is now derived
directly from `!reservation.paymentMethodLabel` (not from `missingFields`/`isIncomplete`), the
`SummaryRow` renders unconditionally showing either the real label or `"Not added"`, and the "Add
payment method" button shows whenever payment is missing, regardless of attempt status.
Why: the user must never need to proceed into consequence (attempt Reserve, or open the
authorization modal) just to learn a deterministic fact the application already has.
Verified live: Reservation Review shows "Payment method — Not added" (destructive-soft styling)
immediately on first landing on the screen; clicking "Add payment method" updates that SAME row to
"Visa •••• 4471" without ever needing to attempt Reserve or open the modal; the Authorize Booking
dialog still separately restates the same payment method as part of final consequence review (both
surfaces intentionally continue to show it, for their different purposes). The existing
validation-on-attempt behavior (`computeMissingFields`/`RESERVE_ATTEMPT` → `"incomplete"`) is
unchanged — a reservation still cannot reach `"ready_for_authorization"` while payment is missing;
this fix only changes what's VISIBLE, not the guarded state machine.

**Reservation Review completeness audit (Finding 9's companion, item 10 of the request)**: compared
against everything needed to make the final booking decision — site, dates, guest count, nightly
rate/service fee/total, payment method (now fixed), the "Staged · Not yet booked" badge, and the
required "No payment has been made and nothing has been booked yet" line are all present and visible
before Reserve is ever clicked. No gaps found beyond Finding 9 itself; no new fields were added
beyond what's already product-required.

**Architecture note — three distinct gates, never collapsed** (item 11 of the request, formalizing
what findings 1, 6, and the pre-existing prerequisites module already separately established):

1. **Semantic understanding** — `IntentInterpretation.status` (actionable/needs_clarification/
   unsupported) — a model judgment, produced by `/api/intent`.
2. **Deterministic prerequisites** — `checkSearchPrerequisites`/`checkBookingDatePrerequisites`
   (`src/lib/prerequisites.ts`) — "does the application have the objectively required facts?"
   (origin ZIP for a distance constraint; dates for an availability-backed search/booking).
3. **Recommendation readiness** — `checkRecommendationReadiness`
   (`src/lib/recommendation-readiness.ts`, new this slice) — "even once 1 and 2 are satisfied, is
   there enough structured intent that a specific ranked recommendation is explainable, not
   effectively random?"

Each has its own `EventType`s (`clarification_requested`/`_resolved`; `prerequisite_missing`/
`_resolved`; `recommendation_readiness_insufficient`/`_satisfied`) and its own state in `page.tsx` —
none is inferred from another, and none is allowed to silently substitute for another.

**Stale statement correction**: `evaluate.ts`'s prior doc comment stating a distance/travel-time
constraint "has no real distance/drive-time-from-ZIP calculation capability at all" and stays
"unverifiable" (never satisfied) "on purpose" is no longer true and has been rewritten in place to
describe the real (approximated, documented) geographic evaluation now implemented — it still stays
unverifiable when the ZIP or budget can't be resolved, but that's now a coverage boundary, not a
permanent limitation.

**Full verification for this slice**: all pre-existing regression scripts (10 files) pass unchanged
in behavior (three fixtures' hardRequirements combinations were adjusted for the larger dataset, per
Finding 2); three new regression scripts added
(`smoke-test-geo.ts`, `smoke-test-recommendation-readiness.ts`, `smoke-test-dates.ts`); `tsc --noEmit`
clean; `eslint` clean; `next build` clean; live Playwright reproduced all seven originally-reported
complaints end to end against the real GPT-5.4-mini endpoint (desktop and a mobile sanity pass),
zero console errors throughout.

---

**Finding: Deterministic Pet Requirement Enforcement + Pet Language Normalization**
Date: 2026-09-03
Context: Live testing surfaced a fresh instance of the exact failure class the guestCount finding
(2026-08-30, above) already named: any query mentioning a dog produced
`"Couldn't verify: Dog-friendly"` even though every campsite record's `petFriendly` field was fully
known. Root cause: `evaluate.ts`'s `checkConstraint` only recognized the substring `"pet"` in a
free-text requirement label — `"Dog-friendly"` contains neither `"pet"` nor a matching amenity
string, so it fell through every branch to the generic catch-all `"unverifiable"`. This was a pure
keyword-coverage gap, not a data gap (the dataset audit below confirms every record already had
complete, deterministic pet-policy data).
Choice: rather than just widening the keyword match (which would still leave pet eligibility resting
on free-text label matching — exactly the pattern the request called out as architecturally wrong),
gave pets the same treatment as `guestCount`: a new, non-optional `TripIntent.travelingWithPets:
boolean` field. The model normalizes every pet/dog phrasing variant ("I'm bringing my dog", "two
dogs", "dog-friendly" stated as a firm need, "dogs allowed", "pets allowed", "I need somewhere that
allows dogs") into this ONE boolean, and is explicitly instructed NOT to also duplicate it as
`hardRequirements` text — mirroring the existing, already-verified guestCount convention. A new
synthetic hard check (`petCheck`, same pattern as `capacityCheck`/`destinationCheck`) in
`evaluateCampsites` enforces it directly against `site.petFriendly` via a new shared `petStatus`
helper — never by keyword-matching. Hard-vs-preference semantics are preserved: "I'm bringing my
dog" sets `travelingWithPets: true` (a non-pet-friendly site is genuinely unusable); a softer,
non-committal "pet-friendly would be nice" — without stating a pet is actually coming — still lands
as a `"Pet-friendly"` entry in `preferences`/`flexibleConstraints`, unchanged from before.
`checkConstraint`'s free-text branch was kept as a defense-in-depth path for that legitimate soft
case (and broadened to recognize `"dog"` as well as `"pet"`, so even a stray free-text label resolves
against the same structured field via `petStatus` rather than falling through to unverifiable).
Why: this is the exact lesson the standing rules already generalized from `guestCount` —
"any user requirement that maps to structured campsite data must be enforced directly against that
data, never through free-text keyword matching." A keyword-widening fix would have resolved this one
reported phrasing gap while leaving the same failure class open for the next unanticipated phrasing.
Dataset audit (item 5): confirmed all 25 records have an explicit, non-optional `petFriendly` boolean
(enforced at the type level — `Campsite.petFriendly: boolean`, not optional, so this is unrepresentable
as "missing" for a real record) with genuine variation (a mix of `true`/`false` across the set, already
established in the 2026-09-02 dataset expansion). `petStatus` still defensively distinguishes a
hypothetically-missing value (`"unverifiable"`) from a confirmed `false` (`"unsatisfied"`) — a naive
`site.petFriendly ? satisfied : unsatisfied` would have silently misreported "genuinely unknown" as
"confirmed not pet-friendly," the same class of bug the constraint-integrity rule exists to prevent.
Candidate Card explanation (item 6): required no code change — `preserved`/`compromises` are already
built generically from whatever's in `hardChecks` (the same mechanism that already surfaces
`"Capacity for N"`), so the new `petCheck`'s `"Pet-friendly"` label flows through automatically,
confirmed by regression test and live screenshot (a satisfied dog+RV+capacity search shows
`Pet-friendly` as a genuine preserved chip, not a re-derived guess).
Verified: new `scripts/smoke-test-pet-requirement.ts` — full dataset audit (every record has an
explicit boolean, meaningful pet-friendly/not variation); `travelingWithPets` enforced directly
against `petFriendly` (a known pet-friendly site qualifies, a known non-pet-friendly site is excluded
outright); the pet check never reports `"unverifiable"` against known dataset data; `petStatus`'s
defensive true/false/missing distinction exercised directly; a query with no pet mention adds no pet
check at all; the free-text fallback (`"Dog-friendly"`, `"Pet-friendly"`, `"Dogs allowed"`, `"Pets
allowed"`) all resolve via the structured field; a satisfied pet requirement appears in `preserved`,
never as a compromise; `travelingWithPets` survives an unrelated multi-turn field update. All
pre-existing regression scripts re-verified passing — `smoke-test-intent-status.ts`'s live-model
assertions were updated from checking `hardRequirements` text to checking the new
`travelingWithPets` field, since routing pet intent through `hardRequirements` text is now the
architecturally-wrong path the model is explicitly instructed away from. Live Playwright reproduced
the exact reported prompts against the real GPT-5.4-mini endpoint — "Find me a campsite for 4 people
and my dog," "I need a dog-friendly campsite," "We have two dogs...," "Find somewhere that allows
pets..." — confirming `travelingWithPets` is captured correctly, pet-friendly records satisfy it,
non-pet-friendly records are excluded (an 8-person+dog+RV search correctly picked the pet-friendly
Galveston Island Campground over the otherwise-equally-qualified but non-pet-friendly Eagle Point
Campground), and `"Couldn't verify: Dog-friendly"` never appears; zero console errors.
Standing rule (reinforced, not new — generalizes the guestCount finding): **any user requirement
that maps to a structured campsite attribute must be enforced directly against that structured
field. Free-text requirement labels are presentation/interpretation artifacts, not enforcement
triggers.**

---

**Slice: Dataset Depth + Derived Trip Truth + Searchable Attribute Normalization**
Date: 2026-09-04
Context: a full review of the 25-record dataset found the record count itself sufficient, but several
dimensions were "too shallow, too uniform, or modeled as inventory facts when they should be derived
from user trip state" — the same architectural lesson as `guestCount`/pet-friendliness, but now
spanning dates, distance, pricing, and several searchable attributes at once. Fixed as one coordinated
slice; the dataset's ~25 records were RE-AUTHORED (not expanded further), keeping every original id.

**1. `datesAvailable` removed — replaced by real, derived availability.** Every record used to carry
the identical `datesAvailable: "Sept 12 – 14"` string, which read as genuine availability for
whatever dates a user happened to ask about — actively harmful once CampOps accepts arbitrary trip
dates. Removed entirely. New `Campsite.unavailableRanges: {start, end}[]` (ISO `YYYY-MM-DD`,
half-open) — a handful of records now have genuine date-specific unavailable windows (e.g.
`lakeview-11` is unavailable exactly over the 2026 Labor Day weekend). `evaluateCampsites` adds a new
synthetic hard check, `"Available for your dates"`, checking `unavailableRanges` overlap against the
ACTUAL requested `checkIn`/`checkOut` (via `computeDateRange`, see below) — added only when a
concrete, resolvable date range exists at all (an exploratory search with no dates yet correctly adds
no check, never a fabricated availability claim). This also RESOLVES the "Availability verified just
now" indicator's long-flagged truthfulness gap (previously the indicator only reflected the static
`available` flag, never depended on dates) — the in-code flag comment (`page.tsx`) was updated to
reflect this, not left stale; the one remaining honest nuance is that an exploratory recommendation
(no dates yet) still shows the same indicator with nothing date-specific to check.

**2. `nights` removed from `Campsite` — derived from the trip's actual dates everywhere.** New
`src/lib/dates.ts` additions: `resolveToISODate` (parses "Sept 12", "9/12", or an ISO string to a
concrete `YYYY-MM-DD`, rolling to next year if this year's occurrence already passed — the same rule
`normalizeDatePhrase` already used for holidays) and `computeDateRange(checkIn, checkOut)` (resolves
both ends and derives real nights; returns null — never a guessed night count — if either date can't
be resolved or the result isn't a positive span). `stageReservation` (`src/lib/reservation.ts`) now
calls this directly and THROWS if it returns null, rather than silently defaulting — by construction
this should never happen, because `checkBookingDatePrerequisites`/`checkSearchPrerequisites`
(`src/lib/prerequisites.ts`) were extended to require not just non-null `checkIn`/`checkOut` strings
but a REAL, resolvable, positive-night range before either search or booking may proceed. A **real
timezone bug** was found and fixed while building this: `new Date("YYYY-MM-DD")` parses as UTC
midnight, and reading it back with local-time getters (`getDate()`/`getMonth()`) silently shifts the
date by a day in any timezone behind UTC — `describeCancellationPolicy`'s cutoff-date arithmetic was
computing dates one day too early until this was caught by its own regression test. Fixed by parsing
ISO components explicitly into local-time `Date` constructor args, never round-tripping through
`new Date(isoString)`. `computeDateRange`/`rangesOverlap` were unaffected (nights is a pure
timestamp-difference, and range overlap compares ISO strings directly, never converting through
local-time getters).

**3. `distanceMiles` removed — the ONE distance value is now `src/lib/geo.ts`'s origin-derived
number.** The prior field was described as "origin-independent" but coexisted confusingly with the
real origin-based travel-time calculation from the Search Truth slice — two competing distance
concepts. Removed entirely. New `Candidate.distanceFromOriginMiles: number | null`, computed once by
`evaluateCampsites` via a new `distanceFromOriginMiles()` helper in `geo.ts`, and threaded through
`buildExplanation` (the "X mi away" clause is now omitted entirely, never fabricated as 0, when no
origin ZIP is known), `recovery.ts`'s `describeChange` (now compares the two candidates' real
`distanceFromOriginMiles` values, omitting the clause if either is null), and `page.tsx`'s Candidate
Card `distanceValue` prop (shows "Not available" — never a fabricated number — when null).

**4. Pet policy deepened: `petFriendly: boolean` -> `petPolicy: {allowed, maxPets}`.** `TripIntent`
gained `petCount: number | null` alongside the existing `travelingWithPets` (singular "my dog" -> 1,
"two dogs" -> 2, a genuinely unspecified plural -> null, never guessed). `evaluateCampsites`'
`petCheck` now enforces `Math.max(petCount ?? 1, 1)` against `site.petPolicy.maxPets` — "two dogs"
correctly fails a site whose policy allows only 1. `petStatus` (used both by the synthetic check and
the free-text defense-in-depth fallback) takes the required count as a parameter and still
distinguishes allowed/disallowed/genuinely-unknown three ways, never conflating "confirmed not
allowed" with "unknown". Dataset audit: all 25 records have an explicit `petPolicy.allowed`; roughly
18 allow pets and 7 don't; 6 records cap at exactly 1 pet (enough to make "two dogs" a genuine filter,
not a trivial pass), one allows 3.

**5. Family suitability deepened: `familyFriendly: boolean` -> `familyFeatures: FamilyFeature[]`.**
New controlled vocabulary (`src/lib/family-features.ts`): `easy_trails`, `restrooms_nearby`,
`nature_center`, `swimming_area`, `playground`. The "family-friendly" check in `evaluate.ts` is now
`site.familyFeatures.length > 0` (grounded in real features, never an opaque flag), and
`buildExplanation` appends a genuinely feature-grounded clause (`describeFamilyFeatures`) — e.g. "It's
family-friendly — a nature center, nearby restrooms, and easy trails." — built ONLY from the site's
actual features, never invented by the model. A real DATA-CONSISTENCY bug was found and fixed while
verifying this live: six records claimed the `restrooms_nearby` family feature but didn't actually
list the `restroom` amenity code, so a literal "I need bathrooms" request would honestly (but
misleadingly) fail a site whose own family-feature claim said it had exactly that. Fixed by adding
the `restroom` amenity to every record that claims `restrooms_nearby` (`pine-ridge-9`, `lakeview-11`,
`mossy-creek-4`, `pedernales-falls-6`, `huntsville-4`, `galveston-island-1`).

**6. Quiet split from secluded: new `noiseLevel`, distinct from `seclusion`.** `seclusion` (privacy
from other campers) is unchanged; `noiseLevel: "high" | "medium" | "low"` (ambient sound) is new.
`evaluate.ts`'s "quiet" branch now checks `noiseLevel === "low"`; "secluded"/"private" still checks
`seclusion !== "low"` — previously both phrases collapsed onto the same `seclusion` check, so a
loud-but-private site (e.g. near a popular falls) could wrongly satisfy "quiet". The dataset now
includes all four combinations the request asked for (high seclusion + low noise, high seclusion +
medium noise, low seclusion + low noise, low seclusion + high noise) as real, intentional tradeoffs.

**7. Water access deepened: `nearWater: boolean` -> `waterAccess: {nearby, directAccess, type}`.**
`type` is one of `creek | river | lake | beach | none`. `evaluate.ts`'s water-matching logic
distinguishes "near water" (any nearby type), "waterfront"/"directly on..." (direct access, any
type), and a named type ("lakeside", "near a river", "beach access") requiring that SPECIFIC type. **A
real bug was found and fixed during live verification**: a combined phrase like "waterfront on a
lake" was checked via whichever branch matched FIRST — "waterfront" matched first and returned based
on `directAccess` alone, never cross-checking that the type word ("lake") was also present, so a
directly-accessible RIVER site (`pedernales-falls-6`) incorrectly satisfied a lake-specific waterfront
request. Rewritten so a type keyword and a directness keyword occurring TOGETHER require BOTH
conditions; a bare type mention with no directness word ("lakeside") requires only proximity to that
type, not direct access. Regression-covered in `scripts/smoke-test-water-access.ts`, including the
exact reproduced combination.

**8. Amenities normalized to a canonical, finite vocabulary.** New `src/lib/amenities.ts`:
`AMENITY_CODES` (a closed union — `restroom`, `vault_toilet`, `shower`, `potable_water`,
`electric_hookup`, `dump_station`, `boat_launch`, `fire_pit`, `wifi`, `hiking_trails`,
`picnic_table`, `fishing_pier`, `sauna`, `stargazing`, `tubing_access`), `AMENITY_LABELS` (friendly
display text — `page.tsx` maps codes through this before rendering, never showing a raw code to the
user), and `normalizeAmenityLabel` (aliases: "bathroom"/"toilet(s)" -> `restroom`, "showers" ->
`shower`, "drinking water" -> `potable_water`, "hookups" -> `electric_hookup`, etc.).
`checkConstraint`'s amenity fallback now normalizes a free-text label to a code BEFORE comparing
against `site.amenities` — a genuine deterministic satisfied/unsatisfied result, not a raw substring
guess (the prior version would never match "bathroom" against "Restrooms" at all). `site.amenities`
itself is now always an array of canonical codes, never a display string.

**9. Cancellation policy made relative.** `Campsite.cancellationPolicy` is now
`{freeUntilDaysBeforeCheckIn: number, latePenaltyNights: number}`, never a literal date string. New
`describeCancellationPolicy` (`src/lib/reservation.ts`) generates the user-facing sentence from this
structured policy and the reservation's ACTUAL check-in date at staging time — "Free cancellation
until Oct 3" now means 7 (or whatever the policy states) days before THIS trip's real check-in, not a
value baked in at authoring time that stayed correct for exactly one trip date.

**10. Budget support added — nightly vs. total-stay, distinguished.** New `TripIntent.budget:
{maxTotal, maxPerNight} | null`. A nightly-rate budget is always checkable (`site.pricePerNight`
directly); a total-stay budget ("keep the whole stay under $300") requires a resolvable date range to
compute a real total (`pricePerNight * nights + serviceFee`) and stays honestly `"unverifiable"` —
never computed against a guessed night count — when dates aren't yet known. Confirmed live and in
`scripts/smoke-test-pricing.ts` that the SAME site can pass a $150 total budget for a 1-night stay and
fail the identical budget for a 4-night stay — nights, not just nightly rate, genuinely matter.

**11. Destination matching extended with deterministic filler-stripping.** New
`src/lib/geography.ts`: `normalizeDestinationRegion` strips "near "/"around "/"in "/"close to "/
trailing " area" so "near Austin" -> "Austin", "San Antonio area" -> "San Antonio" — applied once in
`page.tsx` right after the model's response (same architectural pattern as date-phrase
normalization), so destination matching doesn't depend on the model having stripped the filler
itself. "Hill Country"/"East Texas" (no filler) pass through unchanged.

**12. Capacity rebalanced.** The dataset was concentrated around capacity 4; re-authored to spread
across 2 (2 records), 4 (8), 5 (3), 6 (7), 8 (3), and 10–12 (2 — `cedar-hill-6` at 10,
`north-ridge-1`, closed anyway, at 12). Verified live and in regression that a 6-person pet-friendly
search, a 6-person pet-friendly-near-water search, and a 6-person family-friendly-quiet search each
have multiple genuinely viable candidates, not an accidental collapse to No Match.

**13. Structured-field enforcement guard formalized (item 17).** `evaluate.ts` now exports
`ENFORCED_CAMPSITE_FIELDS`, a named list of every `Campsite` field with a documented enforcement path
(including `cancellationPolicy`, enforced in `reservation.ts` at a different architectural boundary
than search-time). New `scripts/smoke-test-field-enforcement.ts` fails the moment any `Campsite`
field is neither in that list nor an explicit `DESCRIPTIVE_ONLY_FIELDS` allowlist (id, siteName,
description, address, zip, state) — the exact mechanical guard the standing rules asked for, so the
guestCount/pet-friendliness failure class can't silently recur for a new field.

**Verification for this slice**: nine new regression scripts (`smoke-test-amenities.ts`,
`smoke-test-availability-ranges.ts`, `smoke-test-pricing.ts`, `smoke-test-cancellation-policy.ts`,
`smoke-test-geography.ts`, `smoke-test-water-access.ts`, `smoke-test-explanation-grounding.ts`,
`smoke-test-field-enforcement.ts`, plus `smoke-test-pet-requirement.ts` extended with pet-count
scenarios); every pre-existing regression script re-verified against the re-authored dataset (a
handful of fixtures needed a different isolating combination once ranking/capacity/water-type changed
— documented inline in each script, same pattern as the prior two slices); `tsc --noEmit`/`eslint`/
`next build` all clean; live Playwright reproduced all fourteen requested prompts against the real
GPT-5.4-mini endpoint (desktop and mobile, including a full Accept → Reservation Review flow
confirming derived nights/total/cancellation-cutoff copy) — zero console errors, and critically, zero
occurrences of "Couldn't verify" across the entire pass (the original symptom this whole line of
corrective slices exists to eliminate).

---

**Slice: Active-Recommendation Follow-Up Classification + Intent Refinement**
Date: 2026-09-05
Context: live testing against an active recommendation found "is it near water?" producing generic
recommendation copy again — worse, root-cause investigation found the model was silently folding the
QUESTION into TripIntent as a new soft preference (invisible to the user, since a satisfied soft
preference had no visible chip anywhere), which then re-ranked candidates using an intent the user
never actually asked to change. A follow-up EXPLICIT refinement ("I'd like it to be near water")
then appeared to do nothing, because the requirement had already been silently added by the prior
question. This was a genuinely worse bug than the reported symptom suggested: the app was mutating
state on a pure factual question, the opposite of "a mention of an attribute does not automatically
mutate TripIntent."
Choice: classified every turn against an active recommendation into two distinct conversational acts,
by MEANING, never punctuation:
- **Candidate factual question** ("is it near water?", "does it allow dogs?", "does it have showers?",
  "how far away is it?", "is it quiet?") — new `IntentInterpretationSchema.candidateQuestion:
  {topic, amenityHint} | null`. The model only classifies WHICH topic (a closed enum: pet, water,
  family, noise, seclusion, distance, amenity, capacity, price, availability, site_type, other) — it
  never phrases the factual answer itself. New `src/lib/candidate-facts.ts`'s
  `answerCandidateQuestion` looks up the real answer from the CURRENTLY ACTIVE candidate's structured
  data (e.g. `waterAccess` -> "Yes. It has direct lake access." / "No. This site isn't near water.";
  `petPolicy` -> "Yes, pets are allowed — up to 2."). `page.tsx` enforces, independent of what the
  model returns for `intent`, that this turn is a COMPLETE no-op for TripIntent: no merge, no
  prerequisite check, no re-evaluation, no chat boilerplate — just the factual answer and a new
  `candidate_question_answered` event (existing purely to make "TripIntent was not touched" a visible,
  auditable fact in the Activity Log).
- **Intent refinement** ("I'd like it to be near water", "make sure dogs are allowed", "I need
  showers") — the ordinary existing path (`candidateQuestion` null): intent merges, prerequisites
  re-check, and `evaluateCampsites` reruns exactly as it always has for any actionable turn. The
  underlying merge/evaluation pipeline was not broken — the bug was entirely that a pure question was
  being misrouted into this same path.
- The model needs to know a candidate exists at all to recognize a pronoun-referenced question ("it",
  "this site") — a new `hasActiveCandidate: boolean` in the `/api/intent` request body, told to the
  model as plain context ("A candidate campsite IS currently being shown...").
Refinement copy correction (item 5): generic first-recommendation copy ("Got it. Based on what you've
told me...") was also confirmed as the wrong fallback for a refinement of an EXISTING recommendation,
not just for questions. New `src/lib/refinement-acknowledgment.ts`: `diffAddedRequirements` (a pure
structural diff of which requirement/preference/priority labels — or `travelingWithPets` becoming
true — are newly present) and `buildRefinementAcknowledgment`, which names what was actually added and
distinguishes "the same candidate still comes out on top" from "a different candidate is now the
stronger fit" — extracted into a standalone module (not left as page.tsx-local functions) specifically
so this logic is independently regression-testable. `page.tsx` snapshots whether a recommendation
already existed and which candidate was active BEFORE applying this turn's response, and only uses
the refinement framing when one did — the very first recommendation for a trip still gets the ordinary
first-time summary.
"Satisfied, shown as preserved" correction (item 3): a refinement can land as a SOFT preference/
flexible constraint (existing hard-vs-soft judgment, unchanged), but `evaluateCampsites`'s `preserved`
list previously only included satisfied HARD checks — a satisfied soft match had zero visible
acknowledgment anywhere, which is how the original bug went unnoticed as long as it did. `preserved`
now includes satisfied soft checks too; `compromises` deliberately stays hard-only (an unsatisfied/
unverifiable soft check never blocks or downgrades a match, so showing it as a "compromise" would
misrepresent why a candidate is what it is).
Verified: new `scripts/smoke-test-candidate-followup.ts` — factual answers for water (creek vs. direct
lake access distinguished), pets (count-aware), amenities (normalized), distance (honest gap with no
origin), an "other" topic declining gracefully; a failing new requirement changing the recommendation;
an already-satisfied new requirement remaining the top pick AND appearing in `preserved`;
`diffAddedRequirements`/`buildRefinementAcknowledgment` exercised directly; existing constraints
proven to survive a refinement. All pre-existing regression scripts re-verified passing (the
`preserved`-broadening change required no fixture changes). Live Playwright reproduced the EXACT
reported sequence (desktop and mobile) plus the dogs/showers analogues — "is it near water?" now
answers directly with zero TripIntent mutation, and "I'd like it to be near water" now visibly adds
the requirement, reruns evaluation, and either keeps the same candidate (framed as "still comes out on
top — it already satisfies that") or promotes a new one (framed as "is now the stronger fit"); zero
console errors throughout.
**Amendment (2026-09-06 — see that slice's own entry below for the full correction): the paragraph
below, as originally written, was materially inaccurate and is corrected here rather than left to
stand alongside a contradicting later entry.** One live run during verification showed the model
failing to classify a refinement turn as adding anything. That was dismissed at the time as "a single
non-deterministic model response, not a code defect" — re-running the identical sequence once more
succeeded, which was taken as sufficient confirmation. It was not: this classification depended
entirely on a single live model judgment call with no deterministic backstop, and a subsequent live
manual test reproduced the SAME class of failure again, user-facing and repeatable enough to be
reported as a regression. The distinction this slice failed to draw was between "the helper functions
that decide what to do once a turn is classified are correct" (true, and still true — verified by
`scripts/smoke-test-candidate-followup.ts`, unaffected by this amendment) and "the classification
itself is reliably reached in the live product" (false — it was a coin flip on the model, not
something this slice's regression suite could have caught, since that suite never exercised the live
model at all). The 2026-09-06 slice below adds the deterministic backstop this entry should have
included from the start.

---

**Slice: Live Active-Candidate Context Wiring + Water Intent Enforcement**
Date: 2026-09-06
Context: a live manual test disproved the 2026-09-05 slice's fix — the regression suite passed while
the actual product still repeated generic recommendation copy for "is it near water?"/"but is it near
water?", didn't visibly add the water preference for "i'd prefer it to be near water", and asked
"Which campsite or area are you asking about?" for "does it have showers?" despite a single visible
active recommendation. Per the standing rule "when a regression test passes while the real interaction
fails, improve the test boundary rather than assuming the live behavior is anomalous," this was
investigated from the actual live wiring outward, not by re-trusting the prior helper-level tests.

**Diagnosis (item 1 — instrumented, not inferred):** intercepted the real `/api/intent` request/
response payloads for the exact reported sequence. Findings, straight from the wire:
- `hasActiveCandidate` WAS correctly `true` on every turn after the first recommendation existed, in
  every run. **Item 1's hypothesis (missing/absent active-candidate wiring) is disproven by direct
  evidence.**
- The initial request's `"near the water"` WAS correctly extracted into `TripIntent.preferences`
  (`["Pet-friendly", "Near water"]`) in every run, and Cedar Hill's real `waterAccess` (`nearby: true,
  type: "lake"`) DID satisfy it — confirmed both via the API response and via the rendered Candidate
  Card's "How this fits" chips, which showed "near water" correctly. **Items 5/6/12's hypothesis (the
  water requirement silently disappearing, or an unearned "Best match") is also disproven by direct
  evidence** — this data path was already working correctly (from the 2026-09-04 Dataset Depth
  correction's structured `waterAccess` model).
- What was NOT reliable: the MODEL's own `candidateQuestion` classification for the exact same
  message, run to run. Across repeated live calls, "is it near water?" and "does it have showers?"
  sometimes correctly returned a `candidateQuestion`, and sometimes returned `null` (falling through
  to ordinary handling — for "does it have showers?" specifically, the model sometimes chose
  `needs_clarification` and asked which campsite, exactly the reported failure). This is the real root
  cause: a live, unverifiable-in-advance model judgment call with no deterministic backstop, discussed
  in the amendment to the 2026-09-05 entry above.

**Item 2 (canonical source of truth) — verified, not changed:** `page.tsx` already had exactly one
`activeCandidate` declaration, and both `showCandidateCard` (the Candidate Card's render gate) and
`hasActiveCandidateAtSubmit` (the `/api/intent` request field) are direct boolean derivations of that
same value — there was never a second, independently-tracked "is there a candidate" flag to drift out
of sync. No code change was needed for this item; a new static-source guard
(`scripts/smoke-test-active-candidate-wiring.ts`) now protects the invariant mechanically instead of
relying on it being re-verified by inspection every time.

**Fix (items 3, 4, 8, 9) — a deterministic classification backstop, not a live-model reliability
hope.** New `detectCandidateQuestion` (`src/lib/candidate-facts.ts`), the same architectural pattern
already used for `isOriginRelativeDistanceLabel`/`isExploratoryDiscoveryMessage`
(`src/lib/prerequisites.ts`): a plain, repeatable text-pattern match that reaches the same answer for
the same text every time.
- A refinement verb (want/need/prefer/like/make sure/require/must have/would like/rather/switch to)
  ALWAYS forces the "refinement" path, regardless of sentence shape or what the model classified —
  most refinements are plain statements, not questions, so this check runs before any question-shape
  check.
- A question-shaped message (starts with is/does/are/has/how/what/can/could/do, or ends in "?")
  referencing "it"/"this one"/"this site"/"this campsite"/"this campground"/"the current
  campsite/site/campground" ALWAYS forces the "question" path with a deterministically detected topic
  (water/pet/family/noise/seclusion/distance/capacity/price/availability/site_type/amenity via
  `normalizeAmenityLabel`), regardless of what the model classified.
- Anything outside these confident patterns returns "unclear" and falls back to the model's own
  `candidateQuestion` judgment, preserving flexibility for phrasings this pattern doesn't cover.
`page.tsx` now computes `resolvedCandidateQuestion` by combining this deterministic detector with the
model's classification — the detector wins whenever it has an opinion, the model's own field is used
only when the detector abstains. This directly satisfies item 8: the generic
"Got it. Based on what you've told me..." copy is only reachable via the genuine final "actionable"
evaluation branch — every other path (candidate question, needs_clarification, unsupported, missing
prerequisite, insufficient readiness, forced follow-up) returns before reaching it, and the
`candidateQuestion` branch itself now runs BEFORE that branch is ever reachable, structurally, not by
convention.

**Item 10 (integration-level regression):** this project doesn't carry a browser-test framework as a
committed dependency (Playwright is used only via `npx` in ad hoc, uncommitted scratch scripts for
live verification, per established convention) — adding one was judged out of scope for a focused bug
fix. The practical equivalent implemented instead: (a) thorough deterministic unit coverage of
`detectCandidateQuestion` itself (`scripts/smoke-test-candidate-question-detection.ts`), which is what
actually eliminates the reliability gap, and (b) the static wiring guard for item 2's invariant
(`scripts/smoke-test-active-candidate-wiring.ts`). Live Playwright with real network interception
remains the authoritative end-to-end check and was re-run multiple times (see verification below) —
this is a real trade-off, recorded honestly rather than claimed as full integration coverage it isn't.

Verified: two new regression scripts (17 total new assertions) covering every item-11 phrasing plus
refinement-verb overrides and deliberate "unclear" deferrals; all pre-existing regression scripts
re-verified passing; `tsc`/`eslint`/`next build` clean. Live Playwright reproduced the EXACT reported
sequence FOUR times (three desktop runs + one mobile run, not once) — in every run: "is it near
water?" and "but is it near water?" both answered directly and factually with zero repeated
boilerplate; "i'd prefer it to be near water" acknowledged without re-adding an already-present
preference; "does it have showers?", "does it allow two dogs?", "is it quiet?", and "is it secluded?"
all answered directly from Cedar Hill's real structured data with no "which campsite?" clarification
in any run; zero console errors in any run. This slice is not reported complete on the strength of a
single successful run — the repeated-run verification is the point.

---

**Slice: Exploratory Discovery Gate + Family-Friendly Structured Enforcement**
Date: 2026-09-07
Context: a live regression against exploratory discovery — "What are some quiet campgrounds that are
good for families?" jumping straight to a specific, geographically arbitrary recommendation (Medina
Lake) with no area/destination clarification at all. This is a genuine regression of behavior the
2026-09-02 Search Truth slice documented as working (see the amendment added to that entry above) —
not new territory.

**Diagnosis (traced, not inferred):** instrumented the live `/api/intent` request/response for the
exact message. The model correctly extracted `preferences: ["quiet", "family-friendly"]` and returned
`status: "actionable"` — semantically, nothing was wrong. The break was in the recommendation-readiness
gate: `checkRecommendationReadiness`'s rule ("any ONE of destination/party-size/trip-character
suffices") treated the two stated preferences as sufficient signal on their own, so no destination was
ever required — even though the request names no place at all. This rule is the CORRECT one for an
availability-backed search (that's exactly what the 2026-09-02 slice built it to fix — "Find me
somewhere good for camping" + dates alone), but exploratory discovery has a different, stricter
requirement: a destination specifically, not just any signal, because a geographically unscoped "here's
A quiet, family-friendly site" isn't a meaningfully narrowed answer to a browsing question. The two
modes were being governed by the SAME leniency rule when they need different ones — exactly the class
of bug the standing rule "exploratory discovery and availability-backed search are distinct
interaction modes" exists to prevent.

**Fix (items 1, 2, 3, 7):** `checkRecommendationReadiness` (`src/lib/recommendation-readiness.ts`) now
takes an `availabilityBacked` flag — the SAME classification `checkSearchPrerequisites` already
computes in `page.tsx` (`isExploratoryDiscoveryMessage`, persisted across a clarification chain via
`currentRequestAvailabilityBacked`), never independently re-derived. When `false` (exploratory) and no
destination signal (`destinationRegion` or `originZip`) exists, the gate is insufficient and asks
`"What area or destination should I search in for campgrounds?"` — a genuinely deterministic question
this time, generated by the application, not hoped for from the model — with a deterministic quick
reply, `{label: "A specific park/region", followUpQuestion: "Which park or region?"}`, so the
established multi-step branch mechanism (Search Truth correction, 2026-09-02) fires reliably every
time a user picks it, never dependent on the model choosing to offer that option itself. When
`availabilityBacked` is `true`, the original "any one of three" rule is completely unchanged.

**Family-friendly and quiet were already correctly structured (items 4, 6) — verified, not changed.**
Live instrumented testing confirmed "family-friendly" was already landing in `TripIntent` and being
checked against real `familyFeatures` (Dataset Depth correction, 2026-09-04), and "quiet" was already
mapped to `noiseLevel`, distinct from `seclusion` — both pre-existing and correct. The Candidate Card
DID show "family-friendly" (with grounded evidence, e.g. "It's family-friendly — easy trails and
nearby restrooms") whenever the winning candidate actually satisfied it. This item's diagnosis
disproves any hypothesis that family-friendly enforcement itself had regressed.

**A second, related gap found DURING live verification of the fix above (items 5, 6, 10): an
unsatisfied SOFT preference was completely invisible.** Once the destination gate correctly routed the
user to "Hill Country," the winning candidate (Pedernales Falls — family-friendly, but `noiseLevel:
"medium"`, not quiet) showed "family-friendly" as preserved but said NOTHING about "quiet" at all — no
compromise chip, no acknowledgment it was ever considered, even though it was genuinely checked and
genuinely not satisfied. This is exactly the class of "summary claims a criterion, state doesn't show
it" divergence item 10 warns about, except here the criterion WAS in structured state — it just wasn't
visible once unsatisfied, because `compromises` (Active-Recommendation Follow-Up correction,
2026-09-05) only ever included confirmed-failing HARD checks, on the reasoning that a soft miss never
blocks or downgrades a match. That reasoning is still correct for RANKING; it was wrong for VISIBILITY.
Fixed: `evaluateCampsites`'s `compromises` now also includes CONFIRMED-unsatisfied soft checks, under a
new, deliberately distinct `UNMET_PREFERENCE_PREFIX` ("Didn't fully match: ") — never
`UNSATISFIED_PREFIX`, which `no-match.ts`'s `summarizeNoMatch`/`widenSearch` specifically scan for and
must continue to reflect ONLY confirmed hard failures (a dedicated regression test locks this
separation in). An unverifiable soft check is deliberately NOT surfaced this way — most preferences are
free text with no recognized mapping at all, and showing every one as a "compromise" would be noise.

**Item 10 (summary-vs-state divergence), addressed at its root rather than patched at the UI layer:**
the specific divergence reported (goalStatement said "family-friendly," Candidate Card showed nothing)
was a symptom of the destination-gate bug above, not a separate goalStatement-generation defect — once
the gate correctly withheld a premature recommendation, and once satisfied soft preferences already show
as preserved (2026-09-05) and unsatisfied ones now show as an acknowledged compromise (this slice), the
specific reported divergence cannot recur for these two fields. A general goalStatement-vs-structured-
state auditor (re-deriving and cross-checking the model's own free-text summary against every possible
requirement) was judged out of scope for this focused correction — recorded here as a real, narrower
boundary rather than claimed as a comprehensive guard it isn't.

Verified: new `scripts/smoke-test-exploratory-gate.ts` (the exact reproduced preferences-alone case
insufficient for exploratory, ready for availability-backed, ready once destination is added;
family-friendly enforced against real features; quiet enforced against noiseLevel, not seclusion, with
an explicit secluded-but-not-quiet counter-example; a site satisfying both shows both as preserved; a
site satisfying only one shows the other as an acknowledged, non-blocking miss; the new prefix never
contaminates no-match's confirmed-hard-failure scanning); `scripts/smoke-test-recommendation-readiness.ts`
extended with the exploratory-mode rule (destination required regardless of other preferences,
deterministic branch quick reply always offered, origin ZIP also counts as a geographic anchor). All
pre-existing regression scripts re-verified passing. `tsc`/`eslint`/`next build` clean. Live Playwright
reproduced the exact sequence THREE times (twice desktop, once mobile) — in every run: no immediate
recommendation, a destination clarification (via the deterministic gate or, in some runs, the model's
own still-functioning semantic judgment — both are correct outcomes), the branch correctly resolving to
"Which park or region?", "Hill Country" correctly completing the chain, the final result reflecting
BOTH quiet and family-friendly (one as preserved, the other as an acknowledged miss in the one run where
the winning site didn't satisfy both), never requesting dates, zero console errors in any run.

---

**Slice: Public Demo Rate Limiting**
Date: 2026-09-08
Context: CampOps is a public, unauthenticated design POC on Vercel Hobby. `/api/intent` is the one
expensive route (calls OpenAI GPT-5.4-mini) — with no auth and no accounts, nothing previously stopped
one IP or bot from hammering it and burning API credits. This slice adds the minimum needed to close
that gap, deliberately not a generic rate-limiting framework, not auth, not per-user quotas.

**Architecture:** new `src/lib/rate-limit.ts` — small, server-only, three responsibilities per the
brief: build the Upstash `Ratelimit` instance once at module load (10 requests/minute/IP, sliding
window), derive a stable per-client key from the request (`resolveClientKey`), and run the check
(`checkRateLimit`). Wired into `src/app/api/intent/route.ts` as the FIRST thing the route does —
before body parsing, before the `OPENAI_API_KEY` check, before the OpenAI client is ever constructed —
so an over-limit request never reaches any of that.
- **Identity**: `resolveClientKey` reads the first address in `x-forwarded-for` (the standard
  Vercel/proxy convention for the original client; later entries are intermediate hops), falling back
  to a shared `"unknown"` bucket — never a crash — when the header is absent. Deliberately reads only
  `Headers`, never anything from the request body, per the standing rule that identity must never
  depend on trusting model/user-supplied input.
- **Local development**: if either `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` is unset, the
  module logs one clear warning (guarded so it never repeats) and `checkRateLimit` always reports
  `allowed: true` — no fake/dummy Redis credentials, no crash, the POC stays trivially runnable with
  just `OPENAI_API_KEY` set, exactly as before this slice.
- **Fail-open on infrastructure failure, fail-closed on genuine abuse** — the one deliberate asymmetry
  the brief called for: if Upstash is configured but throws (a transient outage), `checkRateLimit`
  logs the error server-side and reports `allowed: true` — a demo POC must never go fully dark because
  a dependency blipped. A real over-limit result (Upstash reachable, limit genuinely exceeded) is the
  ONLY case that returns `allowed: false`, and the route honors that with a real 429.
- **Response shape**: a denied request gets `HTTP 429` with the exact compact body
  `{"error": "Too many requests. Please wait a moment and try again."}` plus `X-RateLimit-*` headers
  from Upstash's own result — no internal details, no stack traces, nothing that could leak
  `UPSTASH_REDIS_REST_TOKEN` or any other secret.
- **Client (`page.tsx`)**: `submitMessage` now checks `res.status === 429` before the existing generic
  `!res.ok` throw, pushing one concise agent chat message ("You've sent a lot of requests in a short
  time. Try again in a moment.") and returning — no reset of `messages`/`intent`/`evaluation`, no new
  full-screen error state, the exact same non-disruptive early-return pattern already used for every
  other "this turn didn't produce a new recommendation" case in this file.

**Testability without over-engineering:** `checkRateLimit` takes an optional `limiterOverride`
parameter — the minimal dependency-injection seam needed to unit-test "under limit," "over limit," and
"Upstash throws" with a fake `{limit: async () => ...}` object, without a mocking library and without
real Upstash credentials. Production call sites never pass it; the real module-level singleton (or
`null`, if unconfigured) is used exactly as before.

**What is and is not integration-tested (recorded explicitly, per the standing instruction):**
`resolveClientKey` is tested against real `Headers` objects — full real coverage. The "not configured"
path is tested against the REAL module singleton in this environment, where Upstash env vars are
genuinely unset — real integration coverage of that specific path. The "under limit"/"over
limit"/"Upstash throws" paths are tested via the dependency-injection seam — this proves
`checkRateLimit`'s OWN interpretation logic is correct, but does NOT prove Upstash's actual
sliding-window algorithm, network behavior, or real credentials work correctly against a live Redis
instance. **That has not been verified and cannot be claimed verified from this environment** — this
sandbox has no real Upstash project or Vercel deployment. It must be verified manually against the
deployed Vercel URL once real `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` values are configured
there (e.g. by sending 11+ requests within a minute from one client and confirming the 11th returns
429), which is explicitly called out to the user as a follow-up rather than silently assumed.

Verified in this environment: new `scripts/smoke-test-rate-limit.ts` (22 assertions: key resolution,
the real not-configured path, the injected under/over-limit/outage paths, response-shape hygiene, and
static source guards proving the route's before-OpenAI ordering, the 429 response shape, and the
client's non-disruptive 429 handling); all pre-existing regression scripts re-verified passing; a live
browser smoke test confirmed the app functions completely normally end-to-end with no Upstash
configuration present (the expected local-development state); `tsc --noEmit`, `eslint`, and
`next build` all clean, including the expected "rate limiting is disabled" warning appearing exactly
once per build worker process (not per request) during `next build`'s static generation.

---

**Slice: Persistent Composer Focus**
Date: 2026-09-09
Context: the composer is the primary conversational interaction surface, but focus was silently
dropped on every submission — after Send or Enter, the user had to click back into the input before
they could type their next turn. This slice restores continuity without turning the composer into an
unconditional global focus magnet.

**Root cause**: the composer's `<input>` is `disabled={isWorking || disabled}` (unchanged in this
slice, per its own explicit constraint — see below). A genuinely `disabled` HTML element cannot hold
focus at all, so the moment a submission flips `isWorking` to `true`, focus is unconditionally lost —
not "not restored," actually destroyed. That single fact drove the whole design: restoration can only
ever happen after `isWorking` flips back to `false` and the input becomes focusable again, never at
the moment of submission itself.

**Design — "pending focus, cancelable by any real interaction"** (`src/app/page.tsx`,
`src/components/campops/composer.tsx`):
- `Composer` is now `forwardRef<HTMLInputElement, …>`, forwarding to the real `<input>` DOM node. The
  same ref object (`composerInputRef`) is passed to both places `Composer` is rendered (the landing
  screen and the active-conversation view — mutually exclusive), so React reattaches it automatically
  across that unmount/mount transition. This is the "actual input ref, not `document.querySelector`"
  requirement — there is exactly one `useRef<HTMLInputElement>` in the whole feature, and it is a real
  typed DOM ref, never a global DOM query.
- `handleSubmit` (the single function both Send-click and Enter route through, since both submit the
  same `<form>`) sets `pendingComposerFocusRef.current = true` before calling `submitMessage`.
  `handleQuickReply` deliberately does not — a quick-reply click is the user explicitly choosing a
  different control, and per the standing "no focus tug-of-war" rule, must never have focus dragged
  back to the composer afterward.
- A `useEffect` keyed on `[isWorking]` consumes the pending flag (one-shot) the instant `isWorking`
  becomes `false`: it bails out while still working or with nothing pending, otherwise resets the flag
  and calls `composerInputRef.current?.focus()`. This is deliberately the smallest reliable signal
  available — React guarantees the effect runs after the DOM has already committed the now-enabled
  input, so there is no timing gap to paper over with a timeout. No `setTimeout`, no polling, no
  arbitrary delay anywhere in this feature.
- A capture-phase `pointerdown`/`keydown` listener on `document` cancels the pending flag the instant
  the event target is anything other than the composer input — this is what makes an explicit user
  focus change always win over the automatic restore, and it is registered in the capture phase
  specifically so it always observes the interaction before a dialog's own focus trap can intercept
  and stop it.

**Bug found via live verification, fixed in the same slice**: the very first live Playwright run
(typing the next message immediately after Enter, with zero click, exactly per this slice's required
verification sequence) showed the restore effect not firing at all. Root cause: while the composer is
disabled, a keystroke the user fires off has nowhere to go — the disabled input can't be an event
target — so the browser routes it to `document.body` by fallback. That keydown's target is body, which
is not the composer input, so the capture-phase cancel-listener was (wrongly) treating it as an
explicit focus change to a different real control and canceling the pending restore before it ever got
a chance to run. Fixed by excluding `document.body` from the cancellation check — it is the browser's
fallback for "nothing else is focused," not a control the user deliberately interacted with. Only a
genuine other element (a button, a chip, a dialog) still cancels the pending restore.

**What this feature does and does NOT guarantee** (documented explicitly, not left implicit): keeping
`disabled={isWorking || disabled}` unchanged (this slice's own scope boundary) means keystrokes typed
during the brief window while a response is still in flight are physically dropped — a disabled
`<input>` cannot receive them, full stop. This is pre-existing, unchanged behavior, not a regression
introduced or silently accepted here. What this feature does guarantee, and what live verification
confirmed: the moment the composer re-enables, focus is already there waiting, and the user can keep
typing with zero click — the actual complaint being fixed.

**Availability-loss recovery, Simulate, Accept/Reject, Widen search — all explicit button clicks**:
these do not route through `handleSubmit` and never set the pending flag. Per the standing "no focus
tug-of-war" rule, focus is left wherever the click landed — the same treatment as any other explicit
control interaction, not a special case. (An earlier live-verification pass assumed the availability-
loss Attention Card should always pull focus back to the composer; that assumption was wrong and was
corrected once the actual click-driven mechanics were traced through — the Simulate button is a button
click like any other, not a composer submission.)

**Modal/dialog interaction — verified by inspection, not just by not-breaking**: `ReservationReview`
and `AuthorizeBookingDialog` are rendered only in the `view === "reservation"` branch, which never
mounts a `<Composer>` at all — so there is structurally nothing for this feature to fight there. Live
verification confirmed the Authorize Booking dialog still opens with `role="dialog"`, traps focus
inside itself (confirmed on the actual "Cancel" button), and closes cleanly with zero console errors —
entirely via Base UI's own existing, untouched behavior. The Trip Details bottom sheet (mobile-only,
`src/components/campops/trip-details-sheet.tsx`) is the one surface that does share the conversational
view with the composer — live mobile verification confirmed it opens with focus moving inside it and
closes via Escape, with the composer never contesting that focus.

**Mobile keyboard dismissal**: verified live at 390×844 — after a deliberate blur (simulating the user
dismissing the keyboard or tapping elsewhere), the composer does not reclaim focus on its own. The
pending-focus mechanism only ever fires in response to a genuine prior submission, never speculatively,
so there is no reopen loop. One platform limitation is recorded rather than worked around: iOS Safari
specifically only opens the on-screen keyboard from a `.focus()` call made synchronously inside a real
user gesture — a `.focus()` fired from a `useEffect` after an async response resolves falls outside
that window, so on iOS the input may become the logically focused element without the keyboard
visually reappearing. This is a known OS/browser security restriction, not a bug in this
implementation, and there is no reliable non-hacky way around it (a synthetic touch dispatch would be
exactly the kind of brittle workaround the standing rules forbid) — so it is documented here rather
than "fixed."

**Principle** (the one this whole slice reduces to): the composer remains the default conversational
focus target after submission, but explicit user focus changes and modal focus management always take
precedence.

**Verified in this environment**: new `scripts/smoke-test-composer-focus.ts` (17 static source-guard
assertions covering the ref wiring, the `isWorking`-keyed one-shot restore effect, the
`handleSubmit`/`handleQuickReply` asymmetry, the capture-phase cancel-listener and its cleanup, and
that the shared Dialog primitive remains completely unaware of this feature) — explicit in its own
header comment that it proves the wiring, not real browser focus behavior, since this project has no
jsdom/React Testing Library configured. All pre-existing regression scripts re-verified passing;
`tsc --noEmit`, `eslint`, and `next build` all clean. Live Playwright verification (ad hoc scratch
scripts, not committed) at both 1440×900 and 390×844: composer regains focus with no click after a
normal recommendation, a clarification question, a No Match response, and a candidate refinement;
typing immediately after Enter with zero click lands once the composer re-enables; clicking a
Candidate Card action (Accept) does not have the composer steal focus back; the No Match Attention
Card's "Change a requirement" button focuses the composer directly; the Authorize Booking dialog and
the mobile Trip Details sheet both retain their own correct focus-trap/return behavior; a simulated
mobile keyboard dismissal is not immediately overridden. Zero console errors across every run. True
native mobile keyboard show/hide behavior (as opposed to logical DOM focus, which was verified) still
requires manual verification on a real device — Playwright's Chromium-based mobile emulation cannot
exercise the OS-level keyboard itself.

---

**Slice: Trip Requirement Projection + Party-Composition Inference**
Date: 2026-09-10
Context: a live bug report for "a campsite for 4 adults, two kids, and two dogs within an hour from my
home" — CampOps correctly asked for ZIP and dates, and the eventual No Match copy correctly cited
"Pet-friendly", "Capacity for 6", and "within an hour from home". The Trip Requirements panel showed
only the last of those. It also never surfaced that two explicit children were part of the party.

**Diagnosis first, per this slice's own instruction** (item 1) — queried the real `/api/intent` endpoint
directly with the exact reported message before changing anything:
```
guestCount: 6            travelingWithPets: true         petCount: 2
flexibleConstraints: ["within an hour from home"]   (landed in a soft tier this run — model
                                                       classification varies run to run, unrelated
                                                       to this bug)
```
This confirmed the extraction was never broken — `guestCount`/`travelingWithPets`/`petCount` were
correctly structured, and the evaluator's own synthetic `capacityCheck`/`petCheck` (in `evaluate.ts`)
already enforce them, which is exactly why the No Match copy could name them. The actual bug was
isolated to exactly one place: `TripRequirementsList` (`src/components/campops/trip-requirements-list.tsx`)
read directly off the four literal `TripIntent` arrays (`hardRequirements`/`flexibleConstraints`/
`preferences`/`priorities`) — and `guestCount`/`travelingWithPets`/`petCount` are deliberately never
echoed into those arrays as text (by design, so the model doesn't duplicate a structured fact as free
text the evaluator would then keyword-match a second time). The panel was reading the wrong source of
truth for those two fields; the evaluator was never the problem.

**Fix 1 — Trip Requirements projection** (`src/lib/requirements.ts`'s new `getDerivedRequirements`,
wired into `TripRequirementsList`): projects the exact same structured fields the evaluator already
reads — `guestCount` -> `capacityRequirementLabel` (newly exported from `evaluate.ts` so the panel and
the evaluator/No-Match copy can never drift apart — one function, two call sites, not a hand-typed
duplicate string) and `travelingWithPets`/`petCount` -> a new, panel-only `petPanelLabel`. These render
as **non-removable** chips (no `onRemove` wired for them) — the exact same treatment this file's own
2026-09-01 doc comment already established for the Candidate Card's synthetic "Capacity for N" chip:
there is no literal array entry to remove, and routing "remove" through a real guestCount/petCount edit
was explicitly out of scope (see the amendment above). `RequirementChip`'s `onRemove` was already
optional for exactly this reason — no new component was built, per this slice's own instruction.

**Pet count preserved as real information, not collapsed to a boolean** (item 4): `petPanelLabel(2)` ->
`"Pet-friendly for 2 pets"`, not a generic "Pet-friendly" — the schema has no pet-species field, so this
says "pets", not "dogs" (saying "dogs" would invent information the structured intent never actually
captured, even though this exact bug report's own wording said "two dogs"). Deliberately does NOT touch
`evaluate.ts`'s own `petCheck` label (kept as plain `"Pet-friendly"`, unchanged) — that string is
exercised by roughly two dozen existing regression assertions (No Match copy, Candidate Card
preserved/compromise chips, `smoke-test-pet-requirement.ts`'s exact-label checks) and changing it was
unnecessary risk for a gap that was specifically about the PANEL, not the No Match/Candidate Card text
(which the bug report itself already confirmed was correct). The two pet labels are intentionally
different strings describing the exact same underlying `petCount`/`petPolicy.maxPets` enforcement — "no
new information," just a richer presentation, in the one place the request asked for it.

**Fix 2 — Party-Composition Inference**: added `TripIntent.travelingWithChildren`/`childCount`,
mirroring `travelingWithPets`/`petCount` exactly (same schema shape, same prompt-writing pattern in
`src/app/api/intent/route.ts`). The prompt is explicit that this is about CHILD COMPOSITION, not
headcount — "4 adults and 2 kids" and "6 people" both produce `guestCount: 6`, but only the first should
set `travelingWithChildren: true`; "6 adults"/"a group of 6" must leave it false. New
`src/lib/family-inference.ts`'s `applyFamilyPreferenceInference` is the deterministic APPLICATION-side
decision this enables: model classifies the language (as it always does), application decides the
consequence (adds `"Family-friendly"` to `preferences` — a real, literal array entry, not a hidden flag)
— the same model-handles-language/application-handles-truth split this codebase has used for every prior
inference in this file.

**Only fires on a false -> true transition, never unconditionally** (this is the one subtle piece):
`applyFamilyPreferenceInference` is called with `(priorIntent, freshIntent)` and only inserts the
preference when `travelingWithChildren` just became true THIS turn. Reasoning it through: the model
returns a fresh `TripIntent` every turn, expected to preserve `priorIntent`'s established facts
(including `travelingWithChildren`) unless the new message changes them. If this function re-derived the
preference from the boolean unconditionally on every turn, then removing the "Family-friendly" chip
(a purely client-side, non-model-informed edit via `removeRequirement`) would get silently undone the
very next time the model responds to an unrelated message — the exact same tug-of-war class already
solved for composer focus in the slice above this one. Comparing against `priorIntent` (the app's own
real current state, which already reflects any prior removal) closes that gap for free: once established,
the preference persists or is removed exactly like any other soft preference, and is never force-reinserted
behind the user's back.

**A real gap found while writing the "don't duplicate a stronger tier" regression test**: the dedup
guard (`hasFamilyMention`, checking all four tiers before inserting) and `evaluate.ts`'s own
`checkConstraint` family branch both originally matched only `"famil"`. Item 6's own example language —
"it needs to be good for kids", "kid-friendly is a must" — would be classified by the model into a
stronger tier using "kid"/"child" wording that neither the evaluator NOR the dedup guard would recognize
as family-related, risking both a duplicate soft "Family-friendly" AND, separately, that stronger label
evaluating as "unverifiable" instead of against `site.familyFeatures`. Fixed by broadening both to
`famil|kid|child` — found via a failing regression assertion before this ever reached live testing, not
via a live bug.

**Everything downstream needed no new code, by construction**: because "Family-friendly" lands as an
ordinary `preferences` string, `evaluate.ts`'s existing soft-check pipeline (`checkConstraint`'s family
branch, already grounded in real `site.familyFeatures`) picks it up automatically — satisfied preferences
already flow into `preserved` (Candidate Card "How this fits", item 11), an unsatisfied one already flows
into `compromises` with `UNMET_PREFERENCE_PREFIX` ("Didn't fully match: Family-friendly", never the
hard-failure `UNSATISFIED_PREFIX`, so it can never contaminate `no-match.ts`'s failing-hard-label
extraction — item 12), and because `preferences` is a SOFT tier, `classifyMatchType` (which only ever
inspects `hardChecks`) can never let it cause a `no_match` on its own. None of this required touching
`evaluate.ts`'s matching/ranking logic at all — the entire fix is "make the application insert one more
literal string into an array the evaluator already knows how to interpret."

**Removal semantics** (item 9), each locked down by both a regression test and live verification:
- **Capacity / pet count** — non-removable (no `onRemove` at all), so there is no way to hide the chip
  while `guestCount`/`travelingWithPets` remain set; the underlying structured fact and its visibility
  can never diverge.
- **Family-friendly** — fully removable via the existing `removeRequirement` path, since it's a literal
  `preferences` entry like any other. Removing it touches only `preferences`; `travelingWithChildren`/
  `childCount` are untouched, so the children never leave the party's structured state, only the derived
  preference chip disappears. Verified live: removing it, then sending an unrelated follow-up message,
  confirmed the chip does not reappear.

**Principles** (item 16):
- Explicit party composition can carry semantic meaning beyond headcount — "4 adults and 2 kids" and "6
  people" are not the same claim even when `guestCount` agrees.
- Mentioning children may infer a soft Family-friendly preference; generic party size never does.
- Derived deterministic constraints and inferred soft preferences must remain visibly aligned with the
  active TripIntent — a fact the evaluator enforces but the UI can't show is exactly the bug class this
  slice closes, and it's now closed by both re-deriving from the same fields (not a duplicate hand-typed
  copy) and by a regression test asserting the evaluator's own computed checks and the panel's projection
  never diverge.

**Verified in this environment**: new `scripts/smoke-test-party-composition.ts` (19 assertions: capacity/
pet projection present and absent-when-unset, pet count preserved as real structured information (never
collapsed to a boolean), the existing 2-dogs-vs-maxPets-1 enforcement re-locked-down at this layer,
Family-friendly inferred only on an explicit false->true transition (not unconditionally, not for
generic headcount, not for "adults"-only phrasing), no duplicate/downgrade when a stronger tier already
carries a family-related label, satisfied/unsatisfied Family-friendly flowing into preserved/compromise
correctly, a soft Family-friendly miss never causing `no_match`, evaluator-vs-panel alignment, removal
preserving party composition, and derived hard requirements being un-hideable while their structured
state remains active); all pre-existing regression scripts re-verified passing; `tsc --noEmit`, `eslint`,
`next build` all clean. Live verification against the real GPT-5.4-mini endpoint, desktop (1440×900) and
mobile (390×844): the exact reported message, followed by a ZIP and "Labor Day weekend", showed
"Capacity for 6" and "Pet-friendly for 2 pets" as non-removable Hard chips and "Family-friendly" as a
removable Preferred chip throughout, surviving every prerequisite turn; the eventual Candidate Card
explanation read "...it satisfies Capacity for 6, Pet-friendly, Available for your dates, Family-friendly,
at $105/night and 55 mi away. It's family-friendly — nearby restrooms." with "Didn't fully match: within
an hour from home" shown honestly as a separate soft compromise. Comparison messages confirmed the
inference boundary live: "a campsite for 6 people within an hour from my home" and "a campsite for 6
adults within an hour from my home" both showed Capacity for 6 with NO Family-friendly; "camping with my
two kids" showed Family-friendly with no capacity stated. Removal verified live: Capacity/pet chips have
no remove control at all; the Family-friendly chip does, removing it makes the chip disappear, and it
does not reappear after an unrelated follow-up turn. Zero console errors across every run.
