import { text } from "@/lib/typography";

/**
 * Shared surface for clarification, unsupported-request, no-match and
 * availability-changed states (CampOps DS "Attention Card" — one variant;
 * the eyebrow text is what distinguishes the reason). All of these are
 * "the agent needs you" moments and get one calm, non-alarming treatment —
 * deliberately not error-colored, and deliberately the same component
 * regardless of which of the three reasons produced it.
 *
 * Action buttons are not part of this component — build them as siblings
 * below the instance, since labels/count vary per scenario.
 */
export function AttentionCard({
  eyebrow,
  body,
}: {
  eyebrow: string;
  body: string;
}) {
  return (
    <div className="flex w-[560px] max-w-full flex-col items-start gap-2 rounded-md border-l-4 border-earth bg-card px-6 py-4">
      <p className={`${text.labelOverline} text-earth`}>{eyebrow}</p>
      <p className={`${text.bodyBase} text-card-foreground`}>{body}</p>
    </div>
  );
}
