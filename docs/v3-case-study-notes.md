# CampOps Consumer v3 — Case Study Notes

Date: 2026-11-22
Build Order stage 9 (Handoff Spec §8.9): the 14 PRD evaluation scenarios (Build Brief §15), each scored
pass / partial / fail, with the evidence behind the score. Companion to the per-stage commit messages,
which carry the fuller rationale for each piece.

Evidence comes from two sources, both noted per scenario:
- **Unit test** — a deterministic `scripts/smoke-test-v3-*.ts` script, runnable any time with `npx tsx`.
- **Live trace** — manually driven in the browser against the real model at `/trip/live`, screenshotted
  during this session.

---

## Scorecard

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 1 | All constraints satisfied | **Pass** | Unit: `smoke-test-v3-agent-loop.ts` ("Golden path"). Live: one message → Pine Hollow + trail ride + pontoon + guided hike all held, $642, "Everything is held · ready to book." |
| 2 | Preferred campsite becomes unavailable | **Pass** | Unit: `smoke-test-v3-scripted-events.ts` ("Campsite unavailable"). Live: "Fire campsite unavailable" demo-panel button. |
| 3 | No campsite satisfies every requirement | **Pass** | Unit: `smoke-test-v3-evaluation-scenarios.ts` ("no campsite satisfies every requirement"). Caught and fixed a real bug this stage: `evaluateCampsites` always returns candidates, even for `no_match` kind (shown for transparency, per its own doc comment) — the planner was reading `candidates[0]` instead of checking `kind`, so an unsatisfiable request was silently "matched" to the closest wrong site instead of asking. |
| 4 | User changes a constraint while working | **Pass** | Unit: `smoke-test-v3-evaluation-scenarios.ts` ("mid-task refinement") — a second turn's requirements merge with the first's, nothing discarded. |
| 5 | User rejects the recommendation | **Partial** | The "Hold this site" path and the scripted Site Unavailable → recommend → accept path are both fully wired and tested. The "Other options" / reject-and-browse-alternatives secondary action is present in the Needs You card and the static `/trip/other-options` screen, but no live resolver browses alternatives yet — clicking it is currently a no-op in `/trip/live`. |
| 6 | Unsupported request | **Pass** | Unit: `smoke-test-v3-agent-loop.ts` ("Unsupported request leaves the plan untouched"). The model-extraction route explicitly classifies flights/hotels/rental cars as out of scope. |
| 7 | Incomplete authorization | **Pass** | Unit: `smoke-test-v3-evaluation-scenarios.ts` + `smoke-test-v3-authorize.ts`. `commitBooking` refuses without a non-empty payment method — a real gap found and fixed this stage (only the UI button was disabled; the function itself had no guard). |
| 8 | No water, so the boat is dropped | **Partial** | The rule itself (`activityBookingsToDrop`) is unit-tested directly and the static `/trip/boat-dropped` screen shows the intended result. The live agent loop doesn't yet expose a "change your campsite mid-task" conversational action that would trigger a live re-check — today the rule only fires through the scripted/demo path, not a user message like "switch me to Prairie Flats." |
| 9 | Two activities would overlap | **Partial** | `checkActivityOverlap` is directly unit-tested (`smoke-test-v3-rules.ts`) against the dataset's one deliberately-overlapping pair (the two trail-ride times). That pair is same-type, and the live planner currently requests at most one activity per type per plan, so the live agent loop never actually exercises its own overlap-avoidance branch end-to-end — only the rule function does, in isolation. |
| 10 | A hold expires before approval | **Pass** | Unit: `smoke-test-v3-scripted-events.ts` ("Hold expiry"). Live: "Fire hold expiry" demo-panel button re-held the trail ride silently, no Needs You card, itinerary unchanged. |
| 11 | An action exceeds the user's permission | **Pass** | Unit: `smoke-test-v3-rules.ts` ("Over-limit hold") + `smoke-test-v3-evaluation-scenarios.ts`. Matches the static `/trip/permission-ask` screen's $320-over-$300 story exactly. |
| 12 | The forecast changes after activities are held | **Pass** | Unit: `smoke-test-v3-scripted-events.ts` ("Forecast change"). Live: "Fire forecast change" posted the exact "Storms 70% likely Sat 2-6pm / Keep Sunday / Other options" card; "Keep Sunday" re-confirmed the hold and returned to "Everything is held · ready to book." |
| 13 | User lowers a permission mid-task | **Pass** | Unit: `smoke-test-v3-rules.ts` ("Lowered permission") + `smoke-test-v3-evaluation-scenarios.ts` (agent-loop level: the same request that was allowed at the default $300 limit asks once lowered to $200/$50). |
| 14 | User dismisses a suggestion | **Pass** | Unit: `smoke-test-v3-evaluation-scenarios.ts` ("user dismisses a suggestion"). Live: the suggestion card appeared only once everything else was held (never mid-decision), correctly excluded the already-booked pontoon (a real bug found and fixed this stage — the suggestion engine wasn't filtering out activities already in the plan), and accepting "Kayaks for two" added a real 5th booking to the itinerary and total. |

**Scorecard: 11 pass, 3 partial, 0 fail.**

---

## Real bugs found and fixed during this evaluation pass

Stage 9's own point is to surface exactly this kind of thing before calling the build done:

1. **No-match silently treated as a match.** `evaluateCampsites` returns "closest" candidates even when
   `kind` is `"no_match"` (by design, for transparency elsewhere in the UI) — the planner read
   `candidates[0]` without checking `kind`, so an unsatisfiable request quietly held the wrong site
   instead of asking. Fixed in `src/lib/v3/agent-loop.ts` and `src/lib/v3/scripted-events.ts`.
2. **Suggestions could re-suggest an already-booked activity.** The suggestion engine filtered dismissed
   types but not activities already in the plan, so finishing the golden path (campsite + trail ride +
   pontoon + guided hike) suggested... the pontoon, already held. Fixed in `src/lib/v3/rules-suggestion.ts`
   by excluding `bookedActivityIds`.
3. **Incomplete authorization had no server-side guard.** `commitBooking` trusted the caller to have
   already checked for a payment method; only the UI button was disabled. Fixed with an explicit check
   inside `commitBooking` itself, so no future caller can approve without one.
4. **(Stage 7) Mobile had no way to open the conversation before any booking existed** — the
   Conversation Peek's tap target and its Review button were the same handler, so tapping "Review"
   before anything was held just reopened the chat instead of nothing happening; tapping the peek with
   nothing to review did nothing at all. Fixed by giving `ConversationPeek` separate `onOpen`/`onReview`
   handlers.
5. **(Stage 6) A self-conflicting overlap check** — re-holding a second activity type incorrectly
   compared it against itself instead of the previously-booked different-type activity, reporting
   "Guided hike overlaps Guided hike." Fixed in `src/lib/v3/agent-loop.ts`.

## Known-deferred (the 3 "partial" scenarios above)

- **Reject-and-browse-alternatives** (#5): the static `/trip/other-options` screen and the data model
  support it; the live resolver for "Other options" doesn't yet exist.
- **Live campsite-change dependency re-check** (#8): the rule works and is tested; it isn't reachable
  from a live conversational "change my campsite" message yet.
- **Cross-type activity overlap, end to end** (#9): the rule works and is tested in isolation; the
  current dataset's one overlapping pair is same-type, which the live planner never requests twice in
  one plan, so the live loop's own overlap branch is untested end-to-end (only the pure function is).

None of these affect the golden path or any of the fully-passing scenarios above.

## v2 regression check

Every existing `scripts/smoke-test-*.ts` from v2 was re-run after each v3 stage in this build (not just
at the end) and passes on the current `main`, including the two whose expected counts/rankings
legitimately changed because the v3 demo-story sites were added to the dataset (documented inline in
those two test files, not silently adjusted).
