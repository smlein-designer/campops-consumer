"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/campops/badge";
import { SummaryRow } from "@/components/campops/summary-row";
import { text } from "@/lib/typography";
import { nonRefundableAfter } from "@/lib/reservation";
import type { Reservation } from "@/lib/schemas";

/**
 * The reservation flow (Figma "Staging and Authorization" page), one screen
 * per `reservation.status`:
 *   staged                  → Reservation Review (8:258 / 11:14)
 *   adding_payment          → Add payment (2065:14217 / 2065:14241)
 *   ready_for_authorization → Confirm your reservation (2065:14093 / 2065:14013)
 *   authorizing             → Processing payment (2065:14162 / 2065:14637)
 *   reserved                → Booking confirmed (32:129 / 33:162)
 *
 * Every reservation arriving here is already complete apart from payment —
 * dates and party size are resolved in the conversation before staging — so
 * this flow never asks for trip information and has no missing-info state.
 * The legacy Missing Info frames (35:237 / 36:274) are not part of it.
 *
 * Responsive: one column at every width — 560px at `lg`+, 24px gutters
 * below; action rows stack primary-first on mobile.
 */
export function ReservationReview({
  reservation,
  onAddPaymentMethod,
  onCancelAddPayment,
  onSavePaymentMethod,
  onContinueToConfirmation,
  onCancelConfirmation,
  onAuthorize,
  onEditReservation,
  onCancelReservation,
}: {
  reservation: Reservation;
  onAddPaymentMethod: () => void;
  onCancelAddPayment: () => void;
  onSavePaymentMethod: (label: string) => void;
  onContinueToConfirmation: () => void;
  onCancelConfirmation: () => void;
  onAuthorize: () => void;
  onEditReservation: () => void;
  onCancelReservation: () => void;
}) {
  const { campsite, status } = reservation;
  const total = `$${reservation.total.toFixed(2)}`;
  const siteLabel = `${campsite.siteName} · ${campsite.campgroundName}`;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each step is a new screen: start it at the top and move focus to its
  // heading so screen readers announce where the user now is.
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [status]);

  const heading = (label: string) => (
    <h1 ref={headingRef} tabIndex={-1} className={`${text.displayH3} text-foreground outline-none`}>
      {label}
    </h1>
  );

  const cancelReservation = (
    <CancelReservation
      siteName={campsite.siteName}
      campgroundName={campsite.campgroundName}
      onConfirm={onCancelReservation}
    />
  );

  const priceRows = (totalLabel: string) => (
    <>
      <SummaryRow label="Dates" value={reservation.dates} />
      <SummaryRow label="Guests" value={String(reservation.guestCount)} />
      <SummaryRow label="Site type" value={campsite.siteType} />
      <SummaryRow
        label="Nightly rate"
        value={`$${reservation.nightlyRate.toFixed(2)} × ${reservation.nights} night${reservation.nights === 1 ? "" : "s"}`}
      />
      <SummaryRow label="Service fee" value={`$${reservation.serviceFee.toFixed(2)}`} />
      <div className="h-px w-full bg-border" />
      <SummaryRow label={totalLabel} value={total} />
    </>
  );

  if (status === "reserved") {
    return (
      <Page campgroundName={campsite.campgroundName}>
        <div className="flex w-full flex-col items-start gap-2 lg:flex-row lg:items-center lg:justify-between">
          {heading("You’re all set")}
          <Badge label="Reserved" severity="ready" />
        </div>
        <p className={`${text.bodySm} text-muted-foreground`}>
          Your reservation is confirmed and your payment method was charged {total}. A confirmation email is on its
          way.
        </p>
        <Card title={siteLabel}>
          <SummaryRow label="Confirmation number" value={reservation.confirmationNumber ?? ""} />
          <SummaryRow label="Dates" value={reservation.dates} />
          <SummaryRow label="Guests" value={String(reservation.guestCount)} />
          <SummaryRow label="Amount charged" value={total} />
          <SummaryRow label="Payment method" value={reservation.paymentMethodLabel ?? ""} />
          <div className="h-px w-full bg-border" />
          <p className={`${text.bodySm} text-muted-foreground`}>{reservation.cancellationPolicy}</p>
        </Card>
      </Page>
    );
  }

  if (status === "authorizing") {
    return (
      <Page campgroundName={campsite.campgroundName} busy>
        <div className="flex flex-col items-start gap-1">
          {heading("Processing payment")}
          <Badge label="Processing" severity="neutral" working />
        </div>
        <p className={`${text.bodySm} text-muted-foreground`}>
          We’re securely charging your card. This usually takes a few seconds. Please stay on this page until the
          confirmation appears.
        </p>
        <Card title="Payment in progress">
          <SummaryRow label="Payment method" value={reservation.paymentMethodLabel ?? ""} />
          <SummaryRow label="Amount" value={total} />
          <SummaryRow label="Reservation" value={siteLabel} />
          <SummaryRow label="Dates" value={reservation.dates} />
          <SummaryRow label="Guests" value={String(reservation.guestCount)} />
          <div className="h-px w-full bg-border" />
          <p className={`${text.bodySm} text-muted-foreground`}>
            Do not close this window or refresh your browser. We’ll automatically redirect you to the confirmation
            page once the payment is complete.
          </p>
        </Card>
        <div className="flex w-full lg:justify-end">
          <Button variant="outline" disabled className="w-full lg:w-auto">
            <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
            Processing payment…
          </Button>
        </div>
        <div className="flex w-full items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className={`${text.bodySm} text-muted-foreground`}>
            Nothing is booked until the payment completes.
          </p>
        </div>
      </Page>
    );
  }

  if (status === "ready_for_authorization") {
    return (
      <Page campgroundName={campsite.campgroundName}>
        {heading("Confirm your reservation")}
        <p className={`${text.bodyBase} text-card-foreground`}>
          You’re about to reserve {campsite.siteName} at {campsite.campgroundName} for {reservation.checkIn} –{" "}
          {reservation.checkOut}. This will charge your saved payment method {total} now.
        </p>
        <Card title={siteLabel}>
          {priceRows("Total due today")}
          <SummaryRow label="Payment" value={reservation.paymentMethodLabel ?? ""} />
          <p className={`${text.labelSm} text-destructive`}>
            Non-refundable after {nonRefundableAfter(reservation)}. This action cannot be undone once authorized.
          </p>
        </Card>
        <Actions
          secondary={
            <Button variant="outline" className="w-full lg:w-auto" onClick={onCancelConfirmation}>
              Cancel
            </Button>
          }
          primary={
            <Button className="w-full lg:w-auto" onClick={onAuthorize}>
              Reserve {campsite.siteName} — {total}
            </Button>
          }
        />
        {/* Mobile frame only (2065:14013). */}
        <div className="lg:hidden">{cancelReservation}</div>
      </Page>
    );
  }

  if (status === "adding_payment") {
    return (
      <Page campgroundName={campsite.campgroundName}>
        {heading("Enter your payment method")}
        <p className={`${text.bodySm} text-muted-foreground`}>Choose how you’d like to pay for your reservation.</p>
        <PaymentForm
          cancellationPolicy={reservation.cancellationPolicy}
          onCancel={onCancelAddPayment}
          onSave={onSavePaymentMethod}
        />
      </Page>
    );
  }

  // staged — Reservation Review.
  const hasPayment = !!reservation.paymentMethodLabel;
  return (
    <Page campgroundName={campsite.campgroundName}>
      <div className="flex w-full flex-col items-start gap-2 lg:flex-row lg:items-center lg:justify-between">
        {heading("Review your reservation")}
        <Badge label="Staged · Not yet booked" severity="neutral" />
      </div>
      <p className={`${text.bodySm} text-muted-foreground`}>
        No payment has been made and nothing has been booked yet.
      </p>
      <Card title={siteLabel}>
        {priceRows("Total due today if authorized")}
        <p className={`${text.bodySm} text-muted-foreground`}>{reservation.cancellationPolicy}</p>
      </Card>
      <Actions
        secondary={
          // Trip details are edited in the conversation, not here: this
          // returns there with the trip and search intact.
          <Button variant="outline" className="w-full lg:w-auto" onClick={onEditReservation}>
            Edit reservation
          </Button>
        }
        primary={
          // Payment is a prerequisite resolved before confirmation — never
          // an error discovered by attempting the reservation.
          hasPayment ? (
            <Button className="w-full lg:w-auto" onClick={onContinueToConfirmation}>
              Continue to confirm
            </Button>
          ) : (
            <Button className="w-full lg:w-auto" onClick={onAddPaymentMethod}>
              Add payment method
            </Button>
          )
        }
      />
      {cancelReservation}
    </Page>
  );
}

