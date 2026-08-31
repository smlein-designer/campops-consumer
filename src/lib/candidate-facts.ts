import { distanceFromOriginMiles } from "@/lib/geo";
import { computeDateRange, rangesOverlap } from "@/lib/dates";
import { normalizeAmenityLabel, AMENITY_LABELS } from "@/lib/amenities";
import { describeFamilyFeatures } from "@/lib/family-features";
import type { Campsite } from "@/lib/schemas";

/**
 * Active-Recommendation Follow-Up correction (2026-09-05 — see
 * docs/implementation-decisions.md). Deterministic factual answers about
 * the CURRENTLY ACTIVE candidate — the model only ever classifies WHICH
 * topic a question is about (`IntentInterpretationSchema.candidateQuestion`);
 * the actual answer always comes from here, reading real structured
 * campsite facts, never invented or model-phrased. This is the same
 * "model handles language, application handles truth" boundary every other
 * deterministic fact in this app already respects.
 */
export type CandidateQuestionTopic =
  | "pet"
  | "water"
  | "family"
  | "noise"
  | "seclusion"
  | "distance"
  | "amenity"
  | "capacity"
  | "price"
  | "availability"
  | "site_type"
  | "other";

export type CandidateQuestionContext = {
  originZip: string | null;
  checkIn: string | null;
  checkOut: string | null;
  amenityHint: string | null;
};

function answerWater(site: Campsite): string {
  const { nearby, directAccess, type } = site.waterAccess;
  if (!nearby || type === "none") return "No. This site isn't near water.";
  if (directAccess) return `Yes. It has direct ${type} access.`;
  return `Yes. It's near a ${type}.`;
}

function answerPet(site: Campsite): string {
  const { allowed, maxPets } = site.petPolicy;
  if (!allowed) return "No, this site doesn't allow pets.";
  return `Yes, pets are allowed — up to ${maxPets}.`;
}

function answerFamily(site: Campsite): string {
  const desc = describeFamilyFeatures(site.familyFeatures);
  if (!desc) return "Not especially — no notable family-oriented features are listed for this site.";
  return `Yes — it has ${desc}.`;
}

function answerNoise(site: Campsite): string {
  if (site.noiseLevel === "low") return "Yes, it's a low-noise site.";
  if (site.noiseLevel === "medium") return "It's moderate — not silent, but not a loud site either.";
  return "Not particularly — this site tends to be on the louder side.";
}

function answerSeclusion(site: Campsite): string {
  if (site.seclusion === "high") return "Yes, it's a highly secluded site, well away from other campers.";
  if (site.seclusion === "medium") return "Somewhat — it has moderate privacy from other campers.";
  return "Not really — this site has low privacy from other campers.";
}

function answerDistance(site: Campsite, ctx: CandidateQuestionContext): string {
  if (!ctx.originZip) {
    return "I don't have a starting ZIP code for you yet, so I can't calculate the distance.";
  }
  const miles = distanceFromOriginMiles(ctx.originZip, {
    lat: site.latitude,
    lng: site.longitude,
  });
  if (miles === null) {
    return "I don't have coverage for that ZIP code, so I can't calculate the distance.";
  }
  return `It's about ${miles} miles from the ZIP you gave me.`;
}

function answerAmenity(site: Campsite, ctx: CandidateQuestionContext): string {
  if (!ctx.amenityHint) {
    return "I'm not sure which amenity you mean — could you name it directly?";
  }
  const code = normalizeAmenityLabel(ctx.amenityHint);
  if (!code) {
    return `I don't have confirmed information about "${ctx.amenityHint}" for this site.`;
  }
  const has = site.amenities.includes(code);
  return has
    ? `Yes, it has ${AMENITY_LABELS[code].toLowerCase()}.`
    : `No, this site doesn't have ${AMENITY_LABELS[code].toLowerCase()}.`;
}

function answerCapacity(site: Campsite): string {
  return `It's set up for up to ${site.capacity} guests.`;
}

function answerPrice(site: Campsite, ctx: CandidateQuestionContext): string {
  const base = `It's $${site.pricePerNight}/night`;
  const range =
    ctx.checkIn && ctx.checkOut ? computeDateRange(ctx.checkIn, ctx.checkOut) : null;
  if (!range) return `${base}, plus a $${site.serviceFee.toFixed(2)} service fee.`;
  const total = Math.round((site.pricePerNight * range.nights + site.serviceFee) * 100) / 100;
  return `${base} — for your ${range.nights}-night stay that's $${total.toFixed(2)} total (including the $${site.serviceFee.toFixed(2)} service fee).`;
}

function answerAvailability(site: Campsite, ctx: CandidateQuestionContext): string {
  const range =
    ctx.checkIn && ctx.checkOut ? computeDateRange(ctx.checkIn, ctx.checkOut) : null;
  if (!range) {
    return site.available
      ? "Yes, this site is currently open — I don't have specific dates from you yet to check against."
      : "This site is closed for the season.";
  }
  const conflict = site.unavailableRanges.some((r) =>
    rangesOverlap(range.startISO, range.endISO, r.start, r.end),
  );
  return conflict
    ? "It's not available for those exact dates."
    : "Yes, it's available for your dates.";
}

function answerSiteType(site: Campsite): string {
  return `It's a ${site.siteType.toLowerCase()}.`;
}

