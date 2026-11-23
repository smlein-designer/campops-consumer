import { UNSATISFIED_PREFIX } from "@/lib/evaluate";
import { distanceFromOriginMiles } from "@/lib/geo";
import type { Campsite, EvaluationResult } from "@/lib/schemas";
import type { FitRowState } from "@/components/v3/fit-row";
import type { V3TripIntent } from "@/lib/v3/schemas";

export type CandidateFitRow = { state: FitRowState; requirement: string; detail: string };

/**
 * Builds the kept/tradeoff/missed fit breakdown for one campsite candidate
 * (PRD v3 §5.4 "which requirements are kept, which are traded off... must
 * name any must-have that is missed"). Reuses the checks evaluateCampsites
 * already computed (preserved/compromises) rather than re-deriving
 * satisfaction — this is the same CampsiteOption/FitRow presentation the
 * Figma handoff (node 31:731 "Site Unavailable") specifies, which existed
 * only in static fixtures until now. `previous`, when given, is the site
 * being replaced — its distance/price become visible tradeoffs instead of
 * isolated facts, matching "30 min farther, still under 2 hrs" in Figma.
 */
export function buildCandidateFit(
  result: EvaluationResult,
  campsiteId: string,
  intent: V3TripIntent,
  previous?: Campsite,
): CandidateFitRow[] {
  const candidate = result.candidates.find((c) => c.campsite.id === campsiteId);
  if (!candidate) return [];
  const rows: CandidateFitRow[] = [];

  for (const req of intent.requirements.filter((r) => r.tier === "must")) {
    if (candidate.preserved.includes(req.label)) {
      rows.push({ state: "kept", requirement: req.label, detail: "Same as you asked" });
    } else if (candidate.compromises.includes(`${UNSATISFIED_PREFIX}${req.label}`)) {
      rows.push({ state: "missed", requirement: req.label, detail: "This site doesn't satisfy it" });
    }
    // An unverifiable requirement (no recognized check) is omitted here,
    // same as summarizeNoMatch/widenSearch's own rule — never surfaced as
    // a confirmed compromise unless the evaluator actually confirmed it.
  }

  if (previous && intent.originZip) {
    const prevMiles = distanceFromOriginMiles(intent.originZip, { lat: previous.latitude, lng: previous.longitude });
    const nextMiles = distanceFromOriginMiles(intent.originZip, {
      lat: candidate.campsite.latitude,
      lng: candidate.campsite.longitude,
    });
    if (prevMiles != null && nextMiles != null && prevMiles !== nextMiles) {
      const delta = Math.abs(nextMiles - prevMiles);
      rows.push({
        state: nextMiles > prevMiles ? "tradeoff" : "kept",
        requirement: "Distance",
        detail: nextMiles > prevMiles ? `${delta} mi farther than ${previous.siteName}` : `${delta} mi closer than ${previous.siteName}`,
      });
    }
  }
  if (previous) {
    const priceDelta = Math.round((candidate.campsite.pricePerNight - previous.pricePerNight) * 100) / 100;
    if (priceDelta !== 0) {
      rows.push({
        state: priceDelta > 0 ? "tradeoff" : "kept",
        requirement: "Price",
        detail: priceDelta > 0 ? `$${priceDelta}/night more than ${previous.siteName}` : `$${Math.abs(priceDelta)}/night less than ${previous.siteName}`,
      });
    }
  }

  return rows;
}

/**
 * Characteristics relevant to the user's request (PRD v3 §6, explicit
 * booking-authorization requirement) — the must-have requirement labels
 * this campsite actually satisfies, for the Review screen's line item.
 * Reuses the same `preserved` data buildCandidateFit does.
 */
export function campsiteCharacteristicTags(result: EvaluationResult, campsiteId: string, intent: V3TripIntent): string[] {
  const candidate = result.candidates.find((c) => c.campsite.id === campsiteId);
  if (!candidate) return [];
  return intent.requirements.filter((r) => r.tier === "must" && candidate.preserved.includes(r.label)).map((r) => r.label);
}
