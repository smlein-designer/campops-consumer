import { z } from "zod";

/**
 * TripIntent — structured application state for the camper's request
 * (Build Brief §6 "Trip intent" / OOUX TRIP object). This is the
 * application's source of truth for what CampOps understood; the model
 * only ever proposes an update to it via structured output (Build Brief §7),
 * it never mutates state directly with free-form text.
 *
 * Requirement tiers mirror the four Requirement Chip tiers (Handoff Spec 2.4):
 * hard requirements, flexible constraints, preferences, and relative
 * priorities. Each is a short human-readable label, not a filter value —
 * the deterministic evaluator below is responsible for turning these into
 * an actual campsite filter/score.
 */
export const TripIntentSchema = z.object({
  goalStatement: z
    .string()
    .describe("The user's trip goal, restated in one plain sentence."),
  guestCount: z
    .number()
    .int()
    .nullable()
    .describe("Number of people on the trip, or null if not stated."),
  checkIn: z
    .string()
    .nullable()
    .describe(
      "Check-in date if stated, in a human-readable form (e.g. 'Sept 12'), else null.",
    ),
  checkOut: z
    .string()
    .nullable()
    .describe("Check-out date if stated, else null."),
  hardRequirements: z
    .array(z.string())
    .describe(
      "Non-negotiable requirements explicitly stated by the user (e.g. 'Pet-friendly').",
    ),
  flexibleConstraints: z
    .array(z.string())
    .describe("Constraints the user indicated could shift under a tradeoff."),
  preferences: z
    .array(z.string())
    .describe("Nice-to-have preferences that are not requirements."),
  priorities: z
    .array(z.string())
    .describe(
      "Relative priorities requiring a tradeoff judgment, e.g. 'Willing to drive farther for more seclusion'.",
    ),
});

export type TripIntent = z.infer<typeof TripIntentSchema>;

export const EMPTY_TRIP_INTENT: TripIntent = {
  goalStatement: "",
  guestCount: null,
  checkIn: null,
  checkOut: null,
  hardRequirements: [],
  flexibleConstraints: [],
  preferences: [],
  priorities: [],
};

/**
 * CAMPSITE — deterministic inventory record (Build Brief §5 / OOUX CAMPSITE
 * object). Amenities are modeled as a plain metadata tag array, not a
 * standalone object, per Case Study Decision 11 (intentional divergence from
 * the admin-tool object model).
 */
export type Campsite = {
  id: string;
  campgroundName: string;
  siteName: string;
  siteType: string;
  description: string;
  available: boolean;
  capacity: number;
  pricePerNight: number;
  petFriendly: boolean;
  amenities: string[];
  distanceMiles: number;
  nearWater: boolean;
  seclusion: "high" | "medium" | "low";
  cancellationPolicy: string;
  datesAvailable: string;
};

/**
 * CANDIDATE — a ranked recommendation produced by deterministic evaluation
 * (OOUX CANDIDATE object). `explanation` is generated from the structured
 * diff between the campsite and the trip intent (Build Brief §7: "recommendation
 * explanations should be generated from structured differences... rather than
 * invented freely by the model") — no LLM call is involved in producing it
 * for this slice.
 */
export type Candidate = {
  campsite: Campsite;
  rank: number;
  score: number;
  preserved: string[];
  compromise?: string;
  explanation: string;
};
