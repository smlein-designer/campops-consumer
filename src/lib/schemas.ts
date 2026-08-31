import { z } from "zod";
import type { AmenityCode } from "@/lib/amenities";
import type { FamilyFeature } from "@/lib/family-features";

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
  originZip: z
    .string()
    .nullable()
    .describe(
      "The user's own starting-point ZIP code, ONLY if they explicitly stated one (e.g. 'my zip is 10001') — never inferred, never a device/browser location, never a placeholder. Null if not given. This is the origin used for constraints stated relative to the user themselves (e.g. 'within an hour of my home', 'near me') — the application decides when one is required, not you.",
    ),
  destinationRegion: z
    .string()
    .nullable()
    .describe(
      "A specific place, region, or park the user wants to camp IN — e.g. 'Hill Country', 'near Austin', 'Big Bend', 'the Gulf coast'. This is the DESTINATION area, distinct from originZip (the user's own starting location, used only for distance/travel-time constraints). Fill this in only when the user actually names a place they want to camp in or near; null otherwise — never guessed from an unrelated ZIP or from a campsite's own city.",
    ),
  travelingWithPets: z
    .boolean()
    .describe(
      "true ONLY when the user states an actual pet/dog is coming on THIS trip — 'I'm bringing my dog', 'we have two dogs', 'traveling with my dog', 'I need somewhere that allows dogs', 'dogs allowed', 'pets allowed'. This is a structural fact (a real animal is coming, so a non-pet-friendly site is genuinely unusable), not a preference — normalize every pet/dog phrasing variant into this ONE boolean field. Do NOT also add 'Pet-friendly'/'Dog-friendly'/'Dogs allowed' etc. as hardRequirements text when this is true — the application enforces it directly against the campsite's own pet-policy field, the same way it enforces guestCount. Leave false (the default) when no pet is mentioned. A softer, non-committal preference for pet-friendly amenities WITHOUT stating a pet is actually coming (e.g. 'pet-friendly would be nice') should instead be added as a 'Pet-friendly' entry in preferences/flexibleConstraints, not this field — that stays a genuine soft preference.",
    ),
  petCount: z
    .number()
    .int()
    .nullable()
    .describe(
      "The actual number of pets coming, ONLY when travelingWithPets is true. 'my dog'/'a dog' -> 1. 'two dogs' -> 2. A genuinely unspecified plural ('we have dogs', count not stated) -> null (never guess a count). Always null when travelingWithPets is false.",
    ),
  travelingWithChildren: z
    .boolean()
    .describe(
      "Trip Requirement Projection + Party-Composition Inference (2026-09-10 — see docs/implementation-decisions.md): true ONLY when the user explicitly identifies children as part of THIS camping party — '2 adults and 2 kids', 'my wife and I with our two children', '4 adults, two kids', 'camping with the kids', 'me, my partner, and our 8-year-old'. This is about explicit CHILD COMPOSITION, not raw headcount: a generic party size ('6 people', 'a group of 6', 'six adults') must leave this false even though guestCount is filled in — there is nothing in that phrasing distinguishing adults from children. The application uses this fact to decide whether a soft family-friendly preference applies; it never infers that from guestCount alone. Leave false (the default) whenever the message doesn't explicitly call out a child.",
    ),
  childCount: z
    .number()
    .int()
    .nullable()
    .describe(
      "The actual number of children explicitly identified, ONLY when travelingWithChildren is true — mirrors petCount's own rule. 'our kid'/'my son' (singular) -> 1. 'two kids' -> 2. A genuinely unspecified plural ('camping with the kids', count not stated) -> null (never guess a count). Always null when travelingWithChildren is false.",
    ),
  budget: z
    .object({
      maxTotal: z
        .number()
        .nullable()
        .describe(
          "Maximum for the ENTIRE stay (all nights + fees combined), only when the user clearly means the whole trip — e.g. 'keep the whole stay under $300', 'total budget of $250'. Null if not stated or if the user meant a nightly rate instead.",
        ),
      maxPerNight: z
        .number()
        .nullable()
        .describe(
          "Maximum PER NIGHT, only when the user clearly means a nightly rate — e.g. 'no more than $150 a night', 'nightly rate under $100'. Null if not stated or if the user meant the whole stay instead.",
        ),
    })
    .nullable()
    .describe(
      "Present only when the user stated a price limit of either kind above; null otherwise. At most one of maxTotal/maxPerNight should be non-null per the user's actual phrasing — do not fill in both from one ambiguous statement.",
    ),
  hardRequirements: z
    .array(z.string())
    .describe(
      "Non-negotiable requirements explicitly stated by the user, other than pets (see travelingWithPets) or guest count (see guestCount) — both of those are structured fields, not hardRequirements text.",
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
  originZip: null,
  destinationRegion: null,
  travelingWithPets: false,
  petCount: null,
  travelingWithChildren: false,
  childCount: null,
  budget: null,
  hardRequirements: [],
  flexibleConstraints: [],
  preferences: [],
  priorities: [],
};

