"use client";

import { useState } from "react";

export function ActivityLogRow({
  time,
  what,
  rule,
  actor,
  details,
}: {
  time: string;
  what: string;
  rule: string;
  actor: string;
  details?: { before?: string; after?: string; checked?: string; reason?: string };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-[var(--color-border-default)] py-3">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-start gap-3 text-left">
        <p className="w-16 shrink-0 text-caption text-[var(--color-text-tertiary)]">{time}</p>
        <div className="min-w-0 flex-1">
          <p className="text-body-s text-[var(--color-text-primary)]">{what}</p>
          <p className="text-caption text-[var(--color-text-tertiary)]">
            {rule} · {actor}
          </p>
        </div>
      </button>
      {expanded && details && (
        <div className="mt-2 ml-[76px] space-y-1 rounded-lg bg-[var(--color-bg-subtle)] p-3 text-caption text-[var(--color-text-secondary)]">
          {details.before && <p>Before: {details.before}</p>}
          {details.after && <p>After: {details.after}</p>}
          {details.checked && <p>Checked: {details.checked}</p>}
          {details.reason && <p>Reason: {details.reason}</p>}
        </div>
      )}
    </div>
  );
}
