import { Button } from "@/components/v3/button";

// Always says nothing is charged until approval (Handoff Spec §5); callers
// supply that wording in `summary`. Figma node 3:85.
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
    <div className="flex h-[72px] items-center justify-between rounded-xl bg-[var(--color-bg-inverse)] py-3 pr-4 pl-6">
      <div className="flex items-baseline gap-3">
        <p className="text-price-l text-[var(--color-text-on-inverse)]">{amount}</p>
        <p className="text-body-s text-[var(--color-text-on-inverse)] opacity-80">{summary}</p>
      </div>
      <Button variant="inverse" label="Review and approve" onClick={onReview} />
    </div>
  );
}
