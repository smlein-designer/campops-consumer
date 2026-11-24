// Permissions (Handoff Spec §4.1 node 12:171 / §4.2 node 22:285) — changes
// apply to the agent's next action; locked rows can't be turned off.
import { TopNav } from "@/components/v3/top-nav";
import { MobileHeader } from "@/components/v3/mobile-header";
import { PermissionRow } from "@/components/v3/permission-row";
import { SelectField } from "@/components/v3/select-field";
import { defaultPermissions } from "@/lib/v3/trip-factory";

const USED_ON_THIS_TRIP = [
  "Held Pine Hollow, Site 14 under Hold refundable bookings ($168, under the $300 limit)",
  "Re-held the trail ride under Re-hold when a hold runs out",
  "Asked before proposing the Sunday pontoon move under Replan when conditions change",
  "Offered kayaks for two under Suggest extras",
];

export default function PermissionsPage() {
  const permissions = defaultPermissions();
  return (
    <div className="min-h-dvh bg-[var(--color-bg-canvas)]">
      <div className="sticky top-0 z-30 hidden border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] md:block">
        <TopNav active="Permissions" chargeStatus="Nothing charged yet" />
      </div>
      <div className="md:hidden">
        <MobileHeader backLabel="Trip" title="Permissions" chargeStatus="Nothing charged yet" />
      </div>
      <div className="mx-auto max-w-2xl space-y-8 p-6 md:p-10">
        <h1 className="hidden text-heading-l text-[var(--color-text-primary)] md:block">Permissions</h1>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          {permissions.map((permission) => (
            <div key={permission.id} className="px-4">
              <PermissionRow
                title={permission.label}
                description={permission.description}
                limits={
                  permission.limitUsd != null ? (
                    <SelectField
                      value={String(permission.limitUsd)}
                      options={[
                        { label: "$200 limit · this trip", value: "200" },
                        { label: "$300 limit · this trip", value: "300" },
                        { label: "$400 limit · this trip", value: "400" },
                      ]}
                    />
                  ) : undefined
                }
                control={permission.locked ? "locked" : permission.enabled ? "on" : "off"}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">Used on this trip</h2>
          <ul className="space-y-2">
            {USED_ON_THIS_TRIP.map((line) => (
              <li key={line} className="text-body-s text-[var(--color-text-secondary)]">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
