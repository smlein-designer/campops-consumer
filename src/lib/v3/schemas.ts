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

/**
 * What the user asked for. Empty string / 0 / null mean "not said yet" —
 * nothing here is ever filled in with a guess.
 */
export type V3TripIntent = {
  /** As stated, e.g. "Apr 16". */
  checkIn: string;
  checkOut: string;
  /** A loose timeframe when exact dates aren't known yet, e.g. "April". */
  dateHint: string;
  adults: number;
  children: number;
  pets: number;
  /** Where they want to camp, e.g. "Hill Country". */
  destination: string;
  /** Where they start from: a ZIP or a city name, e.g. "Austin". */
  origin: string;
  driveLimitHours: number | null;
  /** Spending limit across every booking in the trip. */
  budgetTotalUsd: number | null;
  /** Campsite nightly-rate limit. */
  budgetPerNightUsd: number | null;
  requirements: TripRequirement[];
};

// ---- Provider / Activity (Build Brief §5-§6) -----------------------------

export type ActivityType = "boat" | "horseback" | "guided_hike" | "kayak";

export type Provider = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type PricingBasis = "per_person" | "per_group" | "per_boat";

export type ActivitySlot = {
  date: string; // ISO date
  startTime: string; // "HH:MM", 24h
  endTime: string; // "HH:MM", 24h
};

/** Who from the trip is going on one activity. */
export type ActivityParty = { adults: number; children: number };

/** A time of day an activity runs. `days` limits it to the arrival or last
 * day of a trip (an evening cruise on arrival, a short slot after checkout). */
export type ActivityWindow = { startTime: string; endTime: string; days?: "arrival" | "last" };

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
  /** Short category shown on cards, e.g. "Pontoon". */
  category: string;
  /** Times it runs each day, in preference order. Real slots come from
   * `activitySlots` against the trip's own dates. */
  windows: ActivityWindow[];
  /** Which day of the trip to try first. */
  preferredDay: "first_full" | "last";
  capacity: number;
  price: number;
  pricingBasis: PricingBasis;
  /** Display copy, e.g. "Full refund up to 24 hours before". */
  refundTerms: string;
  refundCutoffHoursBefore: number;
  requiresWaterAccess: boolean;
  skillLevel: "beginner" | "intermediate" | "advanced";
  photoKey?: string;
};

// ---- Add-on (Build Brief §5) ---------------------------------------------

