import { RequirementChip } from "@/components/campops/requirement-chip";
import { getDerivedRequirements } from "@/lib/requirements";
import { text } from "@/lib/typography";
import type { RequirementTier, TripIntent } from "@/lib/schemas";

export const TIER_SECTIONS: {
  key: keyof TripIntent;
  label: string;
  tier: RequirementTier;
}[] = [
  { key: "hardRequirements", label: "Hard requirements", tier: "hard" },
  {
    key: "flexibleConstraints",
    label: "Flexible constraints",
    tier: "flexible",
  },
  { key: "preferences", label: "Preferences", tier: "preference" },
  { key: "priorities", label: "Priorities", tier: "priority" },
];

/**
 * The trip's editable Requirement Chip list, grouped by tier (Handoff Spec
 * 2.4/2.8's Trip Panel chip fallback). Rendered from exactly one component
 * regardless of which screen shows it — the desktop Trip Panel's persistent
 * chip fallback and the mobile Trip Details sheet both use this, rather
 * than each maintaining its own copy of the tier loop and remove wiring
 * (design resolution, 2026-09-01 — see docs/implementation-decisions.md:
 * "do not create separate chip-removal logic per screen").
 *
 * Trip Requirement Projection (2026-09-10 — see
 * docs/implementation-decisions.md): each tier section now also renders
 * `getDerivedRequirements`' structural entries (currently capacity and pet
 * count/eligibility) alongside the tier's literal array values — those two
 * facts are real evaluator-enforced hard constraints that never lived in
 * `hardRequirements` text to begin with (see that function's own doc
 * comment for why), so the panel previously showed only a subset of what
 * was actually active. Derived chips render with no `onRemove` — the same
 * "no removal path, not removable" treatment `RequirementChip` already
 * supports for the Candidate Card's synthetic checks — while literal
 * values keep their existing fully-removable behavior unchanged.
 */
export function TripRequirementsList({
  intent,
  onRemove,
}: {
  intent: TripIntent;
  onRemove: (key: keyof TripIntent, value: string) => void;
}) {
  const derived = getDerivedRequirements(intent);
  return (
    <div className="flex flex-col gap-6">
      {TIER_SECTIONS.map(({ key, label, tier }) => {
        const values = intent[key];
        const derivedForTier = derived.filter((d) => d.tier === tier);
        if (!Array.isArray(values)) return null;
        if (values.length === 0 && derivedForTier.length === 0) return null;
        return (
          <div key={key} className="flex flex-col gap-2">
            <span className={`${text.labelOverline} text-muted-foreground`}>
              {label}
            </span>
            <div className="flex flex-wrap gap-1">
              {derivedForTier.map((d) => (
                <RequirementChip key={d.label} label={d.label} tier={d.tier} />
              ))}
              {values.map((v) => (
                <RequirementChip
                  key={v}
                  label={v}
                  tier={tier}
                  onRemove={() => onRemove(key, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
