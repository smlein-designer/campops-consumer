"use client";

// Dev-only gallery for Build Order stage 2 (Handoff Spec §8.2): every v3
// component and its documented variants in one place, to compare against
// the Figma Component Examples page by screenshot. Client Component only
// because it wires inline onClick/onChange handlers for the demo.
import { Button } from "@/components/v3/button";
import { StatusBadge } from "@/components/v3/status-badge";
import { RequirementChip } from "@/components/v3/requirement-chip";
import { ChatBubble } from "@/components/v3/chat-bubble";
import { BookingCard } from "@/components/v3/booking-card";
import { NeedsYouCard } from "@/components/v3/needs-you-card";
import { SuggestionCard } from "@/components/v3/suggestion-card";
import { PlanStep } from "@/components/v3/plan-step";
import { Composer } from "@/components/v3/composer";
import { ApproveBar } from "@/components/v3/approve-bar";
import { BookingRow } from "@/components/v3/booking-row";
import { Toggle } from "@/components/v3/toggle";
import { SelectField } from "@/components/v3/select-field";
import { SegmentedControl } from "@/components/v3/segmented-control";
import { FactPill } from "@/components/v3/fact-pill";
import { SheetHandle } from "@/components/v3/sheet-handle";
import { CommitNote } from "@/components/v3/commit-note";
import { ActivityEntry } from "@/components/v3/activity-entry";
import { MapPin } from "@/components/v3/map-pin";
import { TopNav } from "@/components/v3/top-nav";
import { AgentStatus } from "@/components/v3/agent-status";
import { TripHero } from "@/components/v3/trip-hero";
import { ReviewLineItem } from "@/components/v3/review-line-item";
import { PermissionRow } from "@/components/v3/permission-row";
import { FilterChip } from "@/components/v3/filter-chip";
import { ActivityLogRow } from "@/components/v3/activity-log-row";
import { SummaryRow } from "@/components/v3/summary-row";
import { MobileHeader } from "@/components/v3/mobile-header";
import { ConversationPeek } from "@/components/v3/conversation-peek";
import { FitRow } from "@/components/v3/fit-row";
import { CampsiteOption } from "@/components/v3/campsite-option";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--color-border-default)] pt-6">
      <h2 className="text-heading-s text-[var(--color-text-primary)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

// Computed once at module load, not during render (react-hooks/purity).
const demoHoldEndsAt = new Date(Date.now() + 14 * 60 * 1000 + 52 * 1000);

