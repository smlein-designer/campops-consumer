/**
 * Shared demo-card helpers (Build Brief §12 "keep the v2 demo card flow and
 * validation"). Extracted from the v2 Reservation Review so v3's Review and
 * Approve can reuse the exact same validation/labeling, not a second copy
 * that could quietly drift from it.
 */
export type CardFields = { number: string; name: string; expiry: string; cvc: string };
export type CardErrors = Partial<Record<keyof CardFields, string>>;

export const EMPTY_CARD: CardFields = { number: "", name: "", expiry: "", cvc: "" };
// Clearly-labelled demo values, filled in visibly by "Use a demo card" —
// no real payment processing in this POC.
export const DEMO_CARD: CardFields = { number: "4242 4242 4242 4471", name: "Demo Camper", expiry: "12 / 29", cvc: "123" };

/** Format checks only — enough to never treat an empty or partial form as a
 * card. (Mock payments: nothing is ever charged.) */
export function validateCard(card: CardFields): CardErrors {
  const errors: CardErrors = {};
  const digits = card.number.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) errors.number = "Enter a card number.";
  if (!card.name.trim()) errors.name = "Enter the name on the card.";
  if (!/^\s*(0[1-9]|1[0-2])\s*\/\s*\d{2}\s*$/.test(card.expiry)) errors.expiry = "Use MM / YY.";
  if (!/^\s*\d{3,4}\s*$/.test(card.cvc)) errors.cvc = "Enter the 3–4 digit code.";
  return errors;
}

export function cardLabel(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");
  const brand = digits[0] === "4" ? "Visa" : digits[0] === "5" ? "Mastercard" : digits[0] === "3" ? "Amex" : "Card";
  return `${brand} •••• ${digits.slice(-4)}`;
}
