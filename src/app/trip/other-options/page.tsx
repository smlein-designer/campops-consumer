// Other Campsite Options (Handoff Spec §4.1 node 31:915 / §4.2 node 32:380)
// — alternatives sorted by fit; Pine Hollow stays marked as the pick.
import { TripShell } from "@/components/v3/trip-shell";
import { CampsiteOption } from "@/components/v3/campsite-option";
import { liveOakBend, pineHollow, ridgeview } from "@/lib/v3/fixtures";

export default function OtherCampsiteOptionsPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{ state: "waiting", title: "Waiting on you", detail: "Comparing other sites" }}
      thread={[{ from: "agent", message: "Here are the other sites nearby, closest fit first." }]}
    >
      <h2 className="text-heading-m text-[var(--color-text-primary)]">Other options</h2>
      <CampsiteOption
        state="recommended"
        eyebrow="Your pick"
        title={`${pineHollow.campgroundName} · ${pineHollow.siteName}`}
        facts={["Lakeside", "Dogs OK", "1 hr 50 min", `$${pineHollow.pricePerNight}/night`]}
        badge="Held"
        fit={[
          { state: "kept", requirement: "Waterfront", detail: "On the water" },
          { state: "kept", requirement: "Dogs OK", detail: "Up to 2 dogs" },
        ]}
        reason="Closest waterfront site that still allows dogs."
      />
      <CampsiteOption
        state="alternative"
        eyebrow="Alternative"
        title={`${liveOakBend.campgroundName} · ${liveOakBend.siteName}`}
        facts={["Wooded", "Dogs OK", "1 hr 35 min", `$${liveOakBend.pricePerNight}/night`]}
        fit={[
          { state: "tradeoff", requirement: "Waterfront", detail: "5-minute walk to water" },
          { state: "kept", requirement: "Dogs OK", detail: "1 dog" },
        ]}
        reason="Cheaper, but water is a short walk rather than on-site."
        actions={[
          { label: "Hold this site", variant: "secondary" },
          { label: "Compare", variant: "ghost" },
        ]}
      />
      <CampsiteOption
        state="alternative"
        eyebrow="Alternative"
        title={`${ridgeview.campgroundName} · ${ridgeview.siteName}`}
        facts={["Lake view", "2 hr 5 min", `$${ridgeview.pricePerNight}/night`]}
        fit={[
          { state: "kept", requirement: "Waterfront", detail: "Lake view" },
          { state: "tradeoff", requirement: "Drive time", detail: "45 min more than Pine Hollow" },
        ]}
        reason="Quietest option, but the longest drive of the group."
        actions={[
          { label: "Hold this site", variant: "secondary" },
          { label: "Compare", variant: "ghost" },
        ]}
      />
    </TripShell>
  );
}
