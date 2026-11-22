import { Button } from "@/components/v3/button";

// Source kept apart from the agent's reason (Handoff Spec §3) — the two
// read as separate lines, never merged into one sentence. At most one
// suggestion visible, and dismissing it is one tap.
export function SuggestionCard({
  title,
  reason,
  source,
  photo,
  onAdd,
  onDismiss,
}: {
  title: string;
  reason: string;
  source: string;
  photo?: string;
  onAdd?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
      {photo && (
        <div
          className="h-16 w-16 shrink-0 rounded-lg bg-[var(--color-bg-subtle)] bg-cover bg-center"
          style={{ backgroundImage: `url(${photo})` }}
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{reason}</p>
        <p className="text-caption text-[var(--color-text-tertiary)]">{source}</p>
        <div className="flex gap-2 pt-1">
          <Button variant="primary" label="Add" onClick={onAdd} />
          <Button variant="ghost" label="No thanks" onClick={onDismiss} />
        </div>
      </div>
    </div>
  );
}
