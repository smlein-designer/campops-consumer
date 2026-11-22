import { cn } from "@/lib/utils";

export type PlanStepState = "active" | "pending" | "done";

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
    <div className="flex gap-3">
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-s",
          state === "done" && "bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)]",
          state === "active" &&
            "border-2 border-[var(--color-bg-brand)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
          state === "pending" && "bg-[var(--color-bg-subtle)] text-[var(--color-text-tertiary)]",
        )}
      >
        {state === "done" ? "✓" : index}
      </div>
      <div className="space-y-0.5 pb-2">
        <p
          className={cn(
            "text-label-m",
            state === "pending" ? "text-[var(--color-text-tertiary)]" : "text-[var(--color-text-primary)]",
          )}
        >
          {step}
        </p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
