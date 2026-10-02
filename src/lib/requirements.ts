import {
  UNMET_PREFERENCE_PREFIX,
  UNSATISFIED_PREFIX,
  UNVERIFIABLE_PREFIX,
  capacityRequirementLabel,
} from "@/lib/evaluate";
import type { RequirementTier, TripIntent } from "@/lib/schemas";

/**
 * Direct-manipulation Requirement Chip removal (Handoff Spec 2.4's
 * removable-chip affordance). Pure and deterministic: touches only the one
 * targeted tier array/value, leaving every other TripIntent field —
 * including the other three requirement tiers — byte-identical. Distinct
 * from `widenSearch` (src/lib/no-match.ts), which MOVES a failing hard
 * requirement into flexible constraints; this REMOVES a requirement
 * outright, from whichever tier the user directly removed it from.
 */
export type RemoveRequirementResult = {
  intent: TripIntent;
  /** false if the value wasn't present in that tier — a no-op, not an error. */
  changed: boolean;
};

export function removeRequirement(
  intent: TripIntent,
  key: keyof TripIntent,
  value: string,
): RemoveRequirementResult {
  const current = intent[key];
  if (!Array.isArray(current) || !current.includes(value)) {
    return { intent, changed: false };
  }
  return {
    intent: {
      ...intent,
      [key]: current.filter((v) => v !== value),
    },
    changed: true,
  };
}

/**
 * Recovers the raw requirement label from a Candidate Card "compromise"
 * description ("Doesn't satisfy: X" / "Couldn't verify: X" / "Didn't fully
 * match: X"), or returns the input unchanged when it carries no such prefix
 * (a "preserved" label is already raw). Card chips come from checks in ALL
 * four requirement tiers (satisfied soft checks are shown as preserved since
 * 2026-09-05), so resolve the result with `requirementKeyFor`.
 */
export function rawRequirementLabel(displayLabel: string): string {
  if (displayLabel.startsWith(UNSATISFIED_PREFIX)) {
    return displayLabel.slice(UNSATISFIED_PREFIX.length);
  }
  if (displayLabel.startsWith(UNVERIFIABLE_PREFIX)) {
    return displayLabel.slice(UNVERIFIABLE_PREFIX.length);
  }
  if (displayLabel.startsWith(UNMET_PREFERENCE_PREFIX)) {
    return displayLabel.slice(UNMET_PREFERENCE_PREFIX.length);
  }
  return displayLabel;
}

/**
 * Whether a Candidate Card "preserved"/"compromise" label corresponds to a
 * literal, removable entry in the trip's actual `hardRequirements` — as
 * opposed to a structurally-derived synthetic check (e.g. "Capacity for 4",
 * which comes from the `guestCount` field, not from `hardRequirements` text,
 * and so has no chip-removal path of its own; see
 * docs/implementation-decisions.md's 2026-09-01 design-resolution entry).
 * This is the single gate both the Trip Panel's plain chips and the
 * Candidate Card's preserved/compromise chips use to decide whether a given
 * chip gets a working remove control — same rule, same underlying array,
 * regardless of which screen is asking.
 */
export type RequirementKey = "hardRequirements" | "flexibleConstraints" | "preferences" | "priorities";
const REQUIREMENT_KEYS: RequirementKey[] = ["hardRequirements", "flexibleConstraints", "preferences", "priorities"];

/**
 * Which of the trip's four literal requirement tiers holds this raw label —
 * the single gate for whether a Candidate Card chip is removable, from any
 * tier, through the same `removeRequirement` path the Trip Panel uses. null
 * for structurally-derived checks ("Capacity for 4", the destination, the
 * date range, pet eligibility): those aren't requirement entries; party
 * size and dates are prerequisites of the search/reservation, changed
 * through the conversation.
 */
export function requirementKeyFor(intent: TripIntent, rawLabel: string): RequirementKey | null {
  return REQUIREMENT_KEYS.find((key) => intent[key].includes(rawLabel)) ?? null;
}

export function isRemovableHardRequirement(
  intent: TripIntent,
  displayLabel: string,
): boolean {
  return intent.hardRequirements.includes(rawRequirementLabel(displayLabel));
}

/**
 * Trip Requirement Projection (2026-09-10 — see
 * docs/implementation-decisions.md). The Trip Requirements panel's four
 * literal tier arrays (`hardRequirements`/`flexibleConstraints`/
 * `preferences`/`priorities`) were never the FULL story: `guestCount` and
 * `travelingWithPets`/`petCount` are real, evaluator-enforced hard
 * constraints (see `capacityCheck`/`petCheck` in evaluate.ts) that the model
 * deliberately does NOT also echo into `hardRequirements` text — so the
 * panel silently omitted them even though the evaluator, the No Match copy,
 * and the Candidate Card all already knew about them. This closes that gap
 * by projecting the same structured fields the evaluator itself reads,
 * rather than inventing a second source of truth.
 *
 * These derived entries are deliberately NON-REMOVABLE (`onRemove` simply
 * isn't wired for them by the caller) — the same rule already established
 * for the Candidate Card's synthetic "Capacity for N" chip (see
 * `isRemovableHardRequirement`'s doc comment): there is no literal array
 * entry to remove, and routing "remove" through a real guestCount/petCount
 * edit is out of scope for a chip-removal affordance. Removing capacity or
 * pet count is a real trip change, made through the composer like any
 * other, not a chip.
 */
