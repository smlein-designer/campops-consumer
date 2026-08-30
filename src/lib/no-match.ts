import type { EvaluationResult, TripIntent } from "@/lib/schemas";

/**
 * No Match support (Handoff Spec 4.1 "No Match" / Figma node 50:259).
 * No Match is distinct from Clarification: CampOps successfully evaluated
 * the request here — no candidate satisfies it. Both helpers below are
 * pure, deterministic, and operate only on facts evaluateCampsites already
 * produced; neither invents a value.
 */

const FAILED_PREFIX = "Doesn't satisfy: ";

/** Distinct hard-requirement labels confirmed failing across every close candidate. */
function failingHardLabels(evaluation: EvaluationResult): string[] {
  const labels = new Set<string>();
  for (const candidate of evaluation.candidates) {
    for (const compromise of candidate.compromises) {
      if (compromise.startsWith(FAILED_PREFIX)) {
        labels.add(compromise.slice(FAILED_PREFIX.length));
      }
    }
  }
  return Array.from(labels);
}

/**
 * Deterministic Attention Card body for a "no_match" evaluation — built
 * only from the confirmed-failing requirement labels evaluateCampsites
 * already computed, never phrased freely by a model.
 */
export function summarizeNoMatch(evaluation: EvaluationResult): string {
  const failing = failingHardLabels(evaluation);
  if (failing.length === 0) {
    return "No site currently satisfies every requirement you've given me.";
  }
  return `No site currently satisfies ${failing.join(", ")}. I can widen a requirement or you can tell me what to change.`;
}

export type WidenSearchResult = {
  intent: TripIntent;
  /** The requirement label that was moved, or null if nothing was widenable. */
  widened: string | null;
};

/**
 * Widen Search (Figma's "Widen search to 100 mi" pattern, generalized):
 * moves exactly ONE confirmed-failing hard requirement into flexible
 * constraints — the requirement that's actually blocking a match, never a
 * generic/unrelated one, and never more than one at a time. Requirements
 * derived only from a structured field (e.g. the synthetic capacity check)
 * aren't present as literal `hardRequirements` text and can't be widened
 * this way; if none of the failing labels match an actual entry, this
 * returns the intent unchanged (nothing to widen) rather than guessing.
 */
export function widenSearch(
  intent: TripIntent,
  evaluation: EvaluationResult,
): WidenSearchResult {
  const failing = failingHardLabels(evaluation);
  const idx = intent.hardRequirements.findIndex((r) =>
    failing.some((f) => f.toLowerCase() === r.toLowerCase()),
  );
  if (idx === -1) return { intent, widened: null };

  const widened = intent.hardRequirements[idx];
  return {
    intent: {
      ...intent,
      hardRequirements: intent.hardRequirements.filter((_, i) => i !== idx),
      flexibleConstraints: [...intent.flexibleConstraints, widened],
    },
    widened,
  };
}