/**
 * IntentInterpretation — wraps TripIntent with an explicit, model-committed
 * judgment about whether the request is actionable, needs clarification, or
 * is outside CampOps' supported scope. This is deliberately a SEPARATE
 * wrapper, not a confidence field bolted onto TripIntent (captured decision,
 * 2026-08-30 — see docs/implementation-decisions.md): TripIntent stays a
 * pure structured representation of the camping goal; `status` is the
 * model's explicit classification, produced by the same structured-output
 * call, never inferred afterward by the application counting how many
 * TripIntent fields happen to be populated.
 *
 * - "actionable": enough is understood to search/evaluate responsibly.
 * - "needs_clarification": a legitimate in-domain camping request, but
 *   missing information CampOps cannot safely assume without risking a
 *   materially wrong result. `clarification` carries the question (and,
 *   where the answer space is naturally a short list, quick replies) —
 *   never a confidence score or private reasoning.
 * - "unsupported": the request itself asks for something outside this
 *   POC's supported scope (not just outside current data). `unsupported`
 *   carries a plain-language statement of what's out of scope.
 */
export const IntentInterpretationSchema = z.object({
  intent: TripIntentSchema,
  status: z.enum(["actionable", "needs_clarification", "unsupported"]),
  clarification: z
    .object({
      question: z
        .string()
        .describe("The single question to ask the user, plain language."),
      quickReplies: z
        .array(
          z.object({
            label: z
              .string()
              .describe("The reply text shown to the user as a button."),
            followUpQuestion: z
              .string()
              .nullable()
              .describe(
                "Multi-step clarification (captured 2026-09-02 — see docs/implementation-decisions.md): a quick reply may itself be a COMPLETE answer (e.g. 'Anywhere nearby'), or it may only select a BRANCH that still requires a further concrete value from the user (e.g. 'A specific park/region' names no park or region yet). Set this to the exact next question to ask if the user picks this option and it does NOT yet supply a concrete value (e.g. 'Which park or region?'). Set it to null if picking this option is itself a complete, actionable answer requiring no further follow-up. The application enforces this deterministically — it does not trust status alone to know whether a branch selection actually resolved anything.",
              ),
          }),
        )
        .describe(
          "Short quick-reply options when the answer space is naturally a small set (e.g. 2-4 options); empty array if not applicable — the composer is always available regardless.",
        ),
    })
    .nullable()
    .describe('Present only when status is "needs_clarification", else null.'),
  unsupported: z
    .object({
      reason: z
        .string()
        .describe(
          "One or two calm, plain-language sentences stating what's outside CampOps' scope and, if natural, offering to continue with the camping task.",
        ),
    })
    .nullable()
    .describe('Present only when status is "unsupported", else null.'),
  candidateQuestion: z
    .object({
      topic: z.enum([
        "pet",
        "water",
        "family",
        "noise",
        "seclusion",
        "distance",
        "amenity",
        "capacity",
        "price",
        "availability",
        "site_type",
        "other",
      ]),
      amenityHint: z
        .string()
        .nullable()
        .describe(
          "Only when topic is 'amenity': the specific amenity/feature the user asked about, in their own words (e.g. 'showers', 'wifi') — the application normalizes this itself, do not translate it to a code.",
        ),
    })
    .nullable()
    .describe(
      "Active-Recommendation Follow-Up correction (captured 2026-09-05 — see docs/implementation-decisions.md). Present ONLY when `hasActiveCandidate` was true for this turn AND the user's message is a FACTUAL QUESTION about the currently shown/recommended campsite specifically ('it', 'this site', 'this one') — asking to be TOLD a fact about it, not asking for it to be changed, and not stating a new requirement for future results. Examples: 'is it near water?', 'does it allow dogs?', 'how far away is it?', 'does it have showers?', 'is it quiet?'. This is a real, separate conversational act from an intent refinement — meaning determines it, never punctuation (a message with no question mark can still be a question; one with a question mark, e.g. 'Would something near water be better?', is often a conversational judgment call, not a request for a specific fact). Do NOT set this for a statement that asks CampOps to change what it's looking for ('I'd like it to be near water', 'make sure dogs are allowed', 'I need showers') — those are ordinary intent refinements and should update `intent` as usual, exactly like any other turn. When you DO set this field, still return your best current `intent` unchanged (the application enforces that a candidate question can never mutate intent regardless of what you return here, but you should not report a change either). Never fabricate the factual answer yourself — you are only classifying the question and its topic; the application looks up the real answer from structured campsite data.",
    ),
});

