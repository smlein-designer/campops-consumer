import { Button } from "@/components/v3/button";
import { SheetHandle } from "@/components/v3/sheet-handle";

export function ConversationPeek({
  message,
  showApprove,
  onOpen,
}: {
  message: string;
  showApprove?: boolean;
  /** Tapping the peek (or dragging the handle) opens the full conversation as a sheet (Handoff Spec §2.2). */
  onOpen?: () => void;
}) {
  return (
    // A clickable div, not a <button>: it contains the Review button, and
    // interactive elements can't nest.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen?.()}
      className="w-full cursor-pointer rounded-t-3xl border border-b-0 border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 pb-3 text-left"
    >
      <SheetHandle />
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-body-m text-[var(--color-text-primary)]">{message}</p>
        {showApprove && <Button variant="primary" label="Review" />}
      </div>
    </div>
  );
}
