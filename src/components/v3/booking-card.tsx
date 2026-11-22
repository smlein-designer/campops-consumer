import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/v3/status-badge";

export type BookingCardState = "held" | "needsOk" | "holdExpired" | "working";

const stateBorder: Record<BookingCardState, string> = {
  held: "border-[var(--color-border-default)]",
  needsOk: "border-[var(--color-border-attention-strong)]",
  holdExpired: "border-[var(--color-border-default)]",
  working: "border-[var(--color-border-default)]",
};

const stateBadge: Record<BookingCardState, { status: "held" | "needsOk" | "expired" | "working"; label: string }> = {
  held: { status: "held", label: "Held" },
  needsOk: { status: "needsOk", label: "Needs OK" },
  holdExpired: { status: "expired", label: "Hold expired" },
  working: { status: "working", label: "Working" },
};

// Static formatting for the gallery; the live, ticking version is wired to
// the shared clock in the Data/store stage (Build Brief §7 "a single clock
// drives every countdown").
function formatCountdown(holdEndsAt: Date) {
  const ms = holdEndsAt.getTime() - Date.now();
  if (ms <= 0) return "0:00 left";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")} left`;
}

export function BookingCard({
  state,
  kind,
  title,
  meta,
  holdEndsAt,
  showPhoto = false,
  onRelease,
}: {
  state: BookingCardState;
  kind: string;
  title: string;
  meta: string;
  holdEndsAt?: Date;
  showPhoto?: boolean;
  onRelease?: () => void;
}) {
  const badge = stateBadge[state];
  return (
    <div className={cn("flex gap-3 rounded-xl border bg-[var(--color-bg-surface)] p-4", stateBorder[state])}>
      {showPhoto && <div className="h-16 w-16 shrink-0 rounded-lg bg-[var(--color-bg-subtle)]" />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-overline text-[var(--color-text-tertiary)]">{kind}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
          <StatusBadge status={badge.status} label={badge.label} />
        </div>
        <p className="text-body-s text-[var(--color-text-secondary)]">{meta}</p>
        {state === "held" && holdEndsAt && (
          <p
            className="text-caption text-[var(--color-text-held)]"
            aria-label={`Hold ends in ${formatCountdown(holdEndsAt)}`}
          >
            {formatCountdown(holdEndsAt)}
          </p>
        )}
        {state === "held" && onRelease && (
          <button
            type="button"
            onClick={onRelease}
            className="text-label-s text-[var(--color-text-link)] underline-offset-2 hover:underline"
          >
            Release
          </button>
        )}
      </div>
    </div>
  );
}
