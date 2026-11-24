// Site Unavailable · Recommendation (Handoff Spec §4.1 node 31:731 / §4.2
// node 32:288) — the loss is posted first, then the recommendation.
import { TripShell } from "@/components/v3/trip-shell";
import { CampsiteOption } from "@/components/v3/campsite-option";
import { cedarPoint, pineHollow } from "@/lib/v3/fixtures";

export default function SiteUnavailablePage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{ state: "waiting", title: "Waiting on you", detail: "One item needs a decision" }}
      needsYou={{
        eyebrow: "Cedar Point, Site 3 is no longer available",
        message: "It was booked by another party. Pine Hollow, Site 14 is the closest match — hold it?",
        primary: { label: "Hold Site 14" },
        secondary: { label: "Other options" },
      }}
      thread={[
        { from: "agent", message: "Cedar Point, Site 3 was just booked by someone else." },
        { from: "agent", message: "Pine Hollow, Site 14 is the closest waterfront site that still allows dogs." },
      ]}
    >
      <h2 className="text-heading-m text-[var(--color-text-primary)]">Your pick</h2>
      <CampsiteOption
        state="unavailable"
        eyebrow="Your pick"
        title={`${cedarPoint.campgroundName} · ${cedarPoint.siteName}`}
        facts={["Waterfront", "1 hr 20 min", `$${cedarPoint.pricePerNight}/night`]}
        fit={[{ state: "missed", requirement: "Available Apr 16-18", detail: "Booked by another party" }]}
        reason="This site was just booked by someone else."
      />
      <CampsiteOption
        state="recommended"
        eyebrow="Recommended"
        title={`${pineHollow.campgroundName} · ${pineHollow.siteName}`}
        facts={["Lakeside", "Dogs OK", "1 hr 50 min", `$${pineHollow.pricePerNight}/night`]}
        badge="Best match"
        fit={[
          { state: "kept", requirement: "Waterfront", detail: "On the water" },
          { state: "kept", requirement: "Dogs OK", detail: "Up to 2 dogs" },
          { state: "tradeoff", requirement: "Drive time", detail: "30 min more than Cedar Point" },
        ]}
        reason="Closest waterfront site that still allows dogs."
        actions={[
          { label: "Hold this site", variant: "primary" },
          { label: "Compare", variant: "secondary" },
        ]}
      />
    </TripShell>
  );
}
