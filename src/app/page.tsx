"use client";

import { useState } from "react";
import { Header } from "@/components/campops/header";
import { Composer } from "@/components/campops/composer";
import { ChatBubble, ChatRow } from "@/components/campops/chat-bubble";
import { RequirementChip } from "@/components/campops/requirement-chip";
import { CandidateCard } from "@/components/campops/candidate-card";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/typography";
import { evaluateCampsites } from "@/lib/evaluate";
import { buildRecoveryMessages } from "@/lib/recovery";
import {
  EMPTY_TRIP_INTENT,
  type EvaluationResult,
  type RequirementTier,
  type TripIntent,
} from "@/lib/schemas";

type Message = { id: string; sender: "user" | "agent"; text: string };
type Stage = "active" | "accepted" | "rejected";

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState<TripIntent>(EMPTY_TRIP_INTENT);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  // Deterministic app/tool state — sites a scripted availability check has
  // marked unavailable. Never populated from a model response.
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>("active");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStarted = messages.length > 0;
  const activeCandidate = evaluation?.candidates[candidateIndex] ?? null;
  const canRequestAlternative =
    !!evaluation && candidateIndex + 1 < evaluation.candidates.length;
  const composerLocked = stage !== "active";

  function pushMessage(sender: Message["sender"], msg: string) {
    setMessages((prev) => [...prev, { id: newId(), sender, text: msg }]);
  }

  async function handleSubmit() {
    const userMessage = draft.trim();
    if (!userMessage) return;

    pushMessage("user", userMessage);
    setDraft("");
    setIsWorking(true);
    setError(null);

    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, priorIntent: intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Intent extraction failed.");

      const updatedIntent: TripIntent = data.intent;
      setIntent(updatedIntent);

      // A previously-lost site must not silently re-enter, even after the
      // user refines their request.
      const result = evaluateCampsites(updatedIntent, unavailableIds);
      setEvaluation(result);
      setCandidateIndex(0);
      setStage("active");

      pushMessage("agent", agentSummary(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      pushMessage(
        "agent",
        "Something went wrong while interpreting that — please try again.",
      );
    } finally {
      setIsWorking(false);
    }
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

    const nextUnavailable = new Set(unavailableIds);
    nextUnavailable.add(lost.campsite.id);
    setUnavailableIds(nextUnavailable);

    const adapted = evaluateCampsites(intent, nextUnavailable);
    setEvaluation(adapted);
    setCandidateIndex(0);

    const { lossMessage, adaptedMessage } = buildRecoveryMessages(
      lost,
      adapted,
    );
    setMessages((prev) => [
      ...prev,
      { id: newId(), sender: "agent", text: lossMessage },
      { id: newId(), sender: "agent", text: adaptedMessage },
    ]);
  }

  function handleAccept() {
    if (!activeCandidate) return;
    setStage("accepted");
    pushMessage(
      "agent",
      `Great — I'll get ${activeCandidate.campsite.siteName} at ${activeCandidate.campsite.campgroundName} ready for you. (Staging and booking come in a later slice.)`,
    );
  }

  function handleReject() {
    setStage("rejected");
    pushMessage("agent", "No thanks, understood — ending this search for now.");
  }

  function handleRequestAlternative() {
    if (!canRequestAlternative) return;
    setCandidateIndex((i) => i + 1);
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
                {messages.map((m) => (
                  <ChatRow key={m.id} sender={m.sender}>
                    <ChatBubble sender={m.sender} message={m.text} />
                  </ChatRow>
                ))}
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
                disabled={composerLocked}
              />
            </div>

            {/* Trip panel */}
            <div className="w-[420px] shrink-0 border-l border-border pl-8">
              <p className={`${text.labelLg} mb-4 text-card-foreground`}>
                {evaluation?.kind === "full"
                  ? "Recommended for you"
                  : evaluation?.kind === "compromise"
                    ? "Closest match"
                    : evaluation?.kind === "no_match"
                      ? "No exact match"
                      : "Your trip"}
              </p>

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

              {evaluation?.kind === "no_match" ? (
                <div className="flex flex-col gap-4">
                  <p className={`${text.bodySm} text-muted-foreground`}>
                    None of the campsites in the current dataset satisfy every
                    hard requirement you&rsquo;ve given me. Here&rsquo;s how the
                    closest options fall short:
                  </p>
                  <div className="flex flex-col gap-3">
                    {evaluation.candidates.slice(0, 2).map((c) => (
                      <div
                        key={c.campsite.id}
                        className="rounded-md border border-border bg-card p-4"
                      >
                        <p className={`${text.labelSm} text-card-foreground`}>
                          {c.campsite.siteName} · {c.campsite.campgroundName}
                        </p>
                        <ul className="mt-1 list-inside list-disc">
                          {c.compromises.map((reason) => (
                            <li
                              key={reason}
                              className={`${text.bodySm} text-destructive`}
                            >
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className={`${text.bodySm} text-muted-foreground`}>
                    Try widening a requirement or telling me what you&rsquo;d be
                    willing to change.
                  </p>
                </div>
              ) : activeCandidate ? (
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

                  {stage === "active" ? (
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
                        <Button variant="link" onClick={handleReject}>
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
                  ) : (
                    <p className={`${text.bodySm} mt-4 text-muted-foreground`}>
                      {stage === "accepted"
                        ? "Selected — staged for a later slice."
                        : "Search ended."}
                    </p>
                  )}
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
