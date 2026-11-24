// No Match (Handoff Spec §4.1 node 31:1149) — the closest option with the
// missed must-have named, plus alternatives; a must-have is never relaxed
// silently.
import { TripShell } from "@/components/v3/trip-shell";
import { CampsiteOption } from "@/components/v3/campsite-option";
import { liveOakBend, prairieFlats, ridgeview } from "@/lib/v3/fixtures";

export default function NoMatchPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{ state: "waiting", title: "Waiting on you", detail: "No site satisfies every requirement" }}
      thread={[
        {
          from: "agent",
          message: "Nothing near Austin is waterfront, pet-friendly, and under $60/night all at once.",
        },
        { from: "agent", message: "Here's the closest option, and a couple of others if you'd rather trade off something else." },
      ]}
    >
      <h2 className="text-heading-m text-[var(--color-text-primary)]">Closest match</h2>
      <CampsiteOption
        state="closest"
        eyebrow="Closest match"
        title={`${liveOakBend.campgroundName} · ${liveOakBend.siteName}`}
        facts={["Wooded", "Dogs OK", "1 hr 35 min", `$${liveOakBend.pricePerNight}/night`]}
        fit={[
          { state: "missed", requirement: "Waterfront", detail: "5-minute walk to water, not on-site" },
          { state: "kept", requirement: "Dogs OK", detail: "1 dog" },
          { state: "kept", requirement: "Budget $60/night", detail: `$${liveOakBend.pricePerNight}/night` },
        ]}
        reason="Misses waterfront, the only site under budget that still allows dogs."
        actions={[{ label: "Hold this site", variant: "primary" }]}
      />
      <h2 className="text-heading-m text-[var(--color-text-primary)]">Other options</h2>
      <CampsiteOption
        state="alternative"
        eyebrow="Alternative"
        title={`${prairieFlats.campgroundName} · ${prairieFlats.siteName}`}
        facts={["Meadow", "Dogs OK", "1 hr 10 min", `$${prairieFlats.pricePerNight}/night`]}
        fit={[
          { state: "missed", requirement: "Waterfront", detail: "No water access" },
          { state: "kept", requirement: "Budget $60/night", detail: `$${prairieFlats.pricePerNight}/night` },
        ]}
        reason="Cheapest and closest, but no water access at all."
        actions={[{ label: "Hold this site", variant: "secondary" }]}
      />
      <CampsiteOption
        state="alternative"
        eyebrow="Alternative"
        title={`${ridgeview.campgroundName} · ${ridgeview.siteName}`}
        facts={["Lake view", "2 hr 5 min", `$${ridgeview.pricePerNight}/night`]}
        fit={[
          { state: "kept", requirement: "Waterfront", detail: "Lake view" },
          { state: "missed", requirement: "Budget $60/night", detail: `$${ridgeview.pricePerNight}/night` },
        ]}
        reason="Waterfront, but over budget and the longest drive."
        actions={[{ label: "Hold this site", variant: "secondary" }]}
      />
    </TripShell>
  );
}
