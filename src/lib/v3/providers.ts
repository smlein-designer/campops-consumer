import type { Campsite } from "@/lib/schemas";
import { greatCircleMiles } from "@/lib/geo";
import type { Activity, ActivitySlot, ActivityType, ActivityWindow, Provider } from "@/lib/v3/schemas";

/**
 * Providers and activities (PRD v3 §10: several providers per activity type,
 * attached across the dataset wherever they realistically fit). An activity
 * belongs to a campsite only when its provider is actually nearby — most
 * campsites have some activities, a few have none.
 */

/** How far a provider can be and still count as "near the site". */
export const NEARBY_MILES = 30;

const provider = (id: string, name: string, latitude: number, longitude: number): Provider => ({
  id,
  name,
  latitude,
  longitude,
});

export const PROVIDERS: Provider[] = [
  // Hill Country (around Pine Hollow)
  provider("lakeshore-marina", "Lakeshore Marina", 30.2672, -98.9211),
  provider("hill-country-trail-rides", "Hill Country Trail Rides", 30.26, -98.93),
  provider("granite-ridge-outfitters", "Granite Ridge Outfitters", 30.275, -98.915),
  provider("pedernales-falls-guides", "Pedernales Falls Guides", 30.3072, -98.2578),
  provider("guadalupe-river-outfitters", "Guadalupe River Outfitters", 29.8833, -98.3936),
  // Austin
  provider("lake-travis-boat-rentals", "Lake Travis Boat Rentals", 30.3936, -97.9269),
  // San Antonio
  provider("medina-lake-marina", "Medina Lake Marina", 29.5432, -98.9803),
  provider("bandera-trail-rides", "Bandera Trail Rides", 29.56, -98.9),
  provider("government-canyon-guides", "Government Canyon Guides", 29.5426, -98.8168),
  // Houston / Gulf
  provider("lake-conroe-marina", "Lake Conroe Marina", 30.3949, -95.5586),
  provider("piney-woods-stables", "Piney Woods Stables", 30.6, -95.5),
  // Dallas / North Texas
  provider("joe-pool-marina", "Joe Pool Marina", 32.5885, -96.9561),
  provider("cedar-ridge-guides", "Cedar Ridge Trail Guides", 32.6, -96.96),
  provider("possum-kingdom-marina", "Possum Kingdom Marina", 32.8779, -98.4256),
  provider("ray-roberts-stables", "Ray Roberts Stables", 33.37, -97.01),
  // East Texas
  provider("caddo-lake-outfitters", "Caddo Lake Outfitters", 32.6879, -94.1719),
  provider("tyler-boathouse", "Tyler State Park Boathouse", 32.4207, -95.3735),
  // West Texas
  provider("palo-duro-stables", "Palo Duro Stables", 34.9483, -101.6685),
  provider("palo-duro-guides", "Palo Duro Canyon Guides", 34.95, -101.67),
  provider("guadalupe-peak-guides", "Guadalupe Peak Guides", 31.8956, -104.8636),
  provider("big-bend-desert-guides", "Big Bend Desert Guides", 29.3197, -103.6094),
  provider("lajitas-stables", "Lajitas Stables", 29.32, -103.61),
];

const PONTOON_WINDOWS: ActivityWindow[] = [
  { startTime: "14:00", endTime: "18:00" },
  { startTime: "09:00", endTime: "13:00" },
  { startTime: "16:00", endTime: "20:00", days: "arrival" },
  { startTime: "13:00", endTime: "17:00", days: "last" },
];

function pontoon(providerId: string, price: number, id = `${providerId}-pontoon`): Activity {
  return {
    id,
    providerId,
    type: "boat",
    name: "Pontoon rental",
    category: "Pontoon",
    windows: PONTOON_WINDOWS,
    preferredDay: "first_full",
    capacity: 8,
    price,
    pricingBasis: "per_boat",
    refundTerms: "Full refund up to 24 hours before",
    refundCutoffHoursBefore: 24,
    requiresWaterAccess: true,
    skillLevel: "beginner",
    photoKey: "pontoon",
  };
}

