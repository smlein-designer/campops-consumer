import type { Campsite } from "@/lib/schemas";
import { slotsOverlap } from "@/lib/v3/overlap";
import { campsiteSatisfiesActivityRequirement } from "@/lib/v3/providers";
import type { Activity, Booking } from "@/lib/v3/schemas";

/**
 * Dependency rules (Build Brief §10). Changing the campsite re-checks every
 * dependent booking — this is the re-check, called with the new campsite
 * and the trip's current activity bookings.
 */
export function activityBookingsToDrop(
  campsite: Campsite,
  bookings: Booking[],
  activitiesById: Record<string, Activity>,
): { booking: Booking; reason: string }[] {
  const dropped: { booking: Booking; reason: string }[] = [];
  for (const booking of bookings) {
    if (booking.kind !== "activity" || booking.status === "released") continue;
    const activity = activitiesById[booking.refId];
    if (!activity || campsiteSatisfiesActivityRequirement(activity, campsite)) continue;
    const why = activity.requiresWaterAccess
      ? `${campsite.campgroundName} has no water access`
      : `${campsite.campgroundName} has no trailhead access`;
    dropped.push({ booking, reason: `${why}, so ${booking.title.toLowerCase()} no longer fits.` });
  }
  return dropped;
}

export type OverlapCheckResult =
  | { result: "ok" }
  | { result: "conflict"; conflictingWith: Activity; alternativeSlotIndex: number | null };

/**
 * No two held or planned activities may overlap (Build Brief §10). When a
 * candidate slot would overlap an already-booked activity, this looks for a
 * same-activity slot that keeps both bookings; `alternativeSlotIndex: null`
 * means none exists, so the agent must ask instead of silently picking one.
 */
export function checkActivityOverlap(
  candidateActivity: Activity,
  candidateSlotIndex: number,
  existingBooked: { activity: Activity; slotIndex: number }[],
): OverlapCheckResult {
  const candidateSlot = candidateActivity.slots[candidateSlotIndex];
  const conflict = existingBooked.find((existing) =>
    slotsOverlap(candidateSlot, existing.activity.slots[existing.slotIndex]),
  );
  if (!conflict) return { result: "ok" };

  const alternativeSlotIndex = candidateActivity.slots.findIndex(
    (slot, index) =>
      index !== candidateSlotIndex &&
      !existingBooked.some((existing) => slotsOverlap(slot, existing.activity.slots[existing.slotIndex])),
  );
  return {
    result: "conflict",
    conflictingWith: conflict.activity,
    alternativeSlotIndex: alternativeSlotIndex >= 0 ? alternativeSlotIndex : null,
  };
}
