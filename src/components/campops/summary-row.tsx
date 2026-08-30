import { text } from "@/lib/typography";

/**
 * Label + value line item for summary/detail lists (Handoff Spec 2.6 /
 * Figma DS node 2015:22). Used across Reservation Review, Authorize
 * Booking, and Booking Confirmed.
 *
 * `missing` renders the row inside the same destructive-soft/bordered
 * treatment the live Figma uses for its one modeled missing-field case
 * (Payment Method Row (Error), node 35:289) — label stays muted-foreground,
 * only the value turns destructive.
 */
export function SummaryRow({
  label,
  value,
  missing = false,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  const row = (
    <div className="flex h-6 w-full items-center justify-between gap-2">
      <p className={`${text.bodySm} min-w-0 flex-1 text-muted-foreground`}>
        {label}
      </p>
      <p
        className={`${text.labelSm} shrink-0 truncate text-right ${
          missing ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );

  if (!missing) return row;

  return (
    <div className="w-full rounded-sm border border-destructive bg-destructive-soft p-2">
      {row}
    </div>
  );
}
