import { CAMPSITES } from "@/lib/campsites";
import { isOriginRelativeDistanceLabel } from "@/lib/prerequisites";
import {
  coordinatesForZip,
  distanceFromOriginMiles,
  estimatedRoadMiles,
  estimatedTravelTimeHours,
  parseDistanceBudget,
} from "@/lib/geo";
import { computeDateRange, rangesOverlap } from "@/lib/dates";
import { normalizeAmenityLabel } from "@/lib/amenities";
import { describeFamilyFeatures } from "@/lib/family-features";
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
 * Searchable-field enforcement audit (Dataset Depth correction, 2026-09-04 —
 * see docs/implementation-decisions.md, standing rule §17): every structured
 * Campsite field that can affect search/ranking has an explicit, documented
 * enforcement path below. `ENFORCED_CAMPSITE_FIELDS` names them; a
 * regression guard (scripts/smoke-test-field-enforcement.ts) checks that
 * list against the Campsite type's own keys so a newly added structured
 * field can't silently exist with no enforcement path.
 *
 *   guestCount (TripIntent)  -> capacityCheck              -> site.capacity
 *   destinationRegion        -> destinationCheck            -> site.region/city/campgroundName
 *   travelingWithPets/petCount -> petCheck                  -> site.petPolicy
 *   budget                   -> budgetCheck                 -> site.pricePerNight (+ derived nights)
 *   checkIn/checkOut         -> dateRangeCheck               -> site.unavailableRanges
 *   originZip + distance text -> checkConstraint (distance)  -> site.latitude/longitude (src/lib/geo.ts)
 *   "pet"/"dog" text         -> checkConstraint (pet)        -> site.petPolicy (defense in depth)
 *   "family" text            -> checkConstraint (family)     -> site.familyFeatures
 *   "quiet" text              -> checkConstraint (noise)      -> site.noiseLevel
 *   "secluded"/"private" text -> checkConstraint (seclusion)  -> site.seclusion
 *   "waterfront"/"lake"/"river"/"creek"/"beach"/"water" text -> checkConstraint (water) -> site.waterAccess
 *   "tent"/"cabin"/"rv" text  -> checkConstraint (site type)  -> site.siteType
 *   any other recognized amenity phrase -> checkConstraint (amenity) -> site.amenities (src/lib/amenities.ts)
 *   anything else             -> unverifiable, never satisfied
 *
 * KNOWN SIMPLIFICATION (flagging, not silently deciding): requirement labels
 * still arrive as free-text from intent extraction for everything other than
 * the structured fields above. Matching them uses keyword heuristics, which
 * is a reasonable POC-scale approach but is not the same as a real
 * constraint-satisfaction engine.
 */
export const ENFORCED_CAMPSITE_FIELDS = [
  "capacity",
  "region",
  "city",
  "campgroundName",
  "petPolicy",
  "pricePerNight",
  "serviceFee",
  "unavailableRanges",
  "latitude",
  "longitude",
  "familyFeatures",
  "noiseLevel",
  "seclusion",
  "waterAccess",
  "siteType",
  "amenities",
  "available",
  // Enforced in src/lib/reservation.ts (describeCancellationPolicy), not
  // this file — still a real, documented enforcement path, just at a
  // different architectural boundary (staging time, not search time).
  "cancellationPolicy",
] as const;

/**
 * The ONE place pet-policy truth is read off a Campsite record (Pet
 * Requirement correction, 2026-09-03; restructured to `petPolicy` in the
 * Dataset Depth correction, 2026-09-04). `petPolicy` is a required,
 * non-optional object in the schema — every dataset record has an explicit
 * value — but this is still written defensively so a genuinely missing
 * value on some future record reads as unverifiable rather than a false
 * failure.
 */
/**
 * The one place the capacity synthetic-check label is built (Trip
 * Requirement Projection correction, 2026-09-10 — see
 * docs/implementation-decisions.md) — exported so the Trip Requirements
 * panel projection (`src/lib/requirements.ts`) renders the EXACT same
 * label the evaluator/No-Match copy already uses, rather than a
 * hand-typed duplicate that could quietly drift out of sync.
 */
