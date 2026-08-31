import type { TripIntent } from "@/lib/schemas";

/**
 * Party-Composition Inference (2026-09-10 — see
 * docs/implementation-decisions.md). Distinguishes "6 people" from "4
 * adults and 2 kids": both give the same `guestCount`, but only the second
 * explicitly identifies children as part of the party, which is real
 * evidence a family-friendly site matters — generic party size carries no
 * such evidence. The MODEL classifies the language (`travelingWithChildren`/
 * `childCount`, extracted the same way `travelingWithPets`/`petCount`
 * already are); the APPLICATION decides, deterministically, whether that
 * fact should add the soft "Family-friendly" preference — never the other
 * way around.
 */
export const FAMILY_FRIENDLY_LABEL = "Family-friendly";

function hasFamilyMention(intent: TripIntent): boolean {
  // Matches the same recognized phrasing as evaluate.ts's checkConstraint
  // family branch ("famil"/"kid"/"child") — kept in sync deliberately so a
  // stronger-tier label like "Kid-friendly is a must" is recognized here
  // the same way it's recognized for evaluation.
  return [
    ...intent.hardRequirements,
    ...intent.flexibleConstraints,
    ...intent.preferences,
    ...intent.priorities,
  ].some((label) => /famil|kid|child/i.test(label));
}

/**
 * Applies the inference exactly once, on the turn `travelingWithChildren`
 * first becomes true (a `priorIntent` -> `intent` transition), never
 * unconditionally on every turn. This is deliberate, not an oversight:
 * `travelingWithChildren` stays true for as long as the children remain
 * part of the party (same persistence contract as every other established
 * TripIntent field), but the INFERRED PREFERENCE is a separate, ordinary
 * `preferences` entry the user can remove like any other soft preference
 * (item 9 of the 2026-09-10 correction). Re-deriving it from the boolean
 * every turn would silently undo that removal the very next time the model
 * responds — the same "no tug-of-war" principle already applied to
 * composer focus. Only a fresh false -> true transition (including the
 * very first turn, where `priorIntent` is `EMPTY_TRIP_INTENT` and the
 * boolean starts false) re-adds it; once established, it persists or is
 * removed exactly like any other preference, and is never force-reinserted
 * behind the user's back.
 *
 * A defensive check also skips inserting a duplicate if the model itself
 * already placed a family-related label in ANY tier (e.g. the user used
 * stronger language like "kid-friendly is a must", which the model should
 * classify into `priorities`/`hardRequirements`, a stronger tier this
 * function must never downgrade or duplicate — see item 6).
 */
export function applyFamilyPreferenceInference(
  priorIntent: TripIntent,
  intent: TripIntent,
): TripIntent {
  const justStartedTravelingWithChildren =
    intent.travelingWithChildren && !priorIntent.travelingWithChildren;
  if (!justStartedTravelingWithChildren) return intent;
  if (hasFamilyMention(intent)) return intent;
  return {
    ...intent,
    preferences: [...intent.preferences, FAMILY_FRIENDLY_LABEL],
  };
}
