"use client";

// Start · Empty (Figma node 5:64) — full-bleed photo, headline, one large
// input card, starter ideas, and a capability strip. Shared by the static
// reference screen (/trip/start) and the live app's empty state
// (/trip/live).
import { useState } from "react";
import { TopNav } from "@/components/v3/top-nav";
import { Button } from "@/components/v3/button";
import { photoSrc } from "@/lib/v3/photos";

const STARTERS = ["Dog-friendly lake weekend", "First camping trip with kids", "Dark skies for stargazing"];

const PLACEHOLDER_EXAMPLE =
  "A lake weekend in April for 4 adults and our dog, under 2 hours from Austin. We would love a boat and a beginner trail ride.";

const CAPABILITIES = [
  "Finds and compares sites",
  "Books boats, rides and guides",
  "Holds refundable bookings",
  "Always asks before charging",
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
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(10,18,13,0.35), rgba(10,18,13,0.15) 40%, rgba(10,18,13,0.6)), url(${photoSrc("hero")})`,
      }}
    >
      <TopNav theme="onPhoto" active="Trips" chargeStatus="Nothing charged yet" showChargeStatus={false} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 pb-20 text-center">
        <h1 className="max-w-4xl text-display-l text-white md:text-display-xl">Where do you want to wake up?</h1>
        <div className="rounded-lg bg-[rgba(10,18,13,0.45)] p-2">
          <p className="max-w-[620px] text-body-l text-[#f1eee5]">
            Describe the trip. CampOps finds the site, lines up the boat, the ride and the guide, and holds it all
            until you approve.
          </p>
        </div>
        <div className="flex w-full max-w-[760px] flex-col gap-4 rounded-3xl bg-white pt-5 pr-5 pb-4 pl-6 text-left shadow-[0px_24px_60px_0px_rgba(10,18,13,0.35)]">
          <textarea
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={PLACEHOLDER_EXAMPLE}
            rows={2}
            className="w-full resize-none bg-transparent text-body-l text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-4">
            <p className="text-body-s text-[var(--color-text-secondary)]">
              Nothing is booked or charged without your approval
            </p>
            <Button variant="primary" size="large" label={busy ? "Planning…" : "Plan my trip"} onClick={submit} disabled={busy} />
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-center gap-2.5">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => setValue(starter)}
              className="rounded-full border border-white/45 bg-[rgba(10,18,13,0.35)] px-4 py-2.5 text-label-m text-white hover:bg-[rgba(10,18,13,0.5)]"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-10 pb-10 text-body-s text-[#f1eee5]">
        {CAPABILITIES.map((capability) => (
          <p key={capability}>{capability}</p>
        ))}
      </div>
    </div>
  );
}
