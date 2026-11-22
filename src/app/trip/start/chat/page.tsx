// Start · After First Message (Handoff Spec §4.1 node 5:98) — What I heard
// (chips) and My plan (Plan Steps); rail is wide while intent is being set.
// Activities default to nice-to-have; chips are editable.
import { TripShell } from "@/components/v3/trip-shell";
import { RequirementChip } from "@/components/v3/requirement-chip";
import { PlanStep } from "@/components/v3/plan-step";

export default function StartAfterFirstMessagePage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      railWide
      agent={{ state: "working", title: "Working", detail: "Looking for a waterfront site near Austin" }}
      thread={[
        { from: "user", message: "A lakeside weekend near Austin with my dog, nothing over $90 a night." },
        { from: "agent", message: "Got it. Roughly how far are you willing to drive?" },
      ]}
    >
      <div className="space-y-3">
        <h2 className="text-heading-m text-[var(--color-text-primary)]">What I heard</h2>
        <div className="flex flex-wrap gap-2">
          <RequirementChip type="mustHave" label="Waterfront" />
          <RequirementChip type="mustHave" label="Dogs OK" />
          <RequirementChip type="mustHave" label="Budget $90/night" />
          <RequirementChip type="niceToHave" label="Trail ride" />
          <RequirementChip type="niceToHave" label="Guided hike" />
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-heading-m text-[var(--color-text-primary)]">My plan</h2>
        <PlanStep index={1} step="Find a campsite" detail="Searching near Austin" state="active" />
        <PlanStep index={2} step="Plan activities" detail="" state="pending" />
        <PlanStep index={3} step="Review and approve" detail="" state="pending" />
      </div>
    </TripShell>
  );
}
