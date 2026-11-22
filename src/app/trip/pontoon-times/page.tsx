// Pontoon · Other Times (Handoff Spec §4.1 node 36:1610) — one button per
// slot; the current pick is primary. Choosing replaces the proposed move.
import { TripShell } from "@/components/v3/trip-shell";
import { Button } from "@/components/v3/button";

export default function PontoonOtherTimesPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{ state: "waiting", title: "Waiting on you", detail: "One item needs a decision" }}
      needsYou={{
        eyebrow: "Storms 70% likely Sat 2-6pm",
        message: "Pick a time for the pontoon.",
        primary: { label: "Keep Sunday 9:00-1:00" },
      }}
      thread={[{ from: "agent", message: "Here are the other times Lakeshore Marina has open." }]}
    >
      <h2 className="text-heading-m text-[var(--color-text-primary)]">Other times</h2>
      <div className="flex flex-col items-start gap-2">
        <Button variant="primary" label="Sunday 9:00-1:00 (current pick)" />
        <Button variant="secondary" label="Friday 5:00-9:00pm" />
        <Button variant="secondary" label="Sunday 2:00-6:00pm" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" label="Saturday 2:00-6:00pm (original)" />
          <span className="text-caption text-[var(--color-text-attention)]">Storm risk</span>
        </div>
      </div>
    </TripShell>
  );
}
