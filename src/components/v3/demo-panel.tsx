"use client";

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/v3/button";

/** Why each scenario can't run on this trip yet, or null when it can. */
export type DemoBlockers = { forecast: string | null; holdExpiry: string | null; campsiteUnavailable: string | null };

const SCENARIOS = [
  {
    key: "forecast",
    label: "Weather moves an activity",
    description: "Storms arrive during a held activity. CampOps moves it to a clear time and asks for your OK.",
  },
  {
    key: "holdExpiry",
    label: "A hold runs out",
    description: "A hold expires. CampOps holds it again if your rules allow, or asks you.",
  },
  {
    key: "campsiteUnavailable",
    label: "Campsite taken by someone else",
    description: "Another camper books your site first. CampOps recommends a replacement and waits for your OK.",
  },
] as const;

/**
 * Demo control panel (Build Brief §11): start the Figma story's trip in one
 * tap, fire the outside events the designs show (weather, a hold running out,
 * a site taken by someone else), and reset — without code changes. Collapsed
 * behind a small "Demo" button so it stays out of product screenshots.
 */
export function DemoPanel({
  onStartDemoTrip,
  onFireForecast,
  onFireHoldExpiry,
  onFireCampsiteUnavailable,
  blockers,
  onReset,
}: {
  onStartDemoTrip: () => void;
  onFireForecast: () => void;
  onFireHoldExpiry: () => void;
  onFireCampsiteUnavailable: () => void;
  blockers: DemoBlockers;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = { forecast: onFireForecast, holdExpiry: onFireHoldExpiry, campsiteUnavailable: onFireCampsiteUnavailable };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open demo scenarios"
        className="fixed bottom-40 left-4 z-20 flex h-10 w-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-label-s text-[var(--color-text-primary)] shadow-lg md:bottom-28 md:w-auto md:px-3"
      >
        <FlaskConical size={16} aria-hidden />
        {/* Icon only on phones, where the corner is tight. */}
        <span className="hidden md:inline">Demo</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-40 left-4 z-20 max-h-[70vh] w-80 space-y-3 overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 shadow-lg md:bottom-28">
      <div className="flex items-center justify-between">
        <p className="text-label-l text-[var(--color-text-primary)]">Demo scenarios</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close demo scenarios" className="cursor-pointer text-[var(--color-text-secondary)]">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="space-y-1">
        <Button variant="primary" label="Start the demo trip" onClick={onStartDemoTrip} className="w-full" />
        <p className="text-caption text-[var(--color-text-secondary)]">
          Demo story: a lake weekend for 4 adults and a dog from Austin, with a boat, a trail ride and a guided hike. Replaces the current trip.
        </p>
      </div>

      <p className="pt-1 text-overline text-[var(--color-text-secondary)]">Things that happen to a trip</p>
      {SCENARIOS.map((s) => (
        <div key={s.key} className="space-y-1">
          <Button variant="secondary" label={s.label} onClick={run[s.key]} disabled={!!blockers[s.key]} className="w-full" />
          <p className="text-caption text-[var(--color-text-secondary)]">{blockers[s.key] ?? s.description}</p>
        </div>
      ))}

      <Button variant="ghost" label="Reset trip" onClick={onReset} className="w-full" />
    </div>
  );
}
