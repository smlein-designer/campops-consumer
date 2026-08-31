# CampOps Consumer — Final Implementation & Evaluation

Date: 2026-09-01
Companion to `docs/implementation-decisions.md` (detailed decision/finding log) and the Case Study
Notes. This document is the single, final summary: what was built, how it holds up against the PRD's
own evaluation matrix, what was verified, what remains known-deferred, and whether it's demo-ready.

---

## 1. What was built

An agentic camping-trip booking POC (Next.js App Router, TypeScript, Tailwind v4, shadcn/ui on
`@base-ui/react` primitives) covering the full golden path: natural-language trip intent → structured
TripIntent → deterministic campsite evaluation → recommendation with explanation → availability-loss
recovery → user acceptance → staged reservation → simulated authorization boundary. Responsive at
both desktop (≥1024px) and mobile (390px+) breakpoints. Full Requirement Chip direct-manipulation
removal, consistently available wherever an editable chip is shown (Trip Panel, mobile Trip Details
sheet, Candidate Card's preserved/compromise rows).

## 2. Architecture summary

- **Model layer** (`src/app/api/intent/route.ts`): GPT-5.4-mini via `responses.parse`, Zod-validated
  (`IntentInterpretationSchema`) before ever leaving the server. Produces language interpretation and
  an explicit `actionable`/`needs_clarification`/`unsupported` judgment only — never campsite data,
  availability, price, ranking, or booking state.
- **Deterministic layer** (`src/lib/*.ts`): `evaluate.ts` (campsite matching/ranking/scoring),
  `reservation.ts` (guarded reservation/authorization state machine — the only code path that can
  produce `"reserved"`), `no-match.ts` (Widen Search), `requirements.ts` (chip removal), `events.ts`
  (Activity Log derivers). None of these call the model or touch anything probabilistic.
- **`src/app/page.tsx`**: orchestrates the two layers — applies the model's validated
  `IntentInterpretation` to structured state, then always re-runs the deterministic evaluator itself;
  the model is never trusted to produce a recommendation, ranking, or price.
- **Dataset** (`src/lib/campsites.ts`): 10 hand-authored records (PRD §8's representative-dataset
  target), covering availability, capacity, price, pet policy, site type, amenities, proximity, and
  distance, with a deliberately closed (`available: false`) record and deliberately overlapping
  full-match/compromise/no-match scenarios (see `docs/implementation-decisions.md` for the
  per-record reasoning).

## 3. Model vs. deterministic responsibility split (verified)

| Responsibility | Owner | Verified how |
|---|---|---|
| Language interpretation, explanation phrasing | GPT-5.4-mini | code review of `route.ts`'s system prompt scope |
| Campsite inventory, availability, price | Deterministic (`campsites.ts`) | model never referenced in `evaluate.ts`; dataset is a static TS array |
| Candidate ranking/scoring | Deterministic (`evaluate.ts`) | `smoke-test-evaluate.ts`, `smoke-test-dataset.ts` — repeated evaluation of identical input is byte-identical |
| Booking/reservation state | Deterministic (`reservation.ts`) | `smoke-test-reservation.ts` — every invalid `transitionReservation` call throws |
| Authorization state | Deterministic, guarded | `reserved` is reachable only via `AUTHORIZE` from `"authorizing"`; every other path throws (tested exhaustively) |
| Model output validation | Zod, server-side, before any state application | `IntentInterpretationSchema.parse(parsed)` in `route.ts`, re-validated even after the SDK's own `.parse()` |
| `OPENAI_API_KEY` | Server-only | `grep`-confirmed: appears only in `route.ts`, never in client code, no `NEXT_PUBLIC_` prefix anywhere |

**No leakage found**: probabilistic output never directly mutates consequence-sensitive truth. The
model's `TripIntent` output is structured text labels only; every deterministic check
(`evaluateCampsites`, capacity, reservation transitions) re-derives its own truth from real
application state, never from the model's own judgment about whether something "fits."

## 4. Eight PRD evaluation scenarios — results

All eight verified live (desktop, with mobile spot-checks on the direct-manipulation-heavy ones).
Zero console errors across every run.

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | All requested constraints can be satisfied | **PASS** | Full match correctly ranks the intended candidate first; structured capacity + literal hard requirements both enforced |
| 2 | Qualitative/relative preference that doesn't map to standard filters | **PASS** | A stated priority ("willing to pay more for Wifi") correctly flips the top-ranked candidate to the only qualifying site that actually has it — a filter-driven UI would need the user to notice and manually re-sort by amenity, this reasons across the tradeoff directly |
| 3 | Preferred campsite becomes unavailable | **PASS** | Scripted availability-loss recovers to a full-match substitute, and separately to a compromise-only substitute when no full match remains, without restarting the search |
| 4 | No campsite satisfies every requirement | **PASS** | True no-match correctly distinct from compromise; Widen Search moves exactly the one failing requirement; Change a requirement focuses the composer |
| 5 | User changes a constraint while CampOps is working | **PASS (after fix)** | Found and fixed a real race: a direct chip removal during an in-flight request was being silently overwritten by that request's stale response. Now the direct change survives and the stale response is honestly discarded — see `docs/implementation-decisions.md` |
| 6 | User rejects the recommendation | **PASS** | Routes to the shared Closing screen; "Start a new search" fully resets task state |
| 7 | User gives an unsupported request | **PASS** | Established intent and the standing recommendation survive an unsupported turn completely untouched (enforced in code, not just prompted) |
| 8 | User attempts to authorize with incomplete required information | **PASS** | Missing Info surfaces on attempt; Reserve stays enabled (per Handoff Spec — never preemptively disabled); completing the missing field cleanly proceeds to Authorization |

## 5. Product hypothesis check

Scenario 2 (qualitative priority reasoning) was used as the "intentionally difficult to reproduce
with standard filters" case, per PRD §11. It demonstrates:

- multi-variable intent preserved (hard requirement + priority carried together across the turn)
- hard/flexible/preference/priority distinguished (the priority never silently became a hard filter)
- reasoning across an imperfect match dimension (amenity-as-tradeoff, not a boolean filter)
- the compromise/tradeoff basis is stated in the explanation, not hidden
- recovery scenario (3) separately demonstrates continuing the task without rebuilding the search

**Does this materially reduce decision and recovery work versus a conventional search/filter
flow?** For scenario 2 specifically: yes, qualitatively — a filter UI has no control for "prefer
sites with Wifi enough to accept a worse price/distance," so a user would have to manually inspect
every pet-friendly result's amenity list and re-rank by hand. CampOps did that ranking directly from
the stated tradeoff. This is a qualitative product-design judgment, not a measured claim — **no
quantitative decision-time or task-completion data was collected in this POC**, and none is claimed.

## 6. Structured-field enforcement review

Every `TripIntent` field, and whether it has a deterministic enforcement path:

| Field | Enforced? | Path |
|---|---|---|
| `hardRequirements[]` | Yes | `checkConstraint` (keyword-heuristic match against real `Campsite` fields); confirmed-unsatisfied → `no_match` |
| `guestCount` | Yes | Independent structured capacity check in `evaluateCampsites`, regardless of whether the model also echoed it as text |
| `flexibleConstraints[]` / `preferences[]` / `priorities[]` | Yes, as soft scoring | Never exclude a candidate (by design — only `hardRequirements`/`guestCount` are exclusionary); matched entries affect ranking score |
| `goalStatement` | N/A | Descriptive restatement only, not a constraint — no enforcement is meaningful here |
| **`checkIn` / `checkOut`** | **YES — for both search and booking (corrected 2026-09-01, twice the same day)** | **Availability-backed search: YES.** `checkSearchPrerequisites(intent, {availabilityBacked: true})` blocks the deterministic evaluator itself — no specific campsite recommendation (and its implicit availability claim) can be produced without concrete dates, unless the request is deterministically classified exploratory discovery (`isExploratoryDiscoveryMessage`; see §14). **Booking-readiness: YES**, unchanged from the first correction — `stageReservation` takes `checkIn`/`checkOut` as required, non-nullable parameters. Both the Candidate Card and the Reservation Review/Authorize Booking/Booking Confirmed surfaces display the user's own stated dates — a real bug (the Candidate Card's `datesValue` reading `campsite.datesAvailable` instead) was found and fixed in the second correction; see §14. **Date-specific availability verification: still NO** — the 10-record dataset has no per-date calendar at all (one static window per record shared by every record), so there is nothing to check a requested date range against, and this document does not claim otherwise. |
| **`originZip`** (added 2026-09-01) | **YES, genuinely evaluated (corrected 2026-09-02 — see §15)** | Gates the one case that needs it: a search containing a self-referential distance/travel-time constraint (`isOriginRelativeDistanceLabel`) is blocked until an origin exists (`checkSearchPrerequisites`), for BOTH exploratory and availability-backed searches. **As of the §15 correction, once supplied, the constraint is genuinely evaluated** — a bundled ZIP-prefix centroid lookup plus great-circle distance and a documented road-distance/travel-time approximation (`src/lib/geo.ts`) resolve it to `"satisfied"`/`"unsatisfied"`, not a permanent `"unverifiable"`. It still falls back to `"unverifiable"` (never a guessed `"satisfied"`) when the ZIP falls outside the bundled table's coverage or the stated radius can't be parsed. See §15 below (§13/§14's original "no real distance calculation at all" claim is superseded by this correction). |

`regression-structured-fields.ts` re-run clean; confirms `guestCount` enforcement specifically
(a guest count exceeding every site's capacity, with otherwise-empty `hardRequirements`, still
correctly produces `no_match`). `scripts/smoke-test-prerequisites.ts` (new) covers the `checkIn`/
`checkOut`/`originZip` rows above in full.

## 7. Semantic state integrity

Reviewed for convenience-boolean collapsing. All of the following remain distinct, real, guarded
states, not flags:

- **`working` / `disabled`** (`Composer`): deliberately separate signals — `isWorking` shows Stop
  (interruptible); `disabled` shows a plain disabled Send (nothing running). Documented in the
  component itself; no collapsing found.
- **`actionable` / `needs_clarification` / `unsupported`** (`IntentInterpretation.status`): a real
  three-way model judgment, not derived from counting populated fields.
- **`full` / `compromise` / `no_match`** (`MatchType`): `compromise` requires zero confirmed-failing
  hard requirements (only unverifiable ones) — never a silently-downgraded `full`.
- **`staged` / `incomplete` / `ready_for_authorization` / `authorizing` / `reserved`**
  (`ReservationStatus`): five distinct values with guarded transitions; `transitionReservation`
  throws on every invalid transition (exhaustively tested).

No new convenience booleans were introduced by the mobile or final-evaluation phases.

## 8. Accessibility verification summary

Audited against Handoff Spec §3 and relevant WCAG expectations. Two real defects found and fixed this
phase (see `docs/implementation-decisions.md` for the full detail): the Composer's missing
focus-visible state, and an intermittent focus-trap escape in both modal dialogs (Authorize Booking,
mobile Trip Details sheet) — fixed with a defensive Tab-wrap shared by both. Also found and fixed:
Button component sizes never actually reached the Handoff Spec's documented 44px minimum (affects hit
target size for every primary CTA).

