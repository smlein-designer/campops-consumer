import { text } from "@/lib/typography";
import type { EventActor } from "@/lib/schemas";

const ACTOR_LABEL: Record<EventActor, string> = {
  user: "You",
  agent: "CampOps",
  system: "CampOps",
};

/**
 * A single entry in the trip's activity log (Handoff Spec 2.8 / Figma DS
 * node 2101:6) — timeline dot, description, actor/timestamp caption.
 * `isLast` hides the connector, per the component's own usage note.
 */
export function EventRow({
  description,
  actor,
  timestamp,
  isLast = false,
}: {
  description: string;
  actor: EventActor;
  /** Already formatted for display, e.g. "9:02 AM". */
  timestamp: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex w-full items-start gap-4">
      <div className="flex w-3 shrink-0 flex-col items-center self-stretch">
        <div className="size-[10px] shrink-0 rounded-full bg-primary" />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex h-10 flex-1 flex-col items-start gap-1 overflow-hidden pb-5">
        <p className={`${text.bodySm} w-full text-card-foreground`}>
          {description}
        </p>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className={text.labelOverline}>{ACTOR_LABEL[actor]}</span>
          <span className={text.bodySm}>·</span>
          <span className={text.bodySm}>{timestamp}</span>
        </div>
      </div>
    </div>
  );
}
