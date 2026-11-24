import type { Campsite } from "@/lib/schemas";
import { ADD_ONS, addOnsNear } from "@/lib/v3/add-ons";
import { ACTIVITIES, ACTIVITIES_BY_ID, activitiesNear, distanceFromCampsiteMiles, providerForActivity } from "@/lib/v3/providers";
import type { Activity, Permission, Suggestion } from "@/lib/v3/schemas";

/**
 * Suggestion rules (Build Brief §10, PRD v3 §9): only something this
 * campsite really offers; at most one; never while a decision is pending; a
 * dismissed kind is never offered again this trip; off entirely when the
 * permission is off. A nearby activity is tried first, then a campground
 * add-on. Every suggestion carries a one-line reason tied to the trip.
 */
export function suggestionFor({
  campsite,
  dismissedTypes,
  permissions,
  hasPendingDecision,
  bookedIds = [],
  activities = ACTIVITIES,
}: {
  campsite: Campsite;
  dismissedTypes: string[];
  permissions: Permission[];
  hasPendingDecision: boolean;
  /** Activity and add-on ids already in the plan — an extra is never a repeat. */
  bookedIds?: string[];
  activities?: Activity[];
}): Suggestion | null {
  if (hasPendingDecision) return null;
  if (!permissions.find((p) => p.id === "suggest_extras")?.enabled) return null;

  // Kinds of thing already in the plan: a held activity, or an add-on that
  // stands in for one (the campground's kayak rental is kayaking too).
  const bookedTypes = bookedIds.map((id) => ACTIVITIES_BY_ID[id]?.type ?? ADD_ONS.find((a) => a.id === id)?.coversActivity);
  const activity = activitiesNear(campsite, activities).find(
    (a) => !dismissedTypes.includes(a.type) && !bookedTypes.includes(a.type),
  );
  if (activity) {
    const provider = providerForActivity(activity);
    const miles = distanceFromCampsiteMiles(activity, campsite);
    const where = miles <= 1 ? "right by the site" : `${miles} miles from the site`;
    return {
      id: `suggestion-${activity.id}`,
      target: { kind: "activity", id: activity.id },
      reason: activity.requiresWaterAccess
        ? `${campsite.campgroundName} is on the water, and ${provider.name} is ${where}.`
        : `${provider.name} is ${where}.`,
      source: `Offered by ${provider.name}`,
      state: "offered",
    };
  }

  const addOn = addOnsNear(campsite).find(
    (a) =>
      !dismissedTypes.includes(a.id) &&
      !bookedIds.includes(a.id) &&
      !(a.coversActivity && (bookedTypes.includes(a.coversActivity) || dismissedTypes.includes(a.coversActivity))),
  );
  if (addOn) {
    return {
      id: `suggestion-${addOn.id}`,
      target: { kind: "addon", id: addOn.id },
      reason: `${campsite.campgroundName} sells it at the camp store, ready when you arrive.`,
      source: `Offered by ${campsite.campgroundName}`,
      state: "offered",
    };
  }
  return null;
}
