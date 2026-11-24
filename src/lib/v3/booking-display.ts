import type { BookingCardState } from "@/components/v3/booking-card";
import { partyLabel } from "@/lib/v3/fit";
import { searchDates, tripRange } from "@/lib/v3/search";
import { cardTime, dayHeading, isoSpanLabel, monthName } from "@/lib/v3/trip-dates";
import type { Campsite } from "@/lib/schemas";
import type { Booking, Trip, V3TripIntent } from "@/lib/v3/schemas";

const KIND_LABEL: Record<Booking["kind"], string> = {
  campsite: "Campsite",
  activity: "Activity",
  addon: "Add-on",
};

export function bookingKindLabel(kind: Booking["kind"]): string {
  return KIND_LABEL[kind];
}

export function bookingCardState(status: Booking["status"]): BookingCardState {
  if (status === "changed_needs_ok") return "needsOk";
  if (status === "hold_expired") return "holdExpired";
  if (status === "held") return "held";
  if (status === "approved") return "approved";
  return "working";
}

/** Booking Card overline (Figma 3:42): "Pontoon · 9:00 to 1:00". */
export function bookingKindAndTime(booking: Booking): string {
  return booking.time ? `${booking.category} · ${cardTime(booking.time)}` : booking.category;
}

/** Booking Card title: the business for an activity, the item otherwise. */
export function bookingCardTitle(booking: Booking): string {
  return booking.provider ?? booking.title;
}

export function bookingMeta(booking: Booking): string {
  return [booking.meta, `$${booking.price}`].filter(Boolean).join(" · ");
}

/** Review line: "Sat 10:00 to 12:00" or "Apr 16 to 18". */
export function bookingWhen(booking: Booking, intent: V3TripIntent): string {
  if (booking.time) return `${dayHeading(booking.day).replace(" · ", " ")} · ${cardTime(booking.time)}`;
  const range = tripRange(intent);
  return range ? isoSpanLabel(range.startISO, range.endISO) : dayHeading(booking.day);
}

export type TripFactKey = "dates" | "party" | "destination" | "drive" | "budget";

/**
 * The trip facts shown as chips beside the free-text requirements (v2's
 * Trip Requirement Projection): things the trip carries as structured
 * fields — dates, who's coming, where, the drive, the budget.
 */
export function tripFactChips(intent: V3TripIntent): { key: TripFactKey; label: string }[] {
  const chips: { key: TripFactKey; label: string }[] = [];
  const range = tripRange(intent);
  if (range) chips.push({ key: "dates", label: isoSpanLabel(range.startISO, range.endISO) });
  else if (intent.dateHint) chips.push({ key: "dates", label: monthName(intent.dateHint) ?? intent.dateHint });
  const party = partyLabel(intent);
  if (party) chips.push({ key: "party", label: party.charAt(0).toUpperCase() + party.slice(1) });
  if (intent.destination) chips.push({ key: "destination", label: intent.destination });
  if (intent.driveLimitHours != null) {
    chips.push({ key: "drive", label: `Under ${intent.driveLimitHours} hrs${intent.origin ? ` from ${intent.origin}` : ""}` });
  } else if (intent.origin) {
    chips.push({ key: "drive", label: `From ${intent.origin}` });
  }
  if (intent.budgetTotalUsd != null) chips.push({ key: "budget", label: `Budget $${intent.budgetTotalUsd}` });
  else if (intent.budgetPerNightUsd != null) chips.push({ key: "budget", label: `Under $${intent.budgetPerNightUsd} a night` });
  return chips;
}

/**
 * The trip's name for the banner, read off the same state as everything
 * else and recomputed as the conversation changes: what kind of trip it is,
 * and where.
 */
export function tripTitle(trip: Pick<Trip, "intent">, site?: Campsite): string {
  const { intent } = trip;
  const text = intent.requirements.map((r) => r.label.toLowerCase()).join(" ");
  const range = tripRange(intent);
  // A month with no dates yet is being planned as a weekend (the options offered).
  const span = (range && range.nights <= 3) || (!range && searchDates(intent)) ? "weekend" : range ? "trip" : "getaway";
  const kind = waterKind(text, site)
    ?? (/stargaz|dark sk/.test(text)
      ? "Dark-sky"
      : /hik|trail|ride|horse/.test(text)
        ? "Trail"
        : intent.children > 0
          ? "Family camping"
          : /quiet|seclud/.test(text)
            ? "Quiet camping"
            : "Camping");
  // "Hill Country" reads well; "Austin / Central Texas" doesn't — use the town.
  const sitePlace = site ? (site.region.includes("/") ? site.city : site.region) : "";
  const place = intent.destination || sitePlace || (intent.origin && intent.driveLimitHours != null ? `near ${intent.origin}` : "");
  return place ? `${kind} ${span}, ${place}` : `${kind} ${span}`;
}

/** A water trip's name: from the held site's own water once there is one,
 * from what the user asked for until then. Null when water isn't the point. */
function waterKind(text: string, site?: Campsite): string | null {
  if (!/water|lake|river|creek|beach|coast|boat|pontoon|kayak|tubing/.test(text)) return null;
  const water = site?.waterAccess.nearby ? site.waterAccess.type : null;
  if (water === "lake" || (!water && /lake/.test(text))) return "Lake";
  if (water === "river" || water === "creek" || (!water && /river|creek|tubing/.test(text))) return "River";
  if (water === "beach" || (!water && /beach|coast/.test(text))) return "Beach";
  return "Waterside";
}

/** Groups bookings under their day, in calendar order. */
export function bookingsByDay(bookings: Booking[]): { day: string; items: Booking[] }[] {
  const days = Array.from(new Set(bookings.map((b) => b.day))).sort();
  return days.map((day) => ({
    day,
    items: bookings.filter((b) => b.day === day).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
  }));
}
