import { parsePartySizeAnswer } from "@/lib/prerequisites";
import { newId } from "@/lib/id";
import { originZip, partySize, tripRange } from "@/lib/v3/search";
import { monthName, weekendOptions } from "@/lib/v3/trip-dates";
import type { HoldBlocker, PendingClarifyingQuestion, V3TripIntent } from "@/lib/v3/schemas";

/**
 * What CampOps still needs from the user, decided by the application from
 * the trip's own facts — never by the model (v2's standing rule: required
 * facts are application rules, not model judgments).
 *
 * A missing fact never hides the plan: CampOps always shows what it heard
 * and its plan, and narrows the rest down in the chat. But it doesn't show
 * a specific site until it has v2's minimum for one (`recommendBlockers`),
 * and doesn't hold one until it has everything a hold needs (`holdBlockers`).
 */

export { parsePartySizeAnswer };

/** v2's recommendation-readiness gate: nothing at all to choose a site by. */
function nothingToGoOn(intent: V3TripIntent): boolean {
  return (
    partySize(intent) < 1 &&
    intent.requirements.length === 0 &&
    !intent.destination &&
    !intent.origin &&
    intent.pets === 0 &&
    intent.children === 0 &&
    intent.budgetTotalUsd == null &&
    intent.budgetPerNightUsd == null
  );
}

/**
 * What's missing before CampOps may show a specific site, in the order it
 * is asked. A request for a stay needs somewhere to look (an area or a
 * starting point), real dates and how many are coming — a site shown
 * without them would imply it's close, free and big enough when nobody has
 * said — plus the starting point when a drive limit depends on it. A
 * browsing question ("what are some quiet campgrounds?") needs a place
 * instead (v2's exploratory mode).
 */
export function recommendBlockers(intent: V3TripIntent, browsing: boolean): HoldBlocker[] {
  const blockers: HoldBlocker[] = [];
  if (nothingToGoOn(intent)) blockers.push("more_detail");
  if (browsing) {
    if (!intent.destination && !intent.origin) blockers.push("destination");
    return blockers;
  }
  // Where: an area, or a starting point to keep it close to. Without either,
  // "best" across the whole state could be a day's drive away.
  // A drive limit needs the starting point itself, which answers "where" too.
  if (intent.driveLimitHours != null && !originZip(intent)) blockers.push("origin");
  else if (!intent.destination && !intent.origin) blockers.push("destination");
  if (!tripRange(intent)) blockers.push("dates");
  if (partySize(intent) < 1) blockers.push("party_size");
  return blockers;
}

/** Everything still missing before a hold is possible — the same minimum. */
export function holdBlockers(intent: V3TripIntent): HoldBlocker[] {
  return recommendBlockers(intent, false);
}

const QUESTIONS: Record<Exclude<HoldBlocker, "dates">, string> = {
  more_detail:
    "Tell me a bit more so I can pick well: where you'd like to be, who's coming, or what matters most (on the water, quiet, dog-friendly, and so on).",
  destination: "Where should I look? Name an area, or tell me where you're driving from and I'll keep it close.",
  party_size: "How many people are coming?",
  origin: "Where will you be driving from? A city or ZIP is fine.",
};

/**
 * The question for one blocker — a plain line, plus a card with tappable
 * answers when the answer is naturally a short list (weekends in a month).
 * `dateAttempts` is v2's loop protection: a reply that looked like dates but
 * didn't resolve gets a more specific ask, not the same question again.
 */
export function questionFor(
  blocker: HoldBlocker,
  intent: V3TripIntent,
  dateAttempts = 0,
): { question: string; card: PendingClarifyingQuestion | null } {
  if (blocker !== "dates") return { question: QUESTIONS[blocker], card: null };

  const options = weekendOptions(intent.dateHint);
  if (options.length > 0) {
    const question = `Which weekend in ${monthName(intent.dateHint)}?`;
    const first = options[0];
    return {
      question,
      card: {
        id: newId(),
        question,
        options: [...options, { label: "Any of these", checkIn: first.checkIn, checkOut: first.checkOut }],
        selected: first.label,
        assumption: `I'm searching ${first.label} for now.`,
      },
    };
  }
  return {
    question:
      dateAttempts >= 2
        ? 'I couldn\'t pin down exact dates from that. Could you give me a check-in and check-out, like "Apr 16 to Apr 18", or a month?'
        : "When are you thinking of going? Exact dates or just a month both work.",
    card: null,
  };
}