export function capacityRequirementLabel(guestCount: number): string {
  return `Capacity for ${guestCount}`;
}

export function petStatus(
  site: Campsite,
  requiredCount: number,
): ConstraintStatus {
  if (!site.petPolicy || typeof site.petPolicy.allowed !== "boolean") {
    return "unverifiable";
  }
  if (!site.petPolicy.allowed) return "unsatisfied";
  return site.petPolicy.maxPets >= requiredCount ? "satisfied" : "unsatisfied";
}

function checkConstraint(
  label: string,
  tier: RequirementTier,
  site: Campsite,
  guestCount: number | null,
  originZip: string | null,
): ConstraintCheck {
  const l = label.toLowerCase();
  const status = (value: boolean): ConstraintStatus =>
    value ? "satisfied" : "unsatisfied";

  // Pet Requirement correction (2026-09-03): defense-in-depth path for a
  // genuinely soft preference-tier "Pet-friendly"/"Dog-friendly" label the
  // model may still produce — the authoritative HARD enforcement lives in
  // evaluateCampsites' `petCheck`, driven by `travelingWithPets`/`petCount`.
  // A bare free-text label carries no known pet count, so this assumes the
  // minimum (1) — never more than what's actually stated.
  if (l.includes("pet") || l.includes("dog"))
    return { label, tier, status: petStatus(site, 1) };

  // Dataset Depth correction (2026-09-04): family suitability is grounded in
  // actual features, not an opaque flag — "family-friendly" is satisfied
  // only when the site genuinely has at least one real family feature.
  // Recognizes "kid(s)"/"child(ren)" phrasing too (Party-Composition
  // Inference correction, 2026-09-10) — "kid-friendly is a must" and
  // "family-friendly is important" name the same underlying concept.
  if (l.includes("famil") || l.includes("kid") || l.includes("child"))
    return { label, tier, status: status(site.familyFeatures.length > 0) };

  // Water access is now structured and genuinely distinguishes "waterfront"
  // (direct access) from "lakeside"/"near a river"/"beach access" (a
  // specific water TYPE) from a generic "near water". A label can name
  // BOTH a directness word AND a type word at once ("waterfront ON A
  // LAKE") — that must require BOTH conditions together, not just whichever
  // branch happened to match first (the original version of this check
  // matched "waterfront" alone and never looked at "lake" at all, so a
  // river site with direct access would incorrectly satisfy "waterfront on
  // a lake").
  const wantsDirect =
    l.includes("waterfront") ||
    l.includes("directly on the water") ||
    l.includes("direct water access") ||
    l.includes("on the lake") ||
    l.includes("on the river") ||
    l.includes("on the creek");
  const waterType = l.includes("beach")
    ? "beach"
    : l.includes("lake")
      ? "lake"
      : l.includes("river")
        ? "river"
        : l.includes("creek")
          ? "creek"
          : null;
  if (waterType) {
    // "beach access" and any explicit directness word both require direct
    // access to that specific type; a bare type mention ("lakeside", "near
    // a river") only requires proximity to that type.
    const requireDirect = wantsDirect || waterType === "beach";
    return {
      label,
      tier,
      status: status(
        site.waterAccess.type === waterType &&
          (requireDirect ? site.waterAccess.directAccess : site.waterAccess.nearby),
      ),
    };
  }
  if (wantsDirect) return { label, tier, status: status(site.waterAccess.directAccess) };
  if (l.includes("water"))
    return { label, tier, status: status(site.waterAccess.nearby) };

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

  // Quiet vs. secluded correction (Dataset Depth correction, 2026-09-04):
  // these are DIFFERENT dimensions on the dataset now — "quiet" checks
  // ambient sound (`noiseLevel`), "secluded"/"private" checks privacy from
  // other campers (`seclusion`). A site can be highly secluded but still
  // loud (near a falls/highway), or unsecluded but quiet.
  if (l.includes("quiet"))
    return { label, tier, status: status(site.noiseLevel === "low") };
  if (l.includes("seclu") || l.includes("private"))
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

  // Search Truth correction (2026-09-02, see docs/implementation-decisions.md):
  // a distance/travel-time constraint stated relative to the user's own
  // location is genuinely evaluated — origin ZIP centroid to the site's
  // real lat/lng, great-circle distance, deterministic road-distance
  // approximation (src/lib/geo.ts). Still explicitly unverifiable — never
  // guessed "satisfied" — when the budget can't be parsed or the ZIP falls
  // outside the bundled centroid table's coverage.
  if (isOriginRelativeDistanceLabel(label)) {
    if (!originZip) return { label, tier, status: "unverifiable" };
    const budget = parseDistanceBudget(label);
    const origin = coordinatesForZip(originZip);
    if (!budget || !origin) return { label, tier, status: "unverifiable" };
    const destination = { lat: site.latitude, lng: site.longitude };
    const withinBudget =
      budget.kind === "hours"
        ? estimatedTravelTimeHours(origin, destination) <= budget.value
        : estimatedRoadMiles(origin, destination) <= budget.value;
    return { label, tier, status: status(withinBudget) };
  }

  // Amenity normalization (Dataset Depth correction, 2026-09-04): a
  // requirement label is mapped to a canonical AmenityCode (recognizing
  // aliases like "bathroom" -> restroom) BEFORE comparison — this is a
  // genuine deterministic satisfied/unsatisfied result now, not a raw
  // substring guess, since `site.amenities` is a finite, canonical list.
  const amenityCode = normalizeAmenityLabel(label);
  if (amenityCode) {
    return { label, tier, status: status(site.amenities.includes(amenityCode)) };
  }

  // Not a recognized concept for this evaluator — explicitly unverifiable,
  // never silently treated as satisfied.
  return { label, tier, status: "unverifiable" };
}

