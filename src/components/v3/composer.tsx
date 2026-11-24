"use client";

import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

// Figma node 3:80: a pill-shaped field plus a separate round Send button,
// not one combined control. Docked at the bottom of the conversation rail
// (desktop) or the conversation sheet (mobile).
export function Composer({
  placeholder = "Tell CampOps what to change",
  onSubmit,
}: {
  placeholder?: string;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!value.trim() || !onSubmit) return;
    onSubmit(value);
    setValue("");
    // v2's phone rule: on a touch keyboard, sending ends the typing so the
    // reply gets the screen; the keyboard returns only on a tap.
    if (window.matchMedia("(max-width: 767px), (pointer: coarse)").matches) inputRef.current?.blur();
  }

  return (
    <div className="flex h-12 w-full items-center gap-2">
      <div className="flex h-12 flex-1 items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-5">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-body-m text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
        />
      </div>
      <button
        type="button"
        onClick={submit}
        aria-label="Send"
        className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)] hover:opacity-90"
      >
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
