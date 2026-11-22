"use client";

// The live Trip Plan (Build Order stage 6) — the real agent loop, wired to
// the actual store and the shared clock, instead of stage 4's static
// fixtures. /trip itself stays on fixtures as the Figma-comparison
// reference; this route is where the agent actually runs.
import { useState } from "react";
import { ClockProvider, useClock } from "@/lib/v3/clock";
import { TripProvider, useTrip } from "@/lib/v3/store";
import { emptyTrip } from "@/lib/v3/trip-factory";
import { fetchPhrasing, runAgentTurn } from "@/lib/v3/agent-loop";
import {
  fireCampsiteUnavailable,
  fireForecastChange,
  fireHoldExpiry,
  resolveCampsiteUnavailableHold,
  resolveForecastDecision,
  resolveHoldExpiryRehold,
  type ScriptedEventResult,
} from "@/lib/v3/scripted-events";
import { newId } from "@/lib/id";
import { TripShell } from "@/components/v3/trip-shell";
import { Itinerary } from "@/components/v3/itinerary";
import { ApproveBar } from "@/components/v3/approve-bar";
import { DemoPanel } from "@/components/v3/demo-panel";
import { TopNav } from "@/components/v3/top-nav";
import { ReviewLineItem } from "@/components/v3/review-line-item";
import { SummaryRow } from "@/components/v3/summary-row";
import { CommitNote } from "@/components/v3/commit-note";
import { Button } from "@/components/v3/button";
import { PaymentForm } from "@/components/v3/payment-form";
import { bookingKindLabel } from "@/lib/v3/booking-display";
import { commitBooking, removeBooking } from "@/lib/v3/authorize";
import { formatUsd, tripTotal } from "@/lib/v3/money";
import type { Trip } from "@/lib/v3/schemas";

const BOOKED_OR_HELD = (status: Trip["bookings"][number]["status"]) => status === "held" || status === "changed_needs_ok";

function LiveTripPlan() {
  const { trip, dispatch } = useTrip();
  const { now } = useClock();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"plan" | "review">("plan");
  const [commitError, setCommitError] = useState<string | null>(null);

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
    setBusy(true);
    dispatch({ type: "SET_AGENT", agent: { working: true, phase: "interpreting", currentStepText: "Reading your message" } });
    try {
      const { trip: nextTrip, factsToPhrase } = await runAgentTurn(trip, message, now);
      const agentLines = await fetchPhrasing(factsToPhrase);
      dispatch({
        type: "RESET",
        trip: {
          ...nextTrip,
          thread: [
            ...trip.thread,
            { id: newId(), from: "user", message },
            ...agentLines.map((line) => ({ id: newId(), from: "agent" as const, message: line })),
          ],
        },
      });
    } catch (err) {
      dispatch({
        type: "ADD_MESSAGE",
        message: { id: newId(), from: "agent", message: "Something went wrong reaching the model — try again?" },
      });
      dispatch({ type: "SET_AGENT", agent: { working: false, phase: "awaiting_user" } });
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  const held = trip.bookings.some((b) => b.status === "held");
  const needsYou = trip.needsYouQueue[0];

  function resolveNeedsYou(choice: "primary" | "secondary") {
    if (!needsYou) return;
    if (needsYou.kind === "forecast_move") {
      void applyEvent(resolveForecastDecision(trip, needsYou.id, choice === "primary", now));
    } else if (needsYou.kind === "hold_expired" && choice === "primary") {
      void applyEvent(resolveHoldExpiryRehold(trip, needsYou.id, needsYou.payload?.bookingId ?? "", now));
    } else if (needsYou.kind === "campsite_unavailable" && choice === "primary") {
      void applyEvent(resolveCampsiteUnavailableHold(trip, needsYou.id, needsYou.payload?.campsiteId ?? "", now));
    }
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

  const bookedCount = trip.bookings.filter((b) => BOOKED_OR_HELD(b.status)).length;
  const total = tripTotal(trip.bookings.filter((b) => BOOKED_OR_HELD(b.status)));

  if (trip.authorization.approved) {
    return (
      <TripShell
        chargeStatus={`Booked · ${formatUsd(total)} charged`}
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
          <TopNav active="Trips" chargeStatus="Nothing charged yet" />
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
            <SummaryRow label="Payment method" value={trip.authorization.paymentMethodLabel} />
          ) : (
            <PaymentForm onSave={handleSavePayment} />
          )}

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

  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{
        state: trip.agent.working ? "working" : trip.agent.phase === "complete" ? "working" : "waiting",
        title: trip.agent.phase === "complete" ? "Everything is held" : trip.agent.working ? "Working" : "Waiting on you",
        detail: trip.agent.currentStepText || "Tell CampOps about your trip",
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
      approveBar={held ? <ApproveBar amount={`${formatUsd(tripTotal(trip.bookings))} total`} summary="Nothing charged yet" onReview={() => setView("review")} /> : undefined}
      onReview={() => setView("review")}
      onComposerSubmit={busy ? undefined : handleSubmit}
    >
      {trip.bookings.length > 0 ? (
        <Itinerary bookings={trip.bookings} />
      ) : (
        <p className="text-body-m text-[var(--color-text-secondary)]">
          Tell CampOps about your trip below — dates, dealbreakers, tradeoffs you&apos;re willing to make.
        </p>
      )}
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
