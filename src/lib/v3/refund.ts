import type { Activity } from "@/lib/v3/schemas";

/**
 * Describes an activity's refund terms relative to its own slot and `now`
 * (same relative-to-the-real-date approach as v2's
 * `describeCancellationPolicy` in src/lib/reservation.ts) — never a stale
 * literal date.
 */
export function describeActivityRefund(activity: Activity, slotIndex = 0, now: Date = new Date()): string {
  const slot = activity.slots[slotIndex];
  if (!slot) return activity.refundTerms;
  const stillRefundable = isActivityRefundable(activity, slotIndex, now);
  return stillRefundable
    ? activity.refundTerms
    : `Non-refundable — within ${activity.refundCutoffHoursBefore} hours of the slot`;
}

/** Whether cancelling right now would still be within the refund window. */
export function isActivityRefundable(activity: Activity, slotIndex = 0, now: Date = new Date()): boolean {
  const slot = activity.slots[slotIndex];
  if (!slot) return false;
  const slotStart = new Date(`${slot.date}T${slot.startTime}:00`);
  const hoursUntilSlot = (slotStart.getTime() - now.getTime()) / 3_600_000;
  return hoursUntilSlot >= activity.refundCutoffHoursBefore;
}
