"use client";

import { useRef, useState } from "react";
import { Header } from "@/components/campops/header";
import { Composer, COMPOSER_INPUT_ID } from "@/components/campops/composer";
import { ChatBubble, ChatRow } from "@/components/campops/chat-bubble";
import { RequirementChip } from "@/components/campops/requirement-chip";
import { CandidateCard } from "@/components/campops/candidate-card";
import { AttentionCard } from "@/components/campops/attention-card";
import { ReservationReview } from "@/components/campops/reservation-review";
import { AuthorizeBookingDialog } from "@/components/campops/authorize-booking-dialog";
import { EventRow } from "@/components/campops/event-row";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/typography";
import { evaluateCampsites } from "@/lib/evaluate";
import { buildRecoveryMessages } from "@/lib/recovery";
import { summarizeNoMatch, widenSearch } from "@/lib/no-match";
import {
  computeMissingFields,
  stageReservation,
  transitionReservation,
} from "@/lib/reservation";
import {
  deriveAlternativeRequestedEvent,
  deriveAvailabilityChangedEvent,
  deriveCandidateExcludedEvent,
  deriveClarificationRequestedEvent,
  deriveClarificationResolvedEvent,
  deriveEvaluationPerformedEvent,
  deriveIntentEvent,
  deriveRecommendationAcceptedEvent,
  deriveRecommendationRejectedEvent,
  deriveRecommendationSelectedEvent,
  deriveReplacementSelectedEvent,
  deriveRequirementWidenedEvent,
  deriveTaskClosedEvent,
  deriveUnsupportedEvent,
} from "@/lib/events";
import {
  EMPTY_TRIP_INTENT,
  type EvaluationResult,
  type IntentInterpretation,
  type Reservation,
  type RequirementTier,
  type TaskEvent,
  type TripIntent,
} from "@/lib/schemas";

type AttentionType = "clarification" | "unsupported" | "no_match";

type ChatEntry =
  | { id: string; kind: "chat"; sender: "user" | "agent"; text: string }
  | {
      id: string;
      kind: "attention";
      attentionType: AttentionType;
      eyebrow: string;
      body: string;
      quickReplies?: string[];
    };

type View = "search" | "reservation" | "closing" | "activity";

// Simulated commit delay for the "authorizing" state (Handoff Spec §5's
// Pressed/Loading requirement) — purely cosmetic; the resulting state
// transition itself is deterministic regardless of this duration.
const AUTHORIZE_DELAY_MS = 600;

const TIER_SECTIONS: {
  key: keyof TripIntent;
  label: string;
  tier: RequirementTier;
}[] = [
  { key: "hardRequirements", label: "Hard requirements", tier: "hard" },
  {
    key: "flexibleConstraints",
    label: "Flexible constraints",
    tier: "flexible",
  },
  { key: "preferences", label: "Preferences", tier: "preference" },
  { key: "priorities", label: "Priorities", tier: "priority" },
];

function agentSummary(evaluation: EvaluationResult): string {
  const top = evaluation.candidates[0];
  if (evaluation.kind === "full" && top) {
    return `Got it. Based on what you've told me, ${top.campsite.siteName} at ${top.campsite.campgroundName} looks like the strongest fit.`;
  }
  if (evaluation.kind === "compromise" && top) {
    return `I couldn't find an exact match, but ${top.campsite.siteName} at ${top.campsite.campgroundName} is the closest option — I've flagged what I couldn't confirm.`;
  }
  return "Nothing in the current dataset satisfies every requirement you've given me. You can widen a requirement or ask me to try something different.";
}