Verified, no defect found:
- Keyboard access to every actionable control, including chip remove icons (native `<button>`
  elements throughout; Enter-key activation confirmed live)
- Focus return to the triggering control on dialog dismiss (confirmed live, Escape-key path)
- Polite live-region announcements for meaningful status changes — added this phase (Handoff Spec §3
  explicitly required this and it was previously absent): one `aria-live="polite"` region mirroring
  the Trip Panel/status-bar label and `isWorking` state, one mirroring the reservation status Badge
- Consequence text (non-refundable warning) is plain DOM text, reachable by assistive tech like any
  other paragraph — no defect found
- Color is never the only signal — every tier/status/state pairs color with real text throughout
  (chip labels, badge text, explicit "Staged"/"Reserved" language); no bare-color state found
- Chip remove controls: keyboard-accessible; their sub-44px tap target is a Handoff-Spec-documented,
  intentional WCAG exception (Case Study decision log), not an oversight
- No critical interaction depends only on a gesture (no swipe-only affordance anywhere; the mobile
  Trip Details sheet has an explicit Done button, Escape, and backdrop-tap, not swipe-only)
- No focus stealing during normal agent progress — the only programmatic `.focus()` call in the app
  is the user-triggered "Change a requirement" action, nothing fires automatically during passive
  progress
