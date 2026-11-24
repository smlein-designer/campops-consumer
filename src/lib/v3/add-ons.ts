import type { Campsite } from "@/lib/schemas";
import type { AddOn } from "@/lib/v3/schemas";

/** Campground add-ons (PRD v3 §10) — sold by the campground for the stay, no
 * time slot. Every campground sells the basics; rentals need water. */
export const ADD_ONS: AddOn[] = [
  { id: "firewood-bundle", name: "Firewood bundle", price: 12, unit: "bundle", refundTerms: "Refundable until check-in" },
  {
    id: "kayak-rental",
    name: "Kayak rental",
    price: 30,
    unit: "each",
    refundTerms: "Full refund up to 24 hours before",
    requiresWaterAccess: true,
    coversActivity: "kayak",
  },
  { id: "late-checkout", name: "Late checkout", price: 15, unit: "night", refundTerms: "Refundable until check-in" },
  { id: "ice", name: "Ice", price: 4, unit: "bag", refundTerms: "Refundable until check-in" },
];

export function addOnsNear(campsite: Campsite): AddOn[] {
  return ADD_ONS.filter((a) => !a.requiresWaterAccess || campsite.waterAccess.nearby);
}
