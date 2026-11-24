"use client";

import { useState } from "react";
import { Button } from "@/components/v3/button";
import { ExpandablePhoto } from "@/components/v3/expandable-photo";
import { FilterChip } from "@/components/v3/filter-chip";
import type { ActivityParty } from "@/lib/v3/schemas";

type Day = { heading: string; times: { key: string; label: string }[] };

/** One "−  2  +" row for a count of people. */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const step = "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-default)] text-label-l text-[var(--color-text-primary)] disabled:opacity-35";
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-label-m text-[var(--color-text-primary)]">{label}</p>
      <div className="flex items-center gap-3">
        <button type="button" className={step} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          −
        </button>
        <span className="w-5 text-center text-label-l tabular-nums text-[var(--color-text-primary)]" aria-live="polite">
          {value}
        </span>
        <button type="button" className={step} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Picking an activity: which open time, and who from the trip is going. The
 * price follows the choice; nothing is held until the user confirms.
 */
export function ActivityChoice({
  eyebrow,
  title,
  subtitle,
  photo,
  days,
  initialKey,
  initialParty,
  maxAdults,
  maxChildren,
  maxTotal,
  roomNote,
  quote,
  warning,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  photo?: string;
  days: Day[];
  initialKey: string;
  initialParty: ActivityParty;
  maxAdults: number;
  maxChildren: number;
  /** The most people this booking can take. */
  maxTotal: number;
  roomNote?: string;
  quote: (party: ActivityParty) => { price: number; detail: string };
  /** e.g. an over-budget note for this price, or null. */
  warning?: (price: number) => string | null;
  confirmLabel: (price: number) => string;
  onConfirm: (key: string, party: ActivityParty) => void;
  cancelLabel: string;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [party, setParty] = useState(initialParty);
  const total = party.adults + party.children;
  const { price, detail } = quote(party);
  const note = warning?.(price);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-[var(--color-border-attention-strong)] bg-[var(--color-bg-surface)]">
      {photo && <ExpandablePhoto src={photo} alt={title} className="h-28" />}
      <div className="space-y-5 p-4 md:p-5">
        <div className="space-y-1">
          <p className="text-overline text-[var(--color-text-attention)]">{eyebrow}</p>
          <h3 className="text-heading-s text-[var(--color-text-primary)]">{title}</h3>
          <p className="text-body-s text-[var(--color-text-secondary)]">{subtitle}</p>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-overline text-[var(--color-text-secondary)]">Time</legend>
          {days.map((day) => (
            <div key={day.heading} className="space-y-2">
              <p className="text-caption text-[var(--color-text-tertiary)]">{day.heading}</p>
              <div className="flex flex-wrap gap-2">
                {day.times.map((time) => (
                  <FilterChip key={time.key} label={time.label} selected={time.key === key} onClick={() => setKey(time.key)} />
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-overline text-[var(--color-text-secondary)]">Who&apos;s going</legend>
          <Stepper
            label="Adults"
            value={party.adults}
            min={0}
            max={Math.min(maxAdults, maxTotal - party.children)}
            onChange={(adults) => setParty({ ...party, adults })}
          />
          {maxChildren > 0 && (
            <Stepper
              label="Kids"
              value={party.children}
              min={0}
              max={Math.min(maxChildren, maxTotal - party.adults)}
              onChange={(children) => setParty({ ...party, children })}
            />
          )}
          {roomNote && <p className="text-caption text-[var(--color-text-secondary)]">{roomNote}</p>}
        </fieldset>

        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-border-default)] pt-4">
          <p className="text-body-s text-[var(--color-text-secondary)]">{detail}</p>
          <p className="text-heading-s tabular-nums text-[var(--color-text-primary)]">${price}</p>
        </div>
        {note && <p className="text-body-s text-[var(--color-text-attention)]">{note}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" label={confirmLabel(price)} onClick={() => onConfirm(key, party)} disabled={total < 1} />
          <Button variant="ghost" label={cancelLabel} onClick={onCancel} />
        </div>
      </div>
    </div>
  );
}
