import type { BookingCardState } from "@/components/v3/booking-card";
import type { Booking } from "@/lib/v3/schemas";

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
