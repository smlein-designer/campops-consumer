import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "@/components/v3/button";
import { StatusBadge, type StatusBadgeStatus } from "@/components/v3/status-badge";
import { FitRow, type FitRowState } from "@/components/v3/fit-row";

export type CampsiteOptionState = "recommended" | "alternative" | "unavailable" | "closest";

/**
 * Figma node 29:217. The badge colour follows what the card is saying:
 * green for the agent's pick, blue for another good option, ember when a
 * must-have is missed or the site was lost.
 */
function badgeStatus(state: CampsiteOptionState, badge: string): StatusBadgeStatus {
  if (state === "unavailable" || /^Misses/.test(badge)) return "needsOk";
  return state === "recommended" ? "held" : "info";
}

export function CampsiteOption({
  state,
  eyebrow,
  title,
  facts,
  badge,
  fit,
  reason,
  actions,
  photo,
}: {
  state: CampsiteOptionState;
  eyebrow: string;
  title: string;
  facts: string[];
  badge?: string;
  fit: { state: FitRowState; requirement: string; detail: string }[];
  reason: string;
  actions?: { label: string; onClick?: () => void; variant?: ButtonVariant }[];
  photo?: string;
}) {
  const isUnavailable = state === "unavailable";
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-[var(--color-bg-surface)]",
        // Only the agent's pick carries a border, in brand green.
        state === "recommended" && "border-2 border-[var(--color-bg-brand)]",
      )}
    >
      {photo && (
        <div
          className={cn("h-[140px] w-full shrink-0 bg-[var(--color-bg-subtle)] bg-cover bg-center", isUnavailable && "opacity-45")}
          style={{ backgroundImage: `url(${photo})` }}
        />
      )}
      <div className="flex flex-col items-start gap-1.5 px-4 pt-3.5 pb-4">
        <p
          className={cn(
            "text-overline",
            state === "recommended" ? "text-[var(--color-text-held)]" : "text-[var(--color-text-secondary)]",
          )}
        >
          {eyebrow}
        </p>
        <p className={cn("text-heading-s text-[var(--color-text-primary)]", isUnavailable && "line-through")}>{title}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{facts.join(" · ")}</p>
        {badge && <StatusBadge status={badgeStatus(state, badge)} label={badge} />}
        {fit.length > 0 && (
          <div className="flex w-full flex-col gap-2 pt-2">
            {fit.map((row) => (
              <FitRow key={row.requirement} {...row} />
            ))}
          </div>
        )}
        {reason && <p className="text-body-s text-[var(--color-text-primary)]">{reason}</p>}
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1.5">
            {actions.map((action) => (
              <Button key={action.label} variant={action.variant ?? "secondary"} label={action.label} onClick={action.onClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
