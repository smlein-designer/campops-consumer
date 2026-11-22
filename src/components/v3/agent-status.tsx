import { cn } from "@/lib/utils";
import { Button } from "@/components/v3/button";

export function AgentStatus({
  state,
  title,
  detail,
  onPause,
}: {
  state: "working" | "waiting";
  title: string;
  detail: string;
  onPause?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          state === "working" ? "bg-[var(--color-status-working)]" : "bg-[var(--color-status-attention)]",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-label-m text-[var(--color-text-primary)]">{title}</p>
        <p className="truncate text-body-s text-[var(--color-text-secondary)]">{detail}</p>
      </div>
      {state === "working" && onPause && <Button variant="ghost" label="Pause" onClick={onPause} />}
    </div>
  );
}
