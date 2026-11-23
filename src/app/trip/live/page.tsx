"use client";

// The live Trip Plan (Build Order stage 6) — the real agent loop, wired to
// the actual store and the shared clock, instead of stage 4's static
// fixtures. /trip itself stays on fixtures as the Figma-comparison
// reference; this route is where the agent actually runs.
import { useState } from "react";
import { ClockProvider, useClock } from "@/lib/v3/clock";
import { TripProvider, useTrip } from "@/lib/v3/store";
import { emptyTrip } from "@/lib/v3/trip-factory";
import {
  acceptSuggestion,
  dismissSuggestion,
  fetchPhrasing,
  removeTripRequirement,
  requestAlternativeCampsite,
  holdSpecificCampsite,
  runAgentTurn,
  widenTripSearch,
  RateLimitError,
} from "@/lib/v3/agent-loop";
import { tryAnswerCandidateQuestion } from "@/lib/v3/candidate-qa";
import { isAlternativeRequestMessage, isNamedCampsiteSwitchMessage, matchNamedCampsite } from "@/lib/v3/clarification";
import { buildCandidateFit, campsiteCharacteristicTags } from "@/lib/v3/fit";
import { evaluateCampsites } from "@/lib/evaluate";
import { toV2SearchIntent } from "@/lib/v3/search-adapter";
import {
  fireCampsiteUnavailable,
  fireForecastChange,
  fireHoldExpiry,
  choosePontoonSlot,
  PONTOON_SLOT_TRADEOFFS,
  resolveCampsiteUnavailableHold,
  resolveForecastDecision,
  resolveHoldExpiryRehold,
  type ScriptedEventResult,
} from "@/lib/v3/scripted-events";
import { newId } from "@/lib/id";
import { TripShell } from "@/components/v3/trip-shell";
import { LandingHero } from "@/components/v3/landing-hero";
import { Itinerary } from "@/components/v3/itinerary";
import { RequirementChip } from "@/components/v3/requirement-chip";
import { PlanStep } from "@/components/v3/plan-step";
import { ClarifyingQuestion } from "@/components/v3/clarifying-question";
import { CampsiteOption } from "@/components/v3/campsite-option";
import { ApproveBar } from "@/components/v3/approve-bar";
import { DemoPanel } from "@/components/v3/demo-panel";
import { TopNav } from "@/components/v3/top-nav";
import { ReviewLineItem } from "@/components/v3/review-line-item";
import { SummaryRow } from "@/components/v3/summary-row";
import { CommitNote } from "@/components/v3/commit-note";
import { Button } from "@/components/v3/button";
import { PaymentForm } from "@/components/v3/payment-form";
import { SuggestionCard } from "@/components/v3/suggestion-card";
import { FilterChip } from "@/components/v3/filter-chip";
import { ActivityLogRow } from "@/components/v3/activity-log-row";
import { PermissionRow } from "@/components/v3/permission-row";
import { SelectField } from "@/components/v3/select-field";
import { bookingKindLabel, tripFactChips } from "@/lib/v3/booking-display";
import { commitBooking, removeBooking } from "@/lib/v3/authorize";
import { formatUsd, tripTotal } from "@/lib/v3/money";
import { ACTIVITIES_BY_ID, providerForActivity } from "@/lib/v3/providers";
import { ADD_ONS } from "@/lib/v3/add-ons";
import { photoSrc } from "@/lib/v3/photos";
import type { Trip, TripEventKind } from "@/lib/v3/schemas";

