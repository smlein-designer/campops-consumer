import type { Campsite } from "@/lib/schemas";

/**
 * v3 object model (Build Brief §6-§7). These are new, additive types for
 * the multi-booking Trip flow — they sit alongside the existing v2
 * single-campsite Reservation machinery (src/lib/schemas.ts,
 * src/lib/reservation.ts), which is unchanged and keeps serving the v2 flow.
 */

// ---- Requirements (Handoff Spec 7 "Trip intent") -------------------------

export type RequirementSourceTier = "must" | "nice";

/**
 * A single structured requirement with a source label and a "changed" flag
 * — cleared once the agent re-checks it (Build Brief §7).
 */
export type TripRequirement = {
  id: string;
  label: string;
  tier: RequirementSourceTier;
  source: string;
  changed: boolean;
};

export type V3TripIntent = {
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  adults: number;
  pets: number;
  originZip: string;
  driveLimitHours: number | null;
  budgetUsd: number | null;
  requirements: TripRequirement[];
};

// ---- Provider / Activity (Build Brief §5-§6) -----------------------------

export type ActivityType = "boat" | "horseback" | "guided_hike" | "kayak";

export type Provider = {
  id: string;
  name: string;
  type: ActivityType;
  latitude: number;
  longitude: number;
  photoKey?: string;
};

export type PricingBasis = "per_person" | "per_group" | "per_boat";

export type ActivitySlot = {
  date: string; // ISO date
  startTime: string; // "HH:MM", 24h
  endTime: string; // "HH:MM", 24h
  capacityRemaining: number;
};

/**
 * ACTIVITY — a bookable experience in a time slot (Build Brief §6). Price is
 * total for the slot's pricing basis, not resolved to a per-booking amount
 * here — `src/lib/v3/money.ts` does that against a party size when needed.
 */
export type Activity = {
  id: string;
  providerId: string;
  type: ActivityType;
  name: string;
  slots: ActivitySlot[];
  capacity: number;
  price: number;
  pricingBasis: PricingBasis;
  /** Display copy, e.g. "Full refund up to 24 hours before". */
  refundTerms: string;
  refundCutoffHoursBefore: number;
  requiresWaterAccess: boolean;
  requiresTrailhead: boolean;
  skillLevel: "beginner" | "intermediate" | "advanced";
  photoKey?: string;
};

// ---- Add-on (Build Brief §5) ---------------------------------------------

export type AddOn = {
  id: string;
  campgroundName: string;
  name: string;
  price: number;
  unit: string; // "bundle" | "each" | "bag" | "night"
  refundTerms: string;
};

// ---- Condition (Build Brief §6, §11) -------------------------------------

export type ForecastDay = {
  date: string; // ISO date
  condition: string;
  stormChancePercent: number;
  stormWindow?: { start: string; end: string }; // "HH:MM"
};

export type ConditionType = "forecast";

export type Condition = {
  id: string;
  type: ConditionType;
  description: string;
  windowStartISO: string; // date-time, e.g. "2027-04-17T14:00"
  windowEndISO: string;
  severity: "advisory" | "high";
  affectedBookingIds: string[];
};

// ---- Hold / Permission (Build Brief §6-§7, §10) --------------------------

export type PermissionId =
  | "hold_refundable"
  | "rehold_on_expiry"
  | "replan_on_condition"
  | "suggest_extras"
  | "hold_nonrefundable"
  | "book_and_charge";

export type Permission = {
  id: PermissionId;
  label: string;
  description: string;
  enabled: boolean;
  /** Only meaningful for "hold_refundable" (default $300). */
  limitUsd?: number;
  /** Locked rows (book and charge) can never be turned off. */
  locked: boolean;
};

export type PermissionCheckResult = "allow" | "ask" | "deny";

export type Hold = {
  id: string;
  bookingId: string;
  expiresAt: number; // epoch ms, driven by the shared clock
  refundable: boolean;
  placedUnderPermissionId: PermissionId;
};

// ---- Suggestion (Build Brief §6, §10) ------------------------------------

export type SuggestionState = "offered" | "added" | "dismissed";

export type Suggestion = {
  id: string;
  activityId: string;
  reason: string;
  source: string;
  state: SuggestionState;
};

// ---- Booking (renamed/widened from v2 Reservation) -----------------------

export type BookingKind = "campsite" | "activity" | "addon";

export type BookingStatus =
  | "searching"
  | "found"
  | "held"
  | "hold_expired"
  | "changed_needs_ok"
  | "ready_for_approval"
  | "approved"
  | "released";

export type Booking = {
  id: string;
  kind: BookingKind;
  /** Campsite id / Activity id / AddOn id. */
  refId: string;
  title: string;
  day: string; // display date, e.g. "Apr 16-18" or "Sun"
  time?: string; // slot text, activities only
  price: number;
  refundTerms: string;
  /** Other booking ids this one depends on (e.g. an activity depends on its campsite). */
  dependsOn: string[];
  status: BookingStatus;
  holdId: string | null;
  /** e.g. "Moved from Saturday for weather. You kept Sunday." */
  changeNote?: string;
};

// ---- Candidate (widened — points to a campsite OR an activity) ----------

export type V3CandidateTarget =
  | { kind: "campsite"; campsite: Campsite }
  | { kind: "activity"; activity: Activity };

export type V3Candidate = {
  target: V3CandidateTarget;
  fit: { state: "kept" | "tradeoff" | "missed"; requirement: string; detail: string }[];
  reason: string;
};

// ---- Plan / Agent state (Build Brief §7, §9) -----------------------------

export type PlanStepStatus = "pending" | "active" | "done";

export type TripPlanStep = {
  id: string;
  label: string;
  detail: string;
  status: PlanStepStatus;
};

export type AgentTaskPhase =
  | "interpreting"
  | "searching"
  | "evaluating"
  | "holding"
  | "replanning"
  | "awaiting_user"
  | "preparing_review"
  | "awaiting_authorization"
  | "complete"
  | "stopped";

export type AgentState = {
  working: boolean;
  phase: AgentTaskPhase;
  paused: boolean;
  currentStepText: string;
};

export type NeedsYouItem = {
  id: string;
  eyebrow: string;
  message: string;
  primaryLabel: string;
  secondaryLabel?: string;
};

// ---- Activity record (Build Brief §7, §11) -------------------------------

export type TripEventActor = "You" | "CampOps";

export type TripEvent = {
  id: string;
  timestamp: number; // epoch ms, from the shared clock
  what: string;
  /** The permission behind this action, or null for a user action. */
  permissionId: PermissionId | null;
  actor: TripEventActor;
  details?: { before?: string; after?: string; checked?: string; reason?: string };
};

// ---- Authorization (Build Brief §12) -------------------------------------

export type Authorization = {
  removedBookingIds: string[];
  paymentMethodLabel: string | null;
  approved: boolean;
};

// ---- Trip (the whole plan) ------------------------------------------------

export type Trip = {
  intent: V3TripIntent;
  plan: TripPlanStep[];
  agent: AgentState;
  bookings: Booking[];
  holds: Hold[];
  permissions: Permission[];
  needsYouQueue: NeedsYouItem[];
  suggestions: Suggestion[];
  dismissedSuggestionTypes: string[];
  conditions: Condition[];
  events: TripEvent[];
  authorization: Authorization;
};
