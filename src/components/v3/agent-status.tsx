import { cn } from "@/lib/utils";
import { Button } from "@/components/v3/button";

// Figma node 16:98 — a flush bar at the top of the conversation rail/sheet,
// not a floating card.
export function AgentStatus({
  state,
  title,
  detail,
  onPause,
  onResume,
}: {
  state: "working" | "waiting" | "paused";
  title: string;
  detail: string;
  onPause?: () => void;
  onResume?: () => void;
}) {
  return (
    <div
      className="flex h-16 w-full min-w-0 items-center justify-between border-b border-[var(--color-border-default)] px-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            state === "working" && "bg-[var(--color-status-working)]",
            state === "waiting" && "bg-[var(--color-status-attention)]",
            state === "paused" && "bg-[var(--stone-600)]",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-label-m text-[var(--color-text-primary)]">{title}</p>
          <p className="truncate text-caption text-[var(--color-text-secondary)]">{detail}</p>
        </div>
      </div>
      {state === "working" && onPause && <Button variant="secondary" label="Pause" onClick={onPause} />}
      {state === "paused" && onResume && <Button variant="secondary" label="Resume" onClick={onResume} />}
    </div>
  );
}
