import { cn } from "@/lib/utils";

export function ReviewLineItem({
  title,
  when,
  terms,
  flag,
  tags,
  amount,
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
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-label-s text-[var(--color-text-link)] hover:underline"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
