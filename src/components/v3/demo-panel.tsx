"use client";

import { useState } from "react";
import { Button } from "@/components/v3/button";

/**
 * Hidden demo control panel (Build Brief §11): fire each scripted event now,
 * and reset to a clean trip — without code changes. Collapsed by default
 * behind a small toggle so it never shows up in a plain screenshot of the
 * product.
 */
export function DemoPanel({
  onFireForecast,
  onFireHoldExpiry,
  onFireCampsiteUnavailable,
  onReset,
}: {
  onFireForecast: () => void;
  onFireHoldExpiry: () => void;
  onFireCampsiteUnavailable: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open demo panel"
        className="fixed right-4 bottom-40 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-label-m shadow-lg md:bottom-4"
      >
        ⚙
      </button>
    );
  }

  return (
    <div className="fixed right-4 bottom-40 z-20 w-64 space-y-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 shadow-lg md:bottom-4">
      <div className="flex items-center justify-between">
        <p className="text-label-m text-[var(--color-text-primary)]">Demo panel</p>
        <button type="button" onClick={() => setOpen(false)} className="text-caption text-[var(--color-text-tertiary)]">
          Close
        </button>
      </div>
      <Button variant="secondary" label="Fire forecast change" onClick={onFireForecast} className="w-full" />
      <Button variant="secondary" label="Fire hold expiry" onClick={onFireHoldExpiry} className="w-full" />
      <Button variant="secondary" label="Fire campsite unavailable" onClick={onFireCampsiteUnavailable} className="w-full" />
      <Button variant="ghost" label="Reset trip" onClick={onReset} className="w-full" />
    </div>
  );
}
