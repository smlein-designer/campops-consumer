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
        // Figma 9:63: 44 × 26.
        "relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors",
        // --color-bg-control-off: contrast fix over the default off-white (Handoff Spec 1.2, 7).
        on ? "bg-[var(--color-bg-brand)]" : "bg-[var(--color-bg-control-off)]",
      )}
    >
      <span
        className={cn(
          // Anchored to the left edge; without it the knob starts centred and
          // the "on" shift pushes it outside the track.
          "absolute top-0.5 left-0.5 h-[22px] w-[22px] rounded-full bg-[var(--white)] transition-transform motion-reduce:transition-none",
          on ? "translate-x-[18px]" : "translate-x-0",
        )}
      />
    </button>
  );
}