export default function ComponentGalleryPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 bg-[var(--color-bg-canvas)] p-10">
      <h1 className="text-heading-l text-[var(--color-text-primary)]">v3 Component Gallery</h1>

      <Section title="Button">
        <Row>
          <Button variant="primary" label="Hold Site 14" />
          <Button variant="secondary" label="Other options" />
          <Button variant="ghost" label="No thanks" />
          <Button variant="attention" label="Hold full day · $320" />
          <Button variant="inverse" label="Review" />
          <Button variant="primary" size="large" label="Book 4 items · charge $642" />
          <Button variant="primary" label="Disabled" disabled />
        </Row>
      </Section>

      <Section title="Status Badge">
        <Row>
          <StatusBadge status="held" label="Held" />
          <StatusBadge status="needsOk" label="Needs OK" />
          <StatusBadge status="working" label="Working" />
          <StatusBadge status="expired" label="Hold expired" />
          <StatusBadge status="info" label="Best match" />
          <StatusBadge status="approved" label="Approved" />
        </Row>
      </Section>

      <Section title="Requirement Chip">
        <Row>
          <RequirementChip type="mustHave" label="Waterfront" />
          <RequirementChip type="niceToHave" label="Pet friendly" />
          <RequirementChip type="changed" label="Budget $300" />
        </Row>
      </Section>

      <Section title="Chat Bubble">
        <ChatBubble from="agent" message="I found Pine Hollow, Site 14 — lakeside, dogs OK, 1 hr 50 min out." />
        <ChatBubble from="user" message="That works, hold it." />
      </Section>

      <Section title="Booking Card">
        <BookingCard
          state="held"
          kind="Campsite"
          title="Pine Hollow · Site 14"
          meta="Apr 16–18 · $84/night"
          holdEndsAt={demoHoldEndsAt}
          onRelease={() => {}}
        />
        <BookingCard state="needsOk" kind="Activity" title="Lakeshore Marina · Pontoon" meta="Sun 9:00–1:00 · $180" />
        <BookingCard state="holdExpired" kind="Activity" title="Hill Country Trail Rides" meta="Sat 10:00–12:00 · $260" />
        <BookingCard state="working" kind="Activity" title="Granite Ridge Outfitters" meta="Searching guided hikes..." />
      </Section>

      <Section title="Needs You Card">
        <NeedsYouCard
          eyebrow="Storms 70% likely Sat 2–6pm"
          message="The pontoon slot moves to Sunday 9:00–1:00, same price. Keep Sunday?"
          primary={{ label: "Keep Sunday" }}
          secondary={{ label: "Other options" }}
        />
      </Section>

      <Section title="Suggestion Card">
        <SuggestionCard
          title="Kayaks for two · $45"
          reason="Pairs well with your lakeside site."
          source="Offered by Lakeshore Marina"
        />
      </Section>

      <Section title="Plan Step">
        <PlanStep index={1} step="Find a campsite" detail="Pine Hollow, Site 14 — held" state="done" />
        <PlanStep index={2} step="Plan activities" detail="Checking water access for the boat" state="active" />
        <PlanStep index={3} step="Review and approve" detail="" state="pending" />
      </Section>

      <Section title="Composer">
        <Composer />
      </Section>

      <Section title="Approve Bar">
        <ApproveBar amount="$642 total" summary="Nothing charged yet" />
      </Section>

      <Section title="Booking Row">
        <BookingRow state="held" title="Pine Hollow · Site 14" meta="Apr 16–18 · $168" />
        <BookingRow state="needsOk" title="Lakeshore Marina · Pontoon" meta="Sun 9:00–1:00 · $180" />
        <BookingRow state="working" title="Granite Ridge Outfitters" meta="Searching..." />
      </Section>

      <Section title="Toggle">
        <Row>
          <Toggle on={true} label="Hold refundable bookings" />
          <Toggle on={false} label="Hold non-refundable bookings" />
        </Row>
      </Section>

      <Section title="Select Field">
        <SelectField
          value="300"
          options={[
            { label: "$200 limit", value: "200" },
            { label: "$300 limit", value: "300" },
            { label: "$400 limit", value: "400" },
          ]}
        />
      </Section>

      <Section title="Segmented Control">
        <SegmentedControl options={["By day", "On the map"]} selected="By day" />
      </Section>

      <Section title="Fact Pill (over a dark surface)">
        <div className="flex gap-2 rounded-lg bg-[var(--ink-900)] p-4">
          <FactPill label="1 hr 50 min" />
          <FactPill label="Dogs OK" />
          <FactPill label="$84/night" />
        </div>
      </Section>

      <Section title="Sheet Handle">
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <SheetHandle />
        </div>
      </Section>

      <Section title="Commit Note">
        <CommitNote message="Booking charges your Visa ending 4242. Nothing else changes." />
      </Section>

      <Section title="Activity Entry">
        <ActivityEntry
          time="9:52 AM"
          what="Re-held the trail ride at the same slot."
          rule="Re-hold when a hold runs out"
          actor="CampOps"
        />
      </Section>

      <Section title="Map Pin">
        <Row>
          <MapPin status="base" place="Cedar Point" detail="Site 3" />
          <MapPin status="held" place="Pine Hollow" detail="Site 14 · held" />
          <MapPin status="needsOk" place="Lakeshore Marina" detail="Pontoon · needs OK" />
          <MapPin status="searching" place="Granite Ridge" detail="Searching..." />
        </Row>
      </Section>

      <Section title="Top Nav">
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <TopNav active="Trips" chargeStatus="Nothing charged yet" />
        </div>
        <div className="rounded-xl bg-[var(--ink-900)]">
          <TopNav theme="onPhoto" active="Trips" chargeStatus="Nothing charged yet" />
        </div>
      </Section>

      <Section title="Agent Status">
        <AgentStatus state="working" title="Working" detail="Checking water access for the pontoon" onPause={() => {}} />
        <AgentStatus state="waiting" title="Waiting on you" detail="One item needs a decision" />
      </Section>

      <Section title="Trip Hero">
        <TripHero size="large" status="Trip · Planning" title="Hill Country Weekend" facts={["Apr 16–18", "4 bookings", "$642"]} />
        <TripHero size="compact" status="Trip · Booked" title="Hill Country Weekend" />
      </Section>

      <Section title="Review Line Item">
        <ReviewLineItem
          title="Pine Hollow · Site 14"
          when="Apr 16–18"
          terms="Fully refundable until Apr 14"
          amount="$168"
          onRemove={() => {}}
        />
        <ReviewLineItem
          title="Lakeshore Marina · Pontoon"
          when="Sun 9:00–1:00"
          terms="Full refund up to 24 hours before"
          flag="Moved from Saturday for weather. You kept Sunday."
          amount="$180"
          onRemove={() => {}}
          variant="mobile"
        />
      </Section>

      <Section title="Permission Row">
        <PermissionRow
          title="Hold refundable bookings"
          description="Hold a site or activity without asking, up to the limit below."
          limits="Limit $300 per booking · this trip"
          control="on"
        />
        <PermissionRow
          title="Book and charge"
          description="CampOps always asks before booking or charging anything."
          control="locked"
        />
      </Section>

      <Section title="Filter Chip">
        <Row>
          <FilterChip label="All" selected />
          <FilterChip label="Holds" selected={false} />
          <FilterChip label="Approvals" selected={false} />
        </Row>
      </Section>

      <Section title="Activity Log Row">
        <ActivityLogRow
          time="9:52 AM"
          what="Re-held the trail ride at the same slot."
          rule="Re-hold when a hold runs out"
          actor="CampOps"
          details={{
            before: "Held until 9:52",
            after: "Held until 10:22",
            checked: "Slot still open, within $300 rule",
            reason: "Hold expired before approval",
          }}
        />
      </Section>

      <Section title="Summary Row">
        <SummaryRow label="Charged" value="$0" />
        <SummaryRow label="Held" value="$642" />
      </Section>

      <Section title="Mobile Header">
        <MobileHeader backLabel="Trip" title="Activity" chargeStatus="Nothing charged yet" />
      </Section>

      <Section title="Conversation Peek">
        <ConversationPeek message="I found a Sunday slot at the same price. Keep Sunday?" showApprove />
      </Section>

      <Section title="Fit Row">
        <FitRow state="kept" requirement="Waterfront" detail="On the water" />
        <FitRow state="tradeoff" requirement="Drive time" detail="1 hr 50 min, 30 min more than asked" />
        <FitRow state="missed" requirement="Budget $70/night" detail="$84/night" />
      </Section>

      <Section title="Campsite Option">
        <CampsiteOption
          state="recommended"
          eyebrow="Recommended"
          title="Pine Hollow · Site 14"
          facts={["Lakeside", "Dogs OK", "1 hr 50 min", "$84/night"]}
          badge="Best match"
          fit={[
            { state: "kept", requirement: "Waterfront", detail: "On the water" },
            { state: "tradeoff", requirement: "Drive time", detail: "30 min more than asked" },
          ]}
          reason="Closest waterfront site that still allows dogs."
          actions={[
            { label: "Hold this site", variant: "primary" },
            { label: "Compare", variant: "secondary" },
          ]}
        />
        <CampsiteOption
          state="unavailable"
          eyebrow="Your pick"
          title="Cedar Point · Site 3"
          facts={["Waterfront", "1 hr 20 min", "$76/night"]}
          fit={[{ state: "missed", requirement: "Available Apr 16–18", detail: "Booked by another party" }]}
          reason="This site was just booked by someone else."
        />
      </Section>
    </div>
  );
}
