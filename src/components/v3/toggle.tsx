"use client";

import { cn } from "@/lib/utils";

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange?.(!on)}
      className={cn(
        "relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors",
        // --color-bg-control-off: contrast fix over the default off-white (Handoff Spec 1.2, 7).
        on ? "bg-[var(--color-bg-brand)]" : "bg-[var(--color-bg-control-off)]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-[var(--white)] transition-transform",
          on ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
