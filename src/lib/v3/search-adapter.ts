import { EMPTY_TRIP_INTENT, type TripIntent } from "@/lib/schemas";
import type { V3TripIntent } from "@/lib/v3/schemas";

/**
 * Adapts the v3 Trip intent (must/nice requirements) into v2's TripIntent
 * shape so the campsite step can reuse v2's proven, deterministic
 * evaluateCampsites engine (src/lib/evaluate.ts) rather than rebuilding
 * search/ranking from scratch (Build Brief §3 "Extend, do not restart").
 */
export function toV2SearchIntent(intent: V3TripIntent): TripIntent {
  const must = intent.requirements.filter((r) => r.tier === "must").map((r) => r.label);
  const nice = intent.requirements.filter((r) => r.tier === "nice").map((r) => r.label);
  return {
    ...EMPTY_TRIP_INTENT,
    guestCount: intent.adults > 0 ? intent.adults : null,
    checkIn: intent.checkIn || null,
    checkOut: intent.checkOut || null,
    originZip: intent.originZip || null,
    travelingWithPets: intent.pets > 0,
    petCount: intent.pets > 0 ? intent.pets : null,
    budget: intent.budgetUsd != null ? { maxTotal: null, maxPerNight: intent.budgetUsd } : null,
    hardRequirements: must,
    preferences: nice,
  };
}
