/**
 * Controlled family-suitability vocabulary (Dataset Depth correction,
 * 2026-09-04 — see docs/implementation-decisions.md). Replaces the opaque
 * `familyFriendly: boolean` — a recommendation must be explainable from
 * actual features ("easy trails, nearby restrooms, a nature center"), not
 * from a hidden flag the model or the UI would otherwise have to invent a
 * reason for.
 */

export const FAMILY_FEATURE_CODES = [
  "easy_trails",
  "restrooms_nearby",
  "nature_center",
  "swimming_area",
  "playground",
] as const;

export type FamilyFeature = (typeof FAMILY_FEATURE_CODES)[number];

export const FAMILY_FEATURE_LABELS: Record<FamilyFeature, string> = {
  easy_trails: "easy trails",
  restrooms_nearby: "nearby restrooms",
  nature_center: "a nature center",
  swimming_area: "a swimming area",
  playground: "a playground",
};

/**
 * Grounded, deterministic explanation clause built ONLY from a site's real
 * `familyFeatures` — never invented. Returns null when the site has no
 * family features at all (nothing honest to say).
 */
export function describeFamilyFeatures(features: readonly FamilyFeature[]): string | null {
  if (features.length === 0) return null;
  const labels = features.map((f) => FAMILY_FEATURE_LABELS[f]);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
