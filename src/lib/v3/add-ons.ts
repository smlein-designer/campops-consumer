import type { AddOn } from "@/lib/v3/schemas";

/** Campground add-ons (Build Brief §5) — no time slot, sold per stay. */
export const ADD_ONS: AddOn[] = [
  {
    id: "firewood-bundle",
    campgroundName: "Pine Hollow",
    name: "Firewood bundle",
    price: 12,
    unit: "bundle",
    refundTerms: "Refundable until check-in",
  },
  {
    id: "kayak-rental",
    campgroundName: "Pine Hollow",
    name: "Kayak rental",
    price: 30,
    unit: "each",
    refundTerms: "Full refund up to 24 hours before",
  },
  {
    id: "ice-bag",
    campgroundName: "Pine Hollow",
    name: "Ice",
    price: 4,
    unit: "bag",
    refundTerms: "Non-refundable once purchased",
  },
  {
    id: "late-checkout",
    campgroundName: "Pine Hollow",
    name: "Late checkout",
    price: 15,
    unit: "night",
    refundTerms: "Refundable until check-in",
  },
];
