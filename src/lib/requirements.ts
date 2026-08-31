import { UNSATISFIED_PREFIX, UNVERIFIABLE_PREFIX } from "@/lib/evaluate";
import type { TripIntent } from "@/lib/schemas";

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
 * description ("Doesn't satisfy: X" / "Couldn't verify: X"), or returns the
 * input unchanged when it carries no such prefix (a "preserved" label is
 * already raw). Compromises are always derived from hard-requirement checks
 * (evaluate.ts only ever builds them from `hardChecks`), so this only ever
 * needs to resolve against `hardRequirements`.
 */
export function rawRequirementLabel(displayLabel: string): string {
  if (displayLabel.startsWith(UNSATISFIED_PREFIX)) {
    return displayLabel.slice(UNSATISFIED_PREFIX.length);
  }
  if (displayLabel.startsWith(UNVERIFIABLE_PREFIX)) {
    return displayLabel.slice(UNVERIFIABLE_PREFIX.length);
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
export function isRemovableHardRequirement(
  intent: TripIntent,
  displayLabel: string,
): boolean {
  return intent.hardRequirements.includes(rawRequirementLabel(displayLabel));
}
