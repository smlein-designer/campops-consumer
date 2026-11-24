"use client";

// The live trip (Build Order stage 6): the real agent loop, wired to the
// store and the shared clock. Every Figma screen is a STATE this page can be
// in — a recommendation, a decision that needs the user, a suggestion, a
// pause, a lost site — reached from whatever trip the user actually asked
// for, not a fixed sequence.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClockProvider, useClock } from "@/lib/v3/clock";
import { TripProvider, useTrip } from "@/lib/v3/store";
import { emptyTrip } from "@/lib/v3/trip-factory";
import {
  acceptSuggestion,
  activeBookings,
  activeCampsiteBooking,
  answerActivityQuestion,
  applyDates,
  changeActivity,
  clearTripFact,
  continueTrip,
  defaultActivityChoice,
  dismissSuggestion,
  dropCampsiteDecision,
  fetchPhrasing,
  holdActivityChoice,
  holdSpecificCampsite,
  openActivitySlots,
  skipActivityChoice,
  releaseBooking,
  removeTripRequirement,
  offerActivity,
  otherOptionsReply,
  requestAlternativeCampsite,
  resolveHoldAsk,
  runAgentTurn,
  setRequirementTier,
  shownCampsite,
  widenTripSearch,
  RateLimitError,
  type TurnCheckpoint,
} from "@/lib/v3/agent-loop";
import { tryAnswerCandidateQuestion } from "@/lib/v3/candidate-qa";
import {
  holdBlockers,
  isAlternativeRequestMessage,
  isBrowseOptionsMessage,
  isNamedCampsiteSwitchMessage,
  needsYouAnswer,
  matchNamedCampsite,
  pauseCommand,
} from "@/lib/v3/clarification";
import { buildFitCard, campsiteCharacteristicTags, campsiteTitle, partyLabel } from "@/lib/v3/fit";
import {
  chooseSlot,
  fireCampsiteUnavailable,
  fireForecastChange,
  fireHoldExpiry,
  otherTimes,
  resolveCampsiteUnavailableHold,
  resolveForecastDecision,
  resolveHoldExpiryRehold,
  scenarioBlockers,
  startDemoTrip,
  DEMO_TRIP_MESSAGE,
} from "@/lib/v3/scripted-events";
import { newId } from "@/lib/id";
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { LandingHero } from "@/components/v3/landing-hero";
import { Itinerary, type MapPoint, type PendingItem } from "@/components/v3/itinerary";
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
import {
  bookingCardTitle,
  bookingKindAndTime,
  bookingWhen,
  tripFactChips,
  tripTitle,
  type TripFactKey,
} from "@/lib/v3/booking-display";
import { commitBooking } from "@/lib/v3/authorize";
import { formatUsd, tripTotal } from "@/lib/v3/money";
import { ACTIVITIES_BY_ID, providerForActivity } from "@/lib/v3/providers";
import { ADD_ONS } from "@/lib/v3/add-ons";
import { campsitePhoto, headerSrc, photoSrc, tripHeaderScene } from "@/lib/v3/photos";
import { campsiteById, openCampsites, partySize, searchCampsites, searchOne, tripRange } from "@/lib/v3/search";
import { siteDetails } from "@/lib/v3/site-details";
import { activityQuote, maxPeople } from "@/lib/v3/activity-choice";
import { ActivityChoice } from "@/components/v3/activity-choice";
import { dayHeading, spokenTime } from "@/lib/v3/trip-dates";
import { CampsiteDetails } from "@/components/v3/campsite-details";
import { isoSpanLabel } from "@/lib/v3/trip-dates";
import type { ActivityParty, ActivitySlot, CampsiteFitCard, Trip, TripEventKind } from "@/lib/v3/schemas";

/**
 * The trip as it is while showing the other sites that fit: a line in the
 * chat, a question about what to loosen only when few fit, and any open
 * campsite decision cleared — picking from the list answers it.
 */
function withOtherOptions(base: Trip, thread: Trip["thread"] = base.thread): Trip {
  const { line, question } = otherOptionsReply(base);
  const next = dropCampsiteDecision(base);
  return { ...next, clarifyingQuestion: question, thread: [...thread, { id: newId(), from: "agent", message: line }] };
}

