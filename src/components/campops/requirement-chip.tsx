import { X } from "lucide-react";
import { text } from "@/lib/typography";
import type { RequirementTier } from "@/lib/schemas";

export type { RequirementTier };

const TIER_STYLES: Record<RequirementTier, string> = {
  hard: "border-earth bg-earth-tint text-earth",
  flexible: "border-border bg-sky-tint text-water",
  preference: "border-border bg-neutral-soft text-foreground",
  priority: "border-water bg-water-tint text-water",
};

/**
 * Removable chip for a single trip requirement (CampOps DS "Requirement
 * Chip", Tier = Hard | Flexible | Preference | Priority — tinted fill,
 * 0.5px tier border, 12px radius). Tier color meaning (Case Study Decision 13):
 * Hard = earth (non-negotiable) · Flexible = sky (can shift) ·
 * Preference = neutral (quietest tier) · Priority = water (requires weighing
 * a tradeoff).
 *
 * `onRemove` is optional so the same component can also render
 * non-interactively — used inside Candidate Card's "Preserved"/"Compromise"
 * rows for chips that don't correspond to a literal, removable
 * `hardRequirements` entry (e.g. the synthetic "Capacity for N" check).
 * Chips there that DO correspond to a literal entry get a working
 * `onRemove` too, via the same removal path the Trip Panel's plain chip
 * list uses (design resolution, 2026-09-01 — see
 * docs/implementation-decisions.md) — this prop's optionality is what lets
 * one screen mix removable and non-removable chips side by side, not a
 * blanket "Candidate Card chips are display-only" rule.
 */
export function RequirementChip({
  label,
  tier,
  onRemove,
}: {
  label: string;
  tier: RequirementTier;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg border-[0.5px] px-2 py-1 ${TIER_STYLES[tier]}`}
    >
      <span className={text.labelSm}>{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="flex size-[12px] shrink-0 cursor-pointer items-center justify-center"
        >
          <X className="size-3" />
        </button>
      ) : (
        // Non-interactive tier icon: used inside Candidate Card's Preserved/
        // Compromise rows, which reuse the chip's visual but not its remove affordance.
        <X className="size-3 shrink-0" aria-hidden />
      )}
    </div>
  );
}
