import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "@/components/v3/button";
import { StatusBadge } from "@/components/v3/status-badge";
import { FitRow, type FitRowState } from "@/components/v3/fit-row";

export function CampsiteOption({
  state,
  eyebrow,
  title,
  facts,
  badge,
  fit,
  reason,
  actions,
}: {
  state: "recommended" | "alternative" | "unavailable" | "closest";
  eyebrow: string;
  title: string;
  facts: string[];
  badge?: string;
  fit: { state: FitRowState; requirement: string; detail: string }[];
  reason: string;
  actions?: { label: string; onClick?: () => void; variant?: ButtonVariant }[];
}) {
  // Unavailable strikes through the title (Handoff Spec §3).
  const isUnavailable = state === "unavailable";
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border bg-[var(--color-bg-surface)] p-4",
        state === "recommended" ? "border-[var(--color-border-attention-strong)]" : "border-[var(--color-border-default)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-overline text-[var(--color-text-tertiary)]">{eyebrow}</p>
          <p
            className={cn(
              "text-heading-s text-[var(--color-text-primary)]",
              isUnavailable && "line-through opacity-60",
            )}
          >
            {title}
          </p>
          <p className="text-body-s text-[var(--color-text-secondary)]">{facts.join(" · ")}</p>
        </div>
        {badge && <StatusBadge status="info" label={badge} />}
      </div>
      <div className="space-y-1">
        {fit.map((row) => (
          <FitRow key={row.requirement} {...row} />
        ))}
      </div>
      <p className="text-body-s text-[var(--color-text-secondary)]">{reason}</p>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "secondary"}
              label={action.label}
              onClick={action.onClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