/** Scrolls a plan step's card into view, in whichever layout is showing. */
function scrollToPlanTarget(stepId: string) {
  const target = [...document.querySelectorAll<HTMLElement>(`[data-plan-target="${stepId}"]`)].find((el) => el.offsetParent !== null);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Brings the activity picker into view in whichever layout is showing. */
function scrollToActivityPicker() {
  requestAnimationFrame(() => {
    const picker = [...document.querySelectorAll<HTMLElement>("[data-activity-picker]")].find((el) => el.offsetParent !== null);
    picker?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

type View ="plan" | "review" | "activity" | "permissions" | "campsite-options" | "other-times" | "site-details" | "activity-change";
type Result = { trip: Trip; factsToPhrase: string[]; checkpoints?: TurnCheckpoint[] };

type NeedsYouOutcome =
  | { kind: "apply"; result: Result }
  | { kind: "options" }
  | { kind: "view"; view: View }
  | { kind: "picker" }
  | { kind: "campsites" };

/**
 * What answering the open Needs You card does — the same whether the answer
 * came from a tap on the card or a reply in the chat.
 */
function needsYouOutcome(trip: Trip, item: Trip["needsYouQueue"][number], yes: boolean, fromChat: boolean, now: number): NeedsYouOutcome {
  // "Other options" on any campsite decision opens the list (and clears the alert).
  const wantsOptions =
    (!yes && (item.kind === "campsite_unavailable" || item.kind === "no_match" || item.payload?.stepId === "step-campsite")) ||
    (item.kind === "no_match" && item.primaryLabel === "Closest options");
  if (wantsOptions) return { kind: "options" };
  switch (item.kind) {
    case "forecast_move":
      return yes ? { kind: "apply", result: resolveForecastDecision(trip, item.id, now) } : { kind: "view", view: "other-times" };
    case "hold_expired":
      return { kind: "apply", result: yes ? resolveHoldExpiryRehold(trip, item.id, now) : releaseBooking(trip, item.payload?.bookingId ?? "", now) };
    case "campsite_unavailable":
      return { kind: "apply", result: resolveCampsiteUnavailableHold(trip, item.id, now) };
    case "no_match":
      return { kind: "apply", result: widenTripSearch(trip, now) };
    case "hold_ask":
      return { kind: "apply", result: resolveHoldAsk(trip, item.id, yes, now) };
    case "campsite_choice": {
      // "Choose a campsite" points to the cards; a "yes" in the chat (or the
      // card's "Hold Site N" when only one fits) holds the recommended site.
      if (!fromChat && item.primaryLabel === "Choose a campsite") return { kind: "campsites" };
      return { kind: "apply", result: holdSpecificCampsite(trip, item.payload?.campsiteId ?? "", now) };
    }
    case "activity_choice": {
      // The card's button only points to the times, which are picked in the plan.
      if (!fromChat && yes) return { kind: "picker" };
      // In the chat, "yes" takes the first open time for everyone; "skip it" leaves it out.
      if (!yes) return { kind: "apply", result: skipActivityChoice(trip, item.id, now) };
      const pick = defaultActivityChoice(trip, item.payload?.activityId ?? "");
      return pick ? { kind: "apply", result: holdActivityChoice(trip, item.id, pick.slot, pick.party, now) } : { kind: "picker" };
    }
  }
  return { kind: "picker" };
}

const PAUSED_LINE = "Paused. Your holds keep counting down and stay free to cancel. Say resume, or tap Resume, when you are ready.";
const STALE_LINE = "Your trip changed while I was working on that — go ahead and repeat it so I have the latest picture.";
const BEAT_MS = 650;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type OptionActions = Parameters<typeof CampsiteOption>[0]["actions"];

/** A campsite fit card, with the site's own photo. */
function OptionCard({
  card,
  state,
  actions = [],
  onDetails,
}: {
  card: CampsiteFitCard;
  state: "recommended" | "alternative" | "unavailable" | "closest";
  actions?: OptionActions;
  onDetails?: (campsiteId: string) => void;
}) {
  const cardSite = campsiteById(card.campsiteId);
  const details = onDetails ? [{ label: "Site details", variant: "ghost" as const, onClick: () => onDetails(card.campsiteId) }] : [];
  return (
    <CampsiteOption
      state={state}
      eyebrow={card.eyebrow}
      title={card.title}
      facts={card.facts}
      badge={card.badge}
      fit={card.fit}
      reason={card.reason}
      photo={cardSite ? campsitePhoto(cardSite) : undefined}
      actions={[...actions, ...details]}
    />
  );
}

/**
 * The time and party picker for one activity, from this trip's open times.
 * `exceptBookingId` is the booking being changed, so its own time counts as
 * open. Renders nothing when no time is open.
 */
function ActivityPicker({
  trip,
  activityId,
  exceptBookingId,
  initial,
  eyebrow,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  trip: Trip;
  activityId: string;
  exceptBookingId?: string;
  initial?: { day: string; time: string; party?: ActivityParty };
  eyebrow: string;
  confirmLabel: (price: number) => string;
  cancelLabel: string;
  onConfirm: (slot: ActivitySlot, party: ActivityParty) => void;
  onCancel: () => void;
}) {
  const activity = ACTIVITIES_BY_ID[activityId];
  const slots = activity ? openActivitySlots(trip, activity, exceptBookingId) : [];
  const fallback = defaultActivityChoice(trip, activityId, exceptBookingId);
  if (!activity || slots.length === 0 || !fallback) return null;
  const keyOf = (s: ActivitySlot) => `${s.date} ${s.startTime}-${s.endTime}`;
  const days = Array.from(new Set(slots.map((s) => s.date)))
    .sort()
    .map((date) => ({
      heading: dayHeading(date),
      times: slots.filter((s) => s.date === date).map((s) => ({ key: keyOf(s), label: spokenTime(`${s.startTime}-${s.endTime}`) })),
    }));
  const wanted = initial ? `${initial.day} ${initial.time}` : "";
  const others = tripTotal(activeBookings(trip).filter((b) => b.id !== exceptBookingId));
  const budget = trip.intent.budgetTotalUsd;
  const roomNote =
    activity.pricingBasis === "per_person"
      ? partySize(trip.intent) > activity.capacity
        ? `Up to ${activity.capacity} per booking.`
        : undefined
      : activity.type === "kayak"
        ? "Each kayak seats two."
        : activity.type === "boat"
          ? `Each boat seats ${activity.capacity}.`
          : undefined;
  return (
    <ActivityChoice
      eyebrow={eyebrow}
      title={`${activity.name} · ${providerForActivity(activity).name}`}
      subtitle={activity.refundTerms}
      photo={activity.photoKey ? photoSrc(activity.photoKey) : undefined}
      days={days}
      initialKey={slots.some((s) => keyOf(s) === wanted) ? wanted : keyOf(fallback.slot)}
      initialParty={initial?.party ?? fallback.party}
      maxAdults={trip.intent.adults}
      maxChildren={trip.intent.children}
      maxTotal={maxPeople(activity, trip.intent)}
      roomNote={roomNote}
      quote={(party) => activityQuote(activity, party)}
      warning={(price) =>
        budget != null && others + price > budget ? `That brings the trip to ${formatUsd(others + price)}, over your ${formatUsd(budget)} budget.` : null
      }
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onCancel={onCancel}
      onConfirm={(key, party) => {
        const slot = slots.find((s) => keyOf(s) === key);
        if (slot) onConfirm(slot, party);
      }}
    />
  );
}

function LiveTripPlan() {
  const { trip, dispatch } = useTrip();
  const { now } = useClock();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("plan");
  // Which campsite the details screen shows, and where Back returns to.
  const [details, setDetails] = useState<{ siteId: string; from: View } | null>(null);
  const showDetails = (siteId: string) => {
    setDetails({ siteId, from: view });
    setView("site-details");
  };
  // The held activity whose time or party is being changed.
  const [changingId, setChangingId] = useState<string | null>(null);
  /** A card's link: a campsite's details, or an activity's time and party. */
  const openBooking = (bookingId: string) => {
    const booking = trip.bookings.find((b) => b.id === bookingId);
    if (booking?.kind === "campsite") return showDetails(booking.refId);
    setChangingId(bookingId);
    setView("activity-change");
  };
  const [itineraryView, setItineraryView] = useState("By day");
  const [editingChip, setEditingChip] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<"All" | "Your decisions" | "Holds" | "Changes" | "Searches">("All");
  const [commitError, setCommitError] = useState<string | null>(null);
  // Pausing stops the plan at its next beat, so it has to be readable from
  // inside an in-flight reveal.
  const pausedRef = useRef(false);
  // v2's stale-result guard: bumped by every direct change (a chip, a
  // release, a button). A model reply that was interpreted against the trip
  // as it stood before that change is discarded, never applied over it.
  const generationRef = useRef(0);

  const say = (message: string) => dispatch({ type: "ADD_MESSAGE", message: { id: newId(), from: "agent", message } });

  /** Reveals a result beat by beat (Build Brief §17: paced progress). If the
   * user pauses mid-way, the plan stops at the beat it reached. */
  async function reveal(result: Result, thread: Trip["thread"]) {
    const lines = await fetchPhrasing(result.factsToPhrase);
    const beats = result.checkpoints ?? [{ trip: result.trip, facts: result.factsToPhrase }];
    let cursor = 0;
    for (let i = 0; i < beats.length; i++) {
      if (pausedRef.current && i > 0) return;
      const beat = beats[i];
      const said = lines.slice(cursor, cursor + beat.facts.length);
      cursor += beat.facts.length;
      thread = [...thread, ...said.map((line) => ({ id: newId(), from: "agent" as const, message: line }))];
      dispatch({ type: "RESET", trip: { ...beat.trip, thread, agent: { ...beat.trip.agent, paused: pausedRef.current } } });
      if (i < beats.length - 1) await sleep(BEAT_MS);
    }
  }

  /** Applies a change the user or the app made directly — no model call. */
  async function apply(result: Result, thread: Trip["thread"] = trip.thread) {
    if (result.trip === trip && result.factsToPhrase.length === 0) return;
    generationRef.current++;
    setEditingChip(null);
    setBusy(true);
    dispatch({ type: "SET_AGENT", agent: { working: true, currentStepText: "updating the plan" } });
    try {
      await reveal(result, thread);
    } finally {
      setBusy(false);
    }
  }

  function pause() {
    pausedRef.current = true;
    dispatch({ type: "SET_AGENT", agent: { paused: true } });
    say(PAUSED_LINE);
  }

  function resume(thread: Trip["thread"] = trip.thread) {
    pausedRef.current = false;
    const resumed: Trip = { ...trip, agent: { ...trip.agent, paused: false } };
    const settled = trip.plan.every((s) => s.status === "done") && holdBlockers(trip.intent).length === 0;
    void apply(
      settled || trip.needsYouQueue.length > 0
        ? { trip: resumed, factsToPhrase: ["Resumed. Nothing changed while you were away."] }
        : continueTrip(resumed, now, ["Resumed. Picking up where I left off."]),
      thread,
    );
  }



  async function handleSubmit(message: string) {
    const userMsg = { id: newId(), from: "user" as const, message };
    dispatch({ type: "ADD_MESSAGE", message: userMsg });
    const thread = [...trip.thread, userMsg];
    const answer = (line: string) =>
      dispatch({ type: "RESET", trip: { ...trip, agent: { ...trip.agent, paused: false }, thread: [...thread, { id: newId(), from: "agent", message: line }] } });

    // Changing a booked trip is out of scope for this prototype (PRD v3 §11).
    if (trip.authorization.approved) {
      return answer("This trip is booked, so I can't change it from here. Tap the campops logo to plan a new one.");
    }

    // Pausing and resuming by saying so (Figma "Paused").
    const command = pauseCommand(message);
    if (command === "pause" && !trip.agent.paused) return pause();
    if (trip.agent.paused) {
      pausedRef.current = false;
      if (command === "resume") return resume(thread);
    }
    // Any other message while paused picks the trip back up.
    const current: Trip = { ...trip, agent: { ...trip.agent, paused: false } };

    // A reply to the open Needs You card answers it here, and the card closes:
    // the card and the chat are one conversation.
    const openCard = trip.needsYouQueue[0];
    const reply = openCard ? needsYouAnswer(openCard, message) : null;
    if (reply) return resolveNeedsYou(reply, thread);

    // "Any activities?" / "any boats to rent?" — from what's really near
    // the site, before it can be mistaken for a question about the site.
    const activityAnswer = answerActivityQuestion(current, message);
    if (activityAnswer) return apply(activityAnswer, thread);

    // A factual question about the site on screen is answered from its
    // record: no model call, nothing changes (v2's candidate follow-up).
    const candidateAnswer = tryAnswerCandidateQuestion(current, message);
    if (candidateAnswer) return answer(candidateAnswer);

    const hasSite = !!shownCampsite(current);
    if ((hasSite || holdBlockers(current.intent).length === 0) && isBrowseOptionsMessage(message)) {
      return showOtherOptions(current, thread);
    }
    // "Let's switch to Prairie Flats" — a named site, not the next option.
    if (isNamedCampsiteSwitchMessage(message)) {
      const target = matchNamedCampsite(message, openCampsites(current));
      if (target) return apply(holdSpecificCampsite(current, target.id, now, ["Done."]), thread);
    }
    if (hasSite && isAlternativeRequestMessage(message)) {
      return apply(requestAlternativeCampsite(current, now), thread);
    }

    setBusy(true);
    dispatch({ type: "SET_AGENT", agent: { working: true, paused: false, phase: "interpreting", currentStepText: "reading your message" } });
    const generation = generationRef.current;
    try {
      const result = await runAgentTurn(current, message, now);
      if (generationRef.current !== generation) {
        say(STALE_LINE);
        dispatch({ type: "SET_AGENT", agent: { working: false } });
        return;
      }
      await reveal(result, thread);
    } catch (err) {
      // v2's public demo rate limiting: a calm message, and the trip so far
      // is left exactly as it was.
      say(err instanceof RateLimitError ? err.message : "Something went wrong reaching the model — try again?");
      dispatch({ type: "SET_AGENT", agent: { working: false, phase: "awaiting_user" } });
      if (!(err instanceof RateLimitError)) console.error(err);
    } finally {
      setBusy(false);
    }
  }

  // A hold that really runs out is handled the moment it does (Build Brief
  // §7: one clock drives every countdown) — not only when the demo fires it.
  const expiredHold = busy
    ? undefined
    : trip.holds.find((h) => h.expiresAt <= now && trip.bookings.some((b) => b.holdId === h.id && b.status === "held"));
  useEffect(() => {
    if (!expiredHold) return;
    // Handled on the next tick, as the outside event it is.
    const timer = setTimeout(() => void apply(fireHoldExpiry(trip, now, expiredHold.bookingId)), 0);
    return () => clearTimeout(timer);
    // Only the expiry itself should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredHold?.id]);


  const needsYou = trip.needsYouQueue[0];
  const blockers = scenarioBlockers(trip);

  function showOtherOptions(base: Trip, thread: Trip["thread"] = base.thread) {
    setView("campsite-options");
    dispatch({ type: "RESET", trip: withOtherOptions(base, thread) });
  }

  /**
   * Answers the open Needs You card. From a tap (`chatThread` left out), the
   * button's words go into the chat as the user's answer; from a chat reply,
   * `chatThread` already holds it. Either way the card closes.
   */
  function resolveNeedsYou(choice: "primary" | "secondary", chatThread?: Trip["thread"]) {
    if (!needsYou) return;
    const yes = choice === "primary";
    const outcome = needsYouOutcome(trip, needsYou, yes, !!chatThread, now);
    if (outcome.kind === "picker") {
      setView("plan");
      return scrollToActivityPicker();
    }
    if (outcome.kind === "campsites") {
      setView("plan");
      return scrollToPlanTarget("step-campsite");
    }
    // A tap goes into the chat as the user's answer, in the button's words.
    const tapped = { id: newId(), from: "user" as const, message: yes ? needsYou.primaryLabel : (needsYou.secondaryLabel ?? "") };
    if (!chatThread) dispatch({ type: "ADD_MESSAGE", message: tapped });
    const thread = chatThread ?? [...trip.thread, tapped];
    if (outcome.kind === "options") {
      setView("campsite-options");
      return dispatch({ type: "RESET", trip: withOtherOptions(trip, thread) });
    }
    if (outcome.kind === "view") return setView(outcome.view);
    return apply(outcome.result, thread);
  }

  // A new activity choice is brought into view, where the times are.
  const choiceId = needsYou?.kind === "activity_choice" ? needsYou.id : undefined;
  useEffect(() => {
    if (choiceId) scrollToActivityPicker();
  }, [choiceId]);

  function handleHoldCampsite(campsiteId: string) {
    setView("plan");
    void apply(holdSpecificCampsite(trip, campsiteId, now));
  }

  function handleChooseTime(slot: ActivitySlot) {
    if (!needsYou) return;
    setView("plan");
    void apply(chooseSlot(trip, needsYou.id, slot, now));
  }

  function handleClarifyingOption(label: string) {
    const option = trip.clarifyingQuestion?.options.find((o) => o.label === label);
    if (option?.activityId) {
      const userMsg = { id: newId(), from: "user" as const, message: label };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      return void apply(offerActivity(trip, option.activityId), [...trip.thread, userMsg]);
    }
    if (option?.relaxRequirementId || option?.dropDriveLimit) {
      const userMsg = { id: newId(), from: "user" as const, message: label };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      const base: Trip = { ...trip, clarifyingQuestion: null };
      const result = option.relaxRequirementId ? setRequirementTier(base, option.relaxRequirementId, "nice", now) : clearTripFact(base, "drive", now);
      return void apply(result, [...trip.thread, userMsg]);
    }
    if (option?.checkIn && option.checkOut) {
      const userMsg = { id: newId(), from: "user" as const, message: label };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      void apply(applyDates(trip, option.checkIn, option.checkOut, now), [...trip.thread, userMsg]);
    } else {
      void handleSubmit(label);
    }
  }

  function handleCommit() {
    if (!trip.authorization.paymentMethodLabel) return;
    const result = commitBooking(trip, trip.authorization.paymentMethodLabel, now);
    if (!result.ok) return setCommitError(result.reason);
    setCommitError(null);
    setView("plan");
    const count = result.trip.bookings.filter((b) => b.status === "approved").length;
    dispatch({
      type: "RESET",
      trip: {
        ...result.trip,
        suggestions: result.trip.suggestions.filter((s) => s.state !== "offered"),
        thread: [
          ...result.trip.thread,
          {
            id: newId(),
            from: "agent",
            message: `${count === 1 ? "It's booked" : `All ${count} are booked`}. Each provider is emailing its confirmation, and every booking keeps the refund terms you saw. Have a great trip.`,
          },
        ],
      },
    });
  }

  function startOver() {
    pausedRef.current = false;
    generationRef.current++;
    setView("plan");
    setEditingChip(null);
    setCommitError(null);
    dispatch({ type: "RESET", trip: emptyTrip() });
  }

  /** Demo: a fresh trip from the Figma story's request, as if the user typed it. */
  function startDemoTripNow() {
    startOver();
    const fresh = emptyTrip();
    const userMsg = { id: newId(), from: "user" as const, message: DEMO_TRIP_MESSAGE };
    void apply(startDemoTrip({ ...fresh, thread: [userMsg] }, now), [userMsg]);
  }

  function handleNavigate(item: "Trips" | "Activity" | "Permissions") {
    setView(item === "Trips" ? "plan" : item === "Activity" ? "activity" : "permissions");
  }

  // ---- What the screen shows, all read off the same trip state ------------

  // The campsite first, then everything in the order it happens.
  const inOrder = (a: Trip["bookings"][number], b: Trip["bookings"][number]) =>
    a.kind === "campsite" ? -1 : b.kind === "campsite" ? 1 : `${a.day}${a.time ?? ""}`.localeCompare(`${b.day}${b.time ?? ""}`);
  const active = [...activeBookings(trip)].sort(inOrder);
  const approved = trip.bookings.filter((b) => b.status === "approved").sort(inOrder);
  const anyHeld = active.length > 0;
  const total = tripTotal(active);
  const range = tripRange(trip.intent);
  const campsiteBooking = activeCampsiteBooking(trip) ?? approved.find((b) => b.kind === "campsite");
  const site = campsiteBooking ? campsiteById(campsiteBooking.refId) : undefined;
  // Never beside a decision that needs the user (PRD v3 §9).
  // An add-on offer waits while CampOps is asking something, so it never
  // pushes a question or a choice out of view in the chat.
  const lastLine = trip.thread.at(-1);
  const asking =
    trip.needsYouQueue.length > 0 || !!trip.clarifyingQuestion || !!trip.pendingAsk || (lastLine?.from === "agent" && lastLine.message.trim().endsWith("?"));
  const offeredSuggestion = asking ? undefined : trip.suggestions.find((s) => s.state === "offered");
  const factChips = tripFactChips(trip.intent);
  const title = tripTitle(trip, site);
  const booked = trip.authorization.approved;
  const chargeStatus = booked
    ? `Booked · ${formatUsd(tripTotal(approved))} charged`
    : anyHeld
      ? "Nothing charged yet"
      : "Nothing held or charged yet";

  // Start · Empty (Figma 5:64): before the first message.
  if (trip.thread.length === 0) {
    return (
      <>
        <LandingHero onSubmit={handleSubmit} busy={busy} />
        <DemoPanel
          onStartDemoTrip={startDemoTripNow}
          onFireForecast={() => void apply(fireForecastChange(trip, now))}
          onFireHoldExpiry={() => void apply(fireHoldExpiry(trip, now))}
          onFireCampsiteUnavailable={() => void apply(fireCampsiteUnavailable(trip, now))}
          blockers={blockers}
          onReset={startOver}
        />
      </>
    );
  }

  const planDone = trip.plan.filter((s) => s.status === "done").length;
  const progress = anyHeld
    ? `${planDone} of ${trip.plan.length} arranged`
    : `Step ${Math.min(planDone + 1, Math.max(trip.plan.length, 1))} of ${Math.max(trip.plan.length, 1)}`;
  const working = busy || trip.agent.working;
  const agent = booked
    ? { state: "working" as const, title: "Trip booked", detail: `All ${approved.length} confirmed · nothing left to do` }
    : {
        state: trip.agent.paused ? ("paused" as const) : working ? ("working" as const) : ("waiting" as const),
        title: trip.agent.paused
          ? "Paused"
          : working
            ? trip.plan.length === 0 || (planDone === 0 && !anyHeld)
              ? "CampOps is starting"
              : "CampOps is working"
            : "Waiting for you",
        detail: trip.agent.paused
          ? "No new holds until you resume"
          : trip.agent.phase === "complete" && !working
            ? anyHeld
              ? "Everything is held · ready to book"
              : "Nothing held · tell me what you'd like"
            : trip.plan.length === 0
              ? "Reading your message"
              : `${progress} · ${trip.agent.currentStepText || "reading your message"}`,
        onPause: pause,
        onResume: () => resume(),
      };

  const heroStatus = booked
    ? "Trip · booked"
    : anyHeld
      ? "Trip plan · in progress"
      : trip.campsiteComparison
        ? "Trip plan · finding your campsite"
        : "Trip plan · taking shape";
  const hero = (
    <TripHero
      size={anyHeld || booked ? "large" : "compact"}
      status={heroStatus}
      title={title}
      photo={headerSrc(tripHeaderScene(trip.intent, shownCampsite(trip)))}
      facts={factChips.map((c) => c.label)}
    />
  );

  const shell = (children: ReactNode, extras: { approveBar?: ReactNode; threadFooter?: ReactNode } = {}) => (
    <TripShell
      chargeStatus={chargeStatus}
      hero={hero}
      onNavigate={handleNavigate}
      onLogoClick={startOver}
      agent={agent}
      needsYou={
        needsYou && !booked
          ? {
              eyebrow: needsYou.eyebrow,
              message: needsYou.message,
              primary: { label: needsYou.primaryLabel },
              secondary: needsYou.secondaryLabel
                ? { label: needsYou.secondaryLabel }
                : undefined,
            }
          : undefined
      }
      onNeedsYouPrimary={() => resolveNeedsYou("primary")}
      onNeedsYouSecondary={() => resolveNeedsYou("secondary")}
      thread={trip.thread.map((m) => ({ from: m.from, message: m.message }))}
      threadFooter={extras.threadFooter}
      approveBar={extras.approveBar}
      onReview={() => setView("review")}
      onComposerSubmit={busy ? undefined : handleSubmit}
      composerPlaceholder={anyHeld ? "Tell CampOps what to change" : "Reply or add anything"}
    >
      {children}
      <DemoPanel
        onStartDemoTrip={startDemoTripNow}
        onFireForecast={() => void apply(fireForecastChange(trip, now))}
        onFireHoldExpiry={() => void apply(fireHoldExpiry(trip, now))}
        onFireCampsiteUnavailable={() => void apply(fireCampsiteUnavailable(trip, now))}
        blockers={blockers}
        onReset={startOver}
      />
    </TripShell>
  );

  const secondaryPage = (activeNav: "Trips" | "Activity" | "Permissions", children: ReactNode) => (
    <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
      <TopNav active={activeNav} chargeStatus={chargeStatus} onNavigate={handleNavigate} onLogoClick={startOver} />
      {children}
    </div>
  );

  // ---- One campsite in full (v2's Candidate Card facts and amenities) -----

  const detailsSite = view === "site-details" && details ? campsiteById(details.siteId) : undefined;
  if (detailsSite && details) {
    const isPick = detailsSite.id === campsiteBooking?.refId;
    const fitCard = buildFitCard(searchOne({ intent: trip.intent, unavailableCampsiteIds: [] }, detailsSite.id), detailsSite.id, trip.intent, "");
    const canHold =
      !booked && !isPick && !!range && holdBlockers(trip.intent).length === 0 && !trip.unavailableCampsiteIds.includes(detailsSite.id);
    return shell(
      <CampsiteDetails
        photo={campsitePhoto(detailsSite)}
        eyebrow={isPick ? (booked ? "Your campsite · booked" : "Your campsite · held") : "Campsite"}
        title={campsiteTitle(detailsSite)}
        {...siteDetails(detailsSite, trip.intent)}
        fit={fitCard?.fit ?? []}
        actions={
          <>
            {canHold && <Button variant="primary" label={`Hold ${detailsSite.siteName}`} onClick={() => handleHoldCampsite(detailsSite.id)} />}
            <Button variant="ghost" label="Back" onClick={() => setView(details.from)} />
          </>
        }
      />,
    );
  }

  // ---- Booked (Figma 36:1286): after approval, nothing left to decide ------

  if (booked) {
    return shell(
      <Itinerary
        bookings={approved}
        photoByBookingId={site && campsiteBooking ? { [campsiteBooking.id]: campsitePhoto(site) } : undefined}
        showHeader
        view="By day"
        onDetails={() => site && showDetails(site.id)}
      />,
      {
        approveBar: (
          <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-bg-inverse)] py-3 pr-4 pl-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-price-l text-[var(--color-text-on-inverse)]">{formatUsd(tripTotal(approved))}</p>
              <p className="text-body-s text-[var(--color-text-on-inverse)] opacity-80">
                {approved.length} booking{approved.length === 1 ? "" : "s"} confirmed · charged to {trip.authorization.paymentMethodLabel}
              </p>
            </div>
            <Button variant="inverse" label="View confirmations" onClick={() => setView("activity")} />
          </div>
        ),
      },
    );
  }

  // ---- Review and approve (Figma 10:112) ----------------------------------

  if (view === "review") {
    const result = searchCampsites(trip);
    return secondaryPage(
      "Trips",
      <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
        <div className="space-y-2">
          <p className="text-overline text-[var(--color-text-secondary)]">Review before booking</p>
          <h1 className="text-heading-l text-[var(--color-text-primary)]">{title}</h1>
          <p className="text-body-s text-[var(--color-text-secondary)]">
            {[range ? isoSpanLabel(range.startISO, range.endISO) : "", partyLabel(trip.intent), campsiteBooking?.title ?? ""].filter(Boolean).join(" · ")}
          </p>
          <CommitNote message="Nothing is booked or charged yet. Every item below is held and free to cancel until you book." />
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
          {active.map((booking) => (
            <ReviewLineItem
              key={booking.id}
              title={bookingCardTitle(booking)}
              when={[booking.provider ? booking.title : booking.category, booking.meta, bookingWhen(booking, trip.intent)].filter(Boolean).join(" · ")}
              terms={booking.status === "hold_expired" ? "Hold ran out — it needs holding again before you book" : booking.refundTerms}
              tags={booking.kind === "campsite" ? campsiteCharacteristicTags(result, booking.refId) : undefined}
              flag={booking.changeNote}
              amount={`$${booking.price}`}
              onEdit={booking.kind === "campsite" || (booking.kind === "activity" && booking.status === "held") ? () => openBooking(booking.id) : undefined}
              onRemove={() => void apply(releaseBooking(trip, booking.id, now))}
            />
          ))}
          {active.length === 0 && <p className="py-4 text-body-m text-[var(--color-text-secondary)]">Nothing left to review.</p>}
        </div>

        <div className="space-y-2">
          <SummaryRow label={`${active.length} booking${active.length === 1 ? "" : "s"} · no service fees`} value={formatUsd(total)} />
          {trip.authorization.paymentMethodLabel && (
            <div className="flex items-center justify-between gap-3">
              <SummaryRow label="Charged to" value={trip.authorization.paymentMethodLabel} />
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_AUTHORIZATION", authorization: { paymentMethodLabel: null } })}
                className="shrink-0 text-label-s text-[var(--color-text-link)] hover:underline"
              >
                Change
              </button>
            </div>
          )}
          <SummaryRow label="Total today" value={formatUsd(total)} />
        </div>
        {!trip.authorization.paymentMethodLabel && (
          <PaymentForm onSave={(label) => dispatch({ type: "SET_AUTHORIZATION", authorization: { paymentMethodLabel: label } })} />
        )}

        <div className="space-y-1 rounded-xl bg-[var(--color-bg-subtle)] px-4 py-3 text-body-s text-[var(--color-text-secondary)]">
          <p className="text-label-m text-[var(--color-text-primary)]">When you book</p>
          <p>· CampOps confirms {active.length === 1 ? "the booking" : `all ${active.length} bookings`} with each provider.</p>
          <p>
            · Your {trip.authorization.paymentMethodLabel || "card"} is charged {formatUsd(total)}
            {active.length === 1 ? "." : `, as ${active.length} separate charges.`}
          </p>
          <p>· Confirmations arrive by email. Each item keeps the refund terms above.</p>
        </div>

        {commitError && <p className="text-body-s text-[var(--color-text-attention)]">{commitError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" label="Back to plan" onClick={() => setView("plan")} />
          <Button
            variant="primary"
            size="large"
            label={`Book ${active.length} item${active.length === 1 ? "" : "s"} · charge ${formatUsd(total)}`}
            onClick={handleCommit}
            disabled={!trip.authorization.paymentMethodLabel || active.length === 0 || !!needsYou}
          />
        </div>
        {needsYou && <p className="text-body-s text-[var(--color-text-attention)]">One item still needs your decision before you can book.</p>}
      </div>,
    );
  }

  // ---- Activity (Figma 18:570) --------------------------------------------

  if (view === "activity") {
    const permissionLabel = (id: string | null) => trip.permissions.find((p) => p.id === id)?.label;
    const matchesFilter = (kind: TripEventKind | undefined, actor: string) => {
      if (activityFilter === "All") return true;
      if (activityFilter === "Your decisions") return actor === "You";
      if (activityFilter === "Holds") return kind === "hold";
      if (activityFilter === "Changes") return kind === "change";
      return kind === "search";
    };
    return secondaryPage(
      "Activity",
      <div className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[1fr_320px] md:p-10">
        <div className="space-y-4">
          <div>
            <p className="text-overline text-[var(--color-text-secondary)]">{title}</p>
            <h1 className="text-heading-l text-[var(--color-text-primary)]">Activity</h1>
            <p className="text-body-m text-[var(--color-text-secondary)]">
              Everything CampOps did on this trip, what you decided, and which rule allowed each step.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["All", "Your decisions", "Holds", "Changes", "Searches"] as const).map((label) => (
              <FilterChip key={label} label={label} selected={activityFilter === label} onClick={() => setActivityFilter(label)} />
            ))}
          </div>
          <div className="rounded-xl bg-[var(--color-bg-surface)] px-4">
            {[...trip.events]
              .reverse()
              .filter((e) => matchesFilter(e.kind, e.actor))
              .map((event) => (
                <ActivityLogRow
                  key={event.id}
                  time={new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  what={event.what}
                  rule={event.actor === "You" ? "You decided" : permissionLabel(event.permissionId) ? `Rule: ${permissionLabel(event.permissionId)}` : "No rule needed"}
                  actor={event.actor}
                  details={event.details}
                />
              ))}
            {trip.events.length === 0 && <p className="py-4 text-body-s text-[var(--color-text-secondary)]">Nothing recorded yet.</p>}
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl bg-[var(--color-bg-surface)] p-4">
            <h2 className="text-heading-s text-[var(--color-text-primary)]">Money</h2>
            <SummaryRow label="Charged" value={formatUsd(tripTotal(approved))} />
            <SummaryRow label="Held, free to cancel" value={formatUsd(total)} />
            {!booked && <SummaryRow label="Waiting on you" value={needsYou ? "One decision" : anyHeld ? "Book on the review screen" : "Nothing yet"} />}
          </div>
          <div className="space-y-2 rounded-xl bg-[var(--color-bg-surface)] p-4">
            <h2 className="text-heading-s text-[var(--color-text-primary)]">What this trip touched</h2>
            {[...active, ...approved].map((b) => (
              <SummaryRow key={b.id} label={bookingCardTitle(b)} value={b.status === "approved" ? "Booked" : b.status === "held" ? "Held" : "Needs you"} />
            ))}
            {active.length + approved.length === 0 && <p className="text-body-s text-[var(--color-text-secondary)]">Nothing yet.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" label="Review permissions" onClick={() => setView("permissions")} />
            <Button variant="ghost" label="Back to trip" onClick={() => setView("plan")} />
          </div>
        </div>
      </div>,
    );
  }

  // ---- Permissions (Figma 12:171) -----------------------------------------

  if (view === "permissions") {
    const used = [...trip.events].reverse().filter((e) => e.permissionId && e.actor === "CampOps").slice(0, 4);
    return secondaryPage(
      "Permissions",
      <div className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[1fr_300px] md:p-10">
        <div className="space-y-4">
          <h1 className="text-heading-l text-[var(--color-text-primary)]">What CampOps may do without asking</h1>
          <p className="text-body-m text-[var(--color-text-secondary)]">
            CampOps always searches, compares and plans for you. These rules decide what it can do next without asking.
            Changes apply to its very next action.
          </p>
          <div className="rounded-xl bg-[var(--color-bg-surface)] px-4">
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
                      options={[100, 200, 300, 400].map((limit) => ({ label: `Up to $${limit} each`, value: String(limit) }))}
                      onChange={(value) => dispatch({ type: "SET_PERMISSION_LIMIT", permissionId: permission.id, limitUsd: Number(value) })}
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
          <Button variant="ghost" label="Back to trip" onClick={() => setView("plan")} />
        </div>
        <div className="h-fit space-y-3 rounded-xl bg-[var(--color-bg-surface)] p-4">
          <h2 className="text-heading-s text-[var(--color-text-primary)]">Used on this trip</h2>
          {used.map((event) => (
            <div key={event.id}>
              <p className="text-body-s text-[var(--color-text-primary)]">{event.what}</p>
              <p className="text-caption text-[var(--color-text-held)]">Rule: {trip.permissions.find((p) => p.id === event.permissionId)?.label}</p>
            </div>
          ))}
          {used.length === 0 && <p className="text-body-s text-[var(--color-text-secondary)]">Nothing yet — CampOps hasn&apos;t acted on a rule.</p>}
          <button type="button" onClick={() => setView("activity")} className="text-label-s text-[var(--color-text-link)] underline">
            See the full activity log
          </button>
        </div>
      </div>,
    );
  }

  const approveBar = anyHeld ? (
    <ApproveBar
      amount={formatUsd(total)}
      summary={`${active.length} booking${active.length === 1 ? "" : "s"} · nothing is charged until you approve`}
      onReview={() => setView("review")}
    />
  ) : undefined;

  // ---- Changing a held activity's time or who's going ---------------------

  const changing = view === "activity-change" ? trip.bookings.find((b) => b.id === changingId && b.status === "held") : undefined;
  if (changing?.time) {
    return shell(
      <ActivityPicker
        key={changing.id}
        trip={trip}
        activityId={changing.refId}
        exceptBookingId={changing.id}
        initial={{ day: changing.day, time: changing.time, party: changing.party }}
        eyebrow="Change time or who's going"
        confirmLabel={(price) => `Save · $${price}`}
        cancelLabel="Back"
        onCancel={() => setView("plan")}
        onConfirm={(slot, party) => {
          setView("plan");
          void apply(changeActivity(trip, changing.id, slot, party, now));
        }}
      />,
      { approveBar },
    );
  }

  // ---- Other campsite options (Figma 31:915) ------------------------------

  if (view === "campsite-options") {
    const result = searchCampsites(trip);
    const canHold = !!range && holdBlockers(trip.intent).length === 0;
    const candidates = result.candidates.slice(0, 6);
    return shell(
      <div className="space-y-4">
        <div>
          <h2 className="text-heading-m text-[var(--color-text-primary)]">
            {result.kind === "no_match" ? "No site fits everything" : "Other campsites"}
            {range ? ` · ${isoSpanLabel(range.startISO, range.endISO)}` : ""}
          </h2>
          <p className="text-body-s text-[var(--color-text-secondary)]">
            {result.kind === "no_match"
              ? "The closest options, and the must-have each one misses."
              : `Sorted by how well they fit.${campsiteBooking ? ` ${campsiteBooking.title} is still my pick.` : ""}`}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {candidates.map((candidate) => {
            const isPick = candidate.campsite.id === campsiteBooking?.refId;
            const card = buildFitCard(result, candidate.campsite.id, trip.intent, isPick ? "Current pick" : result.kind === "no_match" ? "Closest match" : "Option");
            if (!card) return null;
            return (
              <OptionCard
                key={card.campsiteId}
                card={card}
                onDetails={showDetails}
                state={isPick ? "recommended" : result.kind === "no_match" ? "closest" : "alternative"}
                actions={
                  isPick
                    ? undefined
                    : [
                        {
                          label: canHold ? (result.kind === "no_match" ? "Hold anyway" : `Hold ${candidate.campsite.siteName}`) : "Choose this one",
                          onClick: () => handleHoldCampsite(candidate.campsite.id),
                        },
                      ]
                }
              />
            );
          })}
        </div>
        {candidates.length === 0 && <p className="text-body-m text-[var(--color-text-secondary)]">Nothing else is open for this search.</p>}
        <Button variant="ghost" label="Back to plan" onClick={() => setView("plan")} />
      </div>,
      { approveBar },
    );
  }

  // ---- The plan -----------------------------------------------------------

  const movedBookingId = needsYou?.kind === "forecast_move" ? needsYou.payload?.bookingId : undefined;
  const times = view === "other-times" && movedBookingId ? otherTimes(trip, movedBookingId) : [];
  const movedBooking = trip.bookings.find((b) => b.id === movedBookingId);

  const mustChips = trip.intent.requirements.filter((r) => r.tier === "must");
  const niceChips = trip.intent.requirements.filter((r) => r.tier === "nice");
  const editingRequirement = trip.intent.requirements.find((r) => r.id === editingChip);
  const editingFact = factChips.find((c) => c.key === editingChip);

  const heardSection = (factChips.length > 0 || trip.intent.requirements.length > 0) && (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-heading-m text-[var(--color-text-primary)]">What I heard</h2>
        <p className="text-body-s text-[var(--color-text-secondary)]">Tap anything to change it</p>
      </div>
      {(factChips.length > 0 || mustChips.length > 0) && (
        <div className="space-y-2">
          <p className="text-overline text-[var(--color-text-secondary)]">Must have</p>
          <div className="flex flex-wrap gap-2">
            {factChips.map((chip) => (
              <RequirementChip
                key={chip.key}
                type={trip.changedChips.includes(chip.key) ? "changed" : "mustHave"}
                label={chip.label}
                onClick={() => setEditingChip(editingChip === chip.key ? null : chip.key)}
              />
            ))}
            {mustChips.map((r) => (
              <RequirementChip
                key={r.id}
                type={trip.changedChips.includes(r.id) ? "changed" : "mustHave"}
                label={r.label}
                onClick={() => setEditingChip(editingChip === r.id ? null : r.id)}
              />
            ))}
          </div>
        </div>
      )}
      {niceChips.length > 0 && (
        <div className="space-y-2">
          <p className="text-overline text-[var(--color-text-secondary)]">Nice to have</p>
          <div className="flex flex-wrap gap-2">
            {niceChips.map((r) => (
              <RequirementChip
                key={r.id}
                type={trip.changedChips.includes(r.id) ? "changed" : "niceToHave"}
                label={r.label}
                onClick={() => setEditingChip(editingChip === r.id ? null : r.id)}
              />
            ))}
          </div>
        </div>
      )}
      {(editingRequirement || editingFact) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--color-bg-surface)] p-3">
          <p className="mr-auto text-body-s text-[var(--color-text-secondary)]">
            <span className="text-label-m text-[var(--color-text-primary)]">{editingRequirement?.label ?? editingFact?.label}</span> — or just
            tell me the change in the chat.
          </p>
          {editingRequirement && (
            <Button
              variant="secondary"
              label={editingRequirement.tier === "must" ? "Make it a nice-to-have" : "Make it a must-have"}
              onClick={() => void apply(setRequirementTier(trip, editingRequirement.id, editingRequirement.tier === "must" ? "nice" : "must", now))}
            />
          )}
          <Button
            variant="secondary"
            label="Remove"
            onClick={() =>
              void apply(
                editingRequirement
                  ? removeTripRequirement(trip, editingRequirement.id, now)
                  : clearTripFact(trip, editingChip as TripFactKey, now),
              )
            }
          />
          <Button variant="ghost" label="Cancel" onClick={() => setEditingChip(null)} />
        </div>
      )}
    </div>
  );

  const comparison = trip.campsiteComparison;
  const canHoldNow = !!range && holdBlockers(trip.intent).length === 0;
  // The user is picking from the top sites (nothing held until they do).
  const choosing = !!comparison?.options && !comparison.lost && needsYou?.kind !== "no_match" && canHoldNow;
  const holdLabel = (campsiteId: string) => `Hold ${campsiteById(campsiteId)?.siteName ?? "this site"}`;
  const comparisonSection = comparison && choosing && (
    <div data-plan-target="step-campsite" className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="text-heading-m text-[var(--color-text-primary)]">Pick your campsite</h2>
        <p className="text-body-s text-[var(--color-text-secondary)]">
          {comparison.options!.length > 0
            ? `${comparison.options!.length + 1} sites fit what you asked for, best fit first. Nothing is held until you pick one.`
            : "This site fits what you asked for. Nothing is held until you say so."}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {[comparison.recommended, ...comparison.options!].map((card, i) => (
          <OptionCard
            key={card.campsiteId}
            card={card}
            onDetails={showDetails}
            state={i === 0 ? "recommended" : "alternative"}
            actions={[{ label: holdLabel(card.campsiteId), variant: i === 0 ? undefined : ("secondary" as const), onClick: () => handleHoldCampsite(card.campsiteId) }]}
          />
        ))}
      </div>
      <Button variant="ghost" label="Show more options" onClick={() => showOtherOptions(trip)} />
    </div>
  ) || comparison && (
    <div data-plan-target="step-campsite" className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="text-heading-m text-[var(--color-text-primary)]">
          {comparison.lost ? "Your campsite" : needsYou?.kind === "no_match" ? "No site fits everything" : "Your campsite so far"}
        </h2>
        <p className="text-body-s text-[var(--color-text-secondary)]">
          {comparison.lost
            ? "What changed, and what the replacement keeps and trades off."
            : needsYou?.kind === "no_match"
              ? "The closest option, and the must-have it misses."
              : "Nothing is held yet. This is the best fit for what you've told me."}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {comparison.lost && <OptionCard card={comparison.lost} state="unavailable" onDetails={showDetails} />}
        <OptionCard
          card={comparison.recommended}
          onDetails={showDetails}
          state={needsYou?.kind === "no_match" ? "closest" : "recommended"}
          actions={
            needsYou?.kind === "no_match"
              ? [
                  ...(canHoldNow ? [{ label: "Hold anyway", onClick: () => handleHoldCampsite(comparison.recommended.campsiteId) }] : []),
                  { label: "Compare closest options", variant: "ghost" as const, onClick: () => setView("campsite-options") },
                ]
              : comparison.lost
                ? undefined
                : [{ label: "Show other options", variant: "ghost" as const, onClick: () => setView("campsite-options") }]
          }
        />
      </div>
    </div>
  );

  const decisionOnCampsite = !!comparison?.lost || needsYou?.kind === "no_match" || needsYou?.payload?.stepId === "step-campsite";
  const pendingSteps = trip.plan.filter((s) => s.status !== "done");
  const mapPoints: MapPoint[] = site
    ? [
        { id: "site", lat: site.latitude, lng: site.longitude, status: "base", place: campsiteTitle(site), detail: "Base camp" },
        ...active
          .filter((b) => b.kind === "activity")
          .map((b): MapPoint => {
            const provider = providerForActivity(ACTIVITIES_BY_ID[b.refId]);
            return {
              id: b.id,
              lat: provider.latitude,
              lng: provider.longitude,
              status: b.status === "changed_needs_ok" ? "needsOk" : "held",
              place: provider.name,
              detail: bookingKindAndTime(b),
            };
          }),
      ]
    : [];

  const suggested = offeredSuggestion?.target;
  const suggestedActivity = suggested?.kind === "activity" ? ACTIVITIES_BY_ID[suggested.id] : undefined;
  const suggestedItem = suggested?.kind === "addon" ? ADD_ONS.find((a) => a.id === suggested.id) : suggestedActivity;
  const suggestionCard = offeredSuggestion && suggestedItem && (
    <SuggestionCard
      title={`Add ${suggestedItem.name.toLowerCase()} · $${suggestedItem.price}`}
      reason={offeredSuggestion.reason}
      source={offeredSuggestion.source}
      photo={suggestedActivity?.photoKey ? photoSrc(suggestedActivity.photoKey) : undefined}
      // An activity opens its times and who's going right where this card is.
      addLabel={suggestedActivity ? "Learn more" : "Add to plan"}
      onAdd={() => void apply(acceptSuggestion(trip, offeredSuggestion.id, now))}
      onDismiss={() => {
        generationRef.current++;
        dispatch({ type: "RESET", trip: dismissSuggestion(trip, offeredSuggestion.id) });
      }}
    />
  );

  // An activity waiting for its time and group sits in the itinerary, beside
  // the campsite — in its own plan step's place when it has one.
  const choiceStepId = needsYou?.kind === "activity_choice" ? needsYou.payload?.stepId : undefined;
  const picker = needsYou?.kind === "activity_choice" && (
    <div data-activity-picker className="scroll-mt-6">
      <ActivityPicker
        key={needsYou.id}
        trip={trip}
        activityId={needsYou.payload?.activityId ?? ""}
        eyebrow="Pick a time and who's going"
        confirmLabel={(price) => `Hold · $${price}`}
        cancelLabel="Skip it"
        onCancel={() => void apply(skipActivityChoice(trip, needsYou.id, now))}
        onConfirm={(slot, party) => void apply(holdActivityChoice(trip, needsYou.id, slot, party, now))}
      />
    </div>
  );
  const stepItems: PendingItem[] = pendingSteps
    .filter((s) => s.id !== "step-campsite" || !campsiteBooking)
    .map((s) => ({ id: s.id, title: s.label, detail: s.detail, paused: trip.agent.paused }));
  const pickerHasStep = stepItems.some((s) => s.id === choiceStepId);
  // The picker, or else an offer, sits in the column beside the campsite —
  // so "Learn more" opens the picker in the same place the offer was.
  const beside = picker || (anyHeld && suggestionCard);
  const pendingItems: PendingItem[] = !beside
    ? stepItems
    : picker && pickerHasStep
      ? stepItems.map((s) => (s.id === choiceStepId ? { ...s, content: picker } : s))
      : [{ id: "beside", title: "", detail: "", content: beside }, ...stepItems];
  const pendingTitle = !picker && stepItems.length === 0 && beside ? "Idea for your trip" : "Still planning";

  const question = trip.clarifyingQuestion;
  return shell(
    <>
      {view === "other-times" && movedBooking && (
        <div className="space-y-3">
          <div>
            <h2 className="text-heading-m text-[var(--color-text-primary)]">Other times at {movedBooking.provider}</h2>
            <p className="text-body-s text-[var(--color-text-secondary)]">
              Open times that fit around the rest of your plan. Same price, ${movedBooking.price}. {movedBooking.refundTerms}.
            </p>
          </div>
          <div className="rounded-xl bg-[var(--color-bg-surface)] px-4">
            {times.map((time) => (
              <div
                key={`${time.slot.date}-${time.slot.startTime}`}
                className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] py-3 last:border-b-0"
              >
                <div>
                  <p className="text-label-l text-[var(--color-text-primary)]">{time.label}</p>
                  <p className={time.action === "Keep anyway" ? "text-body-s text-[var(--color-text-attention)]" : "text-body-s text-[var(--color-text-secondary)]"}>
                    {time.note}
                  </p>
                </div>
                <Button variant={time.primary ? "primary" : "secondary"} label={time.action} onClick={() => handleChooseTime(time.slot)} />
              </div>
            ))}
          </div>
          <Button variant="ghost" label="Back to plan" onClick={() => setView("plan")} />
        </div>
      )}

      {/* A decision about the campsite leads; a plain "best match so far"
          follows what CampOps heard and its plan (Figma 5:98). */}
      {decisionOnCampsite && comparisonSection}
      {!anyHeld && heardSection}

      {!anyHeld && trip.plan.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">My plan</h2>
          {/* Two columns only when the plan area itself is wide enough. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
            {trip.plan.map((step, i) => (
              <PlanStep
                key={step.id}
                index={i + 1}
                step={step.label}
                detail={step.detail}
                state={step.status}
                // A step with a card to show (the suggested campsite) takes you to it.
                onClick={step.id === "step-campsite" && comparison ? () => scrollToPlanTarget(step.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      {!decisionOnCampsite && comparisonSection}

      {anyHeld && (
        <Itinerary
          bookings={active}
          holds={trip.holds}
          pending={pendingItems}
          pendingTitle={pendingTitle}
          photoByBookingId={site && campsiteBooking ? { [campsiteBooking.id]: campsitePhoto(site) } : undefined}
          onRelease={(bookingId) => void apply(releaseBooking(trip, bookingId, now))}
          onDetails={openBooking}
          onCompare={() => showOtherOptions(trip)}
          view={itineraryView}
          onViewChange={setItineraryView}
          mapPoints={mapPoints}
        />
      )}

      {/* Never in the chat, where it pushed replies out of view. */}
      {!anyHeld && suggestionCard}
      {anyHeld && heardSection}

      {/* The phone layout has no top nav (Figma 6:24), so the other screens
          are reached from here. */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-label-m text-[var(--color-text-link)] md:hidden">
        <button type="button" onClick={() => setView("activity")}>Activity</button>
        <button type="button" onClick={() => setView("permissions")}>Permissions</button>
        <button type="button" onClick={startOver}>Start a new trip</button>
      </div>
    </>,
    {
      approveBar,
      threadFooter: question ? (
        <ClarifyingQuestion
          question={question.question}
          options={question.options.map((o) => o.label)}
          selected={question.selected}
          assumption={question.assumption}
          onSelect={handleClarifyingOption}
        />
      ) : undefined,
    },
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
