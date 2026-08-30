"use client";

import { useState } from "react";
import { Header } from "@/components/campops/header";
import { Composer } from "@/components/campops/composer";
import { ChatBubble, ChatRow } from "@/components/campops/chat-bubble";
import { RequirementChip } from "@/components/campops/requirement-chip";
import { CandidateCard } from "@/components/campops/candidate-card";
import { text } from "@/lib/typography";
import { evaluateCampsites } from "@/lib/evaluate";
import {
  EMPTY_TRIP_INTENT,
  type EvaluationResult,
  type RequirementTier,
  type TripIntent,
} from "@/lib/schemas";

type Message = { id: string; sender: "user" | "agent"; text: string };

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState<TripIntent>(EMPTY_TRIP_INTENT);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStarted = messages.length > 0;
  const topCandidate = evaluation?.candidates[0] ?? null;

  async function handleSubmit() {
    const userMessage = draft.trim();
    if (!userMessage) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sender: "user", text: userMessage },
    ]);
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

      const result = evaluateCampsites(updatedIntent);
      setEvaluation(result);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: "agent",
          text: agentSummary(result),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: "agent",
          text: "Something went wrong while interpreting that — please try again.",
        },
      ]);
    } finally {
      setIsWorking(false);
    }
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
              ) : topCandidate ? (
                <>
                  {evaluation?.kind === "compromise" && (
                    <p className={`${text.bodySm} mb-4 text-muted-foreground`}>
                      No exact match — here&rsquo;s the closest option, with
                      what I couldn&rsquo;t confirm flagged below.
                    </p>
                  )}
                  <CandidateCard
                    location={topCandidate.campsite.campgroundName}
                    siteName={topCandidate.campsite.siteName}
                    siteType={topCandidate.campsite.siteType}
                    capacityValue={`${topCandidate.campsite.capacity} guests`}
                    distanceValue={`${topCandidate.campsite.distanceMiles} mi`}
                    datesValue={topCandidate.campsite.datesAvailable}
                    priceValue={`$${topCandidate.campsite.pricePerNight}/night`}
                    amenities={topCandidate.campsite.amenities}
                    preserved={topCandidate.preserved}
                    compromises={topCandidate.compromises}
                    explanation={topCandidate.explanation}
                  />
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
