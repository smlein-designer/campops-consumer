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

/** Plan-step wording per activity type: the step's title, what it depends
 * on while it waits, and how to name it mid-sentence. */
export const ACTIVITY_STEP: Record<ActivityType, { label: string; pending: string; noun: string; working: string }> = {
  boat: {
    label: "Add a boat near the site",
    pending: "Only if the site is on the water",
    noun: "a boat",
    working: "checking boat times",
  },
  kayak: {
    label: "Add kayaks near the site",
    pending: "Only if the site is on the water",
    noun: "kayaks",
    working: "checking kayak times",
  },
  horseback: {
    label: "Book a trail ride",
    pending: "If a stable is near the site",
    noun: "a trail ride",
    working: "checking ride times",
  },
  guided_hike: {
    label: "Find a hiking guide",
    pending: "If a guide works near the site",
    noun: "a guided hike",
    working: "comparing guides",
  },
};
