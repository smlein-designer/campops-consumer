import { CAMPSITES } from "@/lib/campsites";
import type { Campsite, Candidate, TripIntent } from "@/lib/schemas";

/**
 * Deterministic campsite evaluation (Build Brief §7/§10: campsite data,
 * availability, and ranking are deterministic application logic — never
 * delegated to the model).
 *
 * KNOWN SIMPLIFICATION (flagging, not silently deciding): requirement labels
 * arrive as free-text from intent extraction (e.g. "Pet-friendly", "near
 * water"), not a fixed enum. Matching them to campsite fields below uses
 * keyword heuristics, which is a reasonable POC-scale approach but is not
 * the same as a real constraint-satisfaction engine. An unrecognized
 * requirement label is currently treated as "unverifiable, not blocking" —
 * i.e. it does not fail the site out of the hard-requirement filter. This
 * is a real product-behavior gap relative to the PRD's "make the compromise
 * visible rather than silently relaxing constraints" principle, and should
 * be revisited before this evaluator is trusted for the no-match / compromise
 * scenarios (out of scope for this slice).
 */

type RequirementCheck = {
  label: string;
  matched: boolean | null; // null = could not be evaluated (unrecognized label)
};

function checkRequirement(
  label: string,
  site: Campsite,
  guestCount: number | null,
): RequirementCheck {
  const l = label.toLowerCase();

  if (l.includes("pet")) return { label, matched: site.petFriendly };
  if (l.includes("water") || l.includes("creek") || l.includes("lake"))
    return { label, matched: site.nearWater };
  if (
    l.includes("capacity") ||
    l.includes("guest") ||
    l.includes("people") ||
    l.includes("person")
  )
    return {
      label,
      matched: guestCount === null || site.capacity >= guestCount,
    };
  if (l.includes("seclu") || l.includes("quiet") || l.includes("private"))
    return { label, matched: site.seclusion !== "low" };
  if (l.includes("tent"))
    return { label, matched: site.siteType.toLowerCase().includes("tent") };
  if (l.includes("cabin"))
    return { label, matched: site.siteType.toLowerCase().includes("cabin") };
  if (l.includes("rv"))
    return { label, matched: site.siteType.toLowerCase().includes("rv") };

  const amenityMatch = site.amenities.some(
    (a) => a.toLowerCase().includes(l) || l.includes(a.toLowerCase()),
  );
  if (amenityMatch) return { label, matched: true };

  return { label, matched: null };
}

/**
 * Ranks available campsites against a TripIntent and returns them best-first.
 * Sites failing an explicitly-checkable hard requirement are excluded
 * entirely; sites are otherwise scored by how many preferences/priorities
 * they satisfy, with price and distance as a secondary tiebreak.
 */
export function evaluateCampsites(intent: TripIntent): Candidate[] {
  const candidates = CAMPSITES.filter((site) => site.available)
    .map((site) => {
      const hardChecks = intent.hardRequirements.map((r) =>
        checkRequirement(r, site, intent.guestCount),
      );
      const failedHard = hardChecks.some((c) => c.matched === false);
      if (failedHard) return null;

      const preferenceChecks = [
        ...intent.flexibleConstraints,
        ...intent.preferences,
        ...intent.priorities,
      ].map((r) => checkRequirement(r, site, intent.guestCount));
      const matchedSoft = preferenceChecks.filter((c) => c.matched === true);

      const score =
        matchedSoft.length * 10 -
        site.pricePerNight / 50 -
        site.distanceMiles / 20;

      const preserved = [
        ...hardChecks.filter((c) => c.matched !== false).map((c) => c.label),
        ...matchedSoft.map((c) => c.label),
      ];

      return { site, score, preserved };
    })
    .filter(
      (c): c is { site: Campsite; score: number; preserved: string[] } =>
        c !== null,
    )
    .sort((a, b) => b.score - a.score);

  return candidates.map(({ site, score, preserved }, index) => ({
    campsite: site,
    rank: index + 1,
    score,
    preserved: dedupe(preserved),
    compromise: undefined,
    explanation: buildExplanation(site, preserved, index === 0),
  }));
}

function buildExplanation(
  site: Campsite,
  preserved: string[],
  isTopPick: boolean,
): string {
  const lead = isTopPick
    ? "This is the strongest match"
    : "This is a plausible alternative";
  const reqs =
    preserved.length > 0 ? ` — it satisfies ${preserved.join(", ")}` : "";
  return `${lead}${reqs}, at $${site.pricePerNight}/night and ${site.distanceMiles} mi away.`;
}

function dedupe(labels: string[]): string[] {
  return Array.from(new Set(labels));
}