/**
 * "Show me another option" / "I don't like this site" (v2's candidate
 * cycling). Checked before the message reaches the model.
 */
const ALTERNATIVE_REQUEST_PATTERN =
  /\b(another option|a different (site|campsite|campground|spot|place)|something else|don'?t like (this|it)|try again|somewhere else)\b/i;

export function isAlternativeRequestMessage(message: string): boolean {
  return ALTERNATIVE_REQUEST_PATTERN.test(message);
}

/** "What else is out there?" — asks to see the other options side by side. */
const BROWSE_OPTIONS_PATTERN =
  /\b(what else|(other|more|different) (\w+ )?(options|sites|campsites|campgrounds|choices)|alternatives|show me (the )?others|compare|see (the |some )?options)\b/i;

export function isBrowseOptionsMessage(message: string): boolean {
  return BROWSE_OPTIONS_PATTERN.test(message);
}

/**
 * An explicit, NAMED campsite switch ("Let's switch to Prairie Flats") —
 * distinct from asking for the next ranked option.
 */
const NAMED_SWITCH_PATTERN =
  /\b(switch (?:to|campsites? to)|let'?s (?:switch|go|do|try)|change (?:to|campsites? to)|i'?d rather (?:have|stay at|go with))\b/i;

export function isNamedCampsiteSwitchMessage(message: string): boolean {
  return NAMED_SWITCH_PATTERN.test(message);
}

export function matchNamedCampsite<T extends { campgroundName: string }>(message: string, candidates: T[]): T | null {
  const lower = message.toLowerCase();
  return candidates.find((c) => lower.includes(c.campgroundName.toLowerCase())) ?? null;
}

const YES_PATTERN = /^(yes|yeah|yep|yup|sure|ok(ay)?|do it|go ahead|sounds good|please do|that works|fine|hold it|keep it|book it|let'?s do it)\b/;
const NO_PATTERN = /^(no|nope|nah|don'?t|skip|let it go|pass|not now|never ?mind)\b|other (options|times)|something else|show (me )?(the )?other/;

/**
 * A chat reply that answers the open Needs You card, so the card and the chat
 * stay one conversation: the card's own button words ("Keep Saturday", "Let
 * it go") or a plain yes / no. Null when the message is about something else.
 */
export function needsYouAnswer(item: { primaryLabel: string; secondaryLabel?: string }, message: string): "primary" | "secondary" | null {
  const m = message.trim().toLowerCase().replace(/[.!]+$/, "");
  const plain = (label: string) => label.toLowerCase().replace(/[·$\d]+/g, " ").replace(/\s+/g, " ").trim();
  if (item.secondaryLabel && m.includes(plain(item.secondaryLabel))) return "secondary";
  if (plain(item.primaryLabel).length > 3 && m.includes(plain(item.primaryLabel))) return "primary";
  if (NO_PATTERN.test(m)) return "secondary";
  if (YES_PATTERN.test(m)) return "primary";
  return null;
}

const RESUME_PATTERN =/^\s*(resume|continue|carry on|go ahead|keep going|unpause)\b/i;
const PAUSE_PATTERN = /^\s*(pause|hold on|wait|stop for now|give me a (minute|sec|second))\b/i;

/** Pausing and resuming by saying so (Figma "Paused": "Say resume, or tap Resume"). */
export function pauseCommand(message: string): "pause" | "resume" | null {
  if (RESUME_PATTERN.test(message)) return "resume";
  if (PAUSE_PATTERN.test(message)) return "pause";
  return null;
}