export type IntentInterpretation = z.infer<typeof IntentInterpretationSchema>;

/**
 * Structured pet policy (Dataset Depth correction, 2026-09-04 — see
 * docs/implementation-decisions.md). Replaces the simple `petFriendly`
 * boolean: `allowed` alone can't tell a site that takes one small dog from
 * one that takes a pack of three, and "two dogs" must be able to fail a
 * site whose `maxPets` is 1. `maxPets` is meaningless when `allowed` is
 * false and is conventionally 0 in that case.
 */
export type PetPolicy = {
  allowed: boolean;
  maxPets: number;
};

/**
 * Structured water-access facts (Dataset Depth correction, 2026-09-04).
 * Replaces the single `nearWater` boolean, which couldn't distinguish
 * "near a creek" from "waterfront on a lake" from "beach access" — all
 * materially different claims a user might specifically ask for.
 * `directAccess` implies `nearby` (a site can't have direct access to water
 * that isn't nearby); `type: "none"` pairs with `nearby: false`.
 */
export type WaterAccessType = "creek" | "river" | "lake" | "beach" | "none";
export type WaterAccess = {
  nearby: boolean;
  directAccess: boolean;
  type: WaterAccessType;
};

/**
 * Structured, relative cancellation policy (Dataset Depth correction,
 * 2026-09-04). Replaces a literal string with a hard-coded cutoff date
 * ("Free cancellation until Sept 1") that stayed stale for every trip date
 * other than the one it was originally authored for. The cutoff is always
 * computed relative to the ACTUAL reservation's check-in date — see
 * `describeCancellationPolicy` in `src/lib/reservation.ts`.
 */
export type CancellationPolicy = {
  freeUntilDaysBeforeCheckIn: number;
  latePenaltyNights: number;
};

/**
 * A date-specific unavailable window on a campsite (Dataset Depth
 * correction, 2026-09-04) — ISO `YYYY-MM-DD`, half-open `[start, end)`
 * (checkout day itself is not blocked). This is inventory-level,
 * date-specific availability, distinct from both `available` (a permanent
 * seasonal-closure flag) and the demo's runtime `unavailableIds` simulated-
 * loss mechanism (page.tsx) — all three can coexist and are checked at
 * different points.
 */
export type UnavailableRange = { start: string; end: string };

