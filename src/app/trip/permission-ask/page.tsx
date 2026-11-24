// Permission Ask · Over Limit (Handoff Spec §4.1 node 36:1459) — the
// permission check returned "ask"; nothing is held until the user picks.
import { TripShell } from "@/components/v3/trip-shell";
import { StatusBadge } from "@/components/v3/status-badge";

export default function PermissionAskPage() {
  return (
    <TripShell
      chargeStatus="Nothing charged yet"
      agent={{ state: "waiting", title: "Waiting on you", detail: "A hold would be over your $300 limit" }}
      needsYou={{
        eyebrow: "Over your hold limit",
        message: "A full-day pontoon is $320 — over your $300 hold rule.",
        primary: { label: "Hold full day · $320" },
        secondary: { label: "Keep half day" },
      }}
      thread={[
        { from: "agent", message: "Lakeshore Marina also rents the pontoon for a full day, $320." },
        { from: "agent", message: "That's over your $300 hold limit, so I'm asking before holding it." },
      ]}
    >
      <StatusBadge status="info" label="Asking before holding" />
    </TripShell>
  );
}
