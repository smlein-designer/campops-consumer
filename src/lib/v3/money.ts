import type { Activity, Booking } from "@/lib/v3/schemas";

/**
 * Resolves an activity's booking price for a given party size. "per_person"
 * multiplies by the party; "per_group"/"per_boat" are already flat totals
 * (Build Brief §5 — pontoon $180 flat, guide $34 group rate for 4, trail
 * ride $65/rider).
 */
export function activityBookingPrice(activity: Activity, partySize: number): number {
  return activity.pricingBasis === "per_person" ? activity.price * partySize : activity.price;
}

/** Totals are always computed, never typed (Build Brief §5, §7). */
export function tripTotal(bookings: Booking[]): number {
  return Math.round(bookings.reduce((sum, b) => sum + b.price, 0) * 100) / 100;
}

export function heldTotal(bookings: Booking[]): number {
  return tripTotal(bookings.filter((b) => b.status === "held" || b.status === "changed_needs_ok"));
}

export function chargedTotal(bookings: Booking[]): number {
  return tripTotal(bookings.filter((b) => b.status === "approved"));
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
