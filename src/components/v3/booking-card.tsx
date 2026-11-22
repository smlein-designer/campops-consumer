import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/v3/status-badge";

export type BookingCardState = "held" | "needsOk" | "holdExpired" | "working" | "approved";

// Figma node 3:42. Needs OK gets a 2px ember border; every other state is
// borderless (the card's own white fill against the canvas is enough).
const stateBorder: Record<BookingCardState, string> = {
  held: "",
  needsOk: "border-2 border-[var(--color-border-attention-strong)]",
  holdExpired: "",
  working: "",
  approved: "",
};

const defaultStatus: Record<
  BookingCardState,
  { status: "held" | "needsOk" | "expired" | "working" | "approved"; label: string }
> = {
  held: { status: "held", label: "Held · free to cancel" },
  needsOk: { status: "needsOk", label: "Moved here · needs your OK" },
  holdExpired: { status: "expired", label: "Hold expired" },
  working: { status: "working", label: "Working" },
  // No timers or Release once approved (Handoff Spec §4.1 "Booking Confirmed").
  approved: { status: "approved", label: "Approved" },
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
  statusLabel,
  holdEndsAt,
  showPhoto = false,
  photo,
  onRelease,
}: {
  state: BookingCardState;
  kind: string;
  title: string;
  meta: string;
  /** Overrides the default status-badge copy, e.g. a non-refundable hold's own wording. */
  statusLabel?: string;
  holdEndsAt?: Date;
  showPhoto?: boolean;
  photo?: string;
  onRelease?: () => void;
}) {
  const badge = defaultStatus[state];
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl bg-[var(--color-bg-surface)]", stateBorder[state])}>
      {showPhoto && (
        <div
          className="h-20 w-full shrink-0 bg-[var(--color-bg-subtle)] bg-cover bg-center"
          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
        />
      )}
      <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
        <p className="text-caption text-[var(--color-text-secondary)]">{kind}</p>
        <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{meta}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
          <StatusBadge status={badge.status} label={statusLabel ?? badge.label} />
          {state === "held" && holdEndsAt && (
            <p
              className="text-label-s text-[var(--color-text-held)]"
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
    </div>
  );
}