/**
 * Live Active-Candidate Context Wiring correction (2026-09-06 — see
 * docs/implementation-decisions.md). Live manual testing found the model's
 * OWN classification of `candidateQuestion` unreliable run-to-run for the
 * exact same message — sometimes correctly recognizing "is it near
 * water?" as a factual question, sometimes not (leading to the reported
 * generic-boilerplate/"which campsite?" failures). `hasActiveCandidate`
 * wiring itself was verified correct (a single canonical `activeCandidate`
 * feeds both the rendered Candidate Card and this request field) — the gap
 * was trusting a live model judgment call for something with a
 * deterministically recognizable shape for its most common phrasings.
 *
 * This is a DETERMINISTIC BACKSTOP, the same architectural pattern already
 * used for `isOriginRelativeDistanceLabel`/`isExploratoryDiscoveryMessage`
 * (src/lib/prerequisites.ts): a plain, repeatable text pattern match that
 * must reach the same answer for the same text every time. It only ever
 * intervenes for HIGH-CONFIDENCE canonical phrasings (a question-shaped
 * message referencing "it"/"this site"/"the current campsite" etc., with
 * no refinement verb) — anything less clear-cut returns "unclear" and the
 * caller falls back to the model's own judgment, preserving flexibility
 * for phrasings this pattern doesn't cover. It never decides what the
 * ANSWER is (that's still `answerCandidateQuestion`, from real structured
 * data) — only whether this turn is a candidate question at all, and if
 * so, which topic.
 */
export type CandidateQuestionDetection =
  | { kind: "question"; topic: CandidateQuestionTopic; amenityHint: string | null }
  | { kind: "refinement" }
  | { kind: "unclear" };

const REFINEMENT_VERB_PATTERN =
  /\b(want|need|prefer|like|make sure|require|must have|would like|rather|switch to|change (it|this) to)\b/i;
const REFERENT_PATTERN =
  /\b(it|this one|this site|this campsite|this campground|the current (campsite|site|campground))\b/i;
const QUESTION_SHAPE_PATTERN = /^\s*(is|does|are|has|how|what|can|could|do)\b/i;

export function detectCandidateQuestion(rawMessage: string): CandidateQuestionDetection {
  const trimmed = rawMessage.trim();
  const lower = trimmed.toLowerCase();

  // A refinement verb wins regardless of sentence shape — most refinements
  // are plain statements ("I'd prefer...", "make sure...", "I need..."),
  // not questions at all, so this is checked BEFORE requiring a
  // question-like shape (a refinement phrased as a question, e.g. "could
  // you make sure dogs are allowed?", is still a refinement, not a fact
  // request).
  if (REFINEMENT_VERB_PATTERN.test(lower)) return { kind: "refinement" };

  const looksLikeQuestion =
    QUESTION_SHAPE_PATTERN.test(lower) || /\?\s*$/.test(trimmed);
  if (!looksLikeQuestion) return { kind: "unclear" };

  if (!REFERENT_PATTERN.test(lower)) return { kind: "unclear" };

  if (/\bwater\b/.test(lower)) return { kind: "question", topic: "water", amenityHint: null };
  if (/\b(dogs?|pets?)\b/.test(lower)) return { kind: "question", topic: "pet", amenityHint: null };
  if (/\bfamil/.test(lower)) return { kind: "question", topic: "family", amenityHint: null };
  if (/\bquiet\b/.test(lower)) return { kind: "question", topic: "noise", amenityHint: null };
  if (/\b(seclud\w*|privacy|private)\b/.test(lower))
    return { kind: "question", topic: "seclusion", amenityHint: null };
  if (/\b(far|distance|miles?|away)\b/.test(lower))
    return { kind: "question", topic: "distance", amenityHint: null };
  if (/\b(capacity|guests?|sleep)\b/.test(lower))
    return { kind: "question", topic: "capacity", amenityHint: null };
  if (/\b(price|cost|expensive|cheap)\b/.test(lower) || /\$/.test(trimmed))
    return { kind: "question", topic: "price", amenityHint: null };
  if (/\bavailab/.test(lower)) return { kind: "question", topic: "availability", amenityHint: null };
  if (/\b(tent|cabin|\brv\b)\b/.test(lower))
    return { kind: "question", topic: "site_type", amenityHint: null };
  if (normalizeAmenityLabel(lower)) {
    return { kind: "question", topic: "amenity", amenityHint: lower };
  }
  // A recognized question shape about the current candidate, but about no
  // topic this app has structured data for — still a candidate question
  // (must not fall through to generic recommendation copy or a "which
  // campsite?" clarification), just one `answerCandidateQuestion` will
  // decline gracefully rather than guess.
  return { kind: "question", topic: "other", amenityHint: null };
}

/**
 * The single entry point: given a classified topic and the real active
 * candidate's campsite, returns the deterministic, factual answer. Never
 * calls the model, never invents a detail beyond what the campsite record
 * actually states.
 */
export function answerCandidateQuestion(
  topic: CandidateQuestionTopic,
  site: Campsite,
  ctx: CandidateQuestionContext,
): string {
  switch (topic) {
    case "water":
      return answerWater(site);
    case "pet":
      return answerPet(site);
    case "family":
      return answerFamily(site);
    case "noise":
      return answerNoise(site);
    case "seclusion":
      return answerSeclusion(site);
    case "distance":
      return answerDistance(site, ctx);
    case "amenity":
      return answerAmenity(site, ctx);
    case "capacity":
      return answerCapacity(site);
    case "price":
      return answerPrice(site, ctx);
    case "availability":
      return answerAvailability(site, ctx);
    case "site_type":
      return answerSiteType(site);
    case "other":
    default:
      return "I don't have a specific, confirmed answer for that — let me know if you'd like to change any of your requirements instead.";
  }
}
