import { cn } from "@/lib/utils";

export type FitRowState = "kept" | "tradeoff" | "missed";

const fitIcon: Record<FitRowState, string> = { kept: "✓", tradeoff: "~", missed: "✕" };
const fitColor: Record<FitRowState, string> = {
  kept: "text-[var(--color-status-working)]",
  tradeoff: "text-[var(--color-text-tertiary)]",
  // Missed is reserved for must-haves; a worse nice-to-have is a Tradeoff,
  // never Missed (Handoff Spec §3) — callers decide which state applies.
  missed: "text-[var(--color-status-attention)]",
};

export function FitRow({
  state,
  requirement,
  detail,
}: {
  state: FitRowState;
  requirement: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={cn("w-4 shrink-0 text-label-m", fitColor[state])}>{fitIcon[state]}</span>
      <div className="min-w-0">
        <p className="text-label-m text-[var(--color-text-primary)]">{requirement}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
