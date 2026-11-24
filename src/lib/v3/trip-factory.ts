import type { Permission, Trip } from "@/lib/v3/schemas";

/** Default standing permissions (Build Brief §7). */
export function defaultPermissions(): Permission[] {
  return [
    {
      id: "hold_refundable",
      label: "Hold refundable bookings",
      description: "Hold a site or activity without asking, up to the limit below.",
      enabled: true,
      limitUsd: 300,
      locked: false,
    },
    {
      id: "rehold_on_expiry",
      label: "Re-hold when a hold runs out",
      description: "Re-hold the same slot if it's still open.",
      enabled: true,
      locked: false,
    },
    {
      id: "replan_on_condition",
      label: "Replan when conditions change",
      description: "Find a same-price-or-less alternative and ask before applying.",
      enabled: true,
      locked: false,
    },
    {
      id: "suggest_extras",
      label: "Suggest extras",
      description: "Offer one relevant extra at a natural pause.",
      enabled: true,
      locked: false,
    },
    {
      id: "hold_nonrefundable",
      label: "Hold non-refundable bookings",
      description: "CampOps asks before every one.",
      enabled: false,
      locked: false,
    },
    {
      id: "book_and_charge",
      label: "Book and charge",
      description: "CampOps always asks before booking or charging anything.",
      enabled: true,
      locked: true,
    },
  ];
}

export function emptyTrip(): Trip {
  return {
    intent: {
      checkIn: "",
      checkOut: "",
      dateHint: "",
      adults: 0,
      children: 0,
      pets: 0,
      destination: "",
      origin: "",
      driveLimitHours: null,
      budgetTotalUsd: null,
      budgetPerNightUsd: null,
      requirements: [],
    },
    thread: [],
    plan: [],
    agent: { working: false, phase: "interpreting", paused: false, currentStepText: "" },
    bookings: [],
    holds: [],
    permissions: defaultPermissions(),
    needsYouQueue: [],
    suggestions: [],
    dismissedSuggestionTypes: [],
    conditions: [],
    events: [],
    authorization: { removedBookingIds: [], paymentMethodLabel: null, approved: false },
    pendingAsk: null,
    clarifyingQuestion: null,
    unavailableCampsiteIds: [],
    browsing: false,
    changedChips: [],
    candidateIndex: 0,
    campsiteComparison: null,
  };
}
