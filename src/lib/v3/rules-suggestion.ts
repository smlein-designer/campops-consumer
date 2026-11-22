import type { Campsite } from "@/lib/schemas";
import { ACTIVITIES, activitiesNear, providerForActivity } from "@/lib/v3/providers";
import type { Activity, Permission, Suggestion } from "@/lib/v3/schemas";

/**
 * Suggestion rules (Build Brief §10): only items at or near the chosen
 * campsite; at most one; never while a decision is pending (never in the
 * Needs You slot, never mid-decision); a dismissed type is never offered
 * again this trip; off entirely when the permission is off.
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

  const candidate = activitiesNear(campsite, activities).find(
    (a) => !dismissedTypes.includes(a.type) && !bookedActivityIds.includes(a.id),
  );
  if (!candidate) return null;

  const provider = providerForActivity(candidate);
  return {
    id: `suggestion-${candidate.id}`,
    activityId: candidate.id,
    reason: "Pairs well with your site.",
    source: `Offered by ${provider.name}`,
    state: "offered",
  };
}