- Mobile reflow verified at 390px and 1440px; no horizontal overflow found after the fixes below

## 9. Responsive/overflow audit

Verified at 390px, an intermediate width, 1024px, and 1440px. One real overflow bug found and fixed:
`ReservationReview`'s default (staged/incomplete) branch still used the old fixed `w-[560px]`
container — a real bug, not a hypothetical, confirmed by live render at 390px (the earlier
mobile-responsive slice's fix had only landed on the sibling `isReserved` branch). Fixed to match.
Also hardened (defensively, not because a live bug was found, but because the audit specifically
asks for resilience against these): Candidate Card's site-name/site-type row now truncates the site
name instead of relying on short data always staying short; the no-match/unsupported action rows
(Widen Search / Change a requirement / decline, Continue / Never mind) now wrap instead of forcing a
single non-wrapping row.

No clipped cards, no clipped buttons, no broken bottom sheets/dialogs, no unusable composer states,
and no unwrapped quick-reply rows found at any tested width.

## 10. Visual fidelity vs. Figma

Compared implemented Recommendation and No Match screens directly against live Figma screenshots
(not just the Handoff Spec text). Two gaps found and closed this phase — both purely presentational,
both derived from real state, both confirmed present in the actual Figma screenshots rather than
assumed: the Trip Panel header's status Badge ("Best match" / "Needs attention", confirmed via
screenshot) and the "Availability verified just now" indicator (Handoff Spec 1.2 had already reserved
a `success` color token for exactly this, never used until now). See
`docs/implementation-decisions.md` for the full writeup, including the one badge-copy value
(Compromise/Alternative's exact wording) that was not independently confirmed and was filled in with
the lowest-risk, self-consistent choice rather than asserted as confirmed-correct.

**Preserved, not "fixed back"**, per this phase's explicit instruction:
- destructive token stays `#dc2626` (Style Guide value, not the raw fallback seen on two live screens)
- Staged badge stays `neutral-soft`
- `guestCount` remains required (see the Figma-vs-decision-history conflict below)
- full cancellation workflow remains out of scope (control stays visibly inert)
- chip removal remains consistently available wherever an editable chip is shown (this phase's mobile
  slice's own resolution, not reverted)

## 11. Known Figma divergences (recorded, not silently resolved)

1. **Candidate Card preserved/compromise chips vs. Figma's non-interactive spec**: live Figma
   (Candidate Card node 2085:6, Requirement Chip node 2056:135) still specifies these as
   non-interactive; implementation now makes the ones backed by a literal `hardRequirements` entry
   removable, per the approved design resolution. Figma needs a follow-up update to match.
2. **"Constraint Removed" mobile frame vs. the adopted status-bar+sheet pattern**: that one frame
   shows the chip list inline with no status bar/sheet, diverging from the "Working"/"No Match"
   mobile frames' own collapsed-bar-plus-sheet pattern this implementation adopted consistently.
3. **Destructive fallback mismatch**: two live screens' raw fallback color reads `#b21d1d` instead of
   the Style Guide's `#dc2626`; implementation kept the Style Guide value (already RESOLVED, see
   `docs/implementation-decisions.md`).
4. **Staged badge raw-gray mismatch**: implementation kept the existing `neutral-soft` token rather
   than introducing a new one to chase a possibly-unintentional raw gray (already RESOLVED).
5. **NEW this phase — dates/guest-count as removable chips**: the live No Match Figma screenshot
   shows `Sept 12–14 ×` and `4 guests ×` rendered as literal, removable hard-requirement chips
   alongside "Pet-friendly ×". Implementation does not do this — `guestCount` is deliberately kept
   required (not removable) per an already-recorded resolution, and dates have no chip representation
   or enforcement at all (see §6 above). Not changed this phase: making either directly removable
   would be a real product-behavior change (what "removing" a date or a guest count even means), not
   a visual-fidelity fix, so it's flagged here for a design/product decision rather than invented.

## 12. Known limitations / intentionally deferred scope

Per PRD §9 and standing project scope, explicitly out of scope for this POC (mocked or absent by
design, not oversights):

- real payment processing
- real campground reservation APIs
- production authentication
- persistent cross-session memory
- live inventory synchronization
- production observability/analytics infrastructure
- full cancellation workflow (control exists, stays visibly inert — not a stub pretending to work)
- ~~date-specific availability verification~~ — **implemented 2026-09-04, see §16**: campsites now
  carry real `unavailableRanges`, checked against the actual requested date range via a genuine hard
  check. The remaining honest boundary: coverage is whatever `unavailableRanges` the demo dataset
  authors in (a handful of records, not a live per-date calendar synced to a real booking system).
- ~~real distance/drive-time calculation from an origin ZIP~~ — **implemented 2026-09-02, see §15**:
  a bundled ZIP-prefix centroid lookup + great-circle distance + a documented road-distance/
  travel-time approximation now genuinely evaluate this, for the Texas dataset this POC covers. Real
  limitations that remain: coverage is bundled/regional (not a full ZIP database — an origin outside
  it stays honestly `"unverifiable"`), and the approximation is explicitly a demo-scale heuristic, not
  a real routing engine.

Additional known limitations from this evaluation pass:

- No component-level test harness exists in this project (by established convention — pure-lib smoke
  tests plus ad hoc Playwright verification). The race-condition fix (§4, scenario 5) and both
  Deterministic Action Prerequisites passes' stateful flows (§13, §14) are verified via repeatable
  live Playwright scripts, not committed automated regression tests.
- Compromise/Alternative states' exact Figma badge copy was not independently confirmed (§10) — the
  implemented value is a reasonable, low-risk placeholder, not verified-correct.
- `isOriginRelativeDistanceLabel`'s keyword pattern is a POC-scale heuristic, not real NLU — an
  unusual self-referential phrasing it doesn't recognize would be missed (a missed clarification
  opportunity, not a false "satisfied" claim, since the evaluator's own fallback already treats
  anything unrecognized as "unverifiable"). `isExploratoryDiscoveryMessage` (§14) is the same kind of
  heuristic and carries the same class of limitation, biased deliberately toward the safer
  (availability-backed) default when a message is ambiguous.
