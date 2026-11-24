import type { ClarifyingOption } from "@/lib/v3/schemas";

/** Date and time wording for the trip — everything is derived from the
 * trip's own dates, never typed. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_PATTERN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Local noon keeps a calendar date on the same day in every timezone.
function atNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function monthDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Apr 16 to 18", or "Apr 30 to May 2" across a month boundary. */
export function dateSpanLabel(checkIn: Date, checkOut: Date): string {
  return checkIn.getMonth() === checkOut.getMonth()
    ? `${monthDay(checkIn)} to ${checkOut.getDate()}`
    : `${monthDay(checkIn)} to ${monthDay(checkOut)}`;
}

/** The same span from two ISO dates. */
export function isoSpanLabel(startISO: string, endISO: string): string {
  return dateSpanLabel(atNoon(startISO), atNoon(endISO));
}

function monthFromHint(hint: string, now: Date): number | null {
  const lower = hint.toLowerCase();
  if (/\bnext month\b/.test(lower)) return (now.getMonth() + 1) % 12;
  if (/\bthis month\b/.test(lower)) return now.getMonth();
  const match = lower.match(MONTH_PATTERN);
  return match ? MONTHS.findIndex((m) => m.toLowerCase() === match[1]) : null;
}

/**
 * Turns a loose timeframe ("sometime in April") into the first few Friday-
 * to-Sunday weekends of that month the user could pick from. Empty when the
 * hint names no month — the question is then asked in words instead.
 */
export function weekendOptions(hint: string, now: Date = new Date()): ClarifyingOption[] {
  const month = hint ? monthFromHint(hint, now) : null;
  if (month == null) return [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const options = fridays(year, month)
      .filter((friday) => friday >= today)
      .slice(0, 3)
      .map(weekendOf);
    if (options.length > 0) return options;
  }
  return [];
}

type WeekendOption = { label: string; checkIn: string; checkOut: string };

const ORDINALS: Record<string, number> = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, last: -1 };

/**
 * A weekend the user named outright ("first weekend in December", "the last
 * weekend of May") as exact dates — no need to ask which one. Null when the
 * hint doesn't name one weekend.
 */
export function namedWeekend(hint: string, now: Date = new Date()): WeekendOption | null {
  const ordinal = hint.toLowerCase().match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\s+weekend\b/);
  const month = ordinal ? monthFromHint(hint, now) : null;
  if (!ordinal || month == null) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const all = fridays(year, month);
    const friday = all.at(ORDINALS[ordinal[1]]);
    if (friday && friday >= today) return weekendOf(friday);
  }
  return null;
}

function fridays(year: number, month: number): Date[] {
  const out: Date[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day);
    if (date.getMonth() !== month) break;
    if (date.getDay() === 5) out.push(date);
  }
  return out;
}

/** Friday to Sunday. */
function weekendOf(friday: Date): WeekendOption {
  const sunday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + 2);
  return { label: dateSpanLabel(friday, sunday), checkIn: monthDay(friday), checkOut: monthDay(sunday) };
}

export function monthName(hint: string, now: Date = new Date()): string | null {
  const month = monthFromHint(hint, now);
  return month == null ? null : new Date(2000, month, 1).toLocaleString("en-US", { month: "long" });
}

export function weekdayName(iso: string): string {
  return WEEKDAYS[atNoon(iso).getDay()];
}

/** Itinerary day heading: "Sat · Apr 17". */
export function dayHeading(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = atNoon(iso);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} · ${monthDay(d)}`;
}

function clock(time: string): { text: string; pm: boolean } {
  const [h, m] = time.split(":").map(Number);
  return { text: `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`, pm: h >= 12 };
}

/** Card wording for a slot: "10:00 to 12:00". */
export function cardTime(time: string): string {
  const [start, end] = time.split("-");
  return `${clock(start).text} to ${clock(end).text}`;
}

/** Sentence wording for a slot: "2:00 to 6:00 pm", "9:00 am to 1:00 pm". */
export function spokenTime(time: string): string {
  const [start, end] = time.split("-").map(clock);
  const suffix = (c: { pm: boolean }) => (c.pm ? "pm" : "am");
  return start.pm === end.pm
    ? `${start.text} to ${end.text} ${suffix(end)}`
    : `${start.text} ${suffix(start)} to ${end.text} ${suffix(end)}`;
}

/** A button's short wording for when a slot starts: "Sat 10 am", "Fri 4:30 pm". */
export function shortStart(day: string, time: string): string {
  const [h, m] = time.split("-")[0].split(":").map(Number);
  return `${weekdayName(day).slice(0, 3)} ${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
}

/** "Saturday 2:00 to 6:00 pm". */
export function spokenSlot(day: string, time: string): string {
  return `${weekdayName(day)} ${spokenTime(time)}`;
}
