"use client";

import { useState } from "react";
import { Button } from "@/components/v3/button";
import { cardLabel, DEMO_CARD, EMPTY_CARD, validateCard, type CardErrors, type CardFields } from "@/lib/payment-card";

/** Build Brief §12 "keep the v2 demo card flow and validation" — same
 * validation/labeling as v2's Reservation Review, a smaller form. */
export function PaymentForm({ onSave }: { onSave: (label: string) => void }) {
  const [card, setCard] = useState<CardFields>(EMPTY_CARD);
  const [errors, setErrors] = useState<CardErrors>({});

  function update(field: keyof CardFields) {
    return (value: string) => {
      setCard((c) => ({ ...c, [field]: value }));
      if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    };
  }

  function save() {
    const found = validateCard(card);
    if (Object.keys(found).length === 0) {
      onSave(cardLabel(card.number));
      return;
    }
    setErrors(found);
  }

  const inputClass =
    "rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 py-2 text-body-m text-[var(--color-text-primary)] outline-none aria-invalid:border-[var(--color-border-attention-strong)]";

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
      <p className="text-label-l text-[var(--color-text-primary)]">Payment method</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Card number"
          value={card.number}
          onChange={(e) => update("number")(e.target.value)}
          aria-invalid={!!errors.number}
          className={`col-span-2 ${inputClass}`}
        />
        {errors.number && <p className="col-span-2 text-caption text-[var(--color-status-attention)]">{errors.number}</p>}
        <input
          placeholder="Name on card"
          value={card.name}
          onChange={(e) => update("name")(e.target.value)}
          aria-invalid={!!errors.name}
          className={`col-span-2 ${inputClass}`}
        />
        {errors.name && <p className="col-span-2 text-caption text-[var(--color-status-attention)]">{errors.name}</p>}
        <input
          placeholder="MM / YY"
          value={card.expiry}
          onChange={(e) => update("expiry")(e.target.value)}
          aria-invalid={!!errors.expiry}
          className={inputClass}
        />
        <input
          placeholder="CVC"
          value={card.cvc}
          onChange={(e) => update("cvc")(e.target.value)}
          aria-invalid={!!errors.cvc}
          className={inputClass}
        />
        {(errors.expiry || errors.cvc) && (
          <p className="col-span-2 text-caption text-[var(--color-status-attention)]">{errors.expiry ?? errors.cvc}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" label="Use a demo card" onClick={() => setCard(DEMO_CARD)} />
        <Button variant="primary" label="Save card" onClick={save} />
      </div>
    </div>
  );
}