- **Resolved 2026-09-04 (§16), previously an open product/design question (§14)**: "Availability
  verified just now" used to reflect only a static per-campsite flag, never date-specific truth. As
  of the Dataset Depth correction it genuinely IS date-specific for any availability-backed
  recommendation (concrete dates are guaranteed present by the time this screen renders, and a real
  `unavailableRanges` check has already run against them) — the copy is no longer flagged as a
  truthfulness risk for that case. The one remaining nuance: an EXPLORATORY recommendation (no dates
  yet) still shows the same indicator reflecting only the static flag, since there's nothing
  date-specific to check yet — noted in `page.tsx`'s own comment, not a new open question.

## 13. Deterministic Action Prerequisites (2026-09-01 addendum)

A substantive, standing-rules-driven addition after the original 13-section evaluation above was
written — see `docs/implementation-decisions.md` for the full architectural writeup. Summary:

- **New deterministic layer** (`src/lib/prerequisites.ts`) separates objectively-required action
  prerequisites (application facts) from ordinary semantic ambiguity (the model's own judgment,
  unchanged). GPT never decides whether a prerequisite exists; it may only supply the raw structured
  value (a ZIP, a date) when the user actually states one.
- **Origin/distance support, precisely scoped**: the app now recognizes when a search constraint is
  phrased relative to the user's own (unspecified) location and will not proceed until an origin ZIP
  is supplied. **At the time this section was written, this was the full extent of the app's location
  capability — no geocoding, no real distance calculation, and a self-referential distance constraint
  was marked `"unverifiable"` permanently.** This has since changed: **§15 (2026-09-02) implemented a
  real, deterministic, bundled-ZIP-centroid + great-circle-distance evaluation**, so the constraint now
  genuinely resolves to `"satisfied"`/`"unsatisfied"` rather than staying permanently unverifiable —
  see §15 for the full writeup and its documented approximation. It still falls back to
  `"unverifiable"` (never a guessed `"satisfied"`) outside the bundled ZIP coverage or for an
  unparsable radius.