export type AddOn = {
  id: string;
  name: string;
  price: number;
  unit: string; // "bundle" | "each" | "bag" | "night"
  refundTerms: string;
  /** Only sold at campgrounds on the water. */
  requiresWaterAccess?: boolean;
  /** The activity it stands in for (a campground kayak rental is kayaking),
   * so the two are never both offered or booked. */
  coversActivity?: ActivityType;
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

/** What the suggestion is for — an Activity or a campground AddOn (PRD v3
 * §9/§10: "optional extras" cover both, not activities only). */
export type SuggestionTarget = { kind: "activity"; id: string } | { kind: "addon"; id: string };

export type Suggestion = {
  id: string;
  target: SuggestionTarget;
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
  /** Card overline, e.g. "Campsite · 2 nights" or "Pontoon". */
  category: string;
  /** The business behind it, activities only. */
  provider?: string;
  /** Card meta line, e.g. "Up to 8 people". */
  meta: string;
  photoKey?: string;
  day: string; // ISO date (a campsite's check-in day)
  time?: string; // "HH:MM-HH:MM", activities only
  /** Who's going, activities only — the user's own pick, not the whole trip. */
  party?: ActivityParty;
  /** Where it was before a proposed move — kept until the user decides. */
  movedFrom?: { day: string; time: string };
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

/** `kind`/`payload` let the UI route a button click to the right resolver
 * (src/lib/v3/scripted-events.ts) without string-matching the copy. */
export type NeedsYouKind =
  | "forecast_move"
  | "hold_expired"
  | "campsite_unavailable"
  | "no_match"
  | "hold_ask"
  /** An activity the user picks a time and party for before it is held. */
  | "activity_choice"
  /** The top campsites, for the user to pick one before anything is held. */
  | "campsite_choice";

export type NeedsYouItem = {
  id: string;
  eyebrow: string;
  message: string;
  primaryLabel: string;
  secondaryLabel?: string;
  kind?: NeedsYouKind;
  payload?: Record<string, string>;
};

// ---- Conversation thread --------------------------------------------------

export type ThreadMessage = { id: string; from: "user" | "agent"; message: string };

/** An inline multiple-choice question in the thread (the ClarifyingQuestion
 * component) — the model's own needs_clarification question, shown with
 * quick replies when it supplied any (ported from v2's quickReplies pattern). */
export type ClarifyingOption = {
  label: string;
  checkIn?: string;
  checkOut?: string;
  /** Tapping it makes this must-have optional, to see more sites. */
  relaxRequirementId?: string;
  /** Tapping it drops the drive-time limit, to see more sites. */
  dropDriveLimit?: boolean;
  /** Tapping it offers this nearby activity's times. */
  activityId?: string;
};

export type PendingClarifyingQuestion = {
  id: string;
  question: string;
  options: ClarifyingOption[];
  /** The option CampOps is working with while it waits. */
  selected?: string;
  /** What it is assuming meanwhile, e.g. "I'm searching Apr 16 to 18 for now." */
  assumption?: string;
};

/** One side of a campsite comparison (CampsiteOption component) — the
 * kept/tradeoff/missed fit breakdown PRD v3 §5.4 requires for any
 * recommendation ("which requirements are kept, which are traded off...
 * must name any must-have that is missed"). */
export type CampsiteFitCard = {
  campsiteId: string;
  photoKey?: string;
  eyebrow: string;
  title: string;
  facts: string[];
  badge?: string;
  fit: { state: "kept" | "tradeoff" | "missed"; requirement: string; detail: string }[];
  reason: string;
  /** Strikes through the title — the site that's no longer available. */
  unavailable?: boolean;
};

/** A campsite comparison shown in the thread: the site that's gone (if any)
 * next to the recommended replacement, or just the closest option when
 * nothing has ever been held (no-match). Cleared once resolved. */
export type CampsiteComparison = {
  id: string;
  lost?: CampsiteFitCard;
  recommended: CampsiteFitCard;
  /** The next-best sites shown beside it, when the user is choosing. */
  options?: CampsiteFitCard[];
};

// ---- Deterministic gates (ported from v2's prerequisite/readiness gates) --

/** What CampOps still needs before it can hold anything — an objective fact
 * about the trip, never the model's call (v2's prerequisite gates). */
export type HoldBlocker = "more_detail" | "destination" | "dates" | "party_size" | "origin";

/** The one question currently open in the chat. */
export type PendingAsk = {
  kind: HoldBlocker;
  /** Consecutive replies that looked like dates but didn't resolve (v2's
   * loop protection). */
  dateAskAttempts: number;
};

// ---- Activity record (Build Brief §7, §11) -------------------------------

export type TripEventActor = "You" | "CampOps";

/** Coarse category for the Activity log's filter chips (All / Your decisions
 * / Holds / Changes / Searches). */
export type TripEventKind = "search" | "hold" | "change" | "decision";

export type TripEvent = {
  id: string;
  timestamp: number; // epoch ms, from the shared clock
  what: string;
  /** The permission behind this action, or null for a user action. */
  permissionId: PermissionId | null;
  actor: TripEventActor;
  kind?: TripEventKind;
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
  thread: ThreadMessage[];
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
  /** The question currently open in the chat, or null. */
  pendingAsk: PendingAsk | null;
  /** That question as a card with tappable answers, when it has any. */
  clarifyingQuestion: PendingClarifyingQuestion | null;
  /** Campsites an outside change took away — never searched again this trip. */
  unavailableCampsiteIds: string[];
  /** The trip started as a browsing question ("what are some quiet
   * campgrounds?") rather than a request for a stay — v2's exploratory mode,
   * where a site can be shown before there are dates. */
  browsing: boolean;
  /** Chips the user just changed, shown as "updated" until CampOps has
   * re-checked the plan against them (fact keys or requirement ids). */
  changedChips: string[];
  /** Which ranked candidate from the last campsite search is active — lets
   * the user cycle through alternatives (ported from v2's candidateIndex). */
  candidateIndex: number;
  /** The current campsite comparison card(s), or null. */
  campsiteComparison: CampsiteComparison | null;
};
