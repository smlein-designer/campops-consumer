import { CAMPSITES } from "@/lib/campsites";
import type {
  Campsite,
  Candidate,
  ConstraintCheck,
  ConstraintStatus,
  EvaluationResult,
  MatchType,
  RequirementTier,
  TripIntent,
} from "@/lib/schemas";

/**
 * Deterministic campsite evaluation (Build Brief §7/§10: campsite data,
 * availability, and ranking are deterministic application logic — never
 * delegated to the model).
 *
 * Constraint integrity rule (captured from 2026-08-30 verification): a hard
 * requirement that cannot be verified must NEVER be treated as satisfied.
 * checkConstraint returns an explicit three-state status — satisfied /
 * unsatisfied / unverifiable — and callers must not collapse "unverifiable"
 * into "satisfied" for any hard requirement.
 *
 * KNOWN SIMPLIFICATION (flagging, not silently deciding): requirement labels
 * arrive as free-text from intent extraction (e.g. "Pet-friendly", "near
 * water"), not a fixed enum. Matching them to campsite fields below uses
 * keyword heuristics, which is a reasonable POC-scale approach but is not
 * the same as a real constraint-satisfaction engine.
 */

function checkConstraint(
  label: string,
  tier: RequirementTier,
  site: Campsite,
  guestCount: number | null,
): ConstraintCheck {
  const l = label.toLowerCase();
  const status = (value: boolean): ConstraintStatus =>
    value ? "satisfied" : "unsatisfied";

  if (l.includes("pet"))
    return { label, tier, status: status(site.petFriendly) };
  if (l.includes("water") || l.includes("creek") || l.includes("lake"))
    return { label, tier, status: status(site.nearWater) };
  if (
    l.includes("capacity") ||
    l.includes("guest") ||
    l.includes("people") ||
    l.includes("person")
  )
    return {
      label,
      tier,
      status: status(guestCount === null || site.capacity >= guestCount),
    };
  if (l.includes("seclu") || l.includes("quiet") || l.includes("private"))
    return { label, tier, status: status(site.seclusion !== "low") };
  if (l.includes("tent"))
    return {
      label,
      tier,
      status: status(site.siteType.toLowerCase().includes("tent")),
    };
  if (l.includes("cabin"))
    return {
      label,
      tier,
      status: status(site.siteType.toLowerCase().includes("cabin")),
    };
  if (l.includes("rv"))
    return {
      label,
      tier,
      status: status(site.siteType.toLowerCase().includes("rv")),
    };

  const amenityMatch = site.amenities.some(
    (a) => a.toLowerCase().includes(l) || l.includes(a.toLowerCase()),
  );
  if (amenityMatch) return { label, tier, status: "satisfied" };

  // Not a recognized concept for this evaluator — explicitly unverifiable,
  // never silently treated as satisfied.
  return { label, tier, status: "unverifiable" };
}

function classifyMatchType(hardChecks: ConstraintCheck[]): MatchType {
  if (hardChecks.some((c) => c.status === "unsatisfied")) return "no_match";
  if (hardChecks.some((c) => c.status === "unverifiable")) return "compromise";
  return "full";
}

function buildExplanation(
  matchType: MatchType,
  preserved: string[],
  compromises: string[],
  site: Campsite,
): string {
  const fact = `at $${site.pricePerNight}/night and ${site.distanceMiles} mi away`;
  if (matchType === "full") {
    const reqs =
      preserved.length > 0 ? ` — it satisfies ${preserved.join(", ")}` : "";
    return `This is the strongest match${reqs}, ${fact}.`;
  }
  if (matchType === "compromise") {
    const reqs =
      preserved.length > 0 ? ` It satisfies ${preserved.join(", ")}.` : "";
    return `This is the closest option — ${compromises.join("; ")}.${reqs} ${fact}.`;
  }
  return `This doesn't fully match — ${compromises.join("; ")}. ${fact}.`;
}

const RANK_ORDER: Record<MatchType, number> = {
  full: 0,
  compromise: 1,
  no_match: 2,
};

