import type { ActivityType } from "@/lib/v3/schemas";

/**
 * Deterministic requirement-label -> activity-type matching (same keyword-
 * alias approach as src/lib/amenities.ts's normalizeAmenityLabel), so the
 * planner can build one plan step per requested activity type without a
 * model call deciding plan structure (Build Brief §9 "Plan: application
 * builds macro steps from intent").
 */
const ACTIVITY_TYPE_ALIASES: Record<string, ActivityType> = {
  "trail ride": "horseback",
  horseback: "horseback",
  "horseback riding": "horseback",
  riding: "horseback",
  pontoon: "boat",
  boat: "boat",
  boating: "boat",
  "boat rental": "boat",
  kayak: "kayak",
  kayaks: "kayak",
  kayaking: "kayak",
  hike: "guided_hike",
  hiking: "guided_hike",
  "guided hike": "guided_hike",
};

export function activityTypesRequested(labels: string[]): ActivityType[] {
  const found = new Set<ActivityType>();
  for (const rawLabel of labels) {
    const key = rawLabel.toLowerCase().trim();
    if (ACTIVITY_TYPE_ALIASES[key]) {
      found.add(ACTIVITY_TYPE_ALIASES[key]);
      continue;
    }
    for (const [alias, type] of Object.entries(ACTIVITY_TYPE_ALIASES)) {
      if (key.includes(alias)) {
        found.add(type);
        break;
      }
    }
  }
  return Array.from(found);
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  boat: "Boating",
  horseback: "Trail ride",
  guided_hike: "Guided hike",
  kayak: "Kayaking",
};
