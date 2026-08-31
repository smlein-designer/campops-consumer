"use client";

import { forwardRef } from "react";
import { CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/typography";

/** Stable id so other UI (e.g. the No Match "Change a requirement" action) can focus the composer. */
export const COMPOSER_INPUT_ID = "campops-composer-input";

/**
 * Persistent input bar (Handoff Spec 2.2 / Figma DS node 2056:6).
 *
 * State rule: Send is the default; swap to Stop only while the agent is
 * actively processing. Never show both simultaneously.
 *
 * Send uses the default (44px) Button size, not "sm" — the Handoff Spec
 * text calls it "Send button (Primary, small)", but the live Figma render
 * (source of truth when the two disagree) shows it filling nearly the full
 * 52px composer bar height, matching the default size, not the ~28px small
 * one. Found during a live visual-fidelity check, 2026-09-01.
 *
 * `isWorking` and `disabled` are distinct signals, deliberately not
 * conflated: `isWorking` means "actively processing, showing Stop" (a state
 * the user can interrupt); `disabled` means "not accepting input right now
 * for another reason" (e.g. the search has been accepted or rejected) and
 * renders a plain disabled Send button — never Stop, since nothing is
 * actually running.
 *
 * The Stop control is rendered but not yet wired to a real in-flight-request
 * cancellation for this slice — see report for what "working" means here.
 *
 * `ref` (Persistent Composer Focus, 2026-09-09 — see
 * docs/implementation-decisions.md) forwards to the actual `<input>` DOM
 * node — the caller (page.tsx) uses this real ref, not
 * `document.getElementById`/`querySelector`, to restore focus after a
 * response arrives. Passing the SAME ref object to both places this
 * component is rendered (the landing screen and the active-conversation
 * view, mutually exclusive) lets React reattach it automatically across
 * that unmount/mount transition.
 */
export const Composer = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    isWorking: boolean;
    disabled?: boolean;
    placeholder?: string;
  }
>(function Composer(
  { value, onChange, onSubmit, isWorking, disabled = false, placeholder = "Tell CampOps about your trip..." },
  ref,
) {
  return (
    <form
      className="flex h-[52px] w-full items-center gap-2 rounded-lg border border-border bg-card py-2 pr-2 pl-4 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isWorking && !disabled && value.trim()) onSubmit();
      }}
    >
      <input
        ref={ref}
        id={COMPOSER_INPUT_ID}
        className={`${text.bodyBase} min-w-0 flex-1 bg-transparent text-card-foreground placeholder:text-muted-foreground focus:outline-none`}
        placeholder={placeholder}
        value={value}
        disabled={isWorking || disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {isWorking ? (
        <button
          type="button"
          aria-label="Stop"
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-destructive"
        >
          <CircleStop className="size-5" />
        </button>
      ) : (
        <Button type="submit" disabled={disabled || !value.trim()}>
          Send
        </Button>
      )}
    </form>
  );
});
