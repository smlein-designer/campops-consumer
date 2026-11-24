import { capacityRequirementLabel } from "@/lib/evaluate";
import type { Campsite, Candidate, EvaluationResult } from "@/lib/schemas";
import type { FitRowState } from "@/components/v3/fit-row";
import { activityTypesRequested, ACTIVITY_STEP } from "@/lib/v3/activity-match";
import { driveHours, driveLimitLabel, formatDrive, partySize, searchDates, tripBudgetLabel } from "@/lib/v3/search";
import type { CampsiteFitCard, V3TripIntent } from "@/lib/v3/schemas";

export type CandidateFitRow = { state: FitRowState; requirement: string; detail: string };

const BASIC_LABELS = ["Pet-friendly", "Available for your dates"];

/** A must-have the search has no way to confirm yet (v2's "unverifiable") —
 * shown as such, never passed off as kept. */
const UNCHECKED = "I can't confirm this one yet";

/** "4 adults, 2 kids and a dog". */
export function partyLabel(intent: V3TripIntent): string {
  const parts: string[] = [];
  if (intent.adults > 0) parts.push(`${intent.adults} adult${intent.adults === 1 ? "" : "s"}`);
  if (intent.children > 0) parts.push(`${intent.children} kid${intent.children === 1 ? "" : "s"}`);
  if (intent.pets > 0) parts.push(intent.pets === 1 ? "a dog" : `${intent.pets} dogs`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function describeWater(site: Campsite): string {
  const { nearby, directAccess, type } = site.waterAccess;
  if (!nearby || type === "none") return "No water nearby";
  return directAccess ? `Right on the ${type}` : `Short walk to the ${type}`;
}

function keptDetail(label: string, site: Campsite): string {
  return /water|lake|river|creek|beach/i.test(label) ? describeWater(site) : "Same as you asked";
}

/**
 * The kept / traded-off / missed breakdown for one campsite (PRD v3 §5.4).
 * Built only from the checks the search already ran, so the rows, the badge
 * and the one-line reason can never disagree with each other (Build Brief
 * §8). `previous` is the site being replaced: its drive and price become
 * visible trade-offs.
 */
export function buildCandidateFit(candidate: Candidate, intent: V3TripIntent, previous?: Campsite): CandidateFitRow[] {
  const site = candidate.campsite;
  const rows: CandidateFitRow[] = [];
  const hard = candidate.checks.filter((c) => c.tier === "hard");
  const soft = candidate.checks.filter((c) => c.tier !== "hard");

  // Who and when: capacity, pets, dates.
  const party = partySize(intent);
  const basicLabels = [...BASIC_LABELS, ...(party > 0 ? [capacityRequirementLabel(party)] : [])];
  const basics = hard.filter((c) => basicLabels.includes(c.label));
  if (basics.length > 0) {
    const failed = basics.filter((c) => c.status === "unsatisfied");
    if (failed.length === 0) {
      const what = [searchDates(intent) ? "Dates" : "", partyLabel(intent)].filter(Boolean).join(", ");
      rows.push({ state: "kept", requirement: what || "Your party", detail: "Same as you asked" });
    }
    for (const check of failed) {
      rows.push({
        state: "missed",
        requirement: check.label,
        detail:
          check.label === "Pet-friendly"
            ? "Pets aren't allowed here"
            : check.label === "Available for your dates"
              ? "Booked for part of your stay"
              : `Sleeps ${site.capacity}`,
      });
    }
  }

  const drive = intent.driveLimitHours != null ? driveLimitLabel(intent) : null;
  const tripBudget = intent.budgetTotalUsd != null ? tripBudgetLabel(intent) : null;
  for (const check of hard) {
    if (basicLabels.includes(check.label)) continue;
    if (check.status === "unverifiable") {
      rows.push({ state: "tradeoff", requirement: check.label, detail: UNCHECKED });
      continue;
    }
    if (check.label === drive || check.label === tripBudget) continue;
    rows.push(
      check.status === "satisfied"
        ? { state: "kept", requirement: check.label, detail: keptDetail(check.label, site) }
        : { state: "missed", requirement: check.label, detail: missedDetail(check.label, site) },
    );
  }

  const hours = driveHours(intent, site);
  if (drive && hours != null) {
    const over = hours > (intent.driveLimitHours as number);
    const previousHours = previous ? driveHours(intent, previous) : null;
    const delta = previousHours != null ? Math.round(((hours - previousHours) * 60) / 5) * 5 : 0;
    rows.push(
      over
        ? { state: "missed", requirement: drive, detail: `${formatDrive(hours)}, over your limit` }
        : {
            state: delta > 0 ? "tradeoff" : "kept",
            requirement: `Drive: ${formatDrive(hours)}`,
            detail:
              delta > 0
                ? `${delta} min farther, still under ${intent.driveLimitHours} hrs`
                : delta < 0
                  ? `${-delta} min closer`
                  : `Under your ${intent.driveLimitHours} hr limit`,
          },
    );
  }

  const budgetCheck = hard.find((c) => c.label === tripBudget);
  if (budgetCheck?.status === "unsatisfied") {
    rows.push({ state: "missed", requirement: budgetCheck.label, detail: `$${site.pricePerNight} a night puts the stay over` });
  }
  if (previous && previous.pricePerNight !== site.pricePerNight) {
    const delta = site.pricePerNight - previous.pricePerNight;
    rows.push({
      state: delta > 0 ? "tradeoff" : "kept",
      requirement: `$${site.pricePerNight} a night`,
      detail: delta > 0 ? `$${delta} a night more than ${previous.campgroundName}` : `$${-delta} a night less than ${previous.campgroundName}`,
    });
  }

  // A nice-to-have this site does have is shown too — it's often why the site
  // is on the list at all.
  for (const check of soft) {
    if (check.status !== "satisfied") continue;
    const isActivity = activityTypesRequested([check.label]).length > 0;
    rows.push({
      state: "kept",
      requirement: check.label,
      detail: isActivity ? "Nice to have, and offered nearby" : /water|lake|river|creek|beach/i.test(check.label) ? describeWater(site) : "Nice to have, and this site has it",
    });
  }

  // A nice-to-have this site can't give is a trade-off, never a miss.
  for (const check of soft) {
    if (check.status !== "unsatisfied") continue;
    const [type] = activityTypesRequested([check.label]);
    rows.push({
      state: "tradeoff",
      requirement: check.label,
      detail: type ? `Not offered nearby; ${ACTIVITY_STEP[type].noun} would be dropped` : "Not at this site",
    });
  }

  return rows;
}

function missedDetail(label: string, site: Campsite): string {
  if (/water|lake|river|creek|beach/i.test(label)) return describeWater(site);
  if (label.startsWith("In ")) return `This one is in ${site.region}`;
  if (activityTypesRequested([label]).length > 0) return "Not offered near this site";
  return "This site doesn't have it";
}

/** A campsite as a card: its facts, fit rows, badge and reason, all from the
 * same search result. */
export function buildFitCard(
  result: EvaluationResult,
  campsiteId: string,
  intent: V3TripIntent,
  eyebrow: string,
  previous?: Campsite,
): CampsiteFitCard | null {
  const candidate = result.candidates.find((c) => c.campsite.id === campsiteId);
  if (!candidate) return null;
  const site = candidate.campsite;
  const fit = buildCandidateFit(candidate, intent, previous);
  const missed = fit.filter((r) => r.state === "missed");
  const unchecked = fit.filter((r) => r.detail === UNCHECKED);
  const tradeoffs = fit.filter((r) => r.state === "tradeoff" && r.detail !== UNCHECKED);
  const keeps = unchecked.length > 0 ? "Keeps every must-have I could check" : "Keeps every must-have";
  const unconfirmed =
    unchecked.length > 0 ? ` I couldn't confirm: ${unchecked.map((r) => r.requirement.toLowerCase()).join("; ")}.` : "";
  const hours = driveHours(intent, site);

  return {
    campsiteId: site.id,
    photoKey: site.photoKey,
    eyebrow,
    title: campsiteTitle(site),
    facts: [
      site.siteType,
      site.petPolicy.allowed ? "dogs OK" : "no dogs",
      ...(hours != null ? [formatDrive(hours)] : [site.region]),
      `$${site.pricePerNight}/night`,
    ],
    badge: missed.length > 0 ? `Misses ${missed.length} must-have${missed.length === 1 ? "" : "s"}` : keeps,
    fit,
    reason:
      missed.length > 0
        ? `Fits everything except: ${missed.map((r) => r.requirement).join("; ")}.`
        : tradeoffs.length > 0
          ? `${keeps}. The trade-off: ${tradeoffs.map((r) => r.detail.charAt(0).toLowerCase() + r.detail.slice(1)).join("; ")}.${unconfirmed}`
          : `${keeps}${unchecked.length > 0 ? "." : ", with nothing traded off."}${unconfirmed}`,
  };
}

export function campsiteTitle(site: Campsite): string {
  return `${site.campgroundName}, ${site.siteName}`;
}

/** The must-haves a held campsite satisfies — why it was chosen, for the
 * Review screen (PRD v3 §6 "characteristics relevant to the user's request"). */
export function campsiteCharacteristicTags(result: EvaluationResult, campsiteId: string): string[] {
  const candidate = result.candidates.find((c) => c.campsite.id === campsiteId);
  if (!candidate) return [];
  return candidate.checks.filter((c) => c.tier === "hard" && c.status === "satisfied").map((c) => c.label);
}