/**
 * Deterministic destination-region match (Search Truth correction,
 * 2026-09-02): case-insensitive substring match against the site's own
 * region/city/campground name. `destination` is expected to already be
 * normalized (filler words like "near"/"around" stripped — see
 * `normalizeDestinationRegion` in src/lib/geography.ts, applied once in
 * page.tsx right after the model's response) — this function itself stays a
 * plain substring match, the same POC-scale heuristic as the rest of this
 * file's keyword matching.
 */
function matchesDestination(site: Campsite, destination: string): boolean {
  const d = destination.toLowerCase();
  const region = site.region.toLowerCase();
  const city = site.city.toLowerCase();
  return (
    region.includes(d) ||
    d.includes(region) ||
    city.includes(d) ||
    d.includes(city) ||
    site.campgroundName.toLowerCase().includes(d)
  );
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
  distanceMiles: number | null,
): string {
  const priceFact = `$${site.pricePerNight}/night`;
  const fact =
    distanceMiles !== null ? `at ${priceFact} and ${distanceMiles} mi away` : `at ${priceFact}`;
  // Grounded family-feature clause (item 16: explanations must derive from
  // structured facts, never invented) — appended only when family-related
  // preserved this candidate AND the site actually has real features to
  // name.
  const familyClause =
    preserved.some((p) => /famil/i.test(p)) && describeFamilyFeatures(site.familyFeatures)
      ? ` It's family-friendly — ${describeFamilyFeatures(site.familyFeatures)}.`
      : "";
  if (matchType === "full") {
    const reqs =
      preserved.length > 0 ? ` — it satisfies ${preserved.join(", ")}` : "";
    return `This is the strongest match${reqs}, ${fact}.${familyClause}`;
  }
  if (matchType === "compromise") {
    const reqs =
      preserved.length > 0 ? ` It satisfies ${preserved.join(", ")}.` : "";
    return `This is the closest option — ${compromises.join("; ")}.${reqs} ${fact}.${familyClause}`;
  }
  return `This doesn't fully match — ${compromises.join("; ")}. ${fact}.`;
}

/**
 * Compromise-description prefixes (shared with no-match.ts's failing-label
 * extraction and requirements.ts's chip-removal label resolution, so all
 * three stay in lockstep with how these strings are actually built below —
 * one canonical definition rather than three copies that could drift).
 */
