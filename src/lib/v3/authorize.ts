import { newId } from "@/lib/id";
import { formatUsd } from "@/lib/v3/money";
import type { Trip } from "@/lib/v3/schemas";

/**
 * Removing an item re-checks dependencies: anything that depends on the
 * removed booking (directly or transitively — an activity depends on its
 * campsite) is removed too, never left dangling (Build Brief §12).
 */
export function removeBooking(trip: Trip, bookingId: string, now: number): Trip {
  const toRemove = new Set<string>([bookingId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of trip.bookings) {
      if (!toRemove.has(b.id) && b.dependsOn.some((depId) => toRemove.has(depId))) {
        toRemove.add(b.id);
        changed = true;
      }
    }
  }
  const removed = trip.bookings.filter((b) => toRemove.has(b.id));
  if (removed.length === 0) return trip;

  return {
    ...trip,
    bookings: trip.bookings.filter((b) => !toRemove.has(b.id)),
    holds: trip.holds.filter((h) => !toRemove.has(h.bookingId)),
    authorization: {
      ...trip.authorization,
      removedBookingIds: [...trip.authorization.removedBookingIds, ...removed.map((b) => b.id)],
    },
    events: [
      ...trip.events,
      ...removed.map((b) => ({
        id: newId(),
        timestamp: now,
        what: `Removed ${b.title}.`,
        permissionId: null,
        actor: "You" as const,
      })),
    ],
  };
}

export type ReverifyResult = { ok: true } | { ok: false; expiredBookingIds: string[] };

/** Re-verifies every hold is still active — never commit stale data (Build Brief §12). */
export function reverifyHolds(trip: Trip, now: number): ReverifyResult {
  const expired = trip.bookings
    .filter((b) => b.status === "held" || b.status === "changed_needs_ok")
    .filter((b) => {
      const hold = trip.holds.find((h) => h.id === b.holdId);
      return !hold || hold.expiresAt <= now;
    })
    .map((b) => b.id);
  return expired.length === 0 ? { ok: true } : { ok: false, expiredBookingIds: expired };
}

export type CommitResult = { ok: true; trip: Trip } | { ok: false; reason: string; expiredBookingIds: string[] };

/**
 * The ONLY function permitted to move a booking to "approved" (Definition
 * of Done: "no path reaches approved without the commit action"). Requires
 * a payment method and re-verifies every hold first — a stale hold is
 * surfaced instead of silently committed.
 */
export function commitBooking(trip: Trip, paymentMethodLabel: string, now: number): CommitResult {
  // Incomplete authorization (Build Brief §15 evaluation scenario): never
  // approve without a payment method, no matter who calls this.
  if (!paymentMethodLabel.trim()) {
    return { ok: false, reason: "A payment method is required before booking.", expiredBookingIds: [] };
  }
  const reverify = reverifyHolds(trip, now);
  if (!reverify.ok) {
    return { ok: false, reason: "One or more holds have expired — refresh before booking.", expiredBookingIds: reverify.expiredBookingIds };
  }

  const bookedCount = trip.bookings.filter((b) => b.status === "held" || b.status === "changed_needs_ok").length;
  const total = trip.bookings
    .filter((b) => b.status === "held" || b.status === "changed_needs_ok")
    .reduce((sum, b) => sum + b.price, 0);

  return {
    ok: true,
    trip: {
      ...trip,
      bookings: trip.bookings.map((b) =>
        b.status === "held" || b.status === "changed_needs_ok" ? { ...b, status: "approved" as const, holdId: null } : b,
      ),
      holds: [],
      needsYouQueue: [],
      authorization: { ...trip.authorization, paymentMethodLabel, approved: true },
      agent: { ...trip.agent, working: false, phase: "complete", currentStepText: "Trip booked" },
      events: [
        ...trip.events,
        {
          id: newId(),
          timestamp: now,
          what: `Booked ${bookedCount} items, charged ${formatUsd(total)} to ${paymentMethodLabel}.`,
          permissionId: "book_and_charge",
          actor: "You",
        },
      ],
    },
  };
}
