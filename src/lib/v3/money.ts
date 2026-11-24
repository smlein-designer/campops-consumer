import type { Activity, Booking } from "@/lib/v3/schemas";

/**
 * How many boats, kayaks or guided groups a party needs: a flat-priced unit
 * holds `capacity` people (kayaks for two, a pontoon for eight).
 */
export function activityUnits(activity: Activity, people: number): number {
  return activity.pricingBasis === "per_person" ? people : Math.max(1, Math.ceil(people / activity.capacity));
}

/**
 * Resolves an activity's booking price for a given party size (Build Brief
 * §5 — pontoon $180 a boat, guide $34 a group, trail ride $65 a rider).
 */
export function activityBookingPrice(activity: Activity, partySize: number): number {
  return activity.price * activityUnits(activity, partySize);
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
