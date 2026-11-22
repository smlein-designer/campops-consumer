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
import { formatUsd, tripTotal } from "@/lib/v3/money";
import type { Trip } from "@/lib/v3/schemas";

function LiveTripPlan() {
  const { trip, dispatch } = useTrip();
  const { now } = useClock();
  const [busy, setBusy] = useState(false);

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
      approveBar={held ? <ApproveBar amount={`${formatUsd(tripTotal(trip.bookings))} total`} summary="Nothing charged yet" /> : undefined}
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
        onReset={() => dispatch({ type: "RESET", trip: emptyTrip() })}
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
