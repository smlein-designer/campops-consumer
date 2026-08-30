import type { Campsite } from "@/lib/schemas";

/**
 * Minimal mocked campsite inventory for the first vertical slice
 * (Build Brief §5 calls for 8–15 records with full tradeoff variation —
 * this is intentionally a smaller seed set, enough to prove ranking logic
 * works, NOT the full dataset. Expanding to the full 8–15 records with a
 * scripted availability-loss candidate is explicitly deferred, per the
 * agreed slice scope).
 */
export const CAMPSITES: Campsite[] = [
  {
    id: "blue-ridge-14",
    campgroundName: "Blue Ridge Campground",
    siteName: "Site 14",
    siteType: "Tent site",
    description: "A quiet tent site a short walk from the creek.",
    available: true,
    capacity: 4,
    pricePerNight: 142,
    petFriendly: true,
    amenities: ["Fire pit", "Picnic table", "Potable water"],
    distanceMiles: 32,
    nearWater: true,
    seclusion: "medium",
    cancellationPolicy:
      "Free cancellation until Sept 1. After that, one night's rate is non-refundable.",
    datesAvailable: "Sept 12–14",
  },
  {
    id: "blue-ridge-22",
    campgroundName: "Blue Ridge Campground",
    siteName: "Site 22",
    siteType: "RV site",
    description: "Full-hookup RV pad near the campground entrance.",
    available: true,
    capacity: 6,
    pricePerNight: 165,
    petFriendly: false,
    amenities: ["Electric hookup", "Dump station"],
    distanceMiles: 30,
    nearWater: false,
    seclusion: "low",
    cancellationPolicy:
      "Free cancellation until Sept 1. After that, one night's rate is non-refundable.",
    datesAvailable: "Sept 12–14",
  },
  {
    id: "silver-creek-7",
    campgroundName: "Silver Creek Campground",
    siteName: "Site 7",
    siteType: "Cabin",
    description: "A secluded cabin backing onto the creek.",
    available: true,
    capacity: 4,
    pricePerNight: 210,
    petFriendly: true,
    amenities: ["Fire pit", "Showers", "Wifi"],
    distanceMiles: 58,
    nearWater: true,
    seclusion: "high",
    cancellationPolicy:
      "Free cancellation until Sept 5. After that, one night's rate is non-refundable.",
    datesAvailable: "Sept 12–14",
  },
  {
    id: "cedar-hollow-3",
    campgroundName: "Cedar Hollow Campground",
    siteName: "Site 3",
    siteType: "Tent site",
    description: "A small, private tent site tucked into the trees.",
    available: true,
    capacity: 2,
    pricePerNight: 95,
    petFriendly: true,
    amenities: ["Fire pit", "Potable water"],
    distanceMiles: 45,
    nearWater: false,
    seclusion: "high",
    cancellationPolicy:
      "Free cancellation until Sept 1. After that, one night's rate is non-refundable.",
    datesAvailable: "Sept 12–14",
  },
  {
    id: "pine-ridge-9",
    campgroundName: "Pine Ridge Campground",
    siteName: "Site 9",
    siteType: "Tent site",
    description: "A popular lakeside site close to the highway.",
    available: true,
    capacity: 4,
    pricePerNight: 120,
    petFriendly: false,
    amenities: ["Picnic table", "Potable water", "Showers"],
    distanceMiles: 18,
    nearWater: true,
    seclusion: "low",
    cancellationPolicy:
      "Free cancellation until Sept 1. After that, one night's rate is non-refundable.",
    datesAvailable: "Sept 12–14",
  },
];
