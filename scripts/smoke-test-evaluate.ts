import { evaluateCampsites } from "../src/lib/evaluate";
import type { TripIntent } from "../src/lib/schemas";

const intent: TripIntent = {
  goalStatement: "A 4-person, pet-friendly trip near water for Sept 12-14, keeping cost reasonable.",
  guestCount: 4,
  checkIn: "Sept 12",
  checkOut: "Sept 14",
  hardRequirements: ["Pet-friendly", "Capacity for 4"],
  flexibleConstraints: [],
  preferences: ["Near water"],
  priorities: ["Keep cost low"],
};

const ranked = evaluateCampsites(intent);
console.log(JSON.stringify(ranked, null, 2));
console.log("\nTop pick:", ranked[0]?.campsite.siteName, "@", ranked[0]?.campsite.campgroundName);
