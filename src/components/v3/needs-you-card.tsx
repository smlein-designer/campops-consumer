import { Button } from "@/components/v3/button";

// Decisions only — at most one on screen at a time (the one-attention rule,
// Handoff Spec §2.3).
export function NeedsYouCard({
  eyebrow,
  message,
  primary,
  secondary,
}: {
  eyebrow: string;
  message: string;
  primary: { label: string; onClick?: () => void };
  secondary?: { label: string; onClick?: () => void };
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border-attention)] bg-[var(--color-bg-attention)] p-4">
      <p className="text-overline text-[var(--color-text-attention)]">{eyebrow}</p>
      <p className="text-body-m text-[var(--color-text-primary)]">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="attention" label={primary.label} onClick={primary.onClick} />
        {secondary && <Button variant="secondary" label={secondary.label} onClick={secondary.onClick} />}
      </div>
    </div>
  );
}
