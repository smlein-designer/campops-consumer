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
  /** Fixed booking length this site's `datesAvailable` window represents. */
  nights: number;
  /** Flat service fee added to the nightly total (Build Brief §5 "fees where relevant"). */
  serviceFee: number;
};

/**
 * Requirement tiers, shared by TripIntent's four requirement arrays, the
 * Requirement Chip component, and per-constraint evaluation results.
 */
export type RequirementTier = "hard" | "flexible" | "preference" | "priority";

/**
 * Explicit three-state result of checking one requirement against one
 * campsite (Build Brief-driven rule, captured 2026-08-30 verification):
 * a hard requirement that cannot be verified must never be silently
 * treated as satisfied. "unverifiable" is a distinct, visible state —
 * never conflated with "satisfied".
 */
export type ConstraintStatus = "satisfied" | "unsatisfied" | "unverifiable";

export type ConstraintCheck = {
  label: string;
  tier: RequirementTier;
  status: ConstraintStatus;
};

/**
 * How a candidate relates to the trip's hard requirements:
 * - "full": every hard requirement is confirmed satisfied.
 * - "compromise": no hard requirement is confirmed unsatisfied, but at
 *   least one could not be verified — never presented as a full match.
 * - "no_match": at least one hard requirement is confirmed unsatisfied.
 */
export type MatchType = "full" | "compromise" | "no_match";

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
  matchType: MatchType;
  checks: ConstraintCheck[];
  /** Satisfied hard-requirement labels — Candidate Card's "Preserved" chips. */
  preserved: string[];
  /**
   * Human-readable compromise descriptions (e.g. "Couldn't verify:
   * Pet-friendly", "Doesn't satisfy: Waterfront") — Candidate Card's
   * "Compromise" chip(s). Empty for matchType "full".
   */
  compromises: string[];
  explanation: string;
};

/**
 * Result of evaluating a TripIntent against the dataset. `kind` is the best
 * matchType achieved by any available candidate. For kind "no_match",
 * `candidates` are the closest available sites shown for transparency —
 * none of them should be presented to the user as a confident recommendation.
 */
export type EvaluationResult = {
  kind: MatchType;
  candidates: Candidate[];
};

/**
 * RESERVATION — explicit application state for a staged/committed booking
 * (OOUX RESERVATION object; PRD §6 Booking Authorization Requirements).
 * This is real structured state, not chat text: the reservation the user
 * sees is always read from this object, never re-derived from conversation.
 *
 * Status is a five-value state, deliberately not collapsed into one or two
 * booleans (each has distinct meaning and distinct allowed transitions —
 * see `transitionReservation` in `src/lib/reservation.ts`, the ONLY
 * function permitted to change `status`):
 * - "staged": accepted and prepared, resting state on Reservation Review.
 * - "incomplete": a reserve attempt found required info missing (surfaces
 *   the Missing Info treatment); staged data is preserved, not discarded.
 * - "ready_for_authorization": required info is complete; the Authorize
 *   Booking dialog is open, awaiting the user's explicit decision.
 * - "authorizing": the user has clicked the dialog's own commit action; a
 *   brief, deterministic simulated-commit state (Handoff Spec 5's
 *   "Pressed/Loading" requirement) — not yet reserved.
 * - "reserved": the explicit AUTHORIZE event has resolved. This is the
 *   ONLY status that represents a committed, charged booking.
 */
export type ReservationStatus =
  | "staged"
  | "incomplete"
  | "ready_for_authorization"
  | "authorizing"
  | "reserved";

export type Reservation = {
  campsite: Campsite;
  /** From TripIntent at staging time — may be null if the user never stated a headcount. */
  guestCount: number | null;
  /** Display-formatted date range, e.g. "Sept 12 – 14 (2 nights)". */
  dates: string;
  nights: number;
  nightlyRate: number;
  serviceFee: number;
  total: number;
  cancellationPolicy: string;
  /** null = no payment method on file yet — the one required field the live Figma actually models as missing. */
  paymentMethodLabel: string | null;
  status: ReservationStatus;
  /** Set only by a successful AUTHORIZE transition; deterministic, never random. */
  confirmationNumber: string | null;
};

export type ReservationEvent =
  | { type: "RESERVE_ATTEMPT" }
  | { type: "ADD_PAYMENT_METHOD"; label: string }
  | { type: "BEGIN_AUTHORIZE" }
  | { type: "AUTHORIZE" }
  | { type: "CANCEL_AUTHORIZATION" };
