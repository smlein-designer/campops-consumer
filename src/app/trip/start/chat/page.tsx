"use client";

// Start · After First Message (Handoff Spec §4.1 node 5:98) — What I heard
// (chips) and My plan (Plan Steps); rail is wide while intent is being set.
// Activities default to nice-to-have; chips are editable. Client Component
// only because the demo wires inline onPause/onSelect handlers.
import { TripShell } from "@/components/v3/trip-shell";
import { TripHero } from "@/components/v3/trip-hero";
import { RequirementChip } from "@/components/v3/requirement-chip";
import { PlanStep } from "@/components/v3/plan-step";
import { ClarifyingQuestion } from "@/components/v3/clarifying-question";
import { photoSrc } from "@/lib/v3/photos";

export default function StartAfterFirstMessagePage() {
  return (
    <TripShell
      chargeStatus="Nothing held or charged yet"
      composerPlaceholder="Reply or add anything"
      hero={
        <TripHero
          size="compact"
          status="Trip plan · Taking shape"
          title="Lake weekend, Hill Country"
          photo={photoSrc("hero")}
        />
      }
      agent={{
        state: "working",
        title: "CampOps is starting",
        detail: "Step 1 of 4 · finding a campsite",
        onPause: () => {},
      }}
      thread={[
        {
          from: "user",
          message:
            "A lake weekend in April for 4 adults and our dog, under 2 hours from Austin. We would love a boat, a beginner trail ride, and maybe a guided hike.",
        },
        {
          from: "agent",
          message:
            "Sounds great. I've laid out what I heard and my plan on the left. Dates, guests, the dog and the drive are must-haves. The activities are nice-to-haves, so I won't drop a good site just because one of them isn't available.",
        },
      ]}
      threadFooter={
        <ClarifyingQuestion
          question="Which weekend in April?"
          options={["Apr 16 to 18", "Apr 23 to 25", "Either works"]}
          selected="Apr 16 to 18"
          assumption="I'm searching the 16th for now."
        />
      }
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-heading-s text-[var(--color-text-primary)]">What I heard</h2>
          <p className="text-body-s text-[var(--color-text-secondary)]">Tap anything to change it</p>
        </div>
        <p className="text-overline text-[var(--color-text-secondary)]">Must have</p>
        <div className="flex flex-wrap gap-2">
          <RequirementChip type="mustHave" label="Apr 16 to 18" />
          <RequirementChip type="mustHave" label="4 adults" />
          <RequirementChip type="mustHave" label="Dog allowed" />
          <RequirementChip type="mustHave" label="Under 2 hrs from Austin" />
          <RequirementChip type="mustHave" label="Budget $800" />
        </div>
        <p className="text-overline text-[var(--color-text-secondary)]">Nice to have</p>
        <div className="flex flex-wrap gap-2">
          <RequirementChip type="niceToHave" label="On the water" />
          <RequirementChip type="niceToHave" label="Boat rental" />
          <RequirementChip type="niceToHave" label="Beginner trail ride" />
          <RequirementChip type="niceToHave" label="Guided hike" />
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-heading-s text-[var(--color-text-primary)]">My plan</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlanStep index={1} step="Find a lakeside campsite" detail="Checking 14 campgrounds now" state="active" />
          <PlanStep index={2} step="Add a boat near the site" detail="Only if the site is on the water" state="pending" />
          <PlanStep index={3} step="Book a beginner trail ride" detail="Won't overlap the boat" state="pending" />
          <PlanStep index={4} step="Find a hiking guide" detail="Morning, near the site" state="pending" />
        </div>
      </div>
    </TripShell>
  );
}
