export function SelectField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange?: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 py-2 text-label-m text-[var(--color-text-primary)]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