function Page({ campgroundName, busy = false, children }: { campgroundName: string; busy?: boolean; children: ReactNode }) {
  return (
    <div
      aria-busy={busy || undefined}
      className="mx-auto flex w-full max-w-[560px] flex-col items-start gap-6 px-6 pt-8 pb-12 lg:px-0"
    >
      <p className={`${text.bodySm} text-muted-foreground`}>Your trip · {campgroundName}</p>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-start gap-4 rounded-md border border-border bg-card p-6 max-lg:px-4">
      <p className={`${text.labelLg} text-card-foreground`}>{title}</p>
      {children}
    </div>
  );
}

/** Desktop: secondary left, primary right. Mobile: stacked, primary first. */
function Actions({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return (
    <div className="flex w-full flex-col-reverse gap-3 lg:flex-row lg:items-center lg:gap-2">
      {secondary}
      <div className="hidden flex-1 lg:block" />
      {primary}
    </div>
  );
}

/** Cancel reservation + its confirmation (Figma 34:193 dialog / 34:225
 * sheet): a centered dialog on desktop, a bottom sheet on mobile. Nothing has
 * been charged at any step that shows this control. */
function CancelReservation({
  siteName,
  campgroundName,
  onConfirm,
}: {
  siteName: string;
  campgroundName: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${text.labelSm} cursor-pointer rounded-sm text-destructive outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring`}
      >
        Cancel reservation
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-[440px] gap-4 rounded-md p-6 max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-w-full max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-xl max-lg:rounded-b-none max-lg:pt-4 max-lg:pb-[calc(1.5rem+var(--safe-bottom,0px))] lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2"
        >
          {/* Drag handle — decorative, mobile sheet only. */}
          <div className="mx-auto h-1 w-9 shrink-0 rounded-full bg-muted-foreground lg:hidden" />
          <DialogTitle className={`${text.displayH3} text-card-foreground`}>Cancel this reservation?</DialogTitle>
          <DialogDescription className={`${text.bodyBase} text-card-foreground`}>
            This will discard your staged reservation for {siteName} at {campgroundName}. Nothing has been charged, so
            there’s no cancellation fee, but you’ll need to start over if you change your mind.
          </DialogDescription>
          <div className="flex flex-col gap-3 lg:flex-row lg:justify-end">
            <Button variant="outline" className="w-full lg:w-auto" onClick={() => setOpen(false)}>
              Keep reservation
            </Button>
            <Button
              variant="destructive"
              className="w-full lg:w-auto"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Cancel reservation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type PaymentChoice = "card" | "google" | "apple";
type CardFields = { number: string; name: string; expiry: string; cvc: string };
type CardErrors = Partial<Record<keyof CardFields, string>>;

const EMPTY_CARD: CardFields = { number: "", name: "", expiry: "", cvc: "" };
// Clearly-labelled demo values, filled in visibly by "Use a demo card" —
// no real payment processing in this POC.
const DEMO_CARD: CardFields = { number: "4242 4242 4242 4471", name: "Demo Camper", expiry: "12 / 29", cvc: "123" };

const inputClass = `${text.bodySm} h-9 w-full min-w-0 rounded-md border border-border bg-card px-2 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive`;

/** Format checks only — enough to never treat an empty or partial form as a
 * card. (Mock payments: nothing is ever charged.) */
function validateCard(card: CardFields): CardErrors {
  const errors: CardErrors = {};
  const digits = card.number.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) errors.number = "Enter a card number.";
  if (!card.name.trim()) errors.name = "Enter the name on the card.";
  if (!/^\s*(0[1-9]|1[0-2])\s*\/\s*\d{2}\s*$/.test(card.expiry)) errors.expiry = "Use MM / YY.";
  if (!/^\s*\d{3,4}\s*$/.test(card.cvc)) errors.cvc = "Enter the 3–4 digit code.";
  return errors;
}

function cardLabel(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");
  const brand = digits[0] === "4" ? "Visa" : digits[0] === "5" ? "Mastercard" : digits[0] === "3" ? "Amex" : "Card";
  return `${brand} •••• ${digits.slice(-4)}`;
}

function PaymentForm({
  cancellationPolicy,
  onCancel,
  onSave,
}: {
  cancellationPolicy: string;
  onCancel: () => void;
  onSave: (label: string) => void;
}) {
  const [choice, setChoice] = useState<PaymentChoice>("card");
  const [card, setCard] = useState<CardFields>(EMPTY_CARD);
  const [errors, setErrors] = useState<CardErrors>({});
  const formRef = useRef<HTMLDivElement>(null);

  const update = (field: keyof CardFields) => (value: string) => {
    setCard((c) => ({ ...c, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Focus the first invalid field once its error state has rendered.
  useEffect(() => {
    if (Object.values(errors).some(Boolean)) {
      formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus();
    }
  }, [errors]);

  const save = () => {
    if (choice !== "card") return onSave(choice === "google" ? "Google Pay" : "Apple Pay");
    const found = validateCard(card);
    if (Object.keys(found).length === 0) return onSave(cardLabel(card.number));
    setErrors(found);
  };

  return (
    <>
      <div className="flex w-full flex-col items-start gap-4 rounded-md border border-border bg-card p-6">
        <fieldset className="flex w-full flex-col gap-2">
          <legend className={`${text.labelSm} mb-2 text-foreground`}>Payment method</legend>
          <PaymentOption value="card" choice={choice} onChoose={setChoice} label="Credit card" />
          <PaymentOption
            value="google"
            choice={choice}
            onChoose={setChoice}
            label="Google Pay"
            mark={<span className="bg-[#4285f4]">G</span>}
          />
          <PaymentOption
            value="apple"
            choice={choice}
            onChoose={setChoice}
            label="Apple Pay"
            mark={<span className="bg-black">A</span>}
          />
        </fieldset>
        {choice === "card" && (
          <div ref={formRef} className="flex w-full flex-col gap-2">
            <div className="flex w-full items-baseline justify-between gap-2">
              <p className={`${text.labelSm} text-foreground`}>Card details</p>
              {/* Demo control, styled like the conversation's "Simulate:"
                  link — fills the fields visibly rather than accepting an
                  empty form as a card. */}
              <button
                type="button"
                onClick={() => {
                  setCard(DEMO_CARD);
                  setErrors({});
                }}
                className={`${text.caption} cursor-pointer text-muted-foreground underline`}
              >
                Use a demo card
              </button>
            </div>
            <CardField
              label="Card number"
              value={card.number}
              onChange={update("number")}
              error={errors.number}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              brands
            />
            <div className="flex w-full flex-col gap-2 lg:flex-row">
              <CardField
                label="Name on card"
                value={card.name}
                onChange={update("name")}
                error={errors.name}
                autoComplete="cc-name"
                placeholder="Full name"
                className="min-w-0 flex-1"
              />
              <div className="flex gap-2">
                <CardField
                  label="Expiry"
                  value={card.expiry}
                  onChange={update("expiry")}
                  error={errors.expiry}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM / YY"
                  className="min-w-0 flex-1 lg:w-[120px] lg:flex-none"
                />
                <CardField
                  label="CVC"
                  value={card.cvc}
                  onChange={update("cvc")}
                  error={errors.cvc}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  className="min-w-0 flex-1 lg:w-[120px] lg:flex-none"
                />
              </div>
            </div>
          </div>
        )}
        <p className={`${text.bodySm} text-muted-foreground`}>{cancellationPolicy}</p>
      </div>
      <Actions
        secondary={
          <Button variant="outline" className="w-full lg:w-auto" onClick={onCancel}>
            Cancel
          </Button>
        }
        primary={
          <Button className="w-full lg:w-auto" onClick={save}>
            Save payment method
          </Button>
        }
      />
    </>
  );
}

function CardField({
  label,
  value,
  onChange,
  error,
  brands = false,
  className = "w-full",
  ...input
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  brands?: boolean;
  className?: string;
  inputMode?: "numeric";
  autoComplete: string;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className={`${text.bodySm} text-muted-foreground`}>
        {label}
      </label>
      <span className="relative flex w-full items-center">
        <input
          id={id}
          className={`${inputClass} ${brands ? "pr-24" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...input}
        />
        {brands && (
          <span className="pointer-events-none absolute right-2 flex gap-2" aria-hidden>
            <CardBrand className="bg-[#1a1f71]">VISA</CardBrand>
            <CardBrand className="bg-[#eb001b]">MC</CardBrand>
            <CardBrand className="bg-[#1e3d59]">AMEX</CardBrand>
          </span>
        )}
      </span>
      {error && (
        <p id={`${id}-error`} className={`${text.caption} text-destructive`}>
          {error}
        </p>
      )}
    </div>
  );
}

function PaymentOption({
  value,
  choice,
  onChoose,
  label,
  mark,
}: {
  value: PaymentChoice;
  choice: PaymentChoice;
  onChoose: (value: PaymentChoice) => void;
  label: string;
  mark?: ReactNode;
}) {
  const selected = value === choice;
  return (
    <label
      className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-border p-2 has-focus-visible:ring-3 has-focus-visible:ring-ring ${
        selected ? "bg-background" : "bg-card"
      }`}
    >
      <input
        type="radio"
        name="payment-method"
        value={value}
        checked={selected}
        onChange={() => onChoose(value)}
        className="size-5 shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-card outline-none checked:border-foreground checked:bg-foreground checked:shadow-[inset_0_0_0_5px_var(--card)]"
      />
      {mark && (
        <span
          aria-hidden
          className="flex size-6 items-center justify-center overflow-hidden rounded-full font-sans text-[12px] font-bold text-white [&>span]:flex [&>span]:size-full [&>span]:items-center [&>span]:justify-center"
        >
          {mark}
        </span>
      )}
      <span className={`${text.labelSm} text-foreground`}>{label}</span>
    </label>
  );
}

function CardBrand({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`flex h-4 w-6 items-center justify-center overflow-hidden rounded-[4px] font-sans text-[8px] leading-none font-bold text-white ${className}`}
    >
      {children}
    </span>
  );
}