export const UNVERIFIABLE_PREFIX = "Couldn't verify: ";
export const UNSATISFIED_PREFIX = "Doesn't satisfy: ";
/**
 * A CONFIRMED-unsatisfied SOFT (flexible/preference/priority) check —
 * deliberately distinct from `UNSATISFIED_PREFIX`, which no-match.ts's
 * failing-label extraction treats as a confirmed HARD failure (see
 * `summarizeNoMatch`/`widenSearch`). A soft miss never blocks or downgrades
 * a match and must never be mistaken for one of those.
 */
export const UNMET_PREFERENCE_PREFIX = "Didn't fully match: ";

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
  // Concrete requested date range, if BOTH dates are stated AND resolvable
  // to real calendar dates (Dataset Depth correction, 2026-09-04) — used for
  // date-specific availability and total-stay budget checks below. Genuinely
  // absent (exploratory search, or an unresolvable free-text date) means
  // those checks are skipped entirely, never evaluated against a guessed
  // range.
  const dateRange =
    intent.checkIn && intent.checkOut
      ? computeDateRange(intent.checkIn, intent.checkOut)
      : null;

  const evaluated = CAMPSITES.filter(
    (site) => site.available && !excludeIds.has(site.id),
  ).map((site) => {
    const distanceMiles = distanceFromOriginMiles(intent.originZip, {
      lat: site.latitude,
      lng: site.longitude,
    });

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
              label: capacityRequirementLabel(intent.guestCount),
              tier: "hard",
              status:
                site.capacity >= intent.guestCount
                  ? "satisfied"
                  : "unsatisfied",
            },
          ]
        : [];
    // Destination-region check: a structured field (like guestCount), not
    // free hardRequirements text — same synthetic-check pattern, and same
    // reason it isn't independently chip-removable (Search Truth
    // correction, 2026-09-02).
    const destinationCheck: ConstraintCheck[] = intent.destinationRegion
      ? [
          {
            label: `In ${intent.destinationRegion}`,
            tier: "hard",
            status: matchesDestination(site, intent.destinationRegion)
              ? "satisfied"
              : "unsatisfied",
          },
        ]
      : [];
    // Pet Requirement correction (2026-09-03), extended with a real pet
    // COUNT in the Dataset Depth correction (2026-09-04): a structured
    // field, not free hardRequirements text — the authoritative
    // pet-eligibility check, enforced directly against `site.petPolicy`.
    // `petCount` unspecified means "at least 1" — the minimum the user's
    // own statement guarantees, never assumed higher.
    const petCheck: ConstraintCheck[] = intent.travelingWithPets
      ? [
          {
            label: "Pet-friendly",
            tier: "hard",
            status: petStatus(site, Math.max(intent.petCount ?? 1, 1)),
          },
        ]
      : [];
    // Date-specific availability (Dataset Depth correction, 2026-09-04):
    // only meaningful once a concrete, resolvable date range exists — an
    // exploratory search with no dates yet has nothing to check this
    // against, and correctly adds no check at all (never "unverifiable",
    // never a fabricated availability claim).
    const dateRangeCheck: ConstraintCheck[] = dateRange
      ? [
          {
            label: "Available for your dates",
            tier: "hard",
            status: site.unavailableRanges.some((r) =>
              rangesOverlap(dateRange.startISO, dateRange.endISO, r.start, r.end),
            )
              ? "unsatisfied"
              : "satisfied",
          },
        ]
      : [];
    // Budget (Dataset Depth correction, 2026-09-04): nightly-rate budget is
    // always checkable; a TOTAL-stay budget requires a resolvable date range
    // to compute real nights — without one it stays honestly unverifiable,
    // never computed against a guessed night count.
    const budgetChecks: ConstraintCheck[] = [];
    if (intent.budget?.maxPerNight != null) {
      budgetChecks.push({
        label: `Nightly rate under $${intent.budget.maxPerNight}`,
        tier: "hard",
        status: site.pricePerNight <= intent.budget.maxPerNight ? "satisfied" : "unsatisfied",
      });
    }
    if (intent.budget?.maxTotal != null) {
      if (dateRange) {
        const total = site.pricePerNight * dateRange.nights + site.serviceFee;
        budgetChecks.push({
          label: `Total stay under $${intent.budget.maxTotal}`,
          tier: "hard",
          status: total <= intent.budget.maxTotal ? "satisfied" : "unsatisfied",
        });
      } else {
        budgetChecks.push({
          label: `Total stay under $${intent.budget.maxTotal}`,
          tier: "hard",
          status: "unverifiable",
        });
      }
    }

    const hardChecks = [
      ...capacityCheck,
      ...destinationCheck,
      ...petCheck,
      ...dateRangeCheck,
      ...budgetChecks,
      ...intent.hardRequirements.map((r) =>
        checkConstraint(r, "hard", site, intent.guestCount, intent.originZip),
      ),
    ];
    const softChecks = [
      ...intent.flexibleConstraints.map((r) =>
        checkConstraint(r, "flexible", site, intent.guestCount, intent.originZip),
      ),
      ...intent.preferences.map((r) =>
        checkConstraint(r, "preference", site, intent.guestCount, intent.originZip),
      ),
      ...intent.priorities.map((r) =>
        checkConstraint(r, "priority", site, intent.guestCount, intent.originZip),
      ),
    ];
    const checks = [...hardChecks, ...softChecks];

    const matchType = classifyMatchType(hardChecks);
    const matchedSoft = softChecks.filter((c) => c.status === "satisfied");

    // Preserved now includes satisfied SOFT checks too (Active-Recommendation
    // Follow-Up correction, 2026-09-05 — see docs/implementation-decisions.md):
    // a refinement like "I'd like it to be near water" may land as a soft
    // preference/flexible constraint, not a hard requirement — but once
    // satisfied, the user must still be able to SEE that it's satisfied
    // ("the UI/explanation must now show water as a satisfied/preserved
    // requirement"), not have it silently affect ranking with zero visible
    // acknowledgment.
    const preserved = [
      ...hardChecks.filter((c) => c.status === "satisfied"),
      ...matchedSoft,
    ].map((c) => c.label);
    // Exploratory Discovery correction (2026-09-07 — see
    // docs/implementation-decisions.md): a CONFIRMED-unsatisfied soft check
    // (e.g. "quiet" for a site whose noiseLevel genuinely isn't low) is now
    // also shown, using a distinct `UNMET_PREFERENCE_PREFIX` — never
    // `UNSATISFIED_PREFIX`, which no-match.ts's failing-hard-label
    // extraction (summarizeNoMatch/widenSearch) specifically scans for and
    // must continue to reflect ONLY confirmed HARD failures. Reproduced
    // gap this closes: "quiet campgrounds that are good for families" could
    // rank a family-friendly-but-NOT-quiet site as the top pick with zero
    // visible acknowledgment that "quiet" was ever considered, let alone
    // that this pick doesn't deliver on it — a soft miss never blocks or
    // downgrades a match (unchanged), but it must not be invisible either.
    // An UNVERIFIABLE soft check is deliberately NOT shown this way (most
    // preferences are free text with no recognized mapping at all, and
    // surfacing every one as a "compromise" would be noise, not signal).
    const compromises = [
      ...hardChecks
        .filter((c) => c.status === "unverifiable")
        .map((c) => `${UNVERIFIABLE_PREFIX}${c.label}`),
      ...hardChecks
        .filter((c) => c.status === "unsatisfied")
        .map((c) => `${UNSATISFIED_PREFIX}${c.label}`),
      ...softChecks
        .filter((c) => c.status === "unsatisfied")
        .map((c) => `${UNMET_PREFERENCE_PREFIX}${c.label}`),
    ];

    const score =
      matchedSoft.length * 10 -
      site.pricePerNight / 50 -
      (distanceMiles ?? 0) / 20;

    return {
      campsite: site,
      matchType,
      checks,
      preserved,
      compromises,
      score,
      distanceMiles,
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
      e.distanceMiles,
    ),
    distanceFromOriginMiles: e.distanceMiles,
  }));

  return { kind: bestType, candidates };
}

function dedupe(labels: string[]): string[] {
  return Array.from(new Set(labels));
}
