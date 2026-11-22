import { Button } from "@/components/v3/button";

// Always says nothing is charged until approval (Handoff Spec §5); callers
// supply that wording in `summary`.
export function ApproveBar({
  amount,
  summary,
  onReview,
}: {
  amount: string;
  summary: string;
  onReview?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--color-bg-inverse)] px-5 py-4">
      <div>
        <p className="text-label-l text-[var(--color-text-on-inverse)]">{amount}</p>
        <p className="text-caption text-[var(--color-text-on-inverse)] opacity-80">{summary}</p>
      </div>
      <Button variant="inverse" label="Review" onClick={onReview} />
    </div>
  );
}
