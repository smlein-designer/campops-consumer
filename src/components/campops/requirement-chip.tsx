import { X } from "lucide-react";
import { text } from "@/lib/typography";
import type { RequirementTier } from "@/lib/schemas";

export type { RequirementTier };

const TIER_STYLES: Record<RequirementTier, string> = {
  hard: "bg-earth text-primary-foreground",
  flexible: "bg-sky-tint text-water",
  preference: "bg-neutral-soft text-neutral-foreground",
  priority: "bg-water text-primary-foreground",
};

/**
 * Removable chip for a single trip requirement (Handoff Spec 2.4 / Figma DS
 * node 2056:135). Tier color meaning (Case Study Decision 13):
 * Hard = earth (non-negotiable) · Flexible = sky (can shift) ·
 * Preference = neutral (quietest tier) · Priority = water (requires weighing
 * a tradeoff).
 *
 * `onRemove` is optional so the same component can render non-interactively
 * inside Candidate Card's "Preserved"/"Compromise" rows (same visual tiers,
 * different semantic role — Handoff Spec 2.4).
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
      className={`flex items-center gap-1 rounded-full px-2 py-1 ${TIER_STYLES[tier]}`}
    >
      <span className={text.labelSm}>{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="flex size-[12px] shrink-0 items-center justify-center"
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
