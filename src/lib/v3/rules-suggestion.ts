import type { Campsite } from "@/lib/schemas";
import { addOnsNear } from "@/lib/v3/add-ons";
import { ACTIVITIES, activitiesNear, providerForActivity } from "@/lib/v3/providers";
import type { Activity, Permission, Suggestion } from "@/lib/v3/schemas";

/**
 * Suggestion rules (Build Brief §10, PRD v3 §9): only items at or near the
 * chosen campsite; at most one; never while a decision is pending (never in
 * the Needs You slot, never mid-decision); a dismissed item is never offered
 * again this trip; off entirely when the permission is off. An activity is
 * tried first (it pairs with the trip's requested activities); a campground
 * add-on fills in when no activity is left to suggest — PRD v3 §10 lists
 * add-ons as part of minimum viable data, not just activities.
 */
export function suggestionFor({
  campsite,
  dismissedTypes,
  permissions,
  hasPendingDecision,
  bookedActivityIds = [],
  activities = ACTIVITIES,
}: {
  campsite: Campsite;
  dismissedTypes: string[];
  permissions: Permission[];
  hasPendingDecision: boolean;
  /** Activities already part of the plan — never re-suggested (Build Brief §10 "an optional EXTRA"). */
  bookedActivityIds?: string[];
  activities?: Activity[];
}): Suggestion | null {
  if (hasPendingDecision) return null;

  const permission = permissions.find((p) => p.id === "suggest_extras");
  if (!permission?.enabled) return null;

  const activityCandidate = activitiesNear(campsite, activities).find(
    (a) => !dismissedTypes.includes(a.type) && !bookedActivityIds.includes(a.id),
  );
  if (activityCandidate) {
    const provider = providerForActivity(activityCandidate);
    return {
      id: `suggestion-${activityCandidate.id}`,
      target: { kind: "activity", id: activityCandidate.id },
      reason: "Pairs well with your site.",
      source: `Offered by ${provider.name}`,
      state: "offered",
    };
  }

  const addOnCandidate = addOnsNear(campsite.campgroundName).find((a) => !dismissedTypes.includes(a.id));
  if (addOnCandidate) {
    return {
      id: `suggestion-${addOnCandidate.id}`,
      target: { kind: "addon", id: addOnCandidate.id },
      reason: `Pairs well with your stay at ${campsite.campgroundName}.`,
      source: `Offered by ${addOnCandidate.campgroundName}`,
      state: "offered",
    };
  }

  return null;
}
