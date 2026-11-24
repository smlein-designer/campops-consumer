import { activityBookingPrice, activityUnits } from "@/lib/v3/money";
import type { Activity, ActivityParty, V3TripIntent } from "@/lib/v3/schemas";

/** Everyone on one activity. */
export function partyCount(party: ActivityParty): number {
  return party.adults + party.children;
}

/** "2 adults and 1 kid". */
export function activityPartyLabel(party: ActivityParty): string {
  const parts = [
    party.adults > 0 ? `${party.adults} adult${party.adults === 1 ? "" : "s"}` : "",
    party.children > 0 ? `${party.children} kid${party.children === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(" and ");
}

/** The most people one booking can take: a ride has a fixed number of
 * horses; boats, kayaks and guided groups just add another unit. */
export function maxPeople(activity: Activity, intent: V3TripIntent): number {
  const party = intent.adults + intent.children;
  return activity.pricingBasis === "per_person" ? Math.min(party, activity.capacity) : party;
}

/** Who's going until the user says otherwise: the whole trip, as far as the
 * activity has room — adults first. */
export function defaultActivityParty(activity: Activity, intent: V3TripIntent): ActivityParty {
  const room = maxPeople(activity, intent);
  const adults = Math.min(intent.adults, room);
  return { adults, children: Math.min(intent.children, room - adults) };
}

/** Card meta for an activity booking: "4 riders · beginner trail". */
export function activityMeta(activity: Activity, party: ActivityParty): string {
  const people = partyCount(party);
  const units = activityUnits(activity, people);
  if (activity.type === "horseback") return `${people} rider${people === 1 ? "" : "s"} · ${activity.skillLevel} trail`;
  if (activity.type === "kayak") return `${units} kayak${units === 1 ? "" : "s"} · ${people} ${people === 1 ? "person" : "people"}`;
  if (activity.type === "boat") return units > 1 ? `${units} boats · ${people} people` : `${people} of ${activity.capacity} seats`;
  return units > 1 ? `${units} groups · ${people} people` : `Group of ${people}`;
}

/** What the party is getting, for the picker: "$65 a rider", "2 kayaks for 4". */
export function activityQuote(activity: Activity, party: ActivityParty): { price: number; detail: string } {
  const people = partyCount(party);
  const price = activityBookingPrice(activity, people);
  const units = activityUnits(activity, people);
  const per =
    activity.pricingBasis === "per_person"
      ? `$${activity.price} a ${activity.type === "horseback" ? "rider" : "person"}`
      : `$${activity.price} a ${activity.type === "kayak" ? "kayak for two" : activity.type === "boat" ? "boat" : "group"}`;
  const count =
    activity.pricingBasis === "per_person" ? "" : units > 1 ? ` · ${units} ${activity.type === "kayak" ? "kayaks" : activity.type === "boat" ? "boats" : "groups"}` : "";
  return { price, detail: `${per}${count}` };
}
