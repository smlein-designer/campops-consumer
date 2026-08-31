/**
 * Deterministic destination-phrase normalization (Dataset Depth correction,
 * 2026-09-04 — see docs/implementation-decisions.md). "Prefer structured
 * geography/aliases over model-generated geographic truth" — the model may
 * extract whatever destination phrase the user actually said ("near
 * Austin", "around Fredericksburg", "San Antonio area"), but matching that
 * phrase against the dataset's real city/region names is the application's
 * job, applied once, deterministically, right after the model's response —
 * not re-derived ad hoc wherever destination matching happens to run.
 */

const FILLER_PREFIX = /^(near|around|close to|by|in)\s+/i;
const FILLER_SUFFIX = /\s+area$/i;

/**
 * Strips common locational filler ("near ", "around ", "in ", "close to ",
 * "by ", trailing " area") so the remaining text is a plain place name that
 * can be matched against a campsite's city/region — "near Austin" -> "Austin",
 * "San Antonio area" -> "San Antonio". A phrase with no filler (e.g. "Hill
 * Country", "East Texas") passes through unchanged. Never invents or
 * guesses a place — this only removes wrapping words around whatever the
 * user/model already said.
 */
export function normalizeDestinationRegion(raw: string | null): string | null {
  if (!raw) return null;
  const stripped = raw.trim().replace(FILLER_PREFIX, "").replace(FILLER_SUFFIX, "").trim();
  return stripped || raw;
}
