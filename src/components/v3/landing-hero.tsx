"use client";

// Start · Empty (Handoff Spec §4.1 node 5:64) — full-bleed photo, headline,
// one large input, starter ideas. Shared by the static reference screen
// (/trip/start) and the live app's empty state (/trip/live), so the real
// product actually uses the designed landing page instead of a bare
// composer.
import { useState } from "react";
import { TopNav } from "@/components/v3/top-nav";
import { Button } from "@/components/v3/button";
import { photoSrc } from "@/lib/v3/photos";

const STARTERS = [
  "A lakeside weekend near Austin with my dog",
  "A trip with a trail ride and a guided hike",
  "Somewhere waterfront under $90 a night",
];

export function LandingHero({
  onSubmit,
  busy = false,
}: {
  onSubmit?: (message: string) => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (!value.trim() || busy) return;
    onSubmit?.(value);
    setValue("");
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-cover bg-center"
      style={{ backgroundImage: `linear-gradient(to bottom, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.55)), url(${photoSrc("hero")})` }}
    >
      <TopNav theme="onPhoto" active="Trips" chargeStatus="Nothing charged yet" />
      <div className="flex flex-1 flex-col items-start justify-center gap-6 px-8 pb-24 md:px-16">
        <h1 className="max-w-2xl text-display-l text-white md:text-display-xl">
          Your next campsite, without the search grind
        </h1>
        <p className="max-w-xl text-body-l text-white/85">
          Tell CampOps about your trip — dates, dealbreakers, tradeoffs you&apos;re willing to make — and let it find
          the fit.
        </p>
        <div className="flex w-full max-w-xl items-center gap-2 rounded-full bg-white p-2">
          <input
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Tell CampOps about your trip..."
            className="min-w-0 flex-1 bg-transparent px-3 text-body-l text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-60"
          />
          <Button variant="primary" label={busy ? "Working…" : "Send"} onClick={submit} disabled={busy} />
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => setValue(starter)}
              className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-label-s text-white backdrop-blur-sm hover:bg-white/20"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
