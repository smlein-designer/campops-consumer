import { cn } from "@/lib/utils";

export type FitRowState = "kept" | "tradeoff" | "missed";

// Figma node 29:60: a 20px round tinted icon, then the requirement and its
// detail. Kept is green; a trade-off or a missed must-have is ember.
const fitIcon: Record<FitRowState, string> = { kept: "✓", tradeoff: "~", missed: "✕" };
const fitIconClasses: Record<FitRowState, string> = {
  kept: "bg-[var(--color-bg-held)] text-[var(--color-text-held)]",
  tradeoff: "bg-[var(--color-bg-attention-strong)] text-[var(--color-text-attention)]",
  missed: "bg-[var(--color-bg-attention-strong)] text-[var(--color-text-attention)]",
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
    <div className="flex w-full items-start gap-2.5">
      <span
        aria-hidden
        className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-label-s", fitIconClasses[state])}
      >
        {fitIcon[state]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label-s text-[var(--color-text-primary)]">
          <span className="sr-only">{state === "kept" ? "Kept: " : state === "missed" ? "Missed: " : "Trade-off: "}</span>
          {requirement}
        </p>
        <p className="text-caption text-[var(--color-text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
