import { RequirementChip } from "@/components/campops/requirement-chip";
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
 */
export function TripRequirementsList({
  intent,
  onRemove,
}: {
  intent: TripIntent;
  onRemove: (key: keyof TripIntent, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {TIER_SECTIONS.map(({ key, label, tier }) => {
        const values = intent[key];
        if (!Array.isArray(values) || values.length === 0) return null;
        return (
          <div key={key} className="flex flex-col gap-2">
            <span className={`${text.labelOverline} text-muted-foreground`}>
              {label}
            </span>
            <div className="flex flex-wrap gap-1">
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
