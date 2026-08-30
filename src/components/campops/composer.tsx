"use client";

import { CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/typography";

/**
 * Persistent input bar (Handoff Spec 2.2 / Figma DS node 2056:6).
 *
 * State rule: Send is the default; swap to Stop only while the agent is
 * actively processing. Never show both simultaneously.
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
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  isWorking,
  disabled = false,
  placeholder = "Tell CampOps about your trip...",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isWorking: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <form
      className="flex h-[52px] w-full items-center gap-2 rounded-lg border border-border bg-card py-2 pr-2 pl-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isWorking && !disabled && value.trim()) onSubmit();
      }}
    >
      <input
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
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-destructive"
        >
          <CircleStop className="size-5" />
        </button>
      ) : (
        <Button type="submit" size="sm" disabled={disabled || !value.trim()}>
          Send
        </Button>
      )}
    </form>
  );
}
