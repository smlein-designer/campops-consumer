/**
 * Deterministic relative/holiday date-phrase normalization (Search Truth
 * correction, 2026-09-02 — see docs/implementation-decisions.md). The model
 * is free to identify that the user said "Labor Day weekend"; this module
 * is the deterministic application layer that turns a RECOGNIZED phrase
 * into concrete checkIn/checkOut dates — never left to inconsistent
 * free-form model behavior, and never guessed for a phrase it doesn't
 * recognize (an unrecognized phrase is left alone, which surfaces as a
 * still-missing date prerequisite rather than a fabricated date).
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** The Nth occurrence (1-indexed) of `weekday` (0=Sun..6=Sat) in `month` (0-indexed) of `year`. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** The LAST occurrence of `weekday` (0=Sun..6=Sat) in `month` (0-indexed) of `year`. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return addDays(last, -offset);
}

/** If `date` has already passed relative to `now`, roll forward to next year. */
function rollForwardIfPast(date: Date, now: Date): Date {
  if (date.getTime() >= startOfDay(now).getTime()) return date;
  const rolled = new Date(date);
  rolled.setFullYear(rolled.getFullYear() + 1);
  return rolled;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type NormalizedDateRange = { checkIn: string; checkOut: string };

/**
 * Recognizes a fixed set of deterministic relative/holiday phrases and
 * resolves them to a concrete checkIn/checkOut date range using calendar
 * rules relative to `now`. Returns null for anything not recognized —
 * callers must treat that as "still needs a concrete date," not as a
 * resolved-but-empty result.
 */
export function normalizeDatePhrase(
  rawText: string,
  now: Date = new Date(),
): NormalizedDateRange | null {
  const text = rawText.toLowerCase();

  // Labor Day weekend (US): 1st Monday of September — the weekend is the
  // preceding Saturday through that Monday.
  if (/\blabor\s*day\b/.test(text)) {
    const monday = rollForwardIfPast(
      nthWeekdayOfMonth(now.getFullYear(), 8, 1, 1),
      now,
    );
    return { checkIn: fmt(addDays(monday, -2)), checkOut: fmt(monday) };
  }

  // Memorial Day weekend (US): last Monday of May — Saturday through Monday.
  if (/\bmemorial\s*day\b/.test(text)) {
    const monday = rollForwardIfPast(
      lastWeekdayOfMonth(now.getFullYear(), 4, 1),
      now,
    );
    return { checkIn: fmt(addDays(monday, -2)), checkOut: fmt(monday) };
  }

  // "this weekend" — the upcoming (or current) Saturday through Sunday.
  if (/\bthis\s+weekend\b/.test(text)) {
    const day = now.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7;
    const saturday = addDays(startOfDay(now), daysUntilSaturday);
    return { checkIn: fmt(saturday), checkOut: fmt(addDays(saturday, 1)) };
  }

  // "next weekend" — the Saturday/Sunday after this coming one.
  if (/\bnext\s+weekend\b/.test(text)) {
    const day = now.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7;
    const saturday = addDays(startOfDay(now), daysUntilSaturday + 7);
    return { checkIn: fmt(saturday), checkOut: fmt(addDays(saturday, 1)) };
  }

  // "Friday through Sunday" / "Friday to Sunday" — the next occurrence of
  // that weekday pair, in that order, both weekdays required and explicit.
  const rangeMatch = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s*(?:through|to|-|–)\s*\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (rangeMatch) {
    const startWeekday = WEEKDAYS.indexOf(rangeMatch[1]);
    const endWeekday = WEEKDAYS.indexOf(rangeMatch[2]);
    const today = now.getDay();
    let daysUntilStart = (startWeekday - today + 7) % 7;
    if (daysUntilStart === 0) daysUntilStart = 7; // "Friday through Sunday" said on a Friday means the NEXT one
    const start = addDays(startOfDay(now), daysUntilStart);
    const span = (endWeekday - startWeekday + 7) % 7 || 7;
    return { checkIn: fmt(start), checkOut: fmt(addDays(start, span)) };
  }

  return null;
}

/**
 * Deterministic detector for "this looks like an attempt to state a date"
 * even when it failed to resolve — used to distinguish a first date ask
 * from a repeated one that isn't landing, so the follow-up question can
 * become more specific instead of looping on identical copy (see
 * questionFor's `dateAttempt` parameter in prerequisites.ts).
 */
const DATE_LIKE_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|sunday|monday|tuesday|wednesday|thursday|friday|saturday|weekend|labor day|memorial day)\b|\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2}/i;

export function looksLikeDateAttempt(message: string): boolean {
  return DATE_LIKE_PATTERN.test(message);
}

/**
 * Dataset Depth correction (2026-09-04 — see docs/implementation-decisions.md):
 * `resolveToISODate`/`computeDateRange` are the deterministic bridge from a
 * user-facing date STRING (e.g. "Sept 12", the exact text the user stated or
 * a phrase this module already normalized) to a real calendar date the rest
 * of the app can do arithmetic on — deriving nights, checking a campsite's
 * `unavailableRanges`, and computing a cancellation cutoff. Inventory facts
 * (nights, availability, cancellation cutoffs) are never stored as static
 * campsite data; they are always derived from the active TripIntent/
 * Reservation's own dates, here.
 */

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolves a human-readable date string to a concrete `YYYY-MM-DD`, relative
 * to `now`. Recognizes: an already-ISO date; "Month Day" / "Month Day, Year"
 * (any of the month spellings above); and "M/D" / "M/D/YYYY". A year that's
 * omitted defaults to the soonest occurrence on/after `now` (rolling to next
 * year if this year's date has already passed) — the same "soonest future
 * occurrence" rule `normalizeDatePhrase` already uses for holiday weekends.
 * Returns null for anything not recognized — NEVER a guessed date.
 */
export function resolveToISODate(rawText: string, now: Date = new Date()): string | null {
  const text = rawText.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  let m = text.match(
    /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/,
  );
  if (m) {
    const monthIdx = MONTH_INDEX[m[1].toLowerCase()];
    if (monthIdx === undefined) return null;
    const day = parseInt(m[2], 10);
    if (m[3]) return toISO(new Date(parseInt(m[3], 10), monthIdx, day));
    const candidate = new Date(now.getFullYear(), monthIdx, day);
    return toISO(rollForwardIfPast(candidate, now));
  }

  m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const monthIdx = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    if (monthIdx < 0 || monthIdx > 11) return null;
    if (m[3]) return toISO(new Date(parseInt(m[3], 10), monthIdx, day));
    const candidate = new Date(now.getFullYear(), monthIdx, day);
    return toISO(rollForwardIfPast(candidate, now));
  }

  return null;
}

export type DateRange = { startISO: string; endISO: string; nights: number };

/**
 * Resolves a checkIn/checkOut pair (as free text) to a concrete date range
 * and derived night count. Returns null if either date can't be resolved, or
 * if the resolved checkOut isn't strictly after checkIn — callers must treat
 * null as "not enough information to derive a stay," never default to some
 * assumed night count.
 */
export function computeDateRange(
  checkIn: string,
  checkOut: string,
  now: Date = new Date(),
): DateRange | null {
  const startISO = resolveToISODate(checkIn, now);
  const endISO = resolveToISODate(checkOut, now);
  if (!startISO || !endISO) return null;
  const start = new Date(startISO);
  const end = new Date(endISO);
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (nights <= 0) return null;
  return { startISO, endISO, nights };
}

/** Whether requested [startISO, endISO) overlaps a campsite's unavailable [start, end) range. */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
