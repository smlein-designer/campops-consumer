"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Header } from "@/components/campops/header";
import type { BadgeSeverity } from "@/components/campops/badge";
import { PanelHeader } from "@/components/campops/panel-header";
import { CampIllustration } from "@/components/campops/camp-illustration";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { newId } from "@/lib/id";
import { campsitePhotoSrc } from "@/lib/campsite-photos";
import { Composer } from "@/components/campops/composer";
import { ChatBubble, ChatRow } from "@/components/campops/chat-bubble";
import { CandidateCard } from "@/components/campops/candidate-card";
import { AttentionCard } from "@/components/campops/attention-card";
import { ReservationReview } from "@/components/campops/reservation-review";
import { EventRow } from "@/components/campops/event-row";
import { TripStatusBar } from "@/components/campops/trip-status-bar";
import { TripDetailsSheet } from "@/components/campops/trip-details-sheet";
import {
  TIER_SECTIONS,
  TripRequirementsList,
} from "@/components/campops/trip-requirements-list";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/typography";
import { evaluateCampsites } from "@/lib/evaluate";
import { buildLossMessage, buildRecoveryMessages } from "@/lib/recovery";
import { summarizeNoMatch, widenSearch } from "@/lib/no-match";
import {
  clearChipSource,
  rawRequirementLabel,
  resolveChipSource,
  type ChipSource,
} from "@/lib/requirements";
import {
  checkBookingPrerequisites,
  parsePartySizeAnswer,
  checkSearchPrerequisites,
  explicitSearchRequirements,
  isExploratoryDiscoveryMessage,
  isUnconstrainedDestinationAnswer,
  questionFor,
  type PrerequisiteKind,
} from "@/lib/prerequisites";
import { checkRecommendationReadiness } from "@/lib/recommendation-readiness";
import { looksLikeDateAttempt, normalizeDatePhrase } from "@/lib/dates";
import { normalizeDestinationRegion } from "@/lib/geography";
import { applyFamilyPreferenceInference } from "@/lib/family-inference";
import { AMENITY_LABELS } from "@/lib/amenities";
import { answerCandidateQuestion, detectCandidateQuestion } from "@/lib/candidate-facts";
import {
  buildRefinementAcknowledgment,
  diffAddedRequirements,
} from "@/lib/refinement-acknowledgment";
import {
  discardStagedReservation,
  stageReservation,
  transitionReservation,
} from "@/lib/reservation";
import {
  deriveAlternativeRequestedEvent,
  deriveFirstOptionRequestedEvent,
  deriveAvailabilityChangedEvent,
  deriveCandidateExcludedEvent,
  deriveCandidateQuestionAnsweredEvent,
  deriveClarificationRequestedEvent,
  deriveClarificationResolvedEvent,
  deriveDatePhraseNormalizedEvent,
  deriveEvaluationPerformedEvent,
  deriveIntentEvent,
  derivePrerequisiteMissingEvent,
  derivePrerequisiteResolvedEvent,
  deriveRecommendationAcceptedEvent,
  deriveRecommendationReadinessInsufficientEvent,
  deriveRecommendationReadinessSatisfiedEvent,
  deriveRecommendationRejectedEvent,
  deriveRecommendationSelectedEvent,
  deriveReplacementSelectedEvent,
  deriveRequirementRemovedEvent,
  deriveTripDetailRemovedEvent,
  deriveDestinationUnconstrainedEvent,
  deriveRequirementWidenedEvent,
  deriveTaskClosedEvent,
  deriveUnsupportedEvent,
} from "@/lib/events";
import {
  EMPTY_TRIP_INTENT,
  type Candidate,
  type EvaluationResult,
  type IntentInterpretation,
  type Reservation,
  type ReservationEvent,
  type TaskEvent,
  type TripIntent,
} from "@/lib/schemas";

type AttentionType =
  | "clarification"
  | "unsupported"
  | "no_match"
  | "availability_loss";

/** A quick-reply option — see IntentInterpretationSchema's clarification.quickReplies
 * doc comment for the branch-vs-value distinction `followUpQuestion` encodes. */
type QuickReplyOption = { label: string; followUpQuestion: string | null };

type ChatEntry =
  | { id: string; kind: "chat"; sender: "user" | "agent"; text: string }
  | {
      id: string;
      kind: "attention";
      attentionType: AttentionType;
      eyebrow: string;
      body: string;
      quickReplies?: QuickReplyOption[];
    };

type View = "search" | "reservation" | "closing" | "activity";

/** How the currently shown candidate came to be shown — drives only the
 * Trip Panel's heading/badge ("Recommended for you" vs. "Another option"
 * vs. "Updated recommendation"), never evaluation itself. */
type RecommendationOrigin = "initial" | "alternative" | "adapted";

/** Trip-state fingerprint for the mobile Your Trip grab bar's "changed"
 * state. Excludes `goalStatement`, which the model may simply re-phrase
 * turn to turn without the trip itself changing. */
function tripStateKey(intent: TripIntent): string {
  return JSON.stringify({ ...intent, goalStatement: "" });
}

/** True where the composer is typed into with a software keyboard: the
 * mobile layout (below lg) or any touch-first device (e.g. a tablet in the
 * desktop layout). There, submitting ends the input interaction instead of
 * keeping the keyboard up across turns. */
function submitEndsInputInteraction(): boolean {
  return window.matchMedia("(max-width: 1023px), (pointer: coarse)").matches;
}

// Simulated charge for the Processing payment state — long enough to read
// ("usually takes a few seconds"); the resulting state transition itself is
// deterministic regardless of this duration.
const AUTHORIZE_DELAY_MS = 2000;

// Simulated latency of a live campsite query ("Show me another option",
// availability-change replacement) — long enough to see CampOps working,
// short enough not to make the POC feel slow.
const RECOMMENDATION_QUERY_DELAY_MS = 900;

/** Stand-in for a live campsite inventory query: runs `query` after the
 * simulated latency. The recommendation transition awaits this promise, so
 * a real async request can replace it without touching the UI state. */
function simulateCampsiteQuery<T>(query: () => T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(query()), RECOMMENDATION_QUERY_DELAY_MS),
  );
}

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