/**
 * Evaluates every available campsite against a TripIntent and returns the
 * best achievable match type plus its ranked candidates. When no site fully
 * satisfies every hard requirement, this returns "compromise" (if the best
 * available sites only have unverifiable hard requirements) or "no_match"
 * (if every site has at least one confirmed-unsatisfied hard requirement) —
 * it never silently substitutes a lesser match for a full one.
 *
 * `excludeIds` removes specific sites from consideration entirely (e.g. a
 * site a deterministic availability check has just marked unavailable) —
 * they are filtered out before any scoring or classification happens, so an
 * excluded site can never re-enter the candidate set, not even as a
 * lower-ranked alternative.
 */
export function evaluateCampsites(
  intent: TripIntent,
  excludeIds: ReadonlySet<string> = new Set(),
): EvaluationResult {
  const evaluated = CAMPSITES.filter(
    (site) => site.available && !excludeIds.has(site.id),
  ).map((site) => {
    // guestCount is a structured field, not free text — it must be enforced
    // as a hard capacity check on its own, independent of whether the model
    // also happened to echo it into hardRequirements as text. (Found via
    // live verification: the model correctly does NOT duplicate guestCount
    // into hardRequirements text, which meant capacity was silently never
    // checked at all unless a user's wording happened to match the
    // capacity/guest keyword heuristic in checkConstraint.)
    const capacityCheck: ConstraintCheck[] =
      intent.guestCount !== null
        ? [
            {
              label: `Capacity for ${intent.guestCount}`,
              tier: "hard",
              status:
                site.capacity >= intent.guestCount
                  ? "satisfied"
                  : "unsatisfied",
            },
          ]
        : [];
    const hardChecks = [
      ...capacityCheck,
      ...intent.hardRequirements.map((r) =>
        checkConstraint(r, "hard", site, intent.guestCount),
      ),
    ];
    const softChecks = [
      ...intent.flexibleConstraints.map((r) =>
        checkConstraint(r, "flexible", site, intent.guestCount),
      ),
      ...intent.preferences.map((r) =>
        checkConstraint(r, "preference", site, intent.guestCount),
      ),
      ...intent.priorities.map((r) =>
        checkConstraint(r, "priority", site, intent.guestCount),
      ),
    ];
    const checks = [...hardChecks, ...softChecks];

    const matchType = classifyMatchType(hardChecks);
    const matchedSoft = softChecks.filter((c) => c.status === "satisfied");

    const preserved = hardChecks
      .filter((c) => c.status === "satisfied")
      .map((c) => c.label);
    const compromises = [
      ...hardChecks
        .filter((c) => c.status === "unverifiable")
        .map((c) => `Couldn't verify: ${c.label}`),
      ...hardChecks
        .filter((c) => c.status === "unsatisfied")
        .map((c) => `Doesn't satisfy: ${c.label}`),
    ];

    const score =
      matchedSoft.length * 10 -
      site.pricePerNight / 50 -
      site.distanceMiles / 20;

    return {
      campsite: site,
      matchType,
      checks,
      preserved,
      compromises,
      score,
    };
  });

  if (evaluated.length === 0) {
    return { kind: "no_match", candidates: [] };
  }

  const bestType = evaluated.reduce<MatchType>(
    (best, e) =>
      RANK_ORDER[e.matchType] < RANK_ORDER[best] ? e.matchType : best,
    "no_match",
  );

  // Only candidates that achieve the best available match type are shown —
  // a "compromise" site is never mixed into a list alongside "full" matches
  // (and vice versa), so the top result always reflects the best type
  // actually achievable, never a silently-downgraded pick.
  const pool = evaluated.filter((e) => e.matchType === bestType);

  const sorted = pool.sort((a, b) => b.score - a.score);

  const candidates: Candidate[] = sorted.map((e, index) => ({
    campsite: e.campsite,
    rank: index + 1,
    score: e.score,
    matchType: e.matchType,
    checks: e.checks,
    preserved: dedupe(e.preserved),
    compromises: dedupe(e.compromises),
    explanation: buildExplanation(
      e.matchType,
      e.preserved,
      e.compromises,
      e.campsite,
    ),
  }));

  return { kind: bestType, candidates };
}

function dedupe(labels: string[]): string[] {
  return Array.from(new Set(labels));
}
