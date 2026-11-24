import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const iconButton =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]";

export function ReviewLineItem({
  title,
  when,
  terms,
  flag,
  tags,
  amount,
  onEdit,
  onRemove,
  variant = "desktop",
}: {
  title: string;
  when: string;
  terms: string;
  flag?: string;
  /** Characteristics relevant to the user's request (PRD v3 §6) — e.g.
   * "Waterfront", "Dogs OK" — why this item was chosen, not just what it is. */
  tags?: string[];
  amount: string;
  /** Back to planning this item: a campsite's details, or an activity's time and group. */
  onEdit?: () => void;
  onRemove?: () => void;
  variant?: "desktop" | "mobile";
}) {
  return (
    <div
      className={cn(
        "flex gap-4 border-b border-[var(--color-border-default)] py-4",
        variant === "mobile" && "flex-col gap-2",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{when}</p>
        <p className="text-caption text-[var(--color-text-tertiary)]">{terms}</p>
        {tags && tags.length > 0 && (
          <p className="text-caption text-[var(--color-text-secondary)]">{tags.join(" · ")}</p>
        )}
        {/* Flag notes any change the agent made, e.g. "Moved from Saturday
            for weather. You kept Sunday." (Handoff Spec §4.1) */}
        {flag && <p className="text-caption text-[var(--color-text-link)]">{flag}</p>}
      </div>
      <div className={cn("flex shrink-0 items-start gap-3", variant === "mobile" && "justify-between")}>
        <p className="text-price-l text-[var(--color-text-primary)]">{amount}</p>
        {(onEdit || onRemove) && (
          <div className="flex gap-1">
            {onEdit && (
              <button type="button" onClick={onEdit} aria-label={`Change ${title}`} title="Change" className={iconButton}>
                <Pencil size={18} aria-hidden />
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} title="Remove" className={iconButton}>
                <Trash2 size={18} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