function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Deterministic relative/holiday date-phrase normalization (Search Truth
 * correction, 2026-09-02): the model may leave checkIn/checkOut as the
 * user's own recognized phrase ("Labor Day weekend") rather than a
 * concrete date — this resolves it via src/lib/dates.ts's calendar rules.
 * Only ever touches checkIn/checkOut; a phrase that isn't recognized is
 * left exactly as the model returned it (still "missing" a concrete date
 * from the prerequisite gate's point of view, never guessed).
 */
function normalizeIntentDates(intent: TripIntent): {
  intent: TripIntent;
  normalized: boolean;
} {
  const source = intent.checkIn ?? intent.checkOut;
  if (!source) return { intent, normalized: false };
  const resolved = normalizeDatePhrase(source);
  if (!resolved) return { intent, normalized: false };
  if (intent.checkIn === resolved.checkIn && intent.checkOut === resolved.checkOut) {
    return { intent, normalized: false };
  }
  return {
    intent: { ...intent, checkIn: resolved.checkIn, checkOut: resolved.checkOut },
    normalized: true,
  };
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
  // Transient "finding the next campsite" state between recommendations
  // (Show me another option / availability change) — see
  // beginRecommendationQuery.
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Task-local flags driving event derivation, not display — reset with the
  // rest of task state on "Start a new search".
  const [pendingClarification, setPendingClarification] = useState(false);
  const [tripEstablished, setTripEstablished] = useState(false);
  // Deterministic Action Prerequisites (2026-09-01, corrected the same day
  // — see docs/implementation-decisions.md): distinct from
  // `pendingClarification` (the model's own semantic judgment) on purpose —
  // these track the APPLICATION blocking an action on a missing structured
  // field.
  // `pendingSearchMissing`: null when no search is blocked; otherwise the
  // FULL current list of outstanding search prerequisites (origin and/or
  // dates) — not just a boolean — so re-checking after a partial answer
  // (e.g. ZIP supplied, dates still missing) can tell exactly what was
  // just resolved vs. what's still outstanding, and the Activity Log can
  // say so accurately rather than re-announcing the same ask twice.
  // `pendingSearchAvailabilityBacked` remembers whether the ORIGINAL
  // triggering message was an availability-backed request (requiring
  // dates) or exploratory discovery (dates optional), so a later turn that
  // merely supplies the missing value doesn't get freshly reclassified by
  // its own (unrelated) phrasing. Resolving fully just lets the normal
  // evaluate-and-announce flow proceed — it never produces an intermediate
  // recommendation while any prerequisite remains missing.
  // `pendingBookingRequest`: an Accept was blocked because the trip has
  // no concrete check-in/check-out; resolving it must finish the SAME
  // Accept automatically — the user asked once, not twice.
  const [pendingSearchMissing, setPendingSearchMissing] = useState<
    PrerequisiteKind[] | null
  >(null);
  const [pendingSearchAvailabilityBacked, setPendingSearchAvailabilityBacked] =
    useState(true);
  // Search Truth correction (2026-09-02): exploratory-vs-availability-backed
  // classification must persist across an ENTIRE multi-turn clarification
  // chain (a model needs_clarification round, or a multi-step branch
  // follow-up), not just the leg tracked by `pendingSearchMissing` — a
  // branch reply like "A specific park/region" or a bare region name like
  // "Hill Country" doesn't itself look exploratory by the text heuristic,
  // and re-classifying from that reply's own wording alone would silently
  // flip a genuinely exploratory conversation into requiring dates partway
  // through. null = no active classification yet (a fresh top-level
  // message should classify itself fresh).
  const [currentRequestAvailabilityBacked, setCurrentRequestAvailabilityBacked] =
    useState<boolean | null>(null);
  const [pendingBookingRequest, setPendingBookingRequest] =
    useState(false);
  // Search Truth correction (2026-09-02): counts consecutive user turns that
  // LOOKED like a date attempt (see looksLikeDateAttempt) but still left
  // checkIn/checkOut unresolved — drives questionFor's loop-protection
  // follow-up so a phrase that keeps failing to parse gets a more specific
  // question instead of the same one repeated verbatim. Reset to 0 the
  // moment dates actually resolve.
  const [dateAskAttempts, setDateAskAttempts] = useState(0);
  // Recommendation-readiness gate (Search Truth correction, 2026-09-02) —
  // true while the app has asked its own "not enough to recommend yet"
  // follow-up, tracked separately from `pendingClarification` since this is
  // a distinct, deterministic gate, not the model's own semantic judgment.
  const [pendingRecommendationReadiness, setPendingRecommendationReadiness] =
    useState(false);

  const [view, setView] = useState<View>("search");
  // Mobile-only Trip Details bottom sheet (Handoff Spec 4.1's "Working
  // (Trip Details Expanded)" pattern) — desktop never opens this, the same
  // content is always visible there in the persistent Trip Panel.
  const [showTripDetailsSheet, setShowTripDetailsSheet] = useState(false);
  // The trip state the user last saw in the Your Trip sheet — the collapsed
  // grab bar turns green ("changed, not yet seen") whenever the live trip
  // differs from it, and opening the sheet acknowledges the change.
  const [seenTripKey, setSeenTripKey] = useState(() =>
    tripStateKey(EMPTY_TRIP_INTENT),
  );
  const [recommendationOrigin, setRecommendationOrigin] =
    useState<RecommendationOrigin>("initial");
  const [reservation, setReservationState] = useState<Reservation | null>(null);
  // The payment method the user saved earlier in this session — kept when a
  // staged reservation is set aside (Edit / Cancel) so choosing again doesn't
  // ask for it twice. Cleared only by a full new search.
  const [savedPaymentMethod, setSavedPaymentMethod] = useState<string | null>(null);
  // Deliberate, user-initiated trip editing (Edit reservation) — the
  // conversation invites a change; cleared by the next message.
  const [editingTrip, setEditingTrip] = useState(false);
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
  // Guards against a real race the composer's own disabled-while-working
  // state can't prevent: direct chip removal (and Widen Search) mutate
  // `intent` synchronously and are NOT blocked by `isWorking`, so a user can
  // change a constraint while a prior submitMessage call is still in
  // flight (PRD §11 "user changes a constraint while CampOps is working").
  // That in-flight response was interpreted against the OLD `priorIntent`
  // captured before the direct change — applying it unconditionally when it
  // resolves would silently overwrite the user's newer, explicit change.
  // Bumped by every direct-manipulation intent mutation; submitMessage
  // captures the value at request time and discards its own response
  // (rather than overwriting intent) if it no longer matches on resolve —
  // "preserve established TripIntent unless the user explicitly changes
  // it" / "user corrections must override prior agent assumptions".
  const intentGenerationRef = useRef(0);

  // Persistent Composer Focus (2026-09-09 — see
  // docs/implementation-decisions.md): the composer is the default
  // conversational focus target after a submission, but an explicit user
  // focus change always wins. `composerInputRef` is a real ref to the
  // actual <input> DOM node (forwarded through Composer — see its own doc
  // comment), the SAME ref passed to both the landing-screen and
  // active-conversation Composer instances, so it reattaches correctly
  // across that unmount/mount transition.
  //
  // `pendingComposerFocusRef` is the "focus is pending" flag from the
  // simplest version of the pattern the request itself suggested:
  // handleSubmit sets it true; a document-level pointerdown/keydown on
  // anything other than the composer input cancels it (an explicit user
  // interaction with another control always wins — this is the ONE
  // low-level listener this slice adds, not a general focus-management
  // system); the effect below consumes it (one-shot) the moment the
  // composer becomes focusable again.
  const composerInputRef = useRef<HTMLInputElement>(null);
  const pendingComposerFocusRef = useRef(false);
  // Bounded-workspace scrolling: the message list, the conversation column
  // (the scroll region on desktop), the mobile content plane (the scroll
  // region below lg), the composer's fade bar layered over whichever one is
  // active, and the message count already brought into view — see the
  // effect that uses them.
  const messageListRef = useRef<HTMLDivElement>(null);
  const chatColumnRef = useRef<HTMLElement>(null);
  const contentPlaneRef = useRef<HTMLDivElement>(null);
  const composerBarRef = useRef<HTMLDivElement>(null);
  const revealedMessageCountRef = useRef(0);
  const startScrollerRef = useRef<HTMLDivElement>(null);
  // Recommendation transition bookkeeping: the Trip Panel element, the
  // in-flight query's token (bumped to cancel/supersede it), a synchronous
  // "query active" lock (state alone can't stop a double-click within one
  // render), a request to re-pin the panel to the top after the next
  // render, and a one-shot "don't auto-reveal these messages" flag so
  // transition messages never scroll the conversation.
  const tripPanelRef = useRef<HTMLElement>(null);
  const recommendationQueryRef = useRef(0);
  const recommendationQueryActiveRef = useRef(false);
  const pinPanelTopAfterRenderRef = useRef(false);
  const suppressRevealRef = useRef<"all" | "mobile" | null>(null);
  // What a recommendation transition reveals: the RESULT for a
  // user-initiated change (Show me another option / Start over), or the
  // EXPLANATION for a system-initiated one (availability change) — see
  // beginRecommendationQuery.
  const transitionRevealRef = useRef<"recommendation" | "explanation">(
    "recommendation",
  );
  // Origin of the first candidate in the current result set ("initial", or
  // "adapted" after an availability change) — restored when cycling back to
  // it with "Start over with the first option".
  const firstCandidateOriginRef = useRef<RecommendationOrigin>("initial");

  useEffect(() => {
    function cancelPendingFocusIfElsewhere(e: Event) {
      // While the composer is disabled (isWorking), it can't be an event
      // target at all — a keystroke the user fires off right after
      // submitting lands on <body> by fallback, not because they clicked
      // or tabbed to anything. That's not an explicit focus change, it's
      // the same "still talking to the composer" intent this feature
      // exists to serve (request item 7/8) — found via live verification,
      // 2026-09-09, see docs/implementation-decisions.md. Only a REAL
      // other element (a button, a dialog, a chip) should cancel the
      // pending refocus.
      if (e.target !== composerInputRef.current && e.target !== document.body) {
        pendingComposerFocusRef.current = false;
      }
    }
    // Capture phase, so this always sees the interaction before any
    // component-level handler (e.g. a dialog's own focus trap) runs and
    // potentially stops propagation.
    document.addEventListener("pointerdown", cancelPendingFocusIfElsewhere, true);
    document.addEventListener("keydown", cancelPendingFocusIfElsewhere, true);
    return () => {
      document.removeEventListener("pointerdown", cancelPendingFocusIfElsewhere, true);
      document.removeEventListener("keydown", cancelPendingFocusIfElsewhere, true);
    };
  }, []);

  // Restores focus the moment the composer becomes interactable again
  // (isWorking flips back to false, so the <input> is no longer
  // `disabled` — a disabled element cannot hold focus at all, which is
  // why this must wait for that exact transition rather than firing
  // immediately on submit). Deliberately keyed on `isWorking` alone, not a
  // timer: this is the smallest reliable signal for "the composer just
  // became focusable," and React guarantees this effect runs after the
  // DOM has already committed the (now-enabled) input. A one-shot flag —
  // if nothing else claimed focus in the meantime (see the listener
  // above), the composer regains it; otherwise this is a no-op, so an
  // explicit user focus change always wins, and this never fights it.
  //
  // This is the ONLY code path that focuses the composer as a side effect
  // of a state transition. On mobile it never does (phone-QA correction,
  // 2026-10-01): submitting ends the input interaction, and the keyboard
  // returns only on an explicit tap — so this site refuses outright there,
  // independent of how the pending flag got set.
  useEffect(() => {
    if (isWorking) return;
    if (!pendingComposerFocusRef.current) return;
    pendingComposerFocusRef.current = false;
    if (submitEndsInputInteraction()) return;
    composerInputRef.current?.focus();
  }, [isWorking]);

  const hasStarted = messages.length > 0;
  // Mobile software keyboard (Pages v2 "Keyboard open — Mobile"): the Start
  // and conversation shells track the visual viewport so the composer layer
  // stays immediately above the keyboard — see useVisualViewport.
  useVisualViewport(
    () =>
      !hasStarted
        ? startScrollerRef.current
        : window.matchMedia("(min-width: 1024px)").matches
          ? chatColumnRef.current
          : contentPlaneRef.current,
    { revealFocusedInput: !hasStarted },
  );
  const activeCandidate = evaluation?.candidates[candidateIndex] ?? null;
  const showCandidateCard =
    !!activeCandidate && evaluation?.kind !== "no_match";
  // Same underlying array the Trip Panel's plain chip fallback reads from —
  // gates which Candidate Card preserved/compromise chips get a working
  // remove control (design-resolution update, 2026-09-01).
  // Trip status (Pages v2 status badges: Working → Waiting on you → No
  // matching sites), shown in the Mobile Status Bar and the desktop Panel
  // Header. Driven off real state only: "Working" appears strictly while a
  // request is actually in flight (`isWorking`) — never as an idle default —
  // and otherwise reflects the last message's real kind/type and the real
  // evaluation result.
  type TripStatus = { label: string; severity: BadgeSeverity; working?: boolean };
  const lastMessage = messages[messages.length - 1];
  const workingLabel = evaluation
    ? "Working: Updating search"
    : "Working: Searching campsites";
  const workingStatus: TripStatus = {
    label: workingLabel,
    severity: "neutral",
    working: true,
  };
  const tripStatus: TripStatus = isWorking
    ? workingStatus
    : evaluation?.kind === "no_match" &&
        !(
          lastMessage?.kind === "attention" &&
          (lastMessage.attentionType === "clarification" ||
            lastMessage.attentionType === "unsupported")
        )
      ? { label: "No matching sites", severity: "blocking" }
      : { label: "Waiting on you", severity: "advisory" };
  // Trip Panel heading + status Badge while a candidate is shown (Pages v2:
  // Recommendation / Alternative / Availability Lost frames). The same
  // label also feeds the a11y status announcement, so the two can't drift.
  const candidateHeading: {
    title: string;
    badge: string;
    severity: BadgeSeverity;
  } =
    recommendationOrigin === "alternative"
      ? { title: "Another option", badge: "Alternative", severity: "neutral" }
      : recommendationOrigin === "adapted"
        ? {
            title: "Updated recommendation",
            badge: "Adapted",
            severity: "neutral",
          }
        : evaluation?.kind === "full"
          ? { title: "Recommended for you", badge: "Best match", severity: "ready" }
          : { title: "Closest match", badge: "Closest match", severity: "advisory" };
  // Handoff Spec 3's "status badge changes ... announced via a polite live
  // region, not by moving focus" — mirrors whatever status text is already
  // visible, never separately-invented copy.
  // Recommendation transition loader — interim: the existing DS Working
  // treatment (Badge + spinner), as no transition frame exists in Pages v2.
  const findingStatus: TripStatus = {
    label: "Working: Finding another option",
    severity: "neutral",
    working: true,
  };
  const statusAnnouncement = isWorking
    ? workingLabel
    : recommendationLoading
      ? findingStatus.label
      : showCandidateCard
        ? candidateHeading.title
        : tripStatus.label;
  // The one status Badge for the current view: the recommendation's badge
  // while a candidate is shown, otherwise the trip status — Working wins in
  // both cases while a request or campsite query is in flight.
  const currentStatus: TripStatus = isWorking
    ? workingStatus
    : recommendationLoading
      ? findingStatus
      : showCandidateCard
        ? { label: candidateHeading.badge, severity: candidateHeading.severity }
        : tripStatus;

  const tripKey = tripStateKey(intent);
  const tripChangedUnseen = hasStarted && tripKey !== seenTripKey;
  const canRequestAlternative =
    !!evaluation && candidateIndex + 1 < evaluation.candidates.length;
  // Where the user is within the finite matching result set (0 matches is
  // the separate No Match recovery): the only match, or the last of several.
  // (a no_match result still lists every site as a non-match — that is
  // not a result set, so its count is 0).
  const matchCount =
    evaluation && evaluation.kind !== "no_match" ? evaluation.candidates.length : 0;
  const isOnlyMatch = showCandidateCard && matchCount === 1;
  const isLastOfMatches =
    showCandidateCard && matchCount > 1 && candidateIndex === matchCount - 1;

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
    quickReplies?: QuickReplyOption[],
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

  /**
   * Renders either a normal agent chat summary or a No Match Attention
   * Card, per the evaluation's kind. `refinementContext`, when supplied,
   * means a recommendation ALREADY existed before this turn — the
   * acknowledgment names what changed and whether the same candidate still
   * wins, rather than repeating the generic first-recommendation copy
   * (Active-Recommendation Follow-Up correction, 2026-09-05).
   */
  function announceEvaluation(
    result: EvaluationResult,
    refinementContext?: { addedLabels: string[]; previousCandidateId: string | null },
  ) {
    if (result.kind === "no_match") {
      pushAttention(
        "no_match",
        "No exact match found",
        summarizeNoMatch(result),
      );
    } else if (refinementContext) {
      pushChat(
        "agent",
        buildRefinementAcknowledgment(
          refinementContext.addedLabels,
          refinementContext.previousCandidateId,
          result,
          agentSummary(result),
        ),
      );
    } else {
      pushChat("agent", agentSummary(result));
    }
  }

  async function submitMessage(
    rawText: string,
    options?: { forcedFollowUpQuestion?: string | null },
  ) {
    const userMessage = rawText.trim();
    if (!userMessage) return;
    // A new message supersedes any in-flight recommendation transition.
    cancelRecommendationQuery();
    const forcedFollowUpQuestion = options?.forcedFollowUpQuestion ?? null;

    const priorIntent = intent;
    const wasPendingClarification = pendingClarification;
    const wasPendingSearchMissing = pendingSearchMissing;
    const wasPendingSearchAvailabilityBacked = pendingSearchAvailabilityBacked;
    const wasPendingBookingRequest = pendingBookingRequest;
    const acceptedCandidateOnHold = activeCandidate;
    // Active-Recommendation Follow-Up correction (2026-09-05): snapshot
    // whether a recommendation already existed, and which candidate was
    // currently shown, BEFORE this turn's response can change either —
    // used both to answer a factual question about "it"/"this site" and to
    // build an honest refinement acknowledgment ("X still comes out on
    // top" / "Y is now the stronger fit") instead of the generic
    // first-recommendation copy.
    const hasActiveCandidateAtSubmit = !!activeCandidate;
    const wasAlreadyRecommending =
      hasActiveCandidateAtSubmit && evaluation?.kind !== "no_match";
    const previousCandidateId = activeCandidate?.campsite.id ?? null;
    const currentCandidateSite = activeCandidate?.campsite ?? null;
    // Snapshot so we can tell, once this call resolves, whether a direct
    // manipulation (chip removal, Widen Search) changed `intent` out from
    // under it — see intentGenerationRef's declaration above.
    const generationAtSubmit = intentGenerationRef.current;

    pushChat("user", userMessage);
    setEditingTrip(false);
    setDraft("");
    setIsWorking(true);
    setError(null);

    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          priorIntent,
          hasActiveCandidate: hasActiveCandidateAtSubmit,
        }),
      });
      const data = await res.json();
      // Public Demo Rate Limiting (2026-09-08 — see
      // docs/implementation-decisions.md): a concise, human message —
      // never the generic error path, never a full-screen error state, and
      // never a reset of the in-progress task. The user's messages/intent
      // so far are untouched; they can just try again shortly.
      if (res.status === 429) {
        pushChat(
          "agent",
          "You've sent a lot of requests in a short time. Try again in a moment.",
        );
        return;
      }
      if (!res.ok)
        throw new Error(data.error ?? "Intent interpretation failed.");

      const interpretation: IntentInterpretation = data.interpretation;

      if (intentGenerationRef.current !== generationAtSubmit) {
        // A direct chip removal (or Widen Search) changed the trip while
        // this request was in flight. This response was interpreted
        // against the intent as it stood BEFORE that change, so applying
        // it now would silently undo the user's newer, explicit edit —
        // never acceptable ("preserve established TripIntent unless the
        // user explicitly changes it"). Discard it and say so plainly,
        // rather than resurrecting a requirement the user just removed.
        pushChat(
          "agent",
          "Your trip changed while I was working on that — go ahead and repeat it so I have the latest picture.",
        );
        return;
      }

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

      // Active-Recommendation Follow-Up correction (2026-09-05), hardened
      // (2026-09-06, see docs/implementation-decisions.md): live manual
      // testing found the MODEL's own `candidateQuestion` classification
      // unreliable run-to-run for the exact same message — sometimes
      // correctly recognizing "is it near water?", sometimes not, causing
      // exactly the reported generic-boilerplate/"which campsite?"
      // failures despite `hasActiveCandidate` wiring itself being verified
      // correct. A deterministic backstop (`detectCandidateQuestion`) now
      // resolves high-confidence canonical phrasings itself — a
      // question-shaped message referencing "it"/"this site"/"the current
      // campsite" — and OVERRIDES the model's classification in both
      // directions: forcing "refinement" for a clear refinement verb
      // ("I'd prefer...", "make sure...") even if the model flagged it as
      // a question, and forcing "question" (with its own detected topic)
      // for a canonical factual phrasing even if the model missed it.
      // Anything the pattern doesn't confidently cover ("unclear") falls
      // back to the model's own judgment, preserving flexibility. Either
      // way, once resolved as a question, the app never mutates
      // TripIntent and never re-runs evaluation — the answer always comes
      // from real structured campsite data via `answerCandidateQuestion`,
      // never model-phrased.
      const deterministicFollowUp = currentCandidateSite
        ? detectCandidateQuestion(userMessage)
        : { kind: "unclear" as const };
      const resolvedCandidateQuestion =
        deterministicFollowUp.kind === "refinement"
          ? null
          : deterministicFollowUp.kind === "question"
            ? { topic: deterministicFollowUp.topic, amenityHint: deterministicFollowUp.amenityHint }
            : interpretation.candidateQuestion;

      if (resolvedCandidateQuestion && currentCandidateSite) {
        const { topic, amenityHint } = resolvedCandidateQuestion;
        const answer = answerCandidateQuestion(topic, currentCandidateSite, {
          originZip: priorIntent.originZip,
          checkIn: priorIntent.checkIn,
          checkOut: priorIntent.checkOut,
          amenityHint,
        });
        pushChat("agent", answer);
        pushEvent(
          deriveCandidateQuestionAnsweredEvent(
            topic,
            `${currentCandidateSite.siteName} at ${currentCandidateSite.campgroundName}`,
          ),
        );
        return;
      }

      if (wasPendingClarification) {
        pushEvent(deriveClarificationResolvedEvent());
        setPendingClarification(false);
      }

      // Multi-step deterministic clarification (Search Truth correction,
      // 2026-09-02): the user just picked a quick-reply BRANCH, not a
      // concrete value — its label text (the only thing this turn's
      // message actually contained) cannot have supplied one, no matter
      // what the model's own status/intent says. This always wins, before
      // any other gate below, and never re-derives a recommendation this
      // turn.
      if (forcedFollowUpQuestion) {
        pushEvent(deriveClarificationRequestedEvent(forcedFollowUpQuestion));
        pushAttention("clarification", "Needs your input", forcedFollowUpQuestion);
        setPendingClarification(true);
        return;
      }

      // Deterministic relative/holiday date-phrase normalization (Search
      // Truth correction, 2026-09-02): resolve a recognized phrase (e.g.
      // "Labor Day weekend") into concrete checkIn/checkOut BEFORE any date
      // prerequisite is checked, so a recognized phrase never gets treated
      // as "still missing".
      const { intent: dateNormalizedIntent, normalized } = normalizeIntentDates(
        interpretation.intent,
      );
      if (normalized) {
        pushEvent(
          deriveDatePhraseNormalizedEvent(
            dateNormalizedIntent.checkIn as string,
            dateNormalizedIntent.checkOut as string,
          ),
        );
      }
      // Deterministic destination-phrase normalization (Dataset Depth
      // correction, 2026-09-04 — see docs/implementation-decisions.md):
      // strips locational filler ("near ", "around ", "in ", trailing
      // " area") so "near Austin"/"San Antonio area" match the dataset's
      // real city/region names the same way "Hill Country"/"East Texas"
      // already do, without relying on the model to have stripped it.
      // Party-Composition Inference (2026-09-10 — see
      // docs/implementation-decisions.md): applied against `priorIntent`
      // (the app's own real established state, including any prior chip
      // removal) so this only fires on the turn `travelingWithChildren`
      // first becomes true — never re-forcing the preference back in on a
      // later, unrelated turn after the user has removed it.
      const inferredIntent: TripIntent = applyFamilyPreferenceInference(
        priorIntent,
        {
          ...dateNormalizedIntent,
          destinationRegion: normalizeDestinationRegion(dateNormalizedIntent.destinationRegion),
        },
      );
      // Party-size backstop: when the question just asked was the party
      // size (a Choose is waiting on it), read a bare "4" / "just me" reply
      // deterministically if the interpreter left guestCount unset.
      const askedForPartySize =
        wasPendingSearchMissing?.[0] === "guest_count" ||
        (wasPendingBookingRequest &&
          (() => {
            const prior = checkBookingPrerequisites(priorIntent);
            return prior.status === "missing_prerequisites" && prior.missing[0] === "guest_count";
          })());
      const answeredPartySize =
        askedForPartySize && !inferredIntent.guestCount ? parsePartySizeAnswer(userMessage) : null;
      // "Anywhere" in answer to the destination question: location is
      // intentionally unconstrained — the destination stays empty (never a
      // fake "Anywhere" region) and stops being asked for.
      const destinationUnconstrained =
        wasPendingSearchMissing?.[0] === "destination" && isUnconstrainedDestinationAnswer(userMessage);
      const partySized: TripIntent = answeredPartySize
        ? { ...inferredIntent, guestCount: answeredPartySize }
        : inferredIntent;
      const normalizedIntent: TripIntent = destinationUnconstrained
        ? { ...partySized, destinationRegion: null }
        : partySized;
      // Prerequisites the user actually supplied this turn (a waived
      // destination is recorded as relaxed, not "provided").
      const suppliedKinds = (kinds: PrerequisiteKind[]) =>
        destinationUnconstrained ? kinds.filter((k) => k !== "destination") : kinds;
      if (destinationUnconstrained) pushEvent(deriveDestinationUnconstrainedEvent());

      const intentEvent = deriveIntentEvent(
        priorIntent,
        normalizedIntent,
        tripEstablished,
      );
      if (intentEvent) {
        pushEvent(intentEvent);
        if (intentEvent.type === "trip_established") setTripEstablished(true);
      }
      setIntent(normalizedIntent);

      // Deterministic Action Prerequisites (2026-09-01, corrected the same
      // day): checked against real structured state regardless of the
      // model's own status — an objectively required field being missing
      // is an application fact, not a semantic judgment the model can
      // override by saying "actionable". Resolved first (an interrupted
      // Accept/search takes priority over re-deriving a fresh
      // recommendation this same turn).
      if (wasPendingBookingRequest) {
        const bookingPrereq = checkBookingPrerequisites(normalizedIntent);
        const priorPrereq = checkBookingPrerequisites(priorIntent);
        const wasMissing = priorPrereq.status === "missing_prerequisites" ? priorPrereq.missing : [];
        const stillMissing = bookingPrereq.status === "missing_prerequisites" ? bookingPrereq.missing : [];
        const resolved = wasMissing.filter((kind) => !stillMissing.includes(kind));
        if (resolved.length > 0) pushEvent(derivePrerequisiteResolvedEvent(resolved));
        if (!stillMissing.some((kind) => kind === "check_in_date" || kind === "check_out_date")) {
          setDateAskAttempts(0);
        }
        if (bookingPrereq.status === "actionable" && acceptedCandidateOnHold) {
          setPendingBookingRequest(false);
          if (acceptedCandidateOnHold.campsite.capacity >= (normalizedIntent.guestCount as number)) {
            finishAccept(acceptedCandidateOnHold, normalizedIntent);
            return;
          }
          // The party turned out larger than the chosen site holds — fall
          // through to the normal refinement flow, which re-evaluates the
          // search against the real party size instead of staging a
          // reservation the site can't honor.
        } else if (acceptedCandidateOnHold) {
          // Still missing something — ask for the next one rather than
          // silently proceeding or losing the interrupted Choose. Loop
          // protection for dates: a reply that looked like a date attempt
          // but still didn't resolve escalates to a more specific question.
          const asksDates = stillMissing[0] === "check_in_date" || stillMissing[0] === "check_out_date";
          const attempt = asksDates && looksLikeDateAttempt(userMessage) ? dateAskAttempts + 1 : dateAskAttempts;
          if (asksDates) setDateAskAttempts(attempt);
          pushAttention("clarification", "Needs your input", questionFor(stillMissing, "booking", attempt));
          return;
        } else {
          setPendingBookingRequest(false);
        }
      }

      // Which prerequisite SET applies depends on what kind of request
      // this is — resuming a previously-blocked search must keep asking
      // about what THAT original message actually required (an
      // availability-backed search stays availability-backed even if this
      // turn's own text, e.g. a bare ZIP code, wouldn't itself look like
      // one), never re-classified by whatever text happens to answer it.
      const availabilityBacked = wasPendingSearchMissing
        ? wasPendingSearchAvailabilityBacked
        : wasPendingClarification
          ? (currentRequestAvailabilityBacked ??
              !isExploratoryDiscoveryMessage(userMessage))
          : !isExploratoryDiscoveryMessage(userMessage);
      setCurrentRequestAvailabilityBacked(availabilityBacked);
      const searchPrereq = checkSearchPrerequisites(normalizedIntent, {
        availabilityBacked,
        // A destination/party size the user removed stays required until
        // they give a new one.
        required: suppliedKinds(explicitSearchRequirements(wasPendingSearchMissing)),
      });
      if (searchPrereq.status === "missing_prerequisites") {
        // Only announce what's newly resolved/newly revealed — re-asking
        // about a prerequisite that was ALREADY known missing last turn
        // must not spam a duplicate "missing" event every turn.
        const justResolved = wasPendingSearchMissing
          ? wasPendingSearchMissing.filter(
              (k) => !searchPrereq.missing.includes(k),
            )
          : [];
        if (suppliedKinds(justResolved).length > 0) {
          pushEvent(derivePrerequisiteResolvedEvent(suppliedKinds(justResolved)));
        }
        if (!wasPendingSearchMissing || justResolved.length > 0) {
          pushEvent(derivePrerequisiteMissingEvent(searchPrereq.missing));
        }
        // Loop protection for the date leg of this same gate (see above).
        const stillMissingDates =
          searchPrereq.missing.includes("check_in_date") ||
          searchPrereq.missing.includes("check_out_date");
        const attempt = stillMissingDates
          ? looksLikeDateAttempt(userMessage)
            ? dateAskAttempts + 1
            : dateAskAttempts
          : 0;
        setDateAskAttempts(attempt);
        pushAttention(
          "clarification",
          "Needs your input",
          questionFor(searchPrereq.missing, "search", attempt),
        );
        setPendingSearchMissing(searchPrereq.missing);
        setPendingSearchAvailabilityBacked(availabilityBacked);
        return;
      }
      setDateAskAttempts(0);
      if (wasPendingSearchMissing) {
        if (suppliedKinds(wasPendingSearchMissing).length > 0) {
          pushEvent(derivePrerequisiteResolvedEvent(suppliedKinds(wasPendingSearchMissing)));
        }
        setPendingSearchMissing(null);
      }

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

      // Recommendation-readiness gate (Search Truth correction, 2026-09-02
      // — see docs/implementation-decisions.md): the THIRD gate, distinct
      // from semantic status (above) and deterministic prerequisites
      // (already resolved above). Reachable only once the model considers
      // the request actionable AND every deterministic prerequisite is
      // met — this still refuses to hand back a specific recommendation
      // when there's nothing to explain it by (fixes "Find me somewhere
      // good for camping" + dates alone jumping straight to a recommendation).
      // Exploratory Discovery correction (2026-09-07 — see
      // docs/implementation-decisions.md): `availabilityBacked` — the SAME
      // classification `checkSearchPrerequisites` above already used, not
      // independently re-derived — determines which readiness rule
      // applies. Exploratory discovery specifically requires a destination
      // signal; other trip-character preferences (quiet, family-friendly)
      // do not substitute for it, unlike the availability-backed path.
      const readiness = checkRecommendationReadiness(normalizedIntent, {
        availabilityBacked,
      });
      if (readiness.status === "insufficient") {
        pushEvent(deriveRecommendationReadinessInsufficientEvent());
        pushAttention(
          "clarification",
          "Needs your input",
          readiness.question,
          readiness.quickReplies,
        );
        setPendingRecommendationReadiness(true);
        return;
      }
      if (pendingRecommendationReadiness) {
        pushEvent(deriveRecommendationReadinessSatisfiedEvent());
        setPendingRecommendationReadiness(false);
      }

      // actionable
      pushEvent(deriveEvaluationPerformedEvent(unavailableIds));
      const result = evaluateCampsites(normalizedIntent, unavailableIds);
      setEvaluation(result);
      setCandidateIndex(0);
      setRecommendationOrigin("initial");
      firstCandidateOriginRef.current = "initial";
      pushEvent(deriveRecommendationSelectedEvent(result));
      // Active-Recommendation Follow-Up correction (2026-09-05): only frame
      // this as a refinement acknowledgment when a recommendation already
      // existed before this turn — the very first recommendation for a
      // trip still gets the ordinary first-time summary.
      announceEvaluation(
        result,
        wasAlreadyRecommending
          ? {
              addedLabels: diffAddedRequirements(priorIntent, normalizedIntent),
              previousCandidateId,
            }
          : undefined,
      );
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
    // Both Send-click and Enter submit through this one function.
    if (submitEndsInputInteraction()) {
      // Mobile (phone-QA correction, 2026-10-01): submitting ends the input
      // interaction. Dismiss the software keyboard and never queue a
      // refocus, so the arriving agent/system content gets the viewport;
      // the keyboard returns only when the user taps the composer again.
      composerInputRef.current?.blur();
    } else {
      // Desktop — Persistent Composer Focus (2026-09-09): mark composer
      // focus as pending so it returns once the response arrives. Never set
      // for handleQuickReply, which is the user explicitly clicking a
      // different control and should not have focus dragged back afterward.
      pendingComposerFocusRef.current = true;
    }
    void submitMessage(draft);
  }

  function handleQuickReply(reply: QuickReplyOption) {
    void submitMessage(reply.label, {
      forcedFollowUpQuestion: reply.followUpQuestion,
    });
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
    cancelRecommendationQuery();
    if (!evaluation || evaluation.kind !== "no_match") return;
    const { intent: widenedIntent, widened } = widenSearch(intent, evaluation);
    if (!widened) return;

    pushEvent(deriveRequirementWidenedEvent(widened));
    intentGenerationRef.current++;
    setIntent(widenedIntent);

    pushEvent(deriveEvaluationPerformedEvent(unavailableIds));
    const result = evaluateCampsites(widenedIntent, unavailableIds);
    setEvaluation(result);
    setCandidateIndex(0);
    setRecommendationOrigin("initial");
    firstCandidateOriginRef.current = "initial";
    pushChat(
      "agent",
      `I widened the search — "${widened}" is now flexible instead of required.`,
    );
    pushEvent(deriveRecommendationSelectedEvent(result));
    announceEvaluation(result);
  }

  /**
   * Chip removal — X means "CampOps, don't assume this anymore", for every
   * trip chip, literal or derived. The chip's semantic source is cleared
   * from the trip at once (`clearChipSource`: "Capacity for 10" clears the
   * party size, "In San Antonio" the destination, …); nothing else changes.
   * Then CampOps decides, through the existing search prerequisites, whether
   * it can still search:
   *  - yes → the user-initiated recommendation transition (as "Show me
   *    another option"): Working, then a fresh result set for the relaxed
   *    request;
   *  - no (destination, dates or party size now unknown) → the old
   *    recommendation is withdrawn and the existing clarification asks for
   *    the missing value; answering it runs a fresh search.
   * Every removal is acknowledged in the conversation and recorded in
   * Activity; overlapping searches supersede each other but never undo a
   * removal.
   */
  async function handleRemoveTripDetail(source: ChipSource, label: string) {
    const nextIntent = clearChipSource(intent, source);
    if (JSON.stringify(nextIntent) === JSON.stringify(intent)) return;
    const shown = rawRequirementLabel(label);
    if (source.kind === "requirement") {
      const tier = TIER_SECTIONS.find((s) => s.key === source.key)?.tier;
      if (tier) pushEvent(deriveRequirementRemovedEvent(tier, source.value));
    } else {
      pushEvent(deriveTripDetailRemovedEvent(shown));
    }
    intentGenerationRef.current++;
    setIntent(nextIntent);

    const availabilityBacked = pendingSearchMissing
      ? pendingSearchAvailabilityBacked
      : (currentRequestAvailabilityBacked ?? true);
    const required: PrerequisiteKind[] = [
      ...explicitSearchRequirements(pendingSearchMissing),
      ...(source.kind === "destination" ? (["destination"] as const) : []),
      ...(source.kind === "party_size" ? (["guest_count"] as const) : []),
    ];
    const prereq = checkSearchPrerequisites(nextIntent, { availabilityBacked, required });

    if (prereq.status === "missing_prerequisites") {
      // Required information is now unknown: never search on stale or
      // invented values, and don't keep showing a recommendation for a
      // request that no longer exists.
      cancelRecommendationQuery();
      setEvaluation(null);
      setCandidateIndex(0);
      setRecommendationOrigin("initial");
      firstCandidateOriginRef.current = "initial";
      pushChat("agent", `Removed "${shown}".`);
      // One question at a time: re-ask only if the question itself changes
      // (later gaps are asked in turn once this one is answered).
      if (JSON.stringify(pendingSearchMissing) !== JSON.stringify(prereq.missing)) {
        pushEvent(derivePrerequisiteMissingEvent(prereq.missing));
      }
      if (pendingSearchMissing?.[0] !== prereq.missing[0]) {
        pushAttention("clarification", "Needs your input", questionFor(prereq.missing, "search"));
      }
      setPendingSearchMissing(prereq.missing);
      setPendingSearchAvailabilityBacked(availabilityBacked);
      setCurrentRequestAvailabilityBacked(availabilityBacked);
      return;
    }

    // The search can still run. Acknowledge now (every removal keeps its
    // own acknowledgment, even if its search is superseded), without
    // scrolling the conversation — the new result is what to look at.
    suppressRevealRef.current = "all";
    pushChat("agent", `Removed "${shown}" — no longer treating it as a requirement.`);
    const query = beginRecommendationQuery("recommendation");
    const excluded = unavailableIds;
    const result = await simulateCampsiteQuery(() => evaluateCampsites(nextIntent, excluded));
    if (!finishRecommendationQuery(query)) return;
    pushEvent(deriveEvaluationPerformedEvent(excluded));
    setEvaluation(result);
    setCandidateIndex(0);
    setRecommendationOrigin("initial");
    firstCandidateOriginRef.current = "initial";
    // No Match recovery lives in the conversation, so that one is revealed.
    if (result.kind !== "no_match") suppressRevealRef.current = "all";
    pushEvent(deriveRecommendationSelectedEvent(result));
    announceEvaluation(result);
  }

  function handleChangeRequirement() {
    // Explicit, immediate "let me type in the composer" action (the No
    // Match Attention Card's "Change a requirement" button) — unrelated to
    // the pending-after-submit mechanism above; this one always focuses
    // right away, the same real ref the rest of this feature uses.
    composerInputRef.current?.focus();
  }

  /**
   * Scripted, deterministic availability-loss trigger (Build Brief §13's
   * "developer/demo control" option) — never derived from the model. Marks
   * the currently active candidate unavailable, re-evaluates the remaining
   * set against the SAME (unmutated) TripIntent, and presents the loss and
   * the adapted pick together as two agent messages in one interaction.
   *
   * System-initiated, so the EXPLANATION is what gets revealed: the
   * "Availability changed" card is scrolled into view above the composer
   * (conversation column on desktop, the shared plane on mobile); the
   * recommendation panel transitions on its own — on desktop its own
   * scroll region resets independently, on mobile the view is never pulled
   * away from the explanation, and the replacement simply becomes
   * available below it.
   */
  async function handleSimulateAvailabilityLoss() {
    if (recommendationQueryActiveRef.current || !activeCandidate) return;
    const lost = activeCandidate;
    const query = beginRecommendationQuery("explanation");

    pushEvent(deriveAvailabilityChangedEvent(lost));
    pushEvent(deriveCandidateExcludedEvent(lost));

    const nextUnavailable = new Set(unavailableIds);
    nextUnavailable.add(lost.campsite.id);
    setUnavailableIds(nextUnavailable);

    // Availability-loss recovery correction (Search Truth correction,
    // 2026-09-02 — see docs/implementation-decisions.md): the approved
    // design treats this as a dedicated attention/recovery state, not
    // ordinary chat — the shared AttentionCard states the loss (known
    // immediately), and once the replacement query resolves the agent's
    // following message presents the adapted pick, which the Trip Panel
    // shows via `evaluation`/`activeCandidate`. The card is revealed by the
    // normal new-message reveal (not suppressed).
    pushAttention("availability_loss", "Availability changed", buildLossMessage(lost));

    pushEvent(deriveEvaluationPerformedEvent(nextUnavailable));
    const adapted = await simulateCampsiteQuery(() =>
      evaluateCampsites(intent, nextUnavailable),
    );
    if (!finishRecommendationQuery(query)) return;
    setEvaluation(adapted);
    setCandidateIndex(0);
    setRecommendationOrigin("adapted");
    firstCandidateOriginRef.current = "adapted";
    pushEvent(deriveReplacementSelectedEvent(adapted, 0));
    // Mobile: don't move the view off the explanation when the replacement
    // arrives. Desktop: the conversation reveals it like any reply (the
    // panel is a separate scroll region).
    suppressRevealRef.current = "mobile";
    pushChat("agent", buildRecoveryMessages(lost, adapted).adaptedMessage);
  }

  /**
   * Accept stages a real Reservation from deterministic application state
   * (the accepted Candidate's campsite + the current TripIntent's guest
   * count and dates) and switches to the Reservation Review screen — not a
   * chat acknowledgment standing in for booking state.
   *
   * Conversation owns reservation readiness: a reservation is never staged
   * until everything it needs apart from payment is known — real dates AND
   * the party size. `checkBookingPrerequisites` reads only real TripIntent
   * fields; if anything is missing, staging is skipped (the candidate stays
   * exactly as selected), CampOps asks for it as an ordinary clarification,
   * and `pendingBookingRequest` finishes this same Choose automatically once
   * the answer arrives, so the user asks once, not twice.
   */
  function handleAccept() {
    if (!activeCandidate) return;
    const prereq = checkBookingPrerequisites(intent);
    if (prereq.status === "missing_prerequisites") {
      pushEvent(derivePrerequisiteMissingEvent(prereq.missing));
      pushAttention(
        "clarification",
        "Needs your input",
        questionFor(prereq.missing, "booking"),
      );
      setPendingBookingRequest(true);
      return;
    }
    finishAccept(activeCandidate, intent);
  }

  /** The actual staging transition — factored out so a resolved
   * `pendingBookingRequest` can complete the same Choose the user
   * already asked for, without re-deriving a `recommendation_accepted`
   * event for a click that never happened a second time. */
  function finishAccept(candidate: Candidate, forIntent: TripIntent) {
    pushEvent(deriveRecommendationAcceptedEvent(candidate));
    const { reservation: staged, event } = stageReservation(
      candidate.campsite,
      // Non-null by construction: only reachable after
      // checkBookingPrerequisites reports "actionable".
      forIntent.guestCount as number,
      forIntent.checkIn as string,
      forIntent.checkOut as string,
      savedPaymentMethod,
    );
    updateReservation(staged);
    pushEvent(event);
    setView("reservation");
  }

  async function handleRequestAlternative() {
    if (recommendationQueryActiveRef.current || !canRequestAlternative || !evaluation) return;
    const query = beginRecommendationQuery("recommendation");
    pushEvent(deriveAlternativeRequestedEvent());
    const current = evaluation;
    const nextIndex = await simulateCampsiteQuery(() => candidateIndex + 1);
    if (!finishRecommendationQuery(query)) return;
    setCandidateIndex(nextIndex);
    setRecommendationOrigin("alternative");
    pushEvent(deriveReplacementSelectedEvent(current, nextIndex));
    // Conversational acknowledgment of the request (Pages v2 Alternative
    // frames) — names only the real next candidate, no invented claims.
    const next = current.candidates[nextIndex].campsite;
    suppressRevealRef.current = "all";
    pushChat(
      "agent",
      `Sure — here's another option: ${next.siteName} at ${next.campgroundName}.`,
    );
  }

  /** Final option reached → "Start over with the first option": cycles back
   * to the first recommendation of the SAME result set (no new search, no
   * requirement change), through the same transition as another option. */
  async function handleRestartOptions() {
    if (recommendationQueryActiveRef.current || !evaluation || candidateIndex === 0) return;
    const query = beginRecommendationQuery("recommendation");
    const current = evaluation;
    const firstIndex = await simulateCampsiteQuery(() => 0);
    if (!finishRecommendationQuery(query)) return;
    setCandidateIndex(firstIndex);
    setRecommendationOrigin(firstCandidateOriginRef.current);
    const first = current.candidates[firstIndex];
    pushEvent(deriveFirstOptionRequestedEvent(first));
    suppressRevealRef.current = "all";
    pushChat(
      "agent",
      `Here's the first option again: ${first.campsite.siteName} at ${first.campsite.campgroundName}.`,
    );
  }

  /**
   * Recommendation transition: a real transient state that a live async
   * query could drive. `reveal` says what the user should see:
   *  - "recommendation" (user-initiated — Show me another option, Start
   *    over): the panel is reset to the top first — while the current card
   *    is still laid out, so it can actually scroll there — then the loading
   *    state replaces the card, and the result appears at the top.
   *  - "explanation" (system-initiated — availability change): on mobile
   *    the shared plane is left for the explanation message to claim; on
   *    desktop only the panel's own scroll region resets.
   * Returns the query's token; any later trip change supersedes it (see
   * cancelRecommendationQuery).
   */
  function beginRecommendationQuery(reveal: "recommendation" | "explanation"): number {
    transitionRevealRef.current = reveal;
    // Mobile, explanation-first: hold the panel at its current height while
    // it loads, so the shared plane doesn't shrink (and the browser doesn't
    // clamp its scroll position) underneath the explanation being revealed.
    const panel = tripPanelRef.current;
    if (panel && reveal === "explanation" && !window.matchMedia("(min-width: 1024px)").matches) {
      panel.style.minHeight = `${panel.offsetHeight}px`;
    }
    scrollTripPanelToTop();
    // Re-pin once the loading state has rendered (its height differs).
    pinPanelTopAfterRenderRef.current = true;
    recommendationQueryActiveRef.current = true;
    setRecommendationLoading(true);
    recommendationQueryRef.current += 1;
    return recommendationQueryRef.current;
  }

  /** Ends the transition if `query` is still the current one; false means
   * it was superseded and its result must be discarded. */
  function finishRecommendationQuery(query: number): boolean {
    if (query !== recommendationQueryRef.current) return false;
    recommendationQueryActiveRef.current = false;
    releasePanelHeight();
    setRecommendationLoading(false);
    // Keep the new campsite pinned at the top once it has rendered.
    pinPanelTopAfterRenderRef.current = true;
    return true;
  }

  function cancelRecommendationQuery() {
    recommendationQueryRef.current += 1;
    recommendationQueryActiveRef.current = false;
    releasePanelHeight();
    setRecommendationLoading(false);
  }

  function releasePanelHeight() {
    if (tripPanelRef.current) tripPanelRef.current.style.minHeight = "";
  }

  /** Scrolls only the recommendation panel's own scroll region: the Trip
   * Panel on desktop (the conversation column is untouched), or — on
   * mobile, where the panel sits inline in the single content plane — that
   * plane, just far enough to bring the panel's top to the top. On mobile a
   * system-initiated ("explanation") transition never scrolls the plane:
   * the explanation message owns the view there. */
  function scrollTripPanelToTop() {
    const panel = tripPanelRef.current;
    if (!panel) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      panel.scrollTop = 0;
      return;
    }
    if (transitionRevealRef.current === "explanation") return;
    const plane = contentPlaneRef.current;
    if (!plane) return;
    plane.scrollTop +=
      panel.getBoundingClientRect().top - plane.getBoundingClientRect().top;
  }

  // After a recommendation transition resolves, keep the new campsite at
  // the top of the panel once it has actually rendered (its height differs
  // from the loading state's).
  useEffect(() => {
    if (!pinPanelTopAfterRenderRef.current) return;
    pinPanelTopAfterRenderRef.current = false;
    scrollTripPanelToTop();
  });

  function applyReservationEvent(event: ReservationEvent) {
    if (!reservation) return;
    const { reservation: next, event: taskEvent } = transitionReservation(reservation, event);
    updateReservation(next);
    pushEvent(taskEvent);
  }

  /** Save payment method — mocked: no real payment integration (PRD §9 /
   * Build Brief: no real payment processing for this POC). */
  function handleSavePaymentMethod(label: string) {
    applyReservationEvent({ type: "ADD_PAYMENT_METHOD", label });
    setSavedPaymentMethod(label);
  }

  /** Cancel reservation, after its confirmation dialog: discards the staged
   * (uncharged) reservation and returns to the conversation, where the trip
   * and the recommendation are still in place. */
  function handleCancelReservation() {
    if (!reservation) return;
    pushEvent(discardStagedReservation(reservation, "cancelled"));
    const { siteName, campgroundName } = reservation.campsite;
    updateReservation(null);
    setView("search");
    pushChat(
      "agent",
      `I've cancelled the staged reservation for ${siteName} at ${campgroundName}. Nothing was charged — the recommendation is still here if you change your mind.`,
    );
  }

  /** Edit reservation: deliberate, user-initiated trip editing (not
   * missing-information recovery). Sets the staged reservation aside and
   * returns to the conversation with the trip, search and recommendation
   * intact, inviting the change. The composer is focused within the same tap
   * — like "Change my requirements", so the mobile keyboard opens for it. */
  function handleEditReservation() {
    if (!reservation) return;
    pushEvent(discardStagedReservation(reservation, "editing"));
    updateReservation(null);
    setEditingTrip(true);
    pushChat(
      "agent",
      "Sure — what would you like to change? Your trip details and the current recommendation are kept; tell me what's different and I'll update them.",
    );
    flushSync(() => setView("search"));
    composerInputRef.current?.focus();
  }

  function clearAuthorizeTimeout() {
    if (authorizeTimeoutRef.current !== null) {
      clearTimeout(authorizeTimeoutRef.current);
      authorizeTimeoutRef.current = null;
    }
  }

  /** Confirm's own "Reserve Site X — $Y" click: the explicit authorization.
   * Enters Processing, then the simulated charge resolves to Confirmed. */
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
    applyReservationEvent({ type: "CANCEL_AUTHORIZATION" });
  }

  function handleOpenActivity() {
    setView("activity");
  }

  function handleBackToTrip() {
    // "search" is the only origin today — every screen with the persistent
    // trip panel is the search view; Reservation/Authorize/Confirmed have
    // no Trip Panel and no "View activity" entry point per live Figma.
    // Returns to the normal conversation state: on mobile the Your Trip
    // sheet stays collapsed (Activity is launched from the Mobile Status
    // Bar, not from inside Your Trip, so there is no sheet to restore).
    setView("search");
  }

  /** Full task reset (Closing's "Start a new search") — no prior state leaks into the new trip. */
  function handleStartNewSearch() {
    clearAuthorizeTimeout();
    cancelRecommendationQuery();
    setMessages([]);
    setEvents([]);
    setDraft("");
    setIntent(EMPTY_TRIP_INTENT);
    setEvaluation(null);
    setCandidateIndex(0);
    setRecommendationOrigin("initial");
    firstCandidateOriginRef.current = "initial";
    setSeenTripKey(tripStateKey(EMPTY_TRIP_INTENT));
    setShowTripDetailsSheet(false);
    setUnavailableIds(new Set());
    setIsWorking(false);
    setError(null);
    setPendingClarification(false);
    setPendingSearchMissing(null);
    setPendingSearchAvailabilityBacked(true);
    setCurrentRequestAvailabilityBacked(null);
    setPendingBookingRequest(false);
    setDateAskAttempts(0);
    setPendingRecommendationReadiness(false);
    setTripEstablished(false);
    intentGenerationRef.current = 0;
    updateReservation(null);
    setSavedPaymentMethod(null);
    setEditingTrip(false);
    setView("search");
  }

  function handleTripSheetOpenChange(open: boolean) {
    setShowTripDetailsSheet(open);
    // Opening the sheet — or closing it after, say, removing a chip inside
    // it — means the user has now seen the current trip state, which clears
    // the grab bar's green "changed" state.
    setSeenTripKey(tripKey);
  }

  // The conversation lives in a bounded scroll region, so newly added
  // messages must be brought into view explicitly — in whichever direction
  // they are. They can land below (the usual reply) or ABOVE the viewport
  // (mobile, after acting on the inline recommendation further down, e.g.
  // "Show me another option" or the availability-loss trigger). The new
  // batch's first message is never scrolled past: if the whole batch fits,
  // it's revealed with its end just clear of the composer; if not, its
  // start is aligned to the top. Returning from Activity jumps to the end.
  useEffect(() => {
    // Away from the conversation (Reservation, Activity) the seen-count is
    // kept, so coming back reveals only what was added meanwhile — e.g. the
    // Edit/Cancel reservation message — or, with nothing new, the latest one.
    if (view !== "search") return;
    const list = messageListRef.current;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const scroller = isDesktop
      ? chatColumnRef.current
      : contentPlaneRef.current;
    if (!list || !scroller || messages.length === 0) return;
    // Messages a recommendation transition marks as not-to-reveal are
    // recorded as seen without scrolling: "all" for user-initiated changes
    // (the result is what to look at), "mobile" for the replacement after an
    // availability change (the view stays on the explanation there).
    const suppress = suppressRevealRef.current;
    suppressRevealRef.current = null;
    if (suppress === "all" || (suppress === "mobile" && !isDesktop)) {
      revealedMessageCountRef.current = messages.length;
      return;
    }

    const firstNewIndex = Math.min(
      revealedMessageCountRef.current,
      messages.length - 1,
    );
    revealedMessageCountRef.current = messages.length;
    const first = list.children[firstNewIndex];
    const last = list.children[messages.length - 1];
    if (!first || !last) return;

    const GAP = 16;
    // The composer's fade bar is layered over the bottom of the scroll
    // region at every width (sticky on desktop, fixed with the grab bar
    // on mobile), so new content must clear it.
    const view_ = scroller.getBoundingClientRect();
    const bar = composerBarRef.current?.getBoundingClientRect();
    const obscuredBottom = bar ? Math.max(0, view_.bottom - bar.top) : 0;
    const top = view_.top + GAP;
    const bottom = view_.bottom - obscuredBottom - GAP;
    const firstTop = first.getBoundingClientRect().top;
    const lastBottom = last.getBoundingClientRect().bottom;

    let delta = 0;
    if (lastBottom - firstTop > bottom - top) delta = firstTop - top;
    else if (firstTop < top) delta = firstTop - top;
    else if (lastBottom > bottom) delta = lastBottom - bottom;
    if (delta === 0) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollBy({
      top: delta,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages.length, view]);

  function renderAttentionActions(
    entry: Extract<ChatEntry, { kind: "attention" }>,
  ) {
    // Pages v2: attention actions sit in a row on desktop and stack
    // full-width on mobile.
    const actionRow =
      "flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center";
    const actionButton = "w-full lg:w-auto";
    if (entry.attentionType === "clarification") {
      if (!entry.quickReplies || entry.quickReplies.length === 0) return null;
      return (
        <div className={actionRow}>
          {entry.quickReplies.map((reply) => (
            <Button
              key={reply.label}
              variant="outline"
              className={actionButton}
              onClick={() => handleQuickReply(reply)}
            >
              {reply.label}
            </Button>
          ))}
        </div>
      );
    }
    if (entry.attentionType === "availability_loss") {
      // Pure narration — no decision required here; Choose/Show me another
      // option/etc. for the adapted candidate live in the Trip Panel as
      // usual, same as any other active recommendation.
      return null;
    }
    if (entry.attentionType === "unsupported") {
      return (
        <div className={actionRow}>
          <Button className={actionButton} onClick={handleContinueUnsupported}>
            Continue with campsite search
          </Button>
          <Button
            variant="outline"
            className={actionButton}
            onClick={handleDecline}
          >
            Never mind
          </Button>
        </div>
      );
    }
    // no_match
    return (
      <div className={actionRow}>
        <Button className={actionButton} onClick={handleWidenSearch}>
          Widen search
        </Button>
        <Button
          variant="outline"
          className={actionButton}
          onClick={handleChangeRequirement}
        >
          Change a requirement
        </Button>
        <button
          type="button"
          onClick={handleDecline}
          className={`${text.bodySm} cursor-pointer self-center text-water underline lg:self-auto`}
        >
          No thanks, not right now
        </button>
      </div>
    );
  }

  if (view === "activity") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header onLogoClick={handleStartNewSearch} />
        <main className="flex-1">
          <div className="mx-auto flex w-[560px] max-w-full flex-col items-start gap-6 px-6 py-4 lg:px-0 lg:py-8">
            <button
              type="button"
              onClick={handleBackToTrip}
              className={`${text.labelSm} cursor-pointer text-muted-foreground`}
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
      <div className="flex h-dvh flex-col bg-background">
        <Header onLogoClick={handleStartNewSearch} />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <CampIllustration />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8">
            <ChatBubble
              sender="agent"
              message={CLOSING_MESSAGE}
              maxWidthClassName="max-w-full lg:max-w-[480px]"
            />
            <Button className="w-full lg:w-auto" onClick={handleStartNewSearch}>
              Start a new search
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (view === "reservation" && reservation) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header onLogoClick={handleStartNewSearch} />
        <main className="flex-1">
          <ReservationReview
            reservation={reservation}
            onAddPaymentMethod={() => applyReservationEvent({ type: "BEGIN_ADD_PAYMENT" })}
            onCancelAddPayment={() => applyReservationEvent({ type: "CANCEL_ADD_PAYMENT" })}
            onSavePaymentMethod={handleSavePaymentMethod}
            onContinueToConfirmation={() => applyReservationEvent({ type: "CONTINUE_TO_CONFIRMATION" })}
            onCancelConfirmation={handleCancelAuthorization}
            onAuthorize={handleBeginAuthorize}
            onEditReservation={handleEditReservation}
            onCancelReservation={handleCancelReservation}
          />
        </main>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)] flex-col bg-background">
        <Header onLogoClick={handleStartNewSearch} />
        <main className="relative min-h-0 flex-1">
          <CampIllustration />
          {/* Pages v2 Start: frosted hero card upper-left, composer low and
              centered. The spacing above, between and below is made of
              flexible spacers (Figma's offsets as their preferred sizes)
              inside a definite-height flex column, so they shrink before
              anything overflows: no scrolling whenever the content fits —
              not even a sub-pixel rounding scroll — while a genuinely short
              viewport still scrolls instead of clipping. */}
          <div
            ref={startScrollerRef}
            className="absolute inset-0 flex flex-col overflow-y-auto px-7 lg:px-[100px]"
          >
            <div aria-hidden="true" className="h-[117px] min-h-6 lg:h-[209px] lg:min-h-8" />
            <div className="flex w-full max-w-[663px] shrink-0 flex-col gap-6 rounded-md bg-card/50 p-6 lg:rounded-lg">
              <h1
                className={`${text.displayH1} text-water lg:text-[48px] lg:leading-[1.1]`}
              >
                Your next campsite, without the search grind
              </h1>
              <p className={`${text.bodyLg} text-foreground`}>
                Tell CampOps about your trip — dates, dealbreakers,
                tradeoffs you&rsquo;re willing to make — and let it find the
                fit.
              </p>
            </div>
            <div aria-hidden="true" className="min-h-8 flex-1" />
            <div className="mx-auto flex w-full max-w-[720px] shrink-0 flex-col items-center gap-3">
              <Composer
                ref={composerInputRef}
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                isWorking={isWorking}
              />
              {/* Unobtrusive prototype disclaimer — small, muted, shown
                  only on the landing screen. */}
              <p
                className={`${text.caption} max-w-[480px] text-center text-muted-foreground`}
              >
                CampOps is a product design prototype. Campground
                inventory, availability, pricing, payments, and
                reservations are simulated.
              </p>
            </div>
            <div aria-hidden="true" className="h-8 min-h-4 lg:h-[180px] lg:min-h-8" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-[var(--app-top,0px)] flex h-[var(--app-height,100dvh)] flex-col bg-background">
      <Header onLogoClick={handleStartNewSearch} />
      {/* Handoff Spec 3: status changes are announced via a polite live
          region rather than by moving focus. */}
      <div aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>
      {/* DS Mobile Status Bar (Pages v2: every mobile conversation state,
          including recommendations) — the one live status Badge for the
          current view, plus the trip-details action. */}
      <TripStatusBar
        status={currentStatus}
        onViewDetails={() => handleTripSheetOpenChange(true)}
        onViewActivity={handleOpenActivity}
      />
      {/* Bounded workspace. Desktop: two side-by-side regions that scroll
          independently (conversation | trip panel); the composer's fade bar
          is sticky over the bottom of the conversation column so messages
          scroll behind it. Mobile: one scrolling content plane
          (conversation + inline recommendation); the composer bar and the
          Your Trip grab bar float above it as fixed foreground UI, with
          trailing padding so the last content can scroll clear of them. */}
      <main className="relative flex min-h-0 flex-1">
        <CampIllustration />
        <div
          ref={contentPlaneRef}
          className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-[calc(9rem+var(--safe-bottom))] max-lg:in-data-[keyboard-open]:pb-[100px] lg:flex-row lg:overflow-hidden lg:pb-0"
        >
          <section
            ref={chatColumnRef}
            className="scroll-region flex flex-col px-6 pt-4 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-y-auto lg:p-0"
          >
            {/* Direct children are exactly the messages, in order — the
                reveal-on-new-message effect indexes into them. */}
            <div
              ref={messageListRef}
              className="flex flex-col gap-4 lg:flex-[1_0_auto] lg:px-6 lg:pt-6 [&>*]:shrink-0"
            >
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
                  <div key={m.id} className="flex flex-col items-start gap-4">
                    <AttentionCard eyebrow={m.eyebrow} body={m.body} />
                    {isLatest && renderAttentionActions(m)}
                  </div>
                );
              })}
            </div>
            {/* Pages v2 "Sticky Composer Bar": the same fade-to-surface
                layer at every width — fixed above the content plane on
                mobile, sticky at the bottom of the conversation column on
                desktop (where the column's own scrollbar stays beside it).
                While the mobile software keyboard is open the Your Trip grab
                bar is hidden, so this layer shrinks to sit directly on the
                keyboard (Pages v2 "Keyboard open — Mobile": 84px). */}
            <div
              ref={composerBarRef}
              className="bg-linear-to-b from-surface-fade/0 to-surface-fade to-50% p-4 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--keyboard-inset,0px)+var(--safe-bottom))] max-lg:z-20 max-lg:h-[126px] max-lg:in-data-[keyboard-open]:h-[84px] lg:sticky lg:bottom-0 lg:z-10 lg:shrink-0 lg:p-6"
            >
              <Composer
                ref={composerInputRef}
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                isWorking={isWorking || recommendationLoading}
                placeholder={editingTrip ? "Tell CampOps what to change..." : undefined}
              />
            </div>
          </section>

          {/* Trip Panel — persistent translucent column at lg+. Below lg its
              content appears inline (after the conversation) only while a
              candidate is shown; otherwise the same trip state lives in the
              Your Trip sheet. One width for every state so the composer
              never shifts when a recommendation arrives. */}
          <aside
            ref={tripPanelRef}
            aria-busy={recommendationLoading}
            className={`scroll-region flex flex-col px-6 pb-6 lg:w-[clamp(400px,39vw,560px)] lg:shrink-0 lg:overflow-y-auto lg:bg-card/50 lg:p-6 [&>*]:shrink-0 ${
              showCandidateCard ? "gap-4 pt-4 lg:pt-6" : "gap-3"
            } ${showCandidateCard || error ? "" : "max-lg:hidden"} ${
              // While loading, the panel keeps at least a viewport of height
              // on mobile so its top can stay pinned to the top of the plane.
              recommendationLoading ? "max-lg:min-h-full" : ""
            }`}
          >
            {showCandidateCard && activeCandidate ? (
              <>
                {/* Panel Header — the status Badge and the Activity action
                    show here on desktop only. On mobile (Pages v2) this
                    header is title-only: the status and Activity both live
                    in the Mobile Status Bar (including Working while the
                    next campsite loads — shown once, not repeated here). */}
                <PanelHeader
                  title={candidateHeading.title}
                  badge={currentStatus}
                  badgeClassName="hidden lg:block"
                  activityOnDesktopOnly
                  onViewActivity={handleOpenActivity}
                />

                {/* Mobile loading content: says what CampOps is doing without
                    repeating the Working badge, which the Mobile Status Bar
                    shows as the single source of truth. Desktop has no
                    Status Bar, so its Working badge stays in the header. */}
                {recommendationLoading && (
                  <p className={`${text.bodySm} text-muted-foreground lg:hidden`}>
                    Finding another option…
                  </p>
                )}

                {/* The current campsite (and its actions) is replaced while
                    the next one is being found, so nothing stale can be
                    chosen and no second recommendation action can start. */}
                {!recommendationLoading && (
                <>

                {/* Real, deterministic fact (Figma's "Verified Row"): this
                    candidate passed evaluateCampsites' availability checks
                    moments ago — including a date-specific check whenever
                    concrete dates exist (Dataset Depth correction,
                    2026-09-04). For an exploratory recommendation (no dates
                    yet) it reflects only the static `available` flag —
                    see docs/implementation-decisions.md. */}
                <div className="flex items-center gap-1">
                  <span className="size-1.5 shrink-0 rounded-full bg-success" />
                  <span className={`${text.caption} text-success`}>
                    Availability verified just now
                  </span>
                </div>
                {evaluation?.kind === "compromise" && (
                  <p className={`${text.bodySm} text-muted-foreground`}>
                    No exact match — here&rsquo;s the closest option, with
                    what I couldn&rsquo;t confirm flagged below.
                  </p>
                )}
                <CandidateCard
                  photoSrc={campsitePhotoSrc(activeCandidate.campsite)}
                  location={activeCandidate.campsite.campgroundName}
                  siteName={activeCandidate.campsite.siteName}
                  siteType={activeCandidate.campsite.siteType}
                  capacityValue={`${activeCandidate.campsite.capacity} guests`}
                  distanceValue={
                    // Dataset Depth correction (2026-09-04): derived from the
                    // trip's real originZip, never a campsite-side static
                    // fact — honestly absent when no origin ZIP is known.
                    activeCandidate.distanceFromOriginMiles !== null
                      ? `${activeCandidate.distanceFromOriginMiles} mi`
                      : "Not available"
                  }
                  datesValue={
                    // The user's own requested dates, never the campsite's
                    // inventory-side `datesAvailable` — and honestly "Not
                    // yet set" for an exploratory recommendation.
                    intent.checkIn && intent.checkOut
                      ? `${intent.checkIn} – ${intent.checkOut}`
                      : "Not yet set"
                  }
                  priceValue={`$${activeCandidate.campsite.pricePerNight}/night`}
                  amenities={activeCandidate.campsite.amenities.map(
                    (code) => AMENITY_LABELS[code],
                  )}
                  preserved={activeCandidate.preserved}
                  compromises={activeCandidate.compromises}
                  explanation={activeCandidate.explanation}
                  chipSourceFor={(label) => resolveChipSource(intent, label)}
                  onRemoveChip={handleRemoveTripDetail}
                />

                {/* Result-set position — said in words, never by a disabled
                    control, whenever a useful next action exists. */}
                {(isOnlyMatch || isLastOfMatches) && (
                  <p className={`${text.bodySm} text-foreground`}>
                    {isOnlyMatch
                      ? "This is the only site that matches your current search."
                      : `That’s the last of ${matchCount} matches.`}
                  </p>
                )}
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                  <Button className="w-full lg:w-auto" onClick={handleAccept}>
                    Choose this site
                  </Button>
                  {canRequestAlternative && (
                    <Button
                      variant="outline"
                      className="w-full lg:w-auto"
                      onClick={handleRequestAlternative}
                    >
                      Show me another option
                    </Button>
                  )}
                  {isLastOfMatches && (
                    <Button
                      variant="outline"
                      className="w-full lg:w-auto"
                      onClick={handleRestartOptions}
                    >
                      Start over with the first option
                    </Button>
                  )}
                  {(isOnlyMatch || isLastOfMatches) && (
                    <Button
                      variant="outline"
                      className="w-full lg:w-auto"
                      onClick={handleChangeRequirement}
                    >
                      Change my requirements
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={handleRejectCandidate}
                    className={`${text.bodySm} cursor-pointer self-center whitespace-nowrap text-muted-foreground underline lg:self-auto`}
                  >
                    No thanks, I&rsquo;ll pass
                  </button>
                </div>
                {/* Scripted demo control (Build Brief §13) — not a designed
                    screen element, a deterministic exception trigger for
                    verifying availability-loss recovery. */}
                <button
                  type="button"
                  onClick={handleSimulateAvailabilityLoss}
                  className={`${text.caption} cursor-pointer self-start text-muted-foreground underline`}
                >
                  Simulate: this site just became unavailable
                </button>
                </>
                )}
              </>
            ) : (
              // Below lg this content lives in the Your Trip sheet instead
              // (same TripRequirementsList, same onRemove).
              <div className="hidden lg:contents">
                <PanelHeader
                  title="Your trip"
                  badge={currentStatus}
                  onViewActivity={handleOpenActivity}
                />
                {intent.goalStatement && (
                  <p className="font-sans text-[18px] leading-[1.45] text-muted-foreground">
                    &ldquo;{intent.goalStatement}&rdquo;
                  </p>
                )}
                <TripRequirementsList
                  intent={intent}
                  onRemove={handleRemoveTripDetail}
                />
              </div>
            )}
            {error && (
              <p className={`${text.bodySm} text-destructive`}>{error}</p>
            )}
          </aside>
        </div>
      </main>
      <TripDetailsSheet
        open={showTripDetailsSheet}
        onOpenChange={handleTripSheetOpenChange}
        changed={tripChangedUnseen}
        intent={intent}
        onRemove={handleRemoveTripDetail}
      />
    </div>
  );
}
