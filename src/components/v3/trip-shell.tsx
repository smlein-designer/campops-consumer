"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TopNav } from "@/components/v3/top-nav";
import { AgentStatus } from "@/components/v3/agent-status";
import { NeedsYouCard } from "@/components/v3/needs-you-card";
import { ChatBubble } from "@/components/v3/chat-bubble";
import { Composer } from "@/components/v3/composer";
import { ConversationPeek } from "@/components/v3/conversation-peek";
import { SheetHandle } from "@/components/v3/sheet-handle";

export type ThreadMessage = { from: "user" | "agent"; message: string };

export type TripShellNeedsYou = {
  eyebrow: string;
  message: string;
  primary: { label: string; onClick?: () => void };
  secondary?: { label: string; onClick?: () => void };
};

/**
 * The "Trip Plan" layout pattern (Handoff Spec §2.1-2.2): Top Nav, plan area
 * + conversation rail on desktop, a stacked task view + Conversation Peek on
 * mobile. Used by every screen built on the Trip Plan pattern (Trip Plan,
 * Map, Hold Expired, Site Unavailable, Other Options, No Match, Requirement
 * Changed, Permission Ask, Pontoon Other Times, Boat Dropped, Paused).
 *
 * The one-attention rule (§2.3): at most one Needs You item, shown once —
 * in the rail on desktop, at the top of the stacked content on mobile —
 * never duplicated between them.
 */
export function TripShell({
  chargeStatus,
  hero,
  agent,
  needsYou,
  thread,
  approveBar,
  railWide = false,
  onComposerSubmit,
  children,
}: {
  chargeStatus: string;
  /** Trip Hero (or equivalent) — always precedes `children` (Handoff Spec §2.1 "Trip Hero, then content for current step"). */
  hero?: ReactNode;
  agent: {
    state: "working" | "waiting" | "paused";
    title: string;
    detail: string;
    onPause?: () => void;
    onResume?: () => void;
  };
  needsYou?: TripShellNeedsYou;
  thread: ThreadMessage[];
  approveBar?: ReactNode;
  railWide?: boolean;
  /** Wires the Composer to a real handler (the live agent loop); omitted on the static fixture screens. */
  onComposerSubmit?: (message: string) => void;
  children: ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const lastMessage = thread[thread.length - 1]?.message ?? "";

  return (
    <div className="flex h-dvh flex-col bg-[var(--color-bg-canvas)]">
      {/* The mobile Trip Plan node (Handoff Spec 6:24) has no persistent top
          bar — the Trip Hero itself is the header. Secondary mobile screens
          use Mobile Header instead (§4.2), not this nav. */}
      <div className="hidden border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] md:block">
        <TopNav active="Trips" chargeStatus={chargeStatus} />
      </div>

      {/* Desktop: plan area + rail, each scrolling independently. */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <div className="scroll-region flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-8">
            {hero}
            {children}
          </div>
          {approveBar && (
            <div className="border-t border-[var(--color-border-default)] p-4">{approveBar}</div>
          )}
        </div>
        <div
          className={cn(
            "scroll-region flex shrink-0 flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-surface)]",
            railWide ? "w-[620px]" : "w-[400px]",
          )}
        >
          <div className="p-4">
            <AgentStatus {...agent} />
          </div>
          {needsYou && (
            <div className="px-4 pb-4">
              <NeedsYouCard {...needsYou} />
            </div>
          )}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {thread.map((m, i) => (
              <ChatBubble key={i} from={m.from} message={m.message} />
            ))}
          </div>
          <div className="border-t border-[var(--color-border-default)] p-4">
            <Composer onSubmit={onComposerSubmit} />
          </div>
        </div>
      </div>

      {/* Mobile: stacked task view + Conversation Peek. */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-36">
          {hero}
          {needsYou && <NeedsYouCard {...needsYou} />}
          {children}
        </div>
        <div className="fixed inset-x-0 bottom-0">
          <ConversationPeek
            message={lastMessage}
            showApprove={!!approveBar}
            onOpen={() => setSheetOpen(true)}
          />
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-10 flex flex-col justify-end bg-black/40 md:hidden">
          <div className="max-h-[80vh] rounded-t-3xl bg-[var(--color-bg-surface)]">
            <button
              type="button"
              aria-label="Close conversation"
              onClick={() => setSheetOpen(false)}
              className="w-full"
            >
              <SheetHandle />
            </button>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 pb-4">
              {thread.map((m, i) => (
                <ChatBubble key={i} from={m.from} message={m.message} />
              ))}
            </div>
            <div className="border-t border-[var(--color-border-default)] p-4">
              <Composer onSubmit={onComposerSubmit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
