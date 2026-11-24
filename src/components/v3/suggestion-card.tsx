import { Button } from "@/components/v3/button";
import { StatusBadge } from "@/components/v3/status-badge";

// Figma node 3:51. The source ("Offered by Lakeshore Marina") is kept apart
// from the agent's own reason (Handoff Spec §3). At most one suggestion is
// visible, and dismissing it is one tap. The photo is hidden on mobile.
export function SuggestionCard({
  title,
  reason,
  source,
  photo,
  onAdd,
  addLabel = "Add to plan",
  onDismiss,
}: {
  title: string;
  reason: string;
  source: string;
  photo?: string;
  onAdd?: () => void;
  /** "Learn more" for an activity, which opens its times in place. */
  addLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
      {photo && (
        <div
          className="hidden h-28 w-full rounded-lg bg-[var(--color-bg-subtle)] bg-cover bg-center md:block"
          style={{ backgroundImage: `url(${photo})` }}
        />
      )}
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status="info" label="Optional add-on" />
        <p className="pt-1 text-caption text-[var(--color-text-tertiary)]">{source}</p>
        <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{reason}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" label={addLabel} onClick={onAdd} />
        <Button variant="ghost" label="No thanks" onClick={onDismiss} />
      </div>
    </div>
  );
}