- **Booking-date enforcement, precisely scoped**: a reservation can no longer be staged without
  concrete `checkIn`/`checkOut` (enforced at the type level in `stageReservation`, not just a runtime
  check), and the Reservation Review/Authorize Booking/Booking Confirmed surfaces now display the
  user's own stated dates. This narrows, but does not fully close, the dates limitation recorded
  above: the dataset still has no per-date availability model, so a reservation being "booking-ready"
  has never meant "verified available for those specific dates" and still doesn't — it means "the user
  stated concrete dates and the campsite's own (date-independent) record was otherwise satisfied."
- Full regression coverage: `scripts/smoke-test-prerequisites.ts` (pattern-matching precision, the
  never-satisfied invariant with and without an origin, the full minimum-booking-prerequisites chain)
  plus live Playwright verification of the stateful flows (blocking/resuming a search on missing
  origin, blocking/auto-resuming an Accept on missing dates, the existing stale-response race guard
  composing correctly with the new flow with no additional code) and live-model calibration against
  real GPT-5.4-mini for the required representative prompts. Zero console errors throughout.

**Note: §13 above described the FIRST correction. Live testing found it incomplete — see §14.**

## 14. Deterministic Search-Date Prerequisites correction (2026-09-01, same day, second pass)

§13's date gate only protected the BOOKING path (Accept). Live reproduction — "a campsite for 4
adults, two kids, and two dogs within an hour from my home" → ZIP supplied → an immediate campsite
recommendation, with a fabricated `Sept 12–14` date range and an "Availability verified" claim,
neither ever supplied by the user — proved the SEARCH path itself needed the same protection, since
an availability-backed recommendation is exactly where the implicit "this is available" claim is
actually made. Full writeup in `docs/implementation-decisions.md`; summary:

- **Four distinct action categories, not one global gate**: exploratory campground discovery (dates
  optional — "what are some quiet campgrounds?"), availability-backed campsite search (concrete
  dates + any active constraint's own prerequisite, e.g. origin — required before a specific
  recommendation may be produced), reservation staging (dates + guest count + the selected candidate),
  and authorization (a complete staged reservation + payment method). The first two are now
  distinguished by `isExploratoryDiscoveryMessage`, a deterministic text heuristic on the user's raw
  message that deliberately defaults to the STRICTER category (availability-backed) whenever a
  message doesn't clearly read as general/plural browsing.
- **All currently-missing prerequisites are surfaced together**, not just the first one found —
  "Find me a campsite within an hour of my home" now deterministically knows it lacks origin AND
  both dates before the first clarification is even asked, even though the UI still asks about them
  one at a time (origin first, matching the reproduced flow's own expected sequence). Completing one
  (e.g., supplying the ZIP) is proven, by regression test, to never mark the action fully actionable
  while the others remain outstanding.
- **Real bug found and fixed**: `CandidateCard`'s `DATES` fact was reading
  `campsite.datesAvailable` (a fixed inventory-side value, identical across every record in the
  dataset) instead of the user's own `checkIn`/`checkOut` — meaning it had been silently displaying
  fixture data as the user's requested trip dates in every recommendation ever shown, coincidentally
  unnoticed because every dataset record shares the same static window. Now reads the user's actual
  stated dates, with an honest `"Not yet set"` fallback for the one legitimate case where none exist
  yet (an exploratory recommendation).
- **"Availability verified just now" — flagged, not silently resolved.** Audited: this indicator has
  only ever reflected the campsite's static `available` flag, never date-specific truth. The wording
  itself doesn't explicitly claim "for your dates," so it isn't a fabricated capability, but a
  reasonable user could read it that way, and live Figma specifies this exact copy for the
  Recommendation screen. Per the standing rule that Figma does not override deterministic truth and
  a substantiation conflict should be flagged rather than resolved by fabricating the capability or
  unilaterally rewriting product copy, **this was left exactly as-is and flagged** — both here and to
  the user directly. It is now correctly gated so it can only ever appear once a search has actually
  reached a fully-prerequisite-satisfied recommendation (never mid-clarification), which was the
  concrete, reproduced harm; its underlying truthfulness claim is otherwise unchanged from before.
- Live Playwright re-ran the EXACT reproduced sequence, on both desktop and mobile, end to end:
  origin asked → ZIP supplied → dates asked (still no recommendation) → dates supplied → search
  resumes automatically with the original pet/distance/capacity requirements intact → the
  recommendation's dates are the user's own, not campsite fixture data. Zero console errors.

## 15. Search Truth + Multi-Step Clarification + Booking Completeness + Dataset Expansion (2026-09-02)

A focused corrective slice addressing seven distinct, reproduced live-demo failures — full writeup in
`docs/implementation-decisions.md` (the "Search Truth..." slice entry); summarized here against the
evaluation matrix above:

- **Travel-time constraints, genuinely evaluated (supersedes §13's "no real distance calculation at
  all" claim — see the corrected `originZip` table row in §6 and the corrected §13 bullet above).**
  New `src/lib/geo.ts`: a bundled, local ZIP-prefix centroid lookup (Texas coverage), a standard
  haversine great-circle distance, and one documented demo approximation converting that to an
  estimated road distance/travel time (`ROAD_DISTANCE_FACTOR = 1.3`, `AVERAGE_ROAD_SPEED_MPH = 50`).
  A distance/travel-time hard requirement now resolves to `"satisfied"`/`"unsatisfied"` once both the
  ZIP and the stated radius parse — changing "1 hour" to "2 hours" materially changes which
  candidates qualify. It stays `"unverifiable"` (never a guessed `"satisfied"`) only when the ZIP
  falls outside the bundled coverage or the radius can't be parsed at all — no LLM call is used
  anywhere in this path.
- **Dataset expanded from 10 to 25 records** across all seven named Texas regions (Austin/Central
  Texas, Hill Country, San Antonio, Houston/Gulf, Dallas/North Texas, East Texas, West Texas). The
  original 10 were enriched in place (real address/city/state/zip/region/lat/lng, plus a new
  `familyFriendly` boolean) with every existing behavioral attribute unchanged; 15 new records add
  real variation in pet-friendly, family-friendly, quiet/secluded, site type, and — via real
  coordinates — travel time from a given ZIP.
- **Multi-step deterministic clarification**: `IntentInterpretationSchema.clarification.quickReplies`
  now carries `{label, followUpQuestion}` pairs, not bare strings — a quick reply that only selects a
  clarification BRANCH (e.g. "A specific park/region") is architecturally distinct from one that
  supplies a concrete value, and the application deterministically forces the branch's own follow-up
  question regardless of what the model's status says that turn (never trusted to "usually" get this
  right). A related regression found while fixing this — exploratory-vs-availability-backed
  classification not persisting across a multi-turn clarification chain — was fixed alongside it.
- **Recommendation-readiness gate — a genuinely new, third gate** (new
  `src/lib/recommendation-readiness.ts`): distinct from semantic status and deterministic
  prerequisites, checks whether there's enough structured intent (a destination, a party size, or any
  stated requirement/preference — any ONE suffices) for a recommendation to be non-arbitrary. Fixes
  the most significant of the seven complaints: "Find me somewhere good for camping" no longer
  recommends a specific site purely because dates became known.
