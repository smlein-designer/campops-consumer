export function ActivityEntry({
  time,
  what,
  rule,
  actor,
}: {
  time: string;
  what: string;
  rule: string;
  actor: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <p className="w-16 shrink-0 text-caption text-[var(--color-text-tertiary)]">{time}</p>
      <div className="min-w-0 flex-1">
        <p className="text-body-s text-[var(--color-text-primary)]">{what}</p>
        <p className="text-caption text-[var(--color-text-tertiary)]">
          {rule} · {actor}
        </p>
      </div>
    </div>
  );
}
