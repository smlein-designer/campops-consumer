"use client";

import { useState } from "react";
import { Header } from "@/components/campops/header";
import { Composer } from "@/components/campops/composer";
import { ChatBubble, ChatRow } from "@/components/campops/chat-bubble";
import {
  RequirementChip,
  type RequirementTier,
} from "@/components/campops/requirement-chip";
import { CandidateCard } from "@/components/campops/candidate-card";
import { text } from "@/lib/typography";
import { evaluateCampsites } from "@/lib/evaluate";
import {
  EMPTY_TRIP_INTENT,
  type Candidate,
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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState<TripIntent>(EMPTY_TRIP_INTENT);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStarted = messages.length > 0;

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

      const ranked = evaluateCampsites(updatedIntent);
      const top = ranked[0] ?? null;
      setCandidate(top);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: "agent",
          text: top
            ? `Got it. Based on what you've told me, ${top.campsite.siteName} at ${top.campsite.campgroundName} looks like the strongest fit.`
            : "I understood your request, but nothing in the current dataset satisfies your hard requirements.",
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
                {candidate ? "Recommended for you" : "Your trip"}
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

              {candidate ? (
                <CandidateCard
                  location={candidate.campsite.campgroundName}
                  siteName={candidate.campsite.siteName}
                  siteType={candidate.campsite.siteType}
                  capacityValue={`${candidate.campsite.capacity} guests`}
                  distanceValue={`${candidate.campsite.distanceMiles} mi`}
                  datesValue={candidate.campsite.datesAvailable}
                  priceValue={`$${candidate.campsite.pricePerNight}/night`}
                  amenities={candidate.campsite.amenities}
                  preserved={candidate.preserved}
                  compromise={candidate.compromise}
                  explanation={candidate.explanation}
                />
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
