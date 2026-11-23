import type { BookingCardState } from "@/components/v3/booking-card";
import type { Booking, V3TripIntent } from "@/lib/v3/schemas";

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

/** Booking Card's "kind" line (Figma 3:42): category + time, e.g. "Horseback · 10:00 to 12:00". */
export function bookingKindAndTime(booking: Booking): string {
  const label = bookingKindLabel(booking.kind);
  return booking.time ? `${label} · ${booking.time.replace("-", " to ")}` : label;
}

export function bookingMeta(booking: Booking): string {
  return `$${booking.price}`;
}

/**
 * The "What I heard" chip set's structural (non-free-text) facts — dates,
 * party size, drive limit, budget — ported from v2's Trip Requirement
 * Projection (src/lib/requirements.ts's getDerivedRequirements): these are
 * real must-have facts the trip already carries as scalar TripIntent
 * fields, not literal `requirements[]` entries, so they were previously
 * invisible as chips in the live app even though Figma (and the model's own
 * extracted requirements) treat them as first-class must-haves. Always
 * shown as plain (non-removable) chips, same as v2's own rule for a
 * structurally-derived chip — there's no literal entry to clear; changing
 * one of these is a real trip edit, made through the composer.
 */
export function tripFactChips(intent: V3TripIntent): string[] {
  const chips: string[] = [];
  if (intent.checkIn && intent.checkOut) chips.push(`${intent.checkIn} to ${intent.checkOut}`);
  if (intent.adults > 0) {
    chips.push(
      intent.pets > 0
        ? `${intent.adults} adult${intent.adults === 1 ? "" : "s"} and ${intent.pets} pet${intent.pets === 1 ? "" : "s"}`
        : `${intent.adults} adult${intent.adults === 1 ? "" : "s"}`,
    );
  } else if (intent.pets > 0) {
    chips.push(`${intent.pets} pet${intent.pets === 1 ? "" : "s"}`);
  }
  if (intent.driveLimitHours != null) chips.push(`Under ${intent.driveLimitHours} hrs from ${intent.originZip || "you"}`);
  if (intent.budgetUsd != null) chips.push(`Budget $${intent.budgetUsd}`);
  return chips;
}

/** Groups bookings by their display day, in first-seen order. */
export function bookingsByDay(bookings: Booking[]): { day: string; items: Booking[] }[] {
  const order: string[] = [];
  const byDay = new Map<string, Booking[]>();
  for (const booking of bookings) {
    if (!byDay.has(booking.day)) {
      byDay.set(booking.day, []);
      order.push(booking.day);
    }
    byDay.get(booking.day)!.push(booking);
  }
  return order.map((day) => ({ day, items: byDay.get(day)! }));
}