- **Deterministic relative/holiday date normalization** (new `src/lib/dates.ts`): "Labor Day
  weekend"/"Memorial Day weekend" resolve via real calendar-rule math; "this weekend"/"next
  weekend"/an explicit weekday range resolve relative to the current date. Loop protection escalates
  to a more specific follow-up question after a date-shaped reply still fails to resolve, rather than
  repeating identical copy.
- **Availability-loss recovery now genuinely uses the shared Attention Card** — a real regression
  (the recovery messages had drifted to plain `pushChat` calls, bypassing `pushAttention` entirely)
  found and fixed; no new one-off component was introduced.
- **Reservation Review's Payment Method row is now always visible**, showing the real fact
  (`"Not added"` or the actual label) from the moment the screen loads, not only after a failed
  Reserve attempt — the user no longer has to attempt-and-fail, or open the Authorize Booking modal,
  to learn whether payment is on file. The Authorize Booking dialog still separately restates it for
  final consequence review; the underlying guarded state machine (`computeMissingFields`/
  `RESERVE_ATTEMPT`) is unchanged.

**Verification**: three new regression scripts (`smoke-test-geo.ts`,
`smoke-test-recommendation-readiness.ts`, `smoke-test-dates.ts`); all ten pre-existing regression
scripts re-verified against the expanded dataset (three fixtures' `hardRequirements` combinations
needed adjustment once the larger dataset made the old combination newly satisfiable — documented
inline); `tsc --noEmit`/`eslint`/`next build` all clean; live Playwright reproduced all seven
originally-reported complaints end to end against the real GPT-5.4-mini endpoint, plus a mobile
sanity pass — zero console errors throughout.

## 16. Deterministic Pet Requirement Enforcement (2026-09-03) + Dataset Depth correction (2026-09-04)

