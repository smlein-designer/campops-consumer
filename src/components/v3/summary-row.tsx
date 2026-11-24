export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <p className="text-body-s text-[var(--color-text-secondary)]">{label}</p>
      <p className="text-label-m text-[var(--color-text-primary)]">{value}</p>
    </div>
  );
}
