import { cn } from "@/lib/utils";

export function TopNav({
  theme = "default",
  active,
  chargeStatus,
}: {
  theme?: "default" | "onPhoto";
  active: "Trips" | "Activity" | "Permissions";
  chargeStatus: string;
}) {
  const items = ["Trips", "Activity", "Permissions"] as const;
  const isOnPhoto = theme === "onPhoto";
  return (
    <nav
      className={cn(
        "flex items-center justify-between px-6 py-4",
        isOnPhoto ? "text-white" : "text-[var(--color-text-primary)]",
      )}
    >
      <div className="flex items-center gap-6">
        <span className="text-heading-s">CampOps</span>
        <div className="flex gap-4">
          {items.map((item) => (
            <span key={item} className={cn("text-label-m", item !== active && "opacity-60")}>
              {item}
            </span>
          ))}
        </div>
      </div>
      <span className={cn("text-caption", isOnPhoto ? "text-white/80" : "text-[var(--color-text-tertiary)]")}>
        {chargeStatus}
      </span>
    </nav>
  );
}
