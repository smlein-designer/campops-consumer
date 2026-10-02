import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";

export type BadgeSeverity = "blocking" | "advisory" | "ready" | "neutral";

const SEVERITY_STYLES: Record<BadgeSeverity, string> = {
  blocking: "border-destructive bg-destructive-soft text-destructive",
  advisory: "border-warning bg-warning-soft text-warning",
  ready: "border-success bg-success-soft text-success",
  neutral: "border-muted-foreground bg-muted text-muted-foreground",
};

const SEVERITY_ICONS: Record<BadgeSeverity, typeof CircleAlert | null> = {
  blocking: CircleAlert,
  advisory: TriangleAlert,
  ready: CircleCheck,
  neutral: null,
};

/**
 * Status indicator — CampOps DS "Badge (severity)" (Blocking / Advisory /
 * Ready / Neutral). Reserved for system/status meaning (Working, Needs
 * attention, Best match, Reserved…); descriptive metadata such as site type
 * or amenities uses `Pill` instead, so the two never read as the same kind
 * of signal. Label uses DS Label/Small. `working` shows the DS Spinner slot
 * (used only while a request is actually in flight).
 */
export function Badge({
  label,
  severity,
  working = false,
}: {
  label: string;
  severity: BadgeSeverity;
  working?: boolean;
}) {
  const Icon = SEVERITY_ICONS[severity];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-[0.5px] px-2 py-0.5 font-sans text-sm leading-[1.3] font-medium whitespace-nowrap ${SEVERITY_STYLES[severity]}`}
    >
      {working && (
        <LoaderCircle className="size-3 shrink-0 motion-safe:animate-spin" aria-hidden />
      )}
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {label}
    </span>
  );
}

/**
 * Plain descriptive pill (site type, amenities) — not a status signal.
 * `secondary` = filled earth tint (DS `secondary`), `outline` = card fill
 * with the DS `border` token.
 */
export function Pill({
  label,
  variant,
}: {
  label: string;
  variant: "secondary" | "outline";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-sans text-[12px] leading-4 font-semibold whitespace-nowrap ${
        variant === "secondary"
          ? "bg-secondary text-secondary-foreground"
          : "border border-border bg-card text-foreground"
      }`}
    >
      {label}
    </span>
  );
}
