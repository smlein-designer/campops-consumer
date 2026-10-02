import { text } from "@/lib/typography";

/**
 * Label + value line item for summary/detail lists (Handoff Spec 2.6 /
 * Figma DS node 2015:22). Used across the reservation flow.
 */
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-6 w-full items-center justify-between gap-2">
      <p className={`${text.bodySm} shrink-0 text-muted-foreground`}>{label}</p>
      <p className={`${text.labelSm} min-w-0 truncate text-right text-foreground`}>{value}</p>
    </div>
  );
}
