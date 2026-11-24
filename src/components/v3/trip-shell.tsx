"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useVisualViewport } from "@/lib/use-visual-viewport";
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
 * mobile.
 *
 * The one-attention rule (§2.3): at most one Needs You item, shown once —
 * in the rail on desktop, at the top of the stacked content on mobile.
 */
export function TripShell({
  chargeStatus,
  hero,
  agent,
  needsYou: needsYouCard,
  onNeedsYouPrimary,
  onNeedsYouSecondary,
  thread,
  approveBar,
  onReview,
  onComposerSubmit,
  composerPlaceholder,
  threadFooter,
  onNavigate,
  onLogoClick,
  children,
}: {
  chargeStatus: string;
  /** Trip Hero — always precedes `children` (Handoff Spec §2.1). */
  hero?: ReactNode;
  agent: {
    state: "working" | "waiting" | "paused";
    title: string;
    detail: string;
    onPause?: () => void;
    onResume?: () => void;
  };
  needsYou?: TripShellNeedsYou;
  /** The card's buttons, when the page handles them (they override the card's own onClick). */
  onNeedsYouPrimary?: () => void;
  onNeedsYouSecondary?: () => void;
  thread: ThreadMessage[];
  approveBar?: ReactNode;
  /** Mobile Conversation Peek's "Review" button. */
  onReview?: () => void;
  onComposerSubmit?: (message: string) => void;
  composerPlaceholder?: string;
  /** A card appended after the thread's bubbles (e.g. a Clarifying Question). */
  threadFooter?: ReactNode;
  onNavigate?: (item: "Trips" | "Activity" | "Permissions") => void;
  onLogoClick?: () => void;
  children: ReactNode;
}) {
  const needsYou = needsYouCard && {
    ...needsYouCard,
    primary: { ...needsYouCard.primary, onClick: onNeedsYouPrimary ?? needsYouCard.primary.onClick },
    secondary: needsYouCard.secondary && { ...needsYouCard.secondary, onClick: onNeedsYouSecondary ?? needsYouCard.secondary.onClick },
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const lastMessage = thread[thread.length - 1]?.message ?? "";
  const railScrollRef = useRef<HTMLDivElement>(null);
  const sheetScrollRef = useRef<HTMLDivElement>(null);

  // v2's keyboard rule: the shell tracks the visible viewport, so the sheet
  // and its composer sit directly above the software keyboard.
  useVisualViewport(() => sheetScrollRef.current);

  // New messages are brought into view (v2's reveal-on-new-message).
  const hasFooter = !!threadFooter;
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of [railScrollRef.current, sheetScrollRef.current]) {
      el?.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [thread.length, hasFooter, sheetOpen]);

  // The floating card's height, so the chat leaves room for it at the top.
  const needsYouRef = useRef<HTMLDivElement>(null);
  const [needsYouHeight, setNeedsYouHeight] = useState(0);
  const hasNeedsYou = !!needsYou;
  useEffect(() => {
    const el = needsYouRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setNeedsYouHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNeedsYou]);

  const bubbles = thread.map((m, i) => <ChatBubble key={i} from={m.from} message={m.message} />);

  return (
    <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)] flex-col bg-[var(--color-bg-canvas)]">
      <div className="hidden border-b border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] md:block">
        <TopNav active="Trips" chargeStatus={chargeStatus} onNavigate={onNavigate} onLogoClick={onLogoClick} />
      </div>

      {/* Desktop: plan area + rail, each scrolling independently. */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="scroll-region flex-1 overflow-y-auto">
            {hero}
            <div className="space-y-6 px-8 py-6">{children}</div>
          </div>
          {approveBar && <div className="px-8 pb-6">{approveBar}</div>}
        </div>
        {/* One width throughout: the plan is the wide side from the first message. */}
        <div className="flex w-[400px] shrink-0 flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <AgentStatus {...agent} />
          <div className="relative flex min-h-0 flex-1 flex-col">
            {needsYou && (
              // Floats over the top of the chat, which scrolls underneath it and
              // fades out just below the card (Figma: Needs You Slot fill).
              <div
                ref={needsYouRef}
                className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-[linear-gradient(to_bottom,var(--color-bg-surface)_83%,transparent)] px-5 py-4"
              >
                <div className="pointer-events-auto rounded-xl shadow-[0_8px_24px_rgba(10,18,13,0.14)]">
                  <NeedsYouCard {...needsYou} />
                </div>
              </div>
            )}
            <div ref={railScrollRef} className="scroll-region min-h-0 flex-1 overflow-y-auto">
              {/* Room at the top, so the oldest message can scroll clear of the card. */}
              <div
                className="flex min-h-full flex-col justify-end gap-3 p-5"
                style={needsYou ? { paddingTop: needsYouHeight } : undefined}
              >
                {bubbles}
                {threadFooter}
              </div>
            </div>
          </div>
          <div className="border-t border-[var(--color-border-default)] px-4 pt-3 pb-5">
            <Composer onSubmit={onComposerSubmit} placeholder={composerPlaceholder} />
          </div>
        </div>
      </div>

      {/* Mobile: stacked task view + Conversation Peek. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col md:hidden">
        <AgentStatus {...agent} />
        <div className="flex-1 space-y-4 overflow-y-auto pb-28">
          {hero}
          <div className="space-y-4 px-4">
            {needsYou && <NeedsYouCard {...needsYou} />}
            {children}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0">
          <ConversationPeek message={lastMessage} showApprove={!!approveBar} onOpen={() => setSheetOpen(true)} onReview={onReview} />
        </div>

        {/* Always in the page so it can slide up and down; while closed it sits
            below the screen and `inert` keeps taps, focus and screen readers out. */}
        <div
          inert={!sheetOpen}
          onClick={(e) => e.target === e.currentTarget && setSheetOpen(false)}
          className={cn(
            "absolute inset-0 z-30 flex flex-col justify-end overflow-hidden transition-colors duration-300 motion-reduce:transition-none",
            sheetOpen ? "bg-black/40" : "pointer-events-none bg-black/0",
          )}
        >
          <div
            className={cn(
              "flex max-h-[85%] flex-col rounded-t-3xl bg-[var(--color-bg-surface)] transition-transform duration-300 ease-out motion-reduce:transition-none",
              sheetOpen ? "translate-y-0" : "translate-y-full",
            )}
          >
            <button type="button" aria-label="Close conversation" onClick={() => setSheetOpen(false)} className="w-full shrink-0">
              <SheetHandle />
            </button>
            <div ref={sheetScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
              {bubbles}
              {threadFooter}
            </div>
            <div className="shrink-0 border-t border-[var(--color-border-default)] p-4">
              <Composer onSubmit={onComposerSubmit} placeholder={composerPlaceholder} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