/**
 * CAMPSITE — deterministic inventory record (Build Brief §5 / OOUX CAMPSITE
 * object). Amenities/family features are canonical, finite vocabularies
 * (`src/lib/amenities.ts`, `src/lib/family-features.ts`), not free-text
 * display strings — matching a user's requirement against them is a real
 * enforcement path, not a substring guess.
 *
 * Inventory facts vs. trip-derived facts (Dataset Depth correction,
 * 2026-09-04 — see docs/implementation-decisions.md): a Campsite record
 * deliberately has NO `datesAvailable`, `nights`, or `distanceMiles` field.
 * Those are not properties of the campsite — they only exist relative to a
 * specific requested stay or a specific user origin, and are always derived
 * at evaluation/staging time from the active `TripIntent`/`Reservation`
 * (`src/lib/dates.ts`'s `computeDateRange`, `src/lib/geo.ts`'s distance
 * helpers). Storing them as static campsite facts is exactly the bug class
 * this correction exists to close — every record used to carry the same
 * `datesAvailable: "Sept 12 – 14"`, which read as true availability for
 * whatever dates a user happened to ask about.
 */
export type Campsite = {
  id: string;
  campgroundName: string;
  siteName: string;
  siteType: string;
  description: string;
  /** Permanent seasonal-closure flag — independent of any specific requested date range. */
  available: boolean;
  capacity: number;
  pricePerNight: number;
  petPolicy: PetPolicy;
  familyFeatures: FamilyFeature[];
  amenities: AmenityCode[];
  waterAccess: WaterAccess;
  /** Privacy from OTHER campers/sites — see `noiseLevel` for sound/quiet, a distinct, non-synonymous dimension. */
  seclusion: "high" | "medium" | "low";
  /** Ambient sound level — distinct from `seclusion`: a secluded site can still be loud (e.g. near a highway or falls), and a low-privacy site can still be quiet. */
  noiseLevel: "high" | "medium" | "low";
  cancellationPolicy: CancellationPolicy;
  /** Date-specific unavailable windows — see the `UnavailableRange` doc comment. */
  unavailableRanges: UnavailableRange[];
  /** Flat service fee added to the nightly total (Build Brief §5 "fees where relevant"). */
  serviceFee: number;
  /**
   * Real deterministic geographic location (Search Truth correction,
   * 2026-09-02 — see docs/implementation-decisions.md). `region` is one of
   * the seven named Texas regions the dataset spans, used for deterministic
   * destination-region matching; `latitude`/`longitude` power the
   * origin-ZIP travel-time/distance calculations in `src/lib/geo.ts` —
   * the ONLY source of any user-relative distance value (there is no
   * separate, competing distance field on the record itself).
   */
  address: string;
  city: string;
  state: string;
  zip: string;
  region: string;
  latitude: number;
  longitude: number;
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
  /**
   * Estimated road distance from the trip's `originZip`, in miles — the
   * ONLY distance value this app ever produces (Dataset Depth correction,
   * 2026-09-04; see `src/lib/geo.ts`). Null whenever no origin ZIP is known
   * or it falls outside the bundled centroid table's coverage — never a
   * fabricated number standing in for "unknown".
   */
  distanceFromOriginMiles: number | null;
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
  /**
   * The user's own stated check-in/check-out (TripIntent.checkIn/checkOut at
   * staging time) — deterministically REQUIRED to be non-null AND resolvable
   * to a real, positive-night date range before staging can occur at all
   * (see `checkBookingDatePrerequisites` in `src/lib/prerequisites.ts`).
   * `nights` (and therefore `total`) is DERIVED from this pair via
   * `computeDateRange` (`src/lib/dates.ts`) at staging time — never sourced
   * from the campsite record, which (Dataset Depth correction, 2026-09-04)
   * has no `nights`/`datesAvailable` field of its own at all.
   */
  checkIn: string;
  checkOut: string;
  /** Display-formatted date range, e.g. "Sept 12 – 14 (2 nights)". */
  dates: string;
  /** Derived from checkIn/checkOut at staging time — never a campsite property. */
  nights: number;
  nightlyRate: number;
  serviceFee: number;
  total: number;
  /** Pre-formatted display copy, generated once at staging time from the campsite's structured `CancellationPolicy` + the real check-in date (see `describeCancellationPolicy`). */
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

/**
 * TASK EVENT — real application-event model backing the user-facing
 * Activity Log (Handoff Spec 4.1 "Activity Log" / OOUX EVENT object).
 * Events are emitted only at the same architectural boundary as the real
 * state transition they describe (evaluateCampsites, transitionReservation,
 * stageReservation, the availability-loss/widen-search/alternative
 * handlers) — never fabricated after the fact purely for display, and
 * never reconstructed by parsing chat messages.
 *
 * `actor` is a real three-way distinction, not a convenience boolean:
 * - "user": something the person explicitly did (accept, reject, request
 *   alternative, authorize).
 * - "agent": CampOps' own interpretive/evaluative work (extracting intent,
 *   ranking candidates, staging a reservation).
 * - "system": a deterministic app/tool state change that isn't really a
 *   judgment call by either party (availability changing, a candidate
 *   being excluded, the reservation actually committing).
 *
 * `description` is plain, factual, deterministic copy — never raw
 * function/tool names, internal model terminology, or private reasoning.
 *
 * `clarification_requested` vs. `prerequisite_missing` (Deterministic Action
 * Prerequisites slice, 2026-09-01): both surface as the same Attention
 * Card to the user, but they are NOT the same concept, by design —
 * `clarification_requested` is the MODEL's own semantic judgment that it
 * needs more information (actor "agent"); `prerequisite_missing` is the
 * APPLICATION deterministically refusing to proceed because an objectively
 * required structured field is absent (actor "system" — the model never
 * decides this one). See `src/lib/prerequisites.ts`.
 */
export type EventActor = "user" | "agent" | "system";

export type EventType =
  | "trip_established"
  | "clarification_requested"
  | "clarification_resolved"
  | "requirement_refined"
  | "requirement_removed"
  | "requirement_widened"
  | "evaluation_performed"
  | "recommendation_selected"
  | "availability_changed"
  | "candidate_excluded"
  | "replacement_selected"
  | "alternative_requested"
  | "recommendation_accepted"
  | "recommendation_rejected"
  | "reservation_staged"
  | "payment_method_added"
  | "missing_info_detected"
  | "authorization_presented"
  | "authorization_dismissed"
  | "authorization_initiated"
  | "reservation_reserved"
  | "unsupported_encountered"
  | "task_closed"
  | "prerequisite_missing"
  | "prerequisite_resolved"
  /**
   * Recommendation-readiness gate (Search Truth correction, 2026-09-02 —
   * see docs/implementation-decisions.md): a THIRD, distinct gate from
   * semantic status and deterministic prerequisites — "the model understood
   * the request, and every deterministic prerequisite is met, but there is
   * still not enough structured intent to produce a non-arbitrary
   * recommendation." Actor "system": a deterministic application refusal,
   * never a model judgment.
   */
  | "recommendation_readiness_insufficient"
  | "recommendation_readiness_satisfied"
  /**
   * Deterministic relative/holiday date-phrase normalization (e.g. "Labor
   * Day weekend" -> concrete checkIn/checkOut) — see src/lib/dates.ts.
   */
  | "date_phrase_normalized"
  /**
   * Active-Recommendation Follow-Up correction (2026-09-05 — see
   * docs/implementation-decisions.md): a factual question about the
   * currently active candidate was answered directly from structured
   * campsite data. Actor "agent" (CampOps' own interpretive work,
   * answering — not a system refusal, and not a TripIntent change, which
   * is exactly the point: this event's mere existence is the proof that
   * turn did NOT mutate intent).
   */
  | "candidate_question_answered";

export type TaskEvent = {
  id: string;
  type: EventType;
  actor: EventActor;
  /** Human-readable, factual description — what the Event Row displays. */
  description: string;
  /** Epoch ms — real wall-clock time the event occurred, not fabricated. */
  timestamp: number;
  relatedIds?: {
    campsiteId?: string;
    candidateId?: string;
    reservationId?: string;
  };
  /** Structured facts backing the description (for debugging/evaluation) — never private model reasoning. */
  metadata?: Record<string, string | number | boolean | null>;
};
