import { UNSATISFIED_PREFIX } from "@/lib/evaluate";
import type { EvaluationResult } from "@/lib/schemas";
import { campsiteTitle } from "@/lib/v3/fit";
import { driveLimitLabel } from "@/lib/v3/search";
import type { TripRequirement, V3TripIntent } from "@/lib/v3/schemas";

/**
 * No-match recovery (v2's src/lib/no-match.ts, for v3's trip model). Both
 * helpers read only what the search already confirmed about the CLOSEST
 * site — never a guess, and never a must-have relaxed without the user.
 */

function closestMisses(evaluation: EvaluationResult): string[] {
  const closest = evaluation.candidates[0];
  if (!closest) return [];
  return closest.compromises.filter((c) => c.startsWith(UNSATISFIED_PREFIX)).map((c) => c.slice(UNSATISFIED_PREFIX.length));
}

export function summarizeNoMatch(evaluation: EvaluationResult): string {
  const closest = evaluation.candidates[0];
  const misses = closestMisses(evaluation);
  if (!closest || misses.length === 0) return "Nothing open meets every must-have.";
  return `Nothing open meets every must-have. The closest, ${campsiteTitle(closest.campsite)}, misses: ${misses.join(", ")}.`;
}

export type WidenSearchResult = {
  requirements: TripRequirement[];
  /** What was loosened, or null if nothing could be. */
  label: string | null;
  /** The new drive limit, when that was what was loosened. */
  driveLimitHours: number | null;
  /** True when the destination was what was dropped. */
  anywhere: boolean;
};

/**
 * Loosens exactly ONE thing the closest site misses: the drive limit by
 * half an hour, a requirement from must-have to nice-to-have, or the
 * destination. Facts about the party (a dog, the dates) are never loosened.
 */
export function widenSearch(intent: V3TripIntent, evaluation: EvaluationResult): WidenSearchResult {
  const misses = closestMisses(evaluation);
  const unchanged = { requirements: intent.requirements, label: null, driveLimitHours: null, anywhere: false };
  if (intent.driveLimitHours != null && misses.includes(driveLimitLabel(intent))) {
    return { ...unchanged, label: driveLimitLabel(intent), driveLimitHours: intent.driveLimitHours + 0.5 };
  }
  const idx = intent.requirements.findIndex((r) => r.tier === "must" && misses.includes(r.label));
  if (idx !== -1) {
    return {
      ...unchanged,
      requirements: intent.requirements.map((r, i) => (i === idx ? { ...r, tier: "nice" as const } : r)),
      label: intent.requirements[idx].label,
    };
  }
  if (intent.destination && misses.some((m) => m.startsWith("In "))) {
    return { ...unchanged, label: intent.destination, anywhere: true };
  }
  return unchanged;
}
