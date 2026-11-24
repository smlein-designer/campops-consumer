export function MobileHeader({
  backLabel,
  title,
  chargeStatus,
  onBack,
}: {
  backLabel: string;
  title: string;
  chargeStatus: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-3">
      <button type="button" onClick={onBack} className="text-label-m text-[var(--color-text-link)]">
        ← {backLabel}
      </button>
      <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
      <span className="text-caption text-[var(--color-text-tertiary)]">{chargeStatus}</span>
    </div>
  );
}
