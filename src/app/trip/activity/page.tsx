// Activity (Handoff Spec §4.1 node 18:570 / §4.2 node 22:184) — readable
// first; Details expands to before, after, what was checked, and why.
import { TopNav } from "@/components/v3/top-nav";
import { MobileHeader } from "@/components/v3/mobile-header";
import { FilterChip } from "@/components/v3/filter-chip";
import { ActivityLogRow } from "@/components/v3/activity-log-row";
import { SummaryRow } from "@/components/v3/summary-row";

const LOG = [
  {
    day: "Apr 16",
    entries: [
      {
        time: "9:03 AM",
        what: "Held Pine Hollow, Site 14 for $168.",
        rule: "Hold refundable bookings",
        actor: "CampOps",
        details: { checked: "$168 is under the $300 hold limit", reason: "Matched every must-have" },
      },
      {
        time: "9:04 AM",
        what: "Held the beginner trail ride for $260.",
        rule: "Hold refundable bookings",
        actor: "CampOps",
        details: { checked: "Campsite has trailhead access", reason: "Requested activity" },
      },
    ],
  },
  {
    day: "Apr 17",
    entries: [
      {
        time: "9:52 AM",
        what: "Re-held the trail ride at the same slot.",
        rule: "Re-hold when a hold runs out",
        actor: "CampOps",
        details: {
          before: "Held until 9:52",
          after: "Held until 10:22",
          checked: "Slot still open, within the $300 rule",
          reason: "The previous hold ran out before approval",
        },
      },
      {
        time: "2:10 PM",
        what: "Proposed moving the pontoon to Sunday for the storm forecast.",
        rule: "Replan when conditions change",
        actor: "CampOps",
        details: {
          before: "Sat 2:00-6:00pm",
          after: "Sun 9:00-1:00 (proposed)",
          checked: "Same price, no new conflicts",
          reason: "70% storm chance Sat 2-6pm",
        },
      },
      { time: "2:11 PM", what: "You kept Sunday.", rule: null, actor: "You" },
    ],
  },
];

export default function ActivityPage() {
  return (
    <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
      <div className="hidden border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] md:block">
        <TopNav active="Activity" chargeStatus="Nothing charged yet" />
      </div>
      <div className="md:hidden">
        <MobileHeader backLabel="Trip" title="Activity" chargeStatus="Nothing charged yet" />
      </div>
      <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
        <h1 className="hidden text-heading-l text-[var(--color-text-primary)] md:block">Activity</h1>

        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" selected />
          <FilterChip label="Holds" selected={false} />
          <FilterChip label="Approvals" selected={false} />
        </div>

        <div className="space-y-6">
          {LOG.map((day) => (
            <div key={day.day} className="space-y-1">
              <p className="text-overline text-[var(--color-text-tertiary)]">{day.day}</p>
              <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
                {day.entries.map((entry) => (
                  <ActivityLogRow
                    key={entry.time}
                    time={entry.time}
                    what={entry.what}
                    rule={entry.rule ?? "You approved"}
                    actor={entry.actor}
                    details={entry.details}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
          <SummaryRow label="Charged" value="$0" />
          <SummaryRow label="Held" value="$642" />
        </div>

        <div className="space-y-2">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">What this trip touched</h2>
          <ul className="space-y-1 text-body-s text-[var(--color-text-secondary)]">
            <li>Pine Hollow, Site 14</li>
            <li>Hill Country Trail Rides — beginner trail ride</li>
            <li>Lakeshore Marina — pontoon</li>
            <li>Granite Ridge Outfitters — guided hike</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