function kayaks(providerId: string, price: number, id = `${providerId}-kayaks`): Activity {
  return {
    id,
    providerId,
    type: "kayak",
    name: "Kayaks for two",
    category: "Kayaks",
    windows: [
      { startTime: "13:00", endTime: "16:00" },
      { startTime: "09:00", endTime: "12:00" },
    ],
    preferredDay: "last",
    capacity: 2,
    price,
    pricingBasis: "per_group",
    refundTerms: "Full refund up to 24 hours before",
    refundCutoffHoursBefore: 24,
    requiresWaterAccess: true,
    skillLevel: "beginner",
    photoKey: "kayaks",
  };
}

function trailRide(
  providerId: string,
  price: number,
  skillLevel: Activity["skillLevel"] = "beginner",
  id = `${providerId}-${skillLevel}-trail`,
): Activity {
  return {
    id,
    providerId,
    type: "horseback",
    name: `${skillLevel === "beginner" ? "Beginner" : "Intermediate"} trail ride`,
    category: "Horseback",
    // The intermediate ride deliberately overlaps the beginner one.
    windows:
      skillLevel === "beginner"
        ? [
            { startTime: "10:00", endTime: "12:00" },
            { startTime: "15:00", endTime: "17:00" },
          ]
        : [{ startTime: "11:00", endTime: "13:00" }],
    preferredDay: "first_full",
    capacity: 4,
    price,
    pricingBasis: "per_person",
    refundTerms: "Full refund up to 48 hours before",
    refundCutoffHoursBefore: 48,
    requiresWaterAccess: false,
    skillLevel,
    photoKey: "ride",
  };
}

function guidedHike(providerId: string, price: number, id = `${providerId}-guided-hike`): Activity {
  return {
    id,
    providerId,
    type: "guided_hike",
    name: "Guided hike",
    category: "Guided hike",
    windows: [
      { startTime: "07:00", endTime: "08:30" },
      { startTime: "17:30", endTime: "19:00" },
    ],
    preferredDay: "last",
    capacity: 8,
    price,
    pricingBasis: "per_group",
    refundTerms: "Full refund up to 24 hours before",
    refundCutoffHoursBefore: 24,
    requiresWaterAccess: false,
    skillLevel: "beginner",
    photoKey: "hike",
  };
}

export const ACTIVITIES: Activity[] = [
  pontoon("lakeshore-marina", 180, "lakeshore-pontoon"),
  kayaks("lakeshore-marina", 45, "lakeshore-kayaks"),
  trailRide("hill-country-trail-rides", 65, "beginner", "hcr-beginner-trail"),
  trailRide("hill-country-trail-rides", 75, "intermediate", "hcr-intermediate-trail"),
  guidedHike("granite-ridge-outfitters", 34, "granite-ridge-guided-hike"),
  guidedHike("pedernales-falls-guides", 28),
  kayaks("guadalupe-river-outfitters", 50),
  pontoon("lake-travis-boat-rentals", 195),
  kayaks("lake-travis-boat-rentals", 40),
  pontoon("medina-lake-marina", 165),
  trailRide("bandera-trail-rides", 60),
  guidedHike("government-canyon-guides", 30),
  pontoon("lake-conroe-marina", 170),
  kayaks("lake-conroe-marina", 40),
  trailRide("piney-woods-stables", 55),
  pontoon("joe-pool-marina", 175),
  kayaks("joe-pool-marina", 40),
  guidedHike("cedar-ridge-guides", 32),
  pontoon("possum-kingdom-marina", 185),
  trailRide("ray-roberts-stables", 60),
  pontoon("caddo-lake-outfitters", 150),
  kayaks("caddo-lake-outfitters", 60),
  kayaks("tyler-boathouse", 35),
  trailRide("palo-duro-stables", 70),
  guidedHike("palo-duro-guides", 40),
  guidedHike("guadalupe-peak-guides", 45),
  guidedHike("big-bend-desert-guides", 50),
  trailRide("lajitas-stables", 75),
];

