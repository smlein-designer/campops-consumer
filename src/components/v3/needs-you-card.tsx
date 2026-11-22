import { Button } from "@/components/v3/button";

// Decisions only — at most one on screen at a time (the one-attention rule,
// Handoff Spec §2.3). Figma node 3:43: ember marks the container only
// (background, border, eyebrow) — the action button itself is Primary,
// since "ember is only for decisions, never decoration" extends to never
// using it as a loud CTA color either.
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
    <div className="flex flex-col items-start gap-3 rounded-xl bg-[var(--color-bg-attention)] p-4">
      <p className="text-overline text-[var(--color-text-attention)]">{eyebrow}</p>
      <p className="text-body-m text-[var(--color-text-primary)]">{message}</p>
      <div className="flex w-full gap-2">
        <Button className="flex-1" variant="primary" label={primary.label} onClick={primary.onClick} />
        {secondary && <Button className="flex-1" variant="secondary" label={secondary.label} onClick={secondary.onClick} />}
      </div>
    </div>
  );
}
