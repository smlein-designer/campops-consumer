import { Toggle } from "@/components/v3/toggle";

export function PermissionRow({
  title,
  description,
  limits,
  control,
  onChange,
}: {
  title: string;
  description: string;
  limits?: string;
  control: "on" | "off" | "locked";
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-default)] py-4">
      <div className="min-w-0 space-y-1">
        <p className="text-label-l text-[var(--color-text-primary)]">{title}</p>
        <p className="text-body-s text-[var(--color-text-secondary)]">{description}</p>
        {limits && <p className="text-caption text-[var(--color-text-tertiary)]">{limits}</p>}
      </div>
      {control === "locked" ? (
        // Locked rows (book and charge) cannot be turned off (Handoff Spec §3).
        <span className="shrink-0 text-caption text-[var(--color-text-tertiary)]">Always on</span>
      ) : (
        <Toggle on={control === "on"} onChange={onChange} label={title} />
      )}
    </div>
  );
}
