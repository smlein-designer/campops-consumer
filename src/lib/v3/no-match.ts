import { UNSATISFIED_PREFIX } from "@/lib/evaluate";
import { summarizeNoMatch as v2SummarizeNoMatch } from "@/lib/no-match";
import type { EvaluationResult } from "@/lib/schemas";
import type { TripRequirement, V3TripIntent } from "@/lib/v3/schemas";

/**
 * No-match recovery, ported from v2 (src/lib/no-match.ts). `summarizeNoMatch`
 * is reused as-is — it only reads the v2 EvaluationResult v3 already
 * produces via evaluateCampsites. `widenSearch` is reimplemented for v3's
 * flat must/nice requirement model (v2 moves a label between two separate
 * tier arrays; v3 demotes a single TripRequirement's tier).
 */
export const summarizeNoMatch = v2SummarizeNoMatch;

export type WidenSearchResult = {
  requirements: TripRequirement[];
  /** The requirement label that was widened, or null if nothing was widenable. */
  widened: string | null;
};

/**
 * Moves exactly ONE confirmed-failing must-have requirement to nice-to-have
 * — the requirement actually blocking a match, never a generic/unrelated
 * one, and never more than one at a time.
 */
export function widenSearch(intent: V3TripIntent, evaluation: EvaluationResult): WidenSearchResult {
  const failing = new Set(failingHardLabels(evaluation));
  const idx = intent.requirements.findIndex(
    (r) => r.tier === "must" && failing.has(r.label),
  );
  if (idx === -1) return { requirements: intent.requirements, widened: null };
  const widened = intent.requirements[idx];
  return {
    requirements: intent.requirements.map((r, i) => (i === idx ? { ...r, tier: "nice" as const } : r)),
    widened: widened.label,
  };
}

function failingHardLabels(evaluation: EvaluationResult): string[] {
  const labels = new Set<string>();
  for (const candidate of evaluation.candidates) {
    for (const compromise of candidate.compromises) {
      if (compromise.startsWith(UNSATISFIED_PREFIX)) {
        labels.add(compromise.slice(UNSATISFIED_PREFIX.length));
      }
    }
  }
  return Array.from(labels);
}
