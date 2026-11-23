import type { AddOn } from "@/lib/v3/schemas";

/** Campground add-ons (Build Brief §5, PRD v3 §10 "attached across the
 * dataset wherever they realistically fit") — no time slot, sold per stay. */
export const ADD_ONS: AddOn[] = [
  {
    id: "firewood-bundle-pine-hollow",
    campgroundName: "Pine Hollow",
    name: "Firewood bundle",
    price: 12,
    unit: "bundle",
    refundTerms: "Refundable until check-in",
  },
  {
    id: "kayak-rental-pine-hollow",
    campgroundName: "Pine Hollow",
    name: "Kayak rental",
    price: 30,
    unit: "each",
    refundTerms: "Full refund up to 24 hours before",
  },
  {
    id: "ice-bag-pine-hollow",
    campgroundName: "Pine Hollow",
    name: "Ice",
    price: 4,
    unit: "bag",
    refundTerms: "Non-refundable once purchased",
  },
  {
    id: "late-checkout-pine-hollow",
    campgroundName: "Pine Hollow",
    name: "Late checkout",
    price: 15,
    unit: "night",
    refundTerms: "Refundable until check-in",
  },
  {
    id: "firewood-bundle-cedar-point",
    campgroundName: "Cedar Point",
    name: "Firewood bundle",
    price: 12,
    unit: "bundle",
    refundTerms: "Refundable until check-in",
  },
  {
    id: "ice-bag-cedar-point",
    campgroundName: "Cedar Point",
    name: "Ice",
    price: 4,
    unit: "bag",
    refundTerms: "Non-refundable once purchased",
  },
  {
    id: "firewood-bundle-prairie-flats",
    campgroundName: "Prairie Flats",
    name: "Firewood bundle",
    price: 10,
    unit: "bundle",
    refundTerms: "Refundable until check-in",
  },
  {
    id: "late-checkout-prairie-flats",
    campgroundName: "Prairie Flats",
    name: "Late checkout",
    price: 15,
    unit: "night",
    refundTerms: "Refundable until check-in",
  },
];

export function addOnsNear(campgroundName: string): AddOn[] {
  return ADD_ONS.filter((a) => a.campgroundName === campgroundName);
}
