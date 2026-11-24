"use client";

import { cn } from "@/lib/utils";

export function SegmentedControl({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange?.(option)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1.5 text-label-m whitespace-nowrap transition-colors",
            option === selected
              ? "bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-secondary)]",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
