import type { EvaluationResult, TripIntent } from "@/lib/schemas";

/**
 * Active-Recommendation Follow-Up correction (2026-09-05 — see
 * docs/implementation-decisions.md). Extracted from page.tsx so this pure
 * logic is independently testable: which requirement/preference/priority
 * labels are newly present in `after` that weren't in `before` — used to
 * build an honest refinement acknowledgment ("I added near-water...")
 * instead of silently re-running the generic first-recommendation copy.
 * A pure structural diff, never a guess at what the user "meant".
 */
export function diffAddedRequirements(before: TripIntent, after: TripIntent): string[] {
  const added: string[] = [];
  const tiers = [
    "hardRequirements",
    "flexibleConstraints",
    "preferences",
    "priorities",
  ] as const;
  for (const key of tiers) {
    for (const label of after[key]) {
      if (!before[key].includes(label)) added.push(label);
    }
  }
  if (after.travelingWithPets && !before.travelingWithPets) added.push("Pet-friendly");
  return added;
}

/**
 * Refinement acknowledgment: used instead of the generic first-time
 * recommendation summary whenever a recommendation ALREADY existed before
 * this turn — never the "Based on what you've told me..." boilerplate for
 * a turn that's refining an existing pick. Distinguishes "the same
 * candidate still wins" from "a different candidate is now the stronger
 * fit", and names what was actually added when there's something concrete
 * to name. `fallback` is the ordinary first-time summary text, used only
 * when there's no top candidate to acknowledge against (e.g. compromise
 * with an empty pool, which shouldn't normally happen but is handled
 * rather than assumed away).
 */
export function buildRefinementAcknowledgment(
  addedLabels: string[],
  previousCandidateId: string | null,
  result: EvaluationResult,
  fallback: string,
): string {
  const top = result.candidates[0];
  if (!top) return fallback;
  const addedText =
    addedLabels.length > 0
      ? `I added ${addedLabels.join(", ")}.`
      : "I've updated your requirements.";
  const siteLabel = `${top.campsite.siteName} at ${top.campsite.campgroundName}`;
  if (previousCandidateId && previousCandidateId === top.campsite.id) {
    const satisfiesAdded = addedLabels.some((l) => top.preserved.includes(l));
    return `Got it — ${addedText} ${siteLabel} still comes out on top${satisfiesAdded ? " — it already satisfies that" : ""}.`;
  }
  return `Got it — ${addedText} ${siteLabel} is now the stronger fit.`;
}
