import type { Campsite } from "@/lib/schemas";
import { greatCircleMiles } from "@/lib/geo";
import type { Activity, Provider } from "@/lib/v3/schemas";

/**
 * Providers and activities (Build Brief §5). Wired against the FULL
 * campsite dataset (the 25 v2 sites plus the 5 v3 demo-story sites in
 * src/lib/campsites.ts), not just the named demo sites — `activitiesNear`
 * below decides fit by each campsite's own water access and trailhead
 * amenity, the same way any other requirement is checked.
 */
export const PROVIDERS: Provider[] = [
  {
    id: "lakeshore-marina",
    name: "Lakeshore Marina",
    type: "boat",
    latitude: 30.2672,
    longitude: -98.9211, // next to Pine Hollow
    photoKey: "pontoon",
  },
  {
    id: "hill-country-trail-rides",
    name: "Hill Country Trail Rides",
    type: "horseback",
    latitude: 30.26,
    longitude: -98.93,
    photoKey: "ride",
  },
  {
    id: "granite-ridge-outfitters",
    name: "Granite Ridge Outfitters",
    type: "guided_hike",
    latitude: 30.275,
    longitude: -98.915,
    photoKey: "hike",
  },
];

export const ACTIVITIES: Activity[] = [
  {
    id: "lakeshore-pontoon",
    providerId: "lakeshore-marina",
    type: "boat",
    name: "Pontoon rental",
    capacity: 8,
    price: 180,
    pricingBasis: "per_boat",
    refundTerms: "Full refund up to 24 hours before",
    refundCutoffHoursBefore: 24,
    requiresWaterAccess: true,
    requiresTrailhead: false,
    skillLevel: "beginner",
    photoKey: "pontoon",
    slots: [
      { date: "2027-04-17", startTime: "14:00", endTime: "18:00", capacityRemaining: 1 },
      { date: "2027-04-18", startTime: "09:00", endTime: "13:00", capacityRemaining: 1 },
      { date: "2027-04-16", startTime: "16:00", endTime: "20:00", capacityRemaining: 1 },
      { date: "2027-04-18", startTime: "13:00", endTime: "17:00", capacityRemaining: 1 },
    ],
  },
  {
    id: "lakeshore-kayaks",
    providerId: "lakeshore-marina",
    type: "kayak",
    name: "Kayaks for two",
    capacity: 2,
    price: 45,
    pricingBasis: "per_group",
    refundTerms: "Full refund up to 24 hours before",
    refundCutoffHoursBefore: 24,
    requiresWaterAccess: true,
    requiresTrailhead: false,
    skillLevel: "beginner",
    photoKey: "kayaks",
    slots: [{ date: "2027-04-18", startTime: "13:00", endTime: "16:00", capacityRemaining: 1 }],
  },
  {
    id: "hcr-beginner-trail",
    providerId: "hill-country-trail-rides",
    type: "horseback",
    name: "Beginner trail ride",
    capacity: 4,
    price: 65,
    pricingBasis: "per_person",
    refundTerms: "Full refund up to 48 hours before",
    refundCutoffHoursBefore: 48,
    requiresWaterAccess: false,
    requiresTrailhead: true,
    skillLevel: "beginner",
    photoKey: "ride",
    slots: [{ date: "2027-04-17", startTime: "10:00", endTime: "12:00", capacityRemaining: 4 }],
  },
  {
    id: "hcr-intermediate-trail",
    providerId: "hill-country-trail-rides",
    type: "horseback",
    name: "Intermediate trail ride",
    capacity: 4,
    price: 75,
    pricingBasis: "per_person",
    refundTerms: "Full refund up to 48 hours before",
    refundCutoffHoursBefore: 48,
    requiresWaterAccess: false,
    requiresTrailhead: true,
    skillLevel: "intermediate",
    photoKey: "ride",
    // Deliberately overlaps hcr-beginner-trail's Sat 10:00-12:00 slot
    // (Build Brief §5: "at least one activity pair whose slots overlap").
    slots: [{ date: "2027-04-17", startTime: "11:00", endTime: "13:00", capacityRemaining: 4 }],
  },
  {
    id: "granite-ridge-guided-hike",
    providerId: "granite-ridge-outfitters",
    type: "guided_hike",
    name: "Guided hike",
    capacity: 8,
    price: 34,
    pricingBasis: "per_group",
    refundTerms: "Full refund up to 24 hours before",
    refundCutoffHoursBefore: 24,
    requiresWaterAccess: false,
    requiresTrailhead: true,
    skillLevel: "beginner",
    photoKey: "hike",
    slots: [{ date: "2027-04-18", startTime: "07:00", endTime: "08:30", capacityRemaining: 8 }],
  },
];

export const ACTIVITIES_BY_ID: Record<string, Activity> = Object.fromEntries(
  ACTIVITIES.map((activity) => [activity.id, activity]),
);

export function providerForActivity(activity: Activity): Provider {
  const provider = PROVIDERS.find((p) => p.id === activity.providerId);
  if (!provider) throw new Error(`No provider for activity ${activity.id}`);
  return provider;
}

/** Straight-line distance from an activity's provider to a campsite, in miles. */
export function distanceFromCampsiteMiles(activity: Activity, campsite: Campsite): number {
  const provider = providerForActivity(activity);
  return Math.round(
    greatCircleMiles(
      { lat: provider.latitude, lng: provider.longitude },
      { lat: campsite.latitude, lng: campsite.longitude },
    ),
  );
}

/**
 * Dependency rule (Build Brief §10): an activity with a water requirement is
 * only offered if the campsite has water access (on water or short walk); a
 * trailhead requirement checks the campsite's own `hiking_trails` amenity —
 * no separate "has trailhead" field, same as any other amenity-backed check.
 */
export function campsiteSatisfiesActivityRequirement(activity: Activity, campsite: Campsite): boolean {
  if (activity.requiresWaterAccess && !campsite.waterAccess.nearby) return false;
  if (activity.requiresTrailhead && !campsite.amenities.includes("hiking_trails")) return false;
  return true;
}

/** Activities a campsite can actually offer, nearest provider first. */
export function activitiesNear(campsite: Campsite, activities: Activity[] = ACTIVITIES): Activity[] {
  return activities
    .filter((activity) => campsiteSatisfiesActivityRequirement(activity, campsite))
    .sort((a, b) => distanceFromCampsiteMiles(a, campsite) - distanceFromCampsiteMiles(b, campsite));
}
