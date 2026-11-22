import { Button } from "@/components/v3/button";
import { SheetHandle } from "@/components/v3/sheet-handle";

export function ConversationPeek({
  message,
  showApprove,
  onApprove,
}: {
  message: string;
  showApprove?: boolean;
  onApprove?: () => void;
}) {
  return (
    <div className="rounded-t-3xl border border-b-0 border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 pb-3">
      <SheetHandle />
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-body-m text-[var(--color-text-primary)]">{message}</p>
        {showApprove && <Button variant="primary" label="Review" onClick={onApprove} />}
      </div>
    </div>
  );
}