function newId() {
  return crypto.randomUUID();
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const CLOSING_MESSAGE =
  "No worries — nothing was booked or searched further. Feel free to start a new trip anytime.";

export default function Home() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState<TripIntent>(EMPTY_TRIP_INTENT);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  // Deterministic app/tool state — sites a scripted availability check has
  // marked unavailable. Never populated from a model response.
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Task-local flags driving event derivation, not display — reset with the
  // rest of task state on "Start a new search".
  const [pendingClarification, setPendingClarification] = useState(false);
  const [tripEstablished, setTripEstablished] = useState(false);

  const [view, setView] = useState<View>("search");
  const [reservation, setReservationState] = useState<Reservation | null>(null);
  // Mirrors `reservation` for the timeout callback below, which needs the
  // freshest value without relying on a functional setState updater (which
  // React's Strict Mode may invoke twice in development — fine for a pure
  // reducer, not fine for one that also pushes an event as a side effect).
  const reservationRef = useRef<Reservation | null>(null);
  // Guards the simulated authorize delay: cleared on cancel/unmount so a
  // stray AUTHORIZE can never fire after the user has already backed out.
  const authorizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hasStarted = messages.length > 0;
  const activeCandidate = evaluation?.candidates[candidateIndex] ?? null;
  const showCandidateCard =
    !!activeCandidate && evaluation?.kind !== "no_match";
  const canRequestAlternative =
    !!evaluation && candidateIndex + 1 < evaluation.candidates.length;

  function updateReservation(next: Reservation | null) {
    reservationRef.current = next;
    setReservationState(next);
  }

  function pushChat(sender: "user" | "agent", msg: string) {
    setMessages((prev) => [
      ...prev,
      { id: newId(), kind: "chat", sender, text: msg },
    ]);
  }

  function pushAttention(
    attentionType: AttentionType,
    eyebrow: string,
    body: string,
    quickReplies?: string[],
  ) {
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        kind: "attention",
        attentionType,
        eyebrow,
        body,
        quickReplies,
      },
    ]);
  }

  function pushEvent(event: TaskEvent | null) {
    if (!event) return;
    setEvents((prev) => [...prev, event]);
  }

  /** Renders either a normal agent chat summary or a No Match Attention Card, per the evaluation's kind. */
  function announceEvaluation(result: EvaluationResult) {
    if (result.kind === "no_match") {
      pushAttention(
        "no_match",
        "No exact match found",
        summarizeNoMatch(result),
      );
    } else {
      pushChat("agent", agentSummary(result));
    }
  }

  async function submitMessage(rawText: string) {
    const userMessage = rawText.trim();
    if (!userMessage) return;

    const priorIntent = intent;
    const wasPendingClarification = pendingClarification;

    pushChat("user", userMessage);
    setDraft("");
    setIsWorking(true);
    setError(null);

    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, priorIntent }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Intent interpretation failed.");

      const interpretation: IntentInterpretation = data.interpretation;

      if (interpretation.status === "unsupported") {
        // Deterministic guard: an unsupported turn must never touch the
        // active camping intent, regardless of what the model returned —
        // enforced here in code, not merely assumed from prompt behavior.
        pushEvent(deriveUnsupportedEvent());
        pushAttention(
          "unsupported",
          "Outside what I can help with",
          interpretation.unsupported?.reason ??
            "That's outside what this CampOps POC can do.",
        );
        return;
      }

      if (wasPendingClarification) {
        pushEvent(deriveClarificationResolvedEvent());
        setPendingClarification(false);
      }

      const intentEvent = deriveIntentEvent(
        priorIntent,
        interpretation.intent,
        tripEstablished,
      );
      if (intentEvent) {
        pushEvent(intentEvent);
        if (intentEvent.type === "trip_established") setTripEstablished(true);
      }
      setIntent(interpretation.intent);

      if (interpretation.status === "needs_clarification") {
        const question =
          interpretation.clarification?.question ??
          "Could you tell me a bit more about your trip?";
        pushEvent(deriveClarificationRequestedEvent(question));
        pushAttention(
          "clarification",
          "Needs your input",
          question,
          interpretation.clarification?.quickReplies,
        );
        setPendingClarification(true);
        return;
      }

      // actionable
      pushEvent(deriveEvaluationPerformedEvent(unavailableIds));
      const result = evaluateCampsites(interpretation.intent, unavailableIds);
      setEvaluation(result);
      setCandidateIndex(0);
      pushEvent(deriveRecommendationSelectedEvent(result));
      announceEvaluation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      pushChat(
        "agent",
        "Something went wrong while interpreting that — please try again.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  function handleSubmit() {
    void submitMessage(draft);
  }

  function handleQuickReply(reply: string) {
    void submitMessage(reply);
  }

  function handleContinueUnsupported() {
    pushChat("agent", "Continuing with your search.");
  }

  /** Unsupported "Never mind" and No Match decline — no recommendation existed to reject. */
  function handleDecline() {
    pushEvent(deriveTaskClosedEvent("declined"));
    setView("closing");
  }

  /** Candidate Reject — an actual recommendation was on the table. */
  function handleRejectCandidate() {
    pushEvent(deriveRecommendationRejectedEvent());
    pushEvent(deriveTaskClosedEvent("declined"));
    setView("closing");
  }

  function handleWidenSearch() {
    if (!evaluation || evaluation.kind !== "no_match") return;
    const { intent: widenedIntent, widened } = widenSearch(intent, evaluation);
    if (!widened) return;

    pushEvent(deriveRequirementWidenedEvent(widened));
    setIntent(widenedIntent);

    pushEvent(deriveEvaluationPerformedEvent(unavailableIds));
    const result = evaluateCampsites(widenedIntent, unavailableIds);
    setEvaluation(result);
    setCandidateIndex(0);
    pushChat(
      "agent",
      `I widened the search — "${widened}" is now flexible instead of required.`,
    );
    pushEvent(deriveRecommendationSelectedEvent(result));
    announceEvaluation(result);
  }

  function handleChangeRequirement() {
    document.getElementById(COMPOSER_INPUT_ID)?.focus();
  }

  /**
   * Scripted, deterministic availability-loss trigger (Build Brief §13's
   * "developer/demo control" option) — never derived from the model. Marks
   * the currently active candidate unavailable, re-evaluates the remaining
   * set against the SAME (unmutated) TripIntent, and presents the loss and
   * the adapted pick together as two agent messages in one interaction.
   */
  function handleSimulateAvailabilityLoss() {
    if (!activeCandidate) return;
    const lost = activeCandidate;

    pushEvent(deriveAvailabilityChangedEvent(lost));
    pushEvent(deriveCandidateExcludedEvent(lost));

    const nextUnavailable = new Set(unavailableIds);
    nextUnavailable.add(lost.campsite.id);
    setUnavailableIds(nextUnavailable);

    pushEvent(deriveEvaluationPerformedEvent(nextUnavailable));
    const adapted = evaluateCampsites(intent, nextUnavailable);
    setEvaluation(adapted);
    setCandidateIndex(0);
    pushEvent(deriveReplacementSelectedEvent(adapted, 0));

    const { lossMessage, adaptedMessage } = buildRecoveryMessages(
      lost,
      adapted,
    );
    setMessages((prev) => [
      ...prev,
      { id: newId(), kind: "chat", sender: "agent", text: lossMessage },
      { id: newId(), kind: "chat", sender: "agent", text: adaptedMessage },
    ]);
  }

  /**
   * Accept stages a real Reservation from deterministic application state
   * (the accepted Candidate's campsite + the current TripIntent's guest
   * count) and switches to the Reservation Review screen — not a chat
   * acknowledgment standing in for booking state.
   */
  function handleAccept() {
    if (!activeCandidate) return;
    pushEvent(deriveRecommendationAcceptedEvent(activeCandidate));
    const { reservation: staged, event } = stageReservation(
      activeCandidate.campsite,
      intent.guestCount,
    );
    updateReservation(staged);
    pushEvent(event);
    setView("reservation");
  }

  function handleRequestAlternative() {
    if (!canRequestAlternative || !evaluation) return;
    pushEvent(deriveAlternativeRequestedEvent());
    const nextIndex = candidateIndex + 1;
    setCandidateIndex(nextIndex);
    pushEvent(deriveReplacementSelectedEvent(evaluation, nextIndex));
  }

  function handleReserveAttempt() {
    if (!reservation) return;
    const { reservation: next, event } = transitionReservation(reservation, {
      type: "RESERVE_ATTEMPT",
    });
    updateReservation(next);
    pushEvent(event);
  }

  function handleAddPaymentMethod() {
    // Mocked payment method on file — no real payment integration (PRD §9 /
    // Build Brief: no real payment processing for this POC).
    if (!reservation) return;
    const { reservation: next, event } = transitionReservation(reservation, {
      type: "ADD_PAYMENT_METHOD",
      label: "Visa •••• 4471",
    });
    updateReservation(next);
    pushEvent(event);
  }

  function clearAuthorizeTimeout() {
    if (authorizeTimeoutRef.current !== null) {
      clearTimeout(authorizeTimeoutRef.current);
      authorizeTimeoutRef.current = null;
    }
  }

  /** Dialog's own "Reserve Site X — $Y" click: begins the simulated commit. */
  function handleBeginAuthorize() {
    if (!reservation) return;
    const { reservation: next, event } = transitionReservation(reservation, {
      type: "BEGIN_AUTHORIZE",
    });
    updateReservation(next);
    pushEvent(event);

    clearAuthorizeTimeout();
    authorizeTimeoutRef.current = setTimeout(() => {
      // Only the explicit AUTHORIZE event can produce "reserved" — this is
      // that one call site, gated on the reservation still being in
      // "authorizing" so a cancel that fired during the delay wins. Reads
      // the ref, not the closed-over `reservation`, so it always sees the
      // latest value.
      const current = reservationRef.current;
      if (current && current.status === "authorizing") {
        const { reservation: reserved, event: reservedEvent } =
          transitionReservation(current, { type: "AUTHORIZE" });
        updateReservation(reserved);
        pushEvent(reservedEvent);
        pushEvent(deriveTaskClosedEvent("reserved"));
      }
      authorizeTimeoutRef.current = null;
    }, AUTHORIZE_DELAY_MS);
  }

  function handleCancelAuthorization() {
    clearAuthorizeTimeout();
    if (!reservation) return;
    const { reservation: next, event } = transitionReservation(reservation, {
      type: "CANCEL_AUTHORIZATION",
    });
    updateReservation(next);
    pushEvent(event);
  }

  function handleOpenActivity() {
    setView("activity");
  }

  function handleBackToTrip() {
    // "search" is the only origin today — every screen with the persistent
    // trip panel is the search view; Reservation/Authorize/Confirmed have
    // no Trip Panel and no "View activity" entry point per live Figma.
    setView("search");
  }

  /** Full task reset (Closing's "Start a new search") — no prior state leaks into the new trip. */
  function handleStartNewSearch() {
    clearAuthorizeTimeout();
    setMessages([]);
    setEvents([]);
    setDraft("");
    setIntent(EMPTY_TRIP_INTENT);
    setEvaluation(null);
    setCandidateIndex(0);
    setUnavailableIds(new Set());
    setIsWorking(false);
    setError(null);
    setPendingClarification(false);
    setTripEstablished(false);
    updateReservation(null);
    setView("search");
  }

  function renderAttentionActions(
    entry: Extract<ChatEntry, { kind: "attention" }>,
  ) {
    if (entry.attentionType === "clarification") {
      if (!entry.quickReplies || entry.quickReplies.length === 0) return null;
      return (
        <div className="flex flex-wrap items-start gap-3">
          {entry.quickReplies.map((reply) => (
            <Button
              key={reply}
              variant="outline"
              onClick={() => handleQuickReply(reply)}
            >
              {reply}
            </Button>
          ))}
        </div>
      );
    }
    if (entry.attentionType === "unsupported") {
      return (
        <div className="flex items-center gap-3">
          <Button onClick={handleContinueUnsupported}>
            Continue with campsite search
          </Button>
          <Button variant="outline" onClick={handleDecline}>
            Never mind
          </Button>
        </div>
      );
    }
    // no_match
    return (
      <div className="flex items-center gap-3">
        <Button onClick={handleWidenSearch}>Widen search</Button>
        <Button variant="outline" onClick={handleChangeRequirement}>
          Change a requirement
        </Button>
        <button
          type="button"
          onClick={handleDecline}
          className={`${text.bodySm} text-water underline`}
        >
          No thanks, not right now
        </button>
      </div>
    );
  }

  if (view === "activity") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          <div className="mx-auto flex w-[560px] max-w-full flex-col items-start gap-6 pt-24">
            <button
              type="button"
              onClick={handleBackToTrip}
              className={`${text.labelMd} text-muted-foreground`}
            >
              ‹ Back to trip
            </button>
            <h1 className={`${text.displayH3} text-foreground`}>Activity</h1>
            <div className="flex w-full flex-col items-start">
              {events.length === 0 ? (
                <p className={`${text.bodySm} text-muted-foreground`}>
                  No activity yet.
                </p>
              ) : (
                events.map((e, i) => (
                  <EventRow
                    key={e.id}
                    description={e.description}
                    actor={e.actor}
                    timestamp={formatTimestamp(e.timestamp)}
                    isLast={i === events.length - 1}
                  />
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (view === "closing") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex flex-1 flex-col items-center gap-6 pt-24">
          <ChatBubble
            sender="agent"
            message={CLOSING_MESSAGE}
            maxWidthClassName="max-w-[480px]"
          />
          <Button onClick={handleStartNewSearch}>Start a new search</Button>
        </main>
      </div>
    );
  }

  if (view === "reservation" && reservation) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          <ReservationReview
            reservation={reservation}
            missingFields={computeMissingFields(reservation)}
            onReserveAttempt={handleReserveAttempt}
            onAddPaymentMethod={handleAddPaymentMethod}
          />
        </main>
        <AuthorizeBookingDialog
          reservation={reservation}
          onCancel={handleCancelAuthorization}
          onAuthorize={handleBeginAuthorize}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-6 py-8">
        {!hasStarted ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
            <div className="flex flex-col gap-2">
              <h1 className={`${text.displayH1} text-foreground`}>
                Where should we take you?
              </h1>
              <p className={`${text.bodyLg} text-muted-foreground`}>
                Tell CampOps about the trip you have in mind — dates, guests,
                and what matters to you.
              </p>
            </div>
            <div className="w-full max-w-[560px]">
              <Composer
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                isWorking={isWorking}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 gap-8">
            {/* Chat column */}
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex flex-1 flex-col gap-4">
                {messages.map((m, i) => {
                  const isLatest = i === messages.length - 1;
                  if (m.kind === "chat") {
                    return (
                      <ChatRow key={m.id} sender={m.sender}>
                        <ChatBubble sender={m.sender} message={m.text} />
                      </ChatRow>
                    );
                  }
                  return (
                    <div key={m.id} className="flex flex-col items-start gap-3">
                      <AttentionCard eyebrow={m.eyebrow} body={m.body} />
                      {isLatest && renderAttentionActions(m)}
                    </div>
                  );
                })}
                {isWorking && (
                  <ChatRow sender="agent">
                    <ChatBubble sender="agent" message="Working on it…" />
                  </ChatRow>
                )}
              </div>
              <Composer
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                isWorking={isWorking}
              />
            </div>

            {/* Trip panel */}
            <div className="w-[420px] shrink-0 border-l border-border pl-8">
              <div className="mb-4 flex items-center justify-between">
                <p className={`${text.labelLg} text-card-foreground`}>
                  {evaluation?.kind === "full" && showCandidateCard
                    ? "Recommended for you"
                    : evaluation?.kind === "compromise" && showCandidateCard
                      ? "Closest match"
                      : "Your trip"}
                </p>
                <button
                  type="button"
                  onClick={handleOpenActivity}
                  className={`${text.bodySm} text-muted-foreground underline`}
                >
                  View activity
                </button>
              </div>

              {intent.goalStatement && (
                <p className={`${text.bodySm} mb-6 text-muted-foreground`}>
                  {intent.goalStatement}
                </p>
              )}

              {error && (
                <p className={`${text.bodySm} mb-4 text-destructive`}>
                  {error}
                </p>
              )}

              {showCandidateCard && activeCandidate ? (
                <>
                  {evaluation?.kind === "compromise" && (
                    <p className={`${text.bodySm} mb-4 text-muted-foreground`}>
                      No exact match — here&rsquo;s the closest option, with
                      what I couldn&rsquo;t confirm flagged below.
                    </p>
                  )}
                  <CandidateCard
                    location={activeCandidate.campsite.campgroundName}
                    siteName={activeCandidate.campsite.siteName}
                    siteType={activeCandidate.campsite.siteType}
                    capacityValue={`${activeCandidate.campsite.capacity} guests`}
                    distanceValue={`${activeCandidate.campsite.distanceMiles} mi`}
                    datesValue={activeCandidate.campsite.datesAvailable}
                    priceValue={`$${activeCandidate.campsite.pricePerNight}/night`}
                    amenities={activeCandidate.campsite.amenities}
                    preserved={activeCandidate.preserved}
                    compromises={activeCandidate.compromises}
                    explanation={activeCandidate.explanation}
                  />

                  <div className="mt-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Button onClick={handleAccept}>Accept</Button>
                      <Button
                        variant="outline"
                        onClick={handleRequestAlternative}
                        disabled={!canRequestAlternative}
                      >
                        Request Alternative
                      </Button>
                      <Button variant="link" onClick={handleRejectCandidate}>
                        No thanks, I&rsquo;ll pass
                      </Button>
                    </div>
                    {/* Scripted demo control (Build Brief §13) — not a designed
                        screen element, a deterministic exception trigger for
                        verifying availability-loss recovery. */}
                    <button
                      type="button"
                      onClick={handleSimulateAvailabilityLoss}
                      className={`${text.caption} self-start text-muted-foreground underline`}
                    >
                      Simulate: this site just became unavailable
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-6">
                  {TIER_SECTIONS.map(({ key, label, tier }) => {
                    const values = intent[key];
                    if (!Array.isArray(values) || values.length === 0)
                      return null;
                    return (
                      <div key={key} className="flex flex-col gap-2">
                        <span
                          className={`${text.labelOverline} text-muted-foreground`}
                        >
                          {label}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {values.map((v) => (
                            <RequirementChip key={v} label={v} tier={tier} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
