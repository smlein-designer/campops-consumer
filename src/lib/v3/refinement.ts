import { buildRefinementAcknowledgment as v2BuildRefinementAcknowledgment } from "@/lib/refinement-acknowledgment";
import type { TripRequirement } from "@/lib/v3/schemas";

/**
 * Refinement acknowledgment, ported from v2 (src/lib/refinement-acknowledgment.ts).
 * `buildRefinementAcknowledgment` is reused as-is — it only reads the v2
 * EvaluationResult v3 already produces via evaluateCampsites, plus plain
 * strings. `diffAddedRequirements` is reimplemented for v3's flat
 * requirement list instead of v2's four separate tier arrays.
 */
export const buildRefinementAcknowledgment = v2BuildRefinementAcknowledgment;

/** Requirement labels newly present in `after` that weren't in `before` — a
 * pure structural diff, never a guess at what the user "meant." */
export function diffAddedRequirements(before: TripRequirement[], after: TripRequirement[]): string[] {
  const beforeLabels = new Set(before.map((r) => r.label));
  return after.filter((r) => !beforeLabels.has(r.label)).map((r) => r.label);
}
