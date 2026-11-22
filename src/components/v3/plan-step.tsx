import { cn } from "@/lib/utils";

export type PlanStepState = "active" | "pending" | "done";

// Figma node 3:79: a 60px white card, rounded-xl, with a 28px number
// circle — not a borderless row. Active gets a 2px brand border.
export function PlanStep({
  index,
  step,
  detail,
  state,
}: {
  index: number;
  step: string;
  detail: string;
  state: PlanStepState;
}) {
  return (
    <div
      className={cn(
        "flex h-[60px] w-full items-center gap-3 rounded-xl bg-[var(--color-bg-surface)] px-4 py-3",
        state === "active" && "border-2 border-[var(--color-bg-brand)]",
      )}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-label-s",
          state === "pending"
            ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
            : "bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)]",
        )}
      >
        {state === "done" ? "✓" : index}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-label-l text-[var(--color-text-primary)]">{step}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