export type DerivedRequirement = { label: string; tier: RequirementTier; source: ChipSource };

/**
 * Panel-only pet label (2026-09-10): the evaluator's own synthetic pet
 * check keeps its existing generic "Pet-friendly" label unchanged (No Match
 * copy, Candidate Card preserved/compromise chips, and every existing
 * regression test already key off that exact string) — this is a SEPARATE,
 * richer label used only for the Trip Requirements panel, where a known
 * pet count carries real information ("two dogs" is not the same claim as
 * a bare "pet-friendly would be nice"). Deliberately says "pet(s)", not
 * "dog(s)" — the schema has no species field, so naming a species here
 * would be inventing information the structured intent never actually
 * captured.
 */
export function petPanelLabel(petCount: number | null): string {
  if (petCount != null && petCount > 0) {
    return `Pet-friendly for ${petCount} pet${petCount === 1 ? "" : "s"}`;
  }
  return "Pet-friendly";
}

/**
 * The structural (non-free-text) requirements the Trip Requirements panel
 * must project alongside the four literal tier arrays. Currently just the
 * two the evaluator already enforces as hard constraints outside of
 * `hardRequirements` text — capacity and pet eligibility/count. (Dates and
 * destination are deliberately NOT projected here: dates are represented
 * elsewhere in the existing product design (item 8 of the 2026-09-10
 * correction), and destinationRegion wasn't part of the gap this slice
 * closes — scoped intentionally, not an oversight.)
 */
export function getDerivedRequirements(intent: TripIntent): DerivedRequirement[] {
  const derived: DerivedRequirement[] = [];
  if (intent.guestCount !== null) {
    derived.push({ label: capacityRequirementLabel(intent.guestCount), tier: "hard", source: { kind: "party_size" } });
  }
  if (intent.travelingWithPets) {
    derived.push({ label: petPanelLabel(intent.petCount), tier: "hard", source: { kind: "pets" } });
  }
  return derived;
}

/**
 * The trip fact a removable chip stands for (requirement-removal model,
 * 2026-10-01): X means "CampOps, don't assume this anymore" — it clears the
 * SEMANTIC SOURCE behind the chip, never just its display words. A literal
 * requirement entry is removed from its own tier; a derived chip clears the
 * structured field it was computed from ("Capacity for 10" → party size,
 * "In San Antonio" → destination, "Available for your dates" → dates).
 * Whether the search can still run afterwards is decided by the existing
 * prerequisite checks, not here.
 */
export type ChipSource =
  | { kind: "requirement"; key: RequirementKey; value: string }
  | { kind: "destination" }
  | { kind: "dates" }
  | { kind: "party_size" }
  | { kind: "pets" }
  | { kind: "budget"; field: "maxPerNight" | "maxTotal" };

export function resolveChipSource(intent: TripIntent, displayLabel: string): ChipSource | null {
  const raw = rawRequirementLabel(displayLabel);
  const key = requirementKeyFor(intent, raw);
  if (key) return { kind: "requirement", key, value: raw };
  if (intent.destinationRegion && raw === `In ${intent.destinationRegion}`) return { kind: "destination" };
  if (raw === "Available for your dates" && (intent.checkIn || intent.checkOut)) return { kind: "dates" };
  if (intent.guestCount !== null && raw === capacityRequirementLabel(intent.guestCount)) return { kind: "party_size" };
  if (intent.travelingWithPets && (raw === "Pet-friendly" || raw === petPanelLabel(intent.petCount))) return { kind: "pets" };
  if (intent.budget?.maxPerNight != null && raw === `Nightly rate under $${intent.budget.maxPerNight}`) {
    return { kind: "budget", field: "maxPerNight" };
  }
  if (intent.budget?.maxTotal != null && raw === `Total stay under $${intent.budget.maxTotal}`) {
    return { kind: "budget", field: "maxTotal" };
  }
  return null;
}

/** Clears only the chip's own source; every other trip fact is untouched. */
export function clearChipSource(intent: TripIntent, source: ChipSource): TripIntent {
  switch (source.kind) {
    case "requirement":
      return removeRequirement(intent, source.key, source.value).intent;
    case "destination":
      return { ...intent, destinationRegion: null };
    case "dates":
      return { ...intent, checkIn: null, checkOut: null };
    case "party_size":
      return { ...intent, guestCount: null };
    case "pets":
      return { ...intent, travelingWithPets: false, petCount: null };
    case "budget": {
      const budget = intent.budget ? { ...intent.budget, [source.field]: null } : null;
      return { ...intent, budget: budget && (budget.maxPerNight != null || budget.maxTotal != null) ? budget : null };
    }
  }
}