const BOOKED_OR_HELD = (status: Trip["bookings"][number]["status"]) => status === "held" || status === "changed_needs_ok";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function LiveTripPlan() {
  const { trip, dispatch } = useTrip();
  const { now } = useClock();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"plan" | "review" | "activity" | "permissions" | "campsite-options" | "pontoon-times">("plan");
  const [activityFilter, setActivityFilter] = useState<"All" | "Your decisions" | "Holds" | "Changes" | "Searches">("All");
  const [commitError, setCommitError] = useState<string | null>(null);

  function handleNavigate(item: "Trips" | "Activity" | "Permissions") {
    if (item === "Trips") setView("plan");
    else if (item === "Activity") setView("activity");
    else setView("permissions");
  }

  /** Applies a scripted event or resolver's result as one agent-voiced turn (no user message). */
  async function applyEvent(result: ScriptedEventResult, baseTrip: Trip = trip) {
    if (result.trip === baseTrip && result.factsToPhrase.length === 0) return; // no-op (already fired, or nothing to do)
    setBusy(true);
    try {
      const agentLines = await fetchPhrasing(result.factsToPhrase);
      dispatch({
        type: "RESET",
        trip: {
          ...result.trip,
          thread: [...baseTrip.thread, ...agentLines.map((line) => ({ id: newId(), from: "agent" as const, message: line }))],
        },
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(message: string) {
    // Deterministic factual Q&A about the held campsite (ported from v2's
    // Active-Recommendation Follow-Up correction): answered from real
    // structured data, with no model call and no trip mutation at all.
    const candidateAnswer = tryAnswerCandidateQuestion(trip, message);
    if (candidateAnswer) {
      dispatch({
        type: "RESET",
        trip: {
          ...trip,
          thread: [
            ...trip.thread,
            { id: newId(), from: "user", message },
            { id: newId(), from: "agent", message: candidateAnswer },
          ],
        },
      });
      return;
    }

    // An explicit, NAMED campsite switch ("Let's switch to Prairie Flats")
    // — distinct from "show me another option" below: the user already
    // knows which site they want, so this resolves the name directly
    // rather than cycling the ranked list. Checked first since it's the
    // more specific match.
    if (isNamedCampsiteSwitchMessage(message)) {
      const result = evaluateCampsites(toV2SearchIntent(trip.intent));
      const target = result.kind !== "no_match" ? matchNamedCampsite(message, result.candidates.map((c) => c.campsite)) : null;
      if (target) {
        const userMsg = { id: newId(), from: "user" as const, message };
        dispatch({ type: "ADD_MESSAGE", message: userMsg });
        setBusy(true);
        try {
          const withUserLine = { ...trip, thread: [...trip.thread, userMsg] };
          const switched = holdSpecificCampsite(trip, target.id, now);
          await applyEvent(switched, withUserLine);
        } finally {
          setBusy(false);
        }
        return;
      }
      // Named site not found among current candidates — fall through to
      // the model, which can still ask a clarifying question about it.
    }

    // "Show me another option" (ported from v2's candidate cycling, adapted
    // to v3's hold-first model) — checked before the message ever reaches
    // the model, same priority as the candidate-question check above.
    if (isAlternativeRequestMessage(message) && trip.bookings.some((b) => b.kind === "campsite" && b.status === "held")) {
      const userMsg = { id: newId(), from: "user" as const, message };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      setBusy(true);
      try {
        const withUserLine = { ...trip, thread: [...trip.thread, userMsg] };
        const result = requestAlternativeCampsite(trip, now);
        await applyEvent(result, withUserLine);
      } finally {
        setBusy(false);
      }
      return;
    }

    const userMsg = { id: newId(), from: "user" as const, message };
    dispatch({ type: "ADD_MESSAGE", message: userMsg });
    setBusy(true);
    dispatch({ type: "SET_AGENT", agent: { working: true, phase: "interpreting", currentStepText: "Reading your message" } });
    try {
      const { factsToPhrase, checkpoints } = await runAgentTurn(trip, message, now);
      // One phrasing call for the whole turn, then pace the REVEAL only
      // (Build Brief §17 "progress timing... recommend paced") — each
      // checkpoint (What I heard + My plan, then each hold) becomes its
      // own visible beat instead of the trip jumping straight to its final
      // state in one invisible step.
      const allLines = await fetchPhrasing(factsToPhrase);
      let lineCursor = 0;
      let thread = [...trip.thread, userMsg];
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        const lines = allLines.slice(lineCursor, lineCursor + cp.facts.length);
        lineCursor += cp.facts.length;
        thread = [...thread, ...lines.map((line) => ({ id: newId(), from: "agent" as const, message: line }))];
        dispatch({ type: "RESET", trip: { ...cp.trip, thread } });
        if (i < checkpoints.length - 1) await sleep(650);
      }
    } catch (err) {
      // Public demo rate limiting (ported from v2): a concise, calm message
      // — never the generic error path — and the user's trip so far is
      // left untouched; they can just try again shortly.
      const message =
        err instanceof RateLimitError ? err.message : "Something went wrong reaching the model — try again?";
      dispatch({
        type: "ADD_MESSAGE",
        message: { id: newId(), from: "agent", message },
      });
      dispatch({ type: "SET_AGENT", agent: { working: false, phase: "awaiting_user" } });
      if (!(err instanceof RateLimitError)) console.error(err);
    } finally {
      setBusy(false);
    }
  }

  function handleRemoveRequirement(requirementId: string) {
    void applyEvent(removeTripRequirement(trip, requirementId, now));
  }

  const held = trip.bookings.some((b) => b.status === "held");
  const needsYou = trip.needsYouQueue[0];

  function resolveNeedsYou(choice: "primary" | "secondary") {
    if (!needsYou) return;
    if (needsYou.kind === "forecast_move" && choice === "primary") {
      void applyEvent(resolveForecastDecision(trip, needsYou.id, true, now));
    } else if (needsYou.kind === "hold_expired" && choice === "primary") {
      void applyEvent(resolveHoldExpiryRehold(trip, needsYou.id, needsYou.payload?.bookingId ?? "", now));
    } else if (needsYou.kind === "campsite_unavailable" && choice === "primary") {
      void applyEvent(resolveCampsiteUnavailableHold(trip, needsYou.id, needsYou.payload?.campsiteId ?? "", now));
    } else if (needsYou.kind === "no_match" && choice === "primary") {
      void applyEvent(widenTripSearch(trip, now));
    } else if ((needsYou.kind === "campsite_unavailable" || needsYou.kind === "no_match") && choice === "secondary") {
      setView("campsite-options");
    } else if (needsYou.kind === "forecast_move" && choice === "secondary") {
      setView("pontoon-times");
    }
  }

  function handleChoosePontoonSlot(slotIndex: number) {
    if (!needsYou) return;
    void applyEvent(choosePontoonSlot(trip, needsYou.id, slotIndex, now));
    setView("plan");
  }

  function handleHoldSpecificCampsite(campsiteId: string) {
    void applyEvent(holdSpecificCampsite(trip, campsiteId, now));
    setView("plan");
  }

  function handleClarifyingOption(option: string) {
    void handleSubmit(option);
  }

  function handleRemove(bookingId: string) {
    dispatch({ type: "RESET", trip: removeBooking(trip, bookingId, now) });
  }

  function handleSavePayment(label: string) {
    dispatch({ type: "SET_AUTHORIZATION", authorization: { paymentMethodLabel: label } });
  }

  function handleCommit() {
    if (!trip.authorization.paymentMethodLabel) return;
    const result = commitBooking(trip, trip.authorization.paymentMethodLabel, now);
    if (!result.ok) {
      setCommitError(result.reason);
      return;
    }
    setCommitError(null);
    dispatch({
      type: "RESET",
      trip: {
        ...result.trip,
        thread: [
          ...result.trip.thread,
          {
            id: newId(),
            from: "agent",
            message: `You're all set — every item is confirmed and charged to ${result.trip.authorization.paymentMethodLabel}.`,
          },
        ],
      },
    });
  }

  const factChips = tripFactChips(trip.intent);
  const bookedCount = trip.bookings.filter((b) => BOOKED_OR_HELD(b.status)).length;
  const total = tripTotal(trip.bookings.filter((b) => BOOKED_OR_HELD(b.status)));
  const offeredSuggestion = trip.suggestions.find((s) => s.state === "offered");

  function handleAcceptSuggestion(suggestionId: string) {
    const { trip: nextTrip, factsToPhrase } = acceptSuggestion(trip, suggestionId, now);
    void applyEvent({ trip: nextTrip, factsToPhrase });
  }

  function handleDismissSuggestion(suggestionId: string) {
    dispatch({ type: "RESET", trip: dismissSuggestion(trip, suggestionId) });
  }

  // Start · Empty (Handoff Spec §4.1 node 5:64): before the first message,
  // show the real designed landing page, not a bare composer.
  if (trip.thread.length === 0) {
    return <LandingHero onSubmit={handleSubmit} busy={busy} />;
  }

  if (trip.authorization.approved) {
    return (
      <TripShell
        chargeStatus={`Booked · ${formatUsd(total)} charged`}
        onNavigate={handleNavigate}
        agent={{ state: "working", title: "Trip booked", detail: "Every item is confirmed" }}
        thread={trip.thread.map((m) => ({ from: m.from, message: m.message }))}
        approveBar={
          <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--color-bg-inverse)] px-5 py-4">
            <p className="text-label-l text-[var(--color-text-on-inverse)]">
              {bookedCount} bookings confirmed · charged to {trip.authorization.paymentMethodLabel}
            </p>
          </div>
        }
      >
        <Itinerary title="Your bookings" bookings={trip.bookings} />
      </TripShell>
    );
  }

  if (view === "review") {
    return (
      <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
        <div className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <TopNav active="Trips" chargeStatus="Nothing charged yet" onNavigate={handleNavigate} />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
          <div className="space-y-2">
            <h1 className="text-heading-l text-[var(--color-text-primary)]">Review and approve</h1>
            <CommitNote message="Approving books every item below and charges your card. Nothing happens until you approve." />
          </div>

          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-2">
            {trip.bookings.map((booking) => (
              <ReviewLineItem
                key={booking.id}
                title={`${bookingKindLabel(booking.kind)} · ${booking.title}`}
                when={`${booking.day}${booking.time ? ` · ${booking.time}` : ""}`}
                terms={booking.refundTerms}
                tags={booking.kind === "campsite" ? campsiteCharacteristicTags(evaluateCampsites(toV2SearchIntent(trip.intent)), booking.refId, trip.intent) : undefined}
                flag={booking.changeNote}
                amount={`$${booking.price}`}
                onRemove={() => handleRemove(booking.id)}
              />
            ))}
            {trip.bookings.length === 0 && (
              <p className="p-4 text-body-m text-[var(--color-text-secondary)]">Nothing left to review.</p>
            )}
          </div>

          <SummaryRow label="Total" value={formatUsd(total)} />

          {trip.authorization.paymentMethodLabel ? (
            <div className="flex items-center justify-between">
              <SummaryRow label="Payment method" value={trip.authorization.paymentMethodLabel} />
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_AUTHORIZATION", authorization: { paymentMethodLabel: null } })}
                className="text-label-s text-[var(--color-text-link)] hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <PaymentForm onSave={handleSavePayment} />
          )}

          {/* What happens on approval (PRD v3 §12 Transparency: the user
              must be able to distinguish what's held from the consequential
              action that hasn't happened yet). */}
          <div className="space-y-1 rounded-xl bg-[var(--color-bg-canvas)] px-4 py-3 text-body-s text-[var(--color-text-secondary)]">
            <p className="text-label-m text-[var(--color-text-primary)]">When you book</p>
            <p>· CampOps confirms {bookedCount === 1 ? "the" : `all ${bookedCount}`} booking{bookedCount === 1 ? "" : "s"} with each provider.</p>
            <p>
              · Your {trip.authorization.paymentMethodLabel || "payment method"} is charged {formatUsd(total)}
              {bookedCount === 1 ? "." : `, as ${bookedCount} separate charges.`}
            </p>
            <p>· Confirmations arrive by email. Each item keeps the refund terms above.</p>
          </div>

          {commitError && <p className="text-body-s text-[var(--color-status-attention)]">{commitError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="large"
              label={`Book ${bookedCount} items · charge ${formatUsd(total)}`}
              onClick={handleCommit}
              disabled={!trip.authorization.paymentMethodLabel || bookedCount === 0}
            />
            <Button variant="ghost" label="Back" onClick={() => setView("plan")} />
          </div>
        </div>
      </div>
    );
  }

  if (view === "campsite-options") {
    // "Other Campsite Options" (PRD v3 §5.3 "request alternatives"): every
    // ranked candidate at once, each with its real kept/traded-off fit, so
    // the user compares before picking rather than cycling one at a time.
    const result = evaluateCampsites(toV2SearchIntent(trip.intent));
    const heldCampsite = trip.bookings.find((b) => b.kind === "campsite" && b.status === "held");
    // "No match" still returns every site, ranked, for transparency (see
    // evaluateCampsites's own doc comment) — cap the list the same way
    // regardless of kind, so this never dumps the whole dataset.
    const candidates = result.candidates.slice(0, 4);
    return (
      <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
        <div className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <TopNav active="Trips" chargeStatus="Nothing charged yet" onNavigate={handleNavigate} />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
          <h1 className="text-heading-l text-[var(--color-text-primary)]">Other campsite options</h1>
          <p className="text-body-s text-[var(--color-text-secondary)]">
            Open {trip.intent.checkIn || "Apr 16"} to {trip.intent.checkOut || "Apr 18"}, sorted by fit.
            {heldCampsite ? ` ${heldCampsite.title} is still my pick.` : ""}
          </p>
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <CampsiteOption
                key={candidate.campsite.id}
                state={candidate.campsite.id === heldCampsite?.refId ? "recommended" : "alternative"}
                eyebrow={candidate.campsite.id === heldCampsite?.refId ? "Current pick" : "Alternative"}
                title={`${candidate.campsite.campgroundName} · ${candidate.campsite.siteName}`}
                facts={[`$${candidate.campsite.pricePerNight}/night`]}
                fit={buildCandidateFit(result, candidate.campsite.id, trip.intent)}
                reason={candidate.explanation}
                actions={
                  candidate.campsite.id === heldCampsite?.refId
                    ? undefined
                    : [{ label: "Hold this site", variant: "primary", onClick: () => handleHoldSpecificCampsite(candidate.campsite.id) }]
                }
              />
            ))}
            {candidates.length === 0 && (
              <p className="text-body-m text-[var(--color-text-secondary)]">No campsites currently answer this search.</p>
            )}
          </div>
          <Button variant="ghost" label="Back to trip" onClick={() => setView("plan")} />
        </div>
      </div>
    );
  }

  if (view === "pontoon-times") {
    // Pontoon · Other Times (Figma node 36:1610) — every open slot, with
    // its own tradeoff against the storm, not just the keep/revert
    // shortcut resolveForecastDecision's primary button already covers.
    const pontoon = ACTIVITIES_BY_ID["lakeshore-pontoon"];
    return (
      <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
        <div className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <TopNav active="Trips" chargeStatus="Nothing charged yet" onNavigate={handleNavigate} />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
          <h1 className="text-heading-l text-[var(--color-text-primary)]">Pontoon · other times</h1>
          <p className="text-body-s text-[var(--color-text-secondary)]">
            Open times at Lakeshore Marina that miss the storm. Same boat, ${pontoon.price}, full refund up to 24 hours before.
          </p>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
            {pontoon.slots.map((slot, i) => {
              const tradeoff = PONTOON_SLOT_TRADEOFFS[i];
              return (
                <div key={`${slot.date}-${slot.startTime}`} className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] py-4 last:border-b-0">
                  <div>
                    <p className="text-label-l text-[var(--color-text-primary)]">
                      {slot.date} · {slot.startTime} to {slot.endTime}
                    </p>
                    <p className="text-body-s text-[var(--color-text-secondary)]">{tradeoff?.detail ?? ""}</p>
                  </div>
                  <Button
                    variant={i === 0 ? "secondary" : "primary"}
                    label={tradeoff?.keepLabel ?? "Choose"}
                    onClick={() => handleChoosePontoonSlot(i)}
                  />
                </div>
              );
            })}
          </div>
          <Button variant="ghost" label="Back to trip" onClick={() => setView("plan")} />
        </div>
      </div>
    );
  }

  if (view === "activity") {
    const permissionLabel = (id: string | null) => trip.permissions.find((p) => p.id === id)?.label ?? "You approved";
    const matchesFilter = (kind: TripEventKind | undefined, actor: string) => {
      if (activityFilter === "All") return true;
      if (activityFilter === "Your decisions") return actor === "You";
      if (activityFilter === "Holds") return kind === "hold";
      if (activityFilter === "Changes") return kind === "change";
      return kind === "search";
    };
    const charged = tripTotal(trip.bookings.filter((b) => b.status === "approved"));
    const heldTotal = tripTotal(trip.bookings.filter((b) => b.status === "held" || b.status === "changed_needs_ok"));
    return (
      <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
        <div className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <TopNav active="Activity" chargeStatus="Nothing charged yet" onNavigate={handleNavigate} />
        </div>
        <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-10">
          <h1 className="text-heading-l text-[var(--color-text-primary)]">Activity</h1>
          <div className="flex flex-wrap gap-2">
            {(["All", "Your decisions", "Holds", "Changes", "Searches"] as const).map((label) => (
              <FilterChip key={label} label={label} selected={activityFilter === label} onClick={() => setActivityFilter(label)} />
            ))}
          </div>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
            {trip.events.filter((e) => matchesFilter(e.kind, e.actor)).map((event) => (
              <ActivityLogRow
                key={event.id}
                time={new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                what={event.what}
                rule={event.permissionId ? permissionLabel(event.permissionId) : "You approved"}
                actor={event.actor}
                details={event.details}
              />
            ))}
            {trip.events.length === 0 && (
              <p className="py-4 text-body-s text-[var(--color-text-secondary)]">Nothing recorded yet.</p>
            )}
          </div>
          <div className="space-y-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
            <SummaryRow label="Charged" value={formatUsd(charged)} />
            <SummaryRow label="Held, free to cancel" value={formatUsd(heldTotal)} />
            {needsYou && <SummaryRow label="Waiting on you" value={needsYou.eyebrow} />}
          </div>
          <div className="space-y-2">
            <h2 className="text-heading-m text-[var(--color-text-primary)]">What this trip touched</h2>
            <ul className="space-y-1 text-body-s text-[var(--color-text-secondary)]">
              {trip.bookings.map((b) => (
                <li key={b.id}>
                  {b.title} — {b.status === "approved" ? "Approved" : b.status === "held" ? "Held" : b.status}
                </li>
              ))}
              {trip.bookings.length === 0 && <li>Nothing yet.</li>}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" label="Review permissions" onClick={() => setView("permissions")} />
            <Button variant="ghost" label="Back to trip" onClick={() => setView("plan")} />
          </div>
        </div>
      </div>
    );
  }

  if (view === "permissions") {
    return (
      <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
        <div className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <TopNav active="Permissions" chargeStatus="Nothing charged yet" onNavigate={handleNavigate} />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
          <h1 className="text-heading-l text-[var(--color-text-primary)]">Permissions</h1>
          <p className="text-body-m text-[var(--color-text-secondary)]">
            What CampOps may do on its own. Changes apply to its next action.
          </p>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
            {trip.permissions.map((permission) => (
              <PermissionRow
                key={permission.id}
                title={permission.label}
                description={permission.description}
                control={permission.locked ? "locked" : permission.enabled ? "on" : "off"}
                onChange={(next) => dispatch({ type: "SET_PERMISSION", permissionId: permission.id, enabled: next })}
                limits={
                  permission.limitUsd != null ? (
                    <SelectField
                      value={String(permission.limitUsd)}
                      options={[
                        { label: "$200 limit · this trip", value: "200" },
                        { label: "$300 limit · this trip", value: "300" },
                        { label: "$400 limit · this trip", value: "400" },
                      ]}
                      onChange={(value) =>
                        dispatch({ type: "SET_PERMISSION_LIMIT", permissionId: permission.id, limitUsd: Number(value) })
                      }
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
          <Button variant="ghost" label="Back to trip" onClick={() => setView("plan")} />
        </div>
      </div>
    );
  }

  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      onNavigate={handleNavigate}
      agent={{
        state: trip.agent.paused ? "paused" : trip.agent.working || trip.agent.phase === "complete" ? "working" : "waiting",
        title: trip.agent.paused
          ? "Paused"
          : trip.agent.phase === "complete"
            ? "Everything is held"
            : trip.agent.working
              ? "CampOps is working"
              : "Waiting on you",
        detail: trip.agent.paused
          ? "No new actions until you resume"
          : trip.plan.length > 0
            ? `${trip.plan.filter((s) => s.status === "done").length} of ${trip.plan.length} arranged${trip.agent.currentStepText ? ` · ${trip.agent.currentStepText}` : ""}`
            : trip.agent.currentStepText || "Tell CampOps about your trip",
        onPause: () => dispatch({ type: "SET_AGENT", agent: { paused: true } }),
        onResume: () => dispatch({ type: "SET_AGENT", agent: { paused: false } }),
      }}
      needsYou={
        needsYou
          ? {
              eyebrow: needsYou.eyebrow,
              message: needsYou.message,
              primary: { label: needsYou.primaryLabel, onClick: () => resolveNeedsYou("primary") },
              secondary: needsYou.secondaryLabel ? { label: needsYou.secondaryLabel, onClick: () => resolveNeedsYou("secondary") } : undefined,
            }
          : undefined
      }
      thread={trip.thread.map((m) => ({ from: m.from, message: m.message }))}
      threadFooter={
        trip.clarifyingQuestion ? (
          <ClarifyingQuestion
            question={trip.clarifyingQuestion.question}
            options={trip.clarifyingQuestion.options}
            onSelect={handleClarifyingOption}
          />
        ) : undefined
      }
      approveBar={held ? <ApproveBar amount={`${formatUsd(tripTotal(trip.bookings))} total`} summary="Nothing charged yet" onReview={() => setView("review")} /> : undefined}
      onReview={() => setView("review")}
      onComposerSubmit={busy || trip.agent.paused ? undefined : handleSubmit}
    >
      {trip.campsiteComparison && (
        <div className="space-y-3">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">Your campsite</h2>
          <p className="text-body-s text-[var(--color-text-secondary)]">What changed, and what the replacement keeps and trades off.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {trip.campsiteComparison.lost && (
              <CampsiteOption
                state="unavailable"
                eyebrow={trip.campsiteComparison.lost.eyebrow}
                title={trip.campsiteComparison.lost.title}
                facts={trip.campsiteComparison.lost.facts}
                fit={trip.campsiteComparison.lost.fit}
                reason={trip.campsiteComparison.lost.reason}
              />
            )}
            <CampsiteOption
              state={trip.campsiteComparison.lost ? "recommended" : "closest"}
              eyebrow={trip.campsiteComparison.recommended.eyebrow}
              title={trip.campsiteComparison.recommended.title}
              facts={trip.campsiteComparison.recommended.facts}
              badge={trip.campsiteComparison.recommended.badge}
              fit={trip.campsiteComparison.recommended.fit}
              reason={trip.campsiteComparison.recommended.reason}
            />
          </div>
        </div>
      )}
      {(factChips.length > 0 || trip.intent.requirements.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">What I heard</h2>
          <div className="flex flex-wrap gap-2">
            {factChips.map((label) => (
              <RequirementChip key={label} type="mustHave" label={label} />
            ))}
            {trip.intent.requirements.map((r) => (
              <RequirementChip
                key={r.id}
                type={r.changed ? "changed" : r.tier === "must" ? "mustHave" : "niceToHave"}
                label={r.label}
                onClick={() => handleRemoveRequirement(r.id)}
              />
            ))}
          </div>
        </div>
      )}
      {/* Stays visible until every step is done — not just until the FIRST
          booking holds (PRD v3 §5.2 "communicate meaningful progress...
          including which part of the plan is in progress"): the campsite
          holding doesn't mean the activities after it are done too. */}
      {trip.plan.length > 0 && !trip.plan.every((s) => s.status === "done") && (
        <div className="space-y-3">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">My plan</h2>
          <div className="space-y-1">
            {trip.plan.map((step, i) => (
              <PlanStep key={step.id} index={i + 1} step={step.label} detail={step.detail} state={step.status} />
            ))}
          </div>
        </div>
      )}
      {trip.bookings.length > 0 ? (
        <Itinerary bookings={trip.bookings} onRelease={handleRemove} />
      ) : trip.intent.requirements.length === 0 ? (
        <p className="text-body-m text-[var(--color-text-secondary)]">
          Tell CampOps about your trip below — dates, dealbreakers, tradeoffs you&apos;re willing to make.
        </p>
      ) : null}
      {offeredSuggestion &&
        (() => {
          if (offeredSuggestion.target.kind === "addon") {
            const addOn = ADD_ONS.find((a) => a.id === offeredSuggestion.target.id);
            if (!addOn) return null;
            return (
              <SuggestionCard
                title={`${addOn.name} · $${addOn.price}`}
                reason={offeredSuggestion.reason}
                source={offeredSuggestion.source}
                onAdd={() => handleAcceptSuggestion(offeredSuggestion.id)}
                onDismiss={() => handleDismissSuggestion(offeredSuggestion.id)}
              />
            );
          }
          const activity = ACTIVITIES_BY_ID[offeredSuggestion.target.id];
          if (!activity) return null;
          const provider = providerForActivity(activity);
          return (
            <SuggestionCard
              title={`${activity.name} · $${activity.price}`}
              reason={offeredSuggestion.reason}
              source={offeredSuggestion.source}
              photo={photoSrc(activity.photoKey ?? provider.photoKey ?? "hero")}
              onAdd={() => handleAcceptSuggestion(offeredSuggestion.id)}
              onDismiss={() => handleDismissSuggestion(offeredSuggestion.id)}
            />
          );
        })()}
      {busy && <p className="text-body-s text-[var(--color-text-tertiary)]">Working…</p>}
      <DemoPanel
        onFireForecast={() => void applyEvent(fireForecastChange(trip, now))}
        onFireHoldExpiry={() => {
          const trailRide = trip.bookings.find((b) => b.refId === "hcr-beginner-trail" && b.status === "held");
          if (trailRide) void applyEvent(fireHoldExpiry(trip, trailRide.id, now));
        }}
        onFireCampsiteUnavailable={() => void applyEvent(fireCampsiteUnavailable(trip, "cedar-point-3", now))}
        onReset={() => {
          setView("plan");
          setCommitError(null);
          dispatch({ type: "RESET", trip: emptyTrip() });
        }}
      />
    </TripShell>
  );
}

export default function LiveTripPage() {
  return (
    <ClockProvider>
      <TripProvider initialTrip={emptyTrip()}>
        <LiveTripPlan />
      </TripProvider>
    </ClockProvider>
  );
}