export const ACTIVITIES_BY_ID: Record<string, Activity> = Object.fromEntries(
  ACTIVITIES.map((activity) => [activity.id, activity]),
);

export function providerForActivity(activity: Activity): Provider {
  const found = PROVIDERS.find((p) => p.id === activity.providerId);
  if (!found) throw new Error(`No provider for activity ${activity.id}`);
  return found;
}

/** Straight-line distance from an activity's provider to a campsite, in miles. */
export function distanceFromCampsiteMiles(activity: Activity, campsite: Campsite): number {
  const p = providerForActivity(activity);
  return Math.round(
    greatCircleMiles({ lat: p.latitude, lng: p.longitude }, { lat: campsite.latitude, lng: campsite.longitude }),
  );
}

/**
 * Dependency rule (Build Brief §10): the provider must be nearby, and a
 * water activity is only offered when the campsite itself has water access.
 */
export function campsiteSatisfiesActivityRequirement(activity: Activity, campsite: Campsite): boolean {
  if (activity.requiresWaterAccess && !campsite.waterAccess.nearby) return false;
  return distanceFromCampsiteMiles(activity, campsite) <= NEARBY_MILES;
}

/** Activities a campsite can actually offer, nearest provider first. */
export function activitiesNear(campsite: Campsite, activities: Activity[] = ACTIVITIES): Activity[] {
  return activities
    .filter((activity) => campsiteSatisfiesActivityRequirement(activity, campsite))
    .sort((a, b) => distanceFromCampsiteMiles(a, campsite) - distanceFromCampsiteMiles(b, campsite));
}

/** The activity of one type to plan at a campsite, or undefined if none is
 * nearby. `wantsIntermediate` picks the harder trail ride when asked for. */
export function activityOfType(campsite: Campsite, type: ActivityType, wantsIntermediate = false): Activity | undefined {
  const options = activitiesNear(campsite).filter((a) => a.type === type);
  return options.find((a) => (a.skillLevel === "intermediate") === wantsIntermediate) ?? options[0];
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The calendar date of a trip's first full day (or its last day). */
export function tripDay(range: { startISO: string; nights: number }, which: "first_full" | "last"): string {
  return addDaysISO(range.startISO, which === "last" ? range.nights : Math.min(1, range.nights));
}

function windowRunsOn(window: ActivityWindow, dayIndex: number, lastIndex: number): boolean {
  if (window.days === "arrival") return dayIndex === 0;
  if (window.days === "last") return dayIndex === lastIndex;
  if (dayIndex === 0) return window.startTime >= "15:00"; // after check-in
  if (dayIndex === lastIndex) return window.endTime <= "17:00"; // leaves time to drive home
  return true;
}

/**
 * The real slots an activity has for a trip, best first: the activity's
 * preferred day, then later days, then earlier ones. Always derived from the
 * trip's own dates — never a fixed calendar.
 */
export function activitySlots(activity: Activity, range: { startISO: string; nights: number }): ActivitySlot[] {
  const last = range.nights;
  const preferred = activity.preferredDay === "last" ? last : Math.min(1, last);
  const dayOrder = [preferred];
  for (let d = preferred + 1; d <= last; d++) dayOrder.push(d);
  for (let d = preferred - 1; d >= 0; d--) dayOrder.push(d);

  const slots: ActivitySlot[] = [];
  for (const day of dayOrder) {
    for (const window of activity.windows) {
      if (!windowRunsOn(window, day, last)) continue;
      slots.push({ date: addDaysISO(range.startISO, day), startTime: window.startTime, endTime: window.endTime });
    }
  }
  return slots;
}