**Pet Requirement correction (2026-09-03, brief record — full writeup in
`docs/implementation-decisions.md`):** live testing found "Dog-friendly" (and other dog-phrasing
variants) resolving to `"Couldn't verify"` even though pet-policy data was fully known, because
`checkConstraint` only recognized the substring `"pet"`. Fixed with the same architecture as
`guestCount`: a new `TripIntent.travelingWithPets: boolean`, enforced directly against the
campsite's own pet-policy field via a dedicated synthetic hard check, never via free-text keyword
matching. This was the second occurrence of the exact failure class §13 first named for `guestCount`
— a signal that a structural guard, not just a one-off fix, was needed (see §16's item 13 below).

**Dataset Depth + Derived Trip Truth + Searchable Attribute Normalization (2026-09-04):** a
follow-on review of the dataset found several dimensions modeled as static inventory facts when they
should be derived from active trip state, and several structured fields too shallow to genuinely
filter/rank on. All ~25 records were re-authored (not expanded further) with:

- `unavailableRanges` (real date-specific availability) replacing the shared, static
  `datesAvailable` string every record used to carry — this directly resolves the "Availability
  verified just now" copy gap §14 flagged as an open question: it's now genuinely date-specific for
  any availability-backed recommendation, since concrete dates are already guaranteed present by
  that point.
- `nights`/`distanceMiles` removed from `Campsite` entirely — both are now always DERIVED from the
  active trip's real dates (`src/lib/dates.ts`'s `computeDateRange`) and real origin ZIP
  (`src/lib/geo.ts`'s `distanceFromOriginMiles`), never stored as static campsite facts. A real
  timezone bug (UTC-midnight date parsing silently shifting cancellation cutoffs by a day in local
  time) was found and fixed by its own regression test during this work.
- `petPolicy: {allowed, maxPets}` (replacing the boolean from §16's Pet Requirement correction) plus
  a `TripIntent.petCount`, so "two dogs" now genuinely fails a site whose policy caps at 1 pet.
- `familyFeatures`, `noiseLevel` (split from `seclusion`), and `waterAccess` (replacing three opaque
  booleans) ground every family/quiet/water claim in real structured facts a recommendation's
  explanation can honestly cite — a real DATA-CONSISTENCY bug (a `restrooms_nearby` family-feature
  claim not backed by the `restroom` amenity code on six records) and a real WATER-MATCHING bug (a
  combined "waterfront on a lake" phrase matching on `directAccess` alone, ignoring the water type,
  so a river site could satisfy a lake-specific request) were both found and fixed during live
  verification.
- Canonical `amenities` (a finite `AmenityCode` union with alias normalization — "bathroom" now
  genuinely matches a "restroom" amenity), a structured relative `cancellationPolicy`, and a new
  `TripIntent.budget` (nightly vs. total-stay, the latter correctly requiring real dates to compute).
- Capacity rebalanced (2/4/5/6/8/10–12) so a 6-person pet-friendly-near-water-family-quiet search has
  multiple genuinely viable candidates instead of an accidental collapse to No Match.
- A new structured-field enforcement guard (`ENFORCED_CAMPSITE_FIELDS` +
  `scripts/smoke-test-field-enforcement.ts`) so the guestCount/pet-friendliness failure class can't
  silently recur for a future field.

Verified: nine new/extended regression scripts, all pre-existing scripts re-verified against the
re-authored dataset, `tsc`/`eslint`/`next build` all clean, and a live Playwright pass against the
real GPT-5.4-mini endpoint covering all fourteen requested prompts (desktop and mobile, including a
full Accept → Reservation Review flow confirming derived nights/total/cancellation copy) — zero
console errors and zero `"Couldn't verify"` occurrences across the entire pass.

## 17. Overall readiness

**Demo-ready.** All eight PRD evaluation scenarios pass live, including the two hardest to get
right (the availability-loss recovery and the working-state race condition, the latter a real bug
this phase caught and fixed). The model/application boundary is clean and independently verifiable in
code, and was tightened five times now (§13, §14, §15, §16): objectively required action
prerequisites (an origin for a self-referential distance constraint; a REAL, resolvable date range
before an availability-backed search result or a booking, not merely non-null strings) are
deterministic application rules the model cannot override by simply not noticing; geographic
constraints, pet policy, family suitability, quietness, water access, amenities, pricing, and
date-specific availability are all now genuinely evaluated against real structured data rather than
falling back to "Couldn't verify"; and a structured-field enforcement guard now catches this entire
failure class mechanically rather than relying on it being independently rediscovered per field.
Reservation/authorization invariants are exhaustively guarded and tested, including the date
requirement at both the search and booking boundaries, Reservation Review visibly shows payment
status at every point in the flow, and nights/pricing/cancellation copy are all derived from the
trip's real dates rather than static campsite fixtures. Responsive and accessibility passes each
found and fixed real, verifiable defects rather than surfacing only cosmetic nits — the POC is
materially more correct after this phase than before it. No unresolved blockers. The known
limitations above are genuine scope boundaries (explicitly out of scope per the PRD) or transparently
flagged gaps (the bundled — not exhaustive — ZIP-centroid coverage and its documented road-distance
approximation, one badge-copy value) — not silent omissions, and not claimed resolved before they
actually were, which is itself the lesson §14 through §16 all exist to record: a
deterministic-prerequisite fix isn't verified complete until the exact reproduction is re-run end to
end and the resulting UI is checked for truthfulness, not just "did it ask a question."
