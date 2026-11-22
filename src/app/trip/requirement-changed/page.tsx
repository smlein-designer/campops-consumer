// Requirement Changed (Handoff Spec §4.1 node 31:1405) — the chip returns
// to its type after the re-check.
import { TripShell } from "@/components/v3/trip-shell";
import { RequirementChip } from "@/components/v3/requirement-chip";
import { PlanStep } from "@/components/v3/plan-step";

export default function RequirementChangedPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{ state: "working", title: "Working", detail: "Re-checking the campsite against your new budget" }}
      thread={[{ from: "user", message: "Actually, keep it under $70 a night." }]}
    >
      <div className="space-y-3">
        <h2 className="text-heading-m text-[var(--color-text-primary)]">What I heard</h2>
        <div className="flex flex-wrap gap-2">
          <RequirementChip type="mustHave" label="Waterfront" />
          <RequirementChip type="mustHave" label="Dogs OK" />
          <RequirementChip type="changed" label="Budget $70/night" />
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-heading-m text-[var(--color-text-primary)]">My plan</h2>
        <PlanStep index={1} step="Find a campsite" detail="Re-checking against the new budget" state="active" />
        <PlanStep index={2} step="Plan activities" detail="" state="pending" />
        <PlanStep index={3} step="Review and approve" detail="" state="pending" />
      </div>
    </TripShell>
  );
}
