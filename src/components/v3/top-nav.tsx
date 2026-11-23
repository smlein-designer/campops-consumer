import { cn } from "@/lib/utils";

/** Figma node 16:81. Logo is lowercase "campops"; charge status always
 * states whether money has moved; the avatar sits to its right. */
export function TopNav({
  theme = "default",
  active,
  chargeStatus,
  showChargeStatus = true,
  onNavigate,
}: {
  theme?: "default" | "onPhoto";
  active: "Trips" | "Activity" | "Permissions";
  chargeStatus: string;
  showChargeStatus?: boolean;
  /** Real in-app navigation (the live page only) — omitted elsewhere, where
   * these items stay plain text (Figma-comparison static screens). */
  onNavigate?: (item: "Trips" | "Activity" | "Permissions") => void;
}) {
  const items = ["Trips", "Activity", "Permissions"] as const;
  const isOnPhoto = theme === "onPhoto";
  return (
    <nav
      className={cn(
        "flex h-16 items-center justify-between px-8",
        !isOnPhoto && "border-b border-[var(--color-border-default)]",
      )}
    >
      <div className="flex items-center gap-10">
        <span
          className="text-heading-s"
          style={{ color: isOnPhoto ? "white" : "var(--color-text-link)" }}
        >
          campops
        </span>
        <div className="flex gap-7">
          {items.map((item) => {
            const color = isOnPhoto
              ? item === active
                ? "white"
                : "#edebe0"
              : item === active
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)";
            return onNavigate ? (
              <button
                key={item}
                type="button"
                onClick={() => onNavigate(item)}
                className="text-label-m cursor-pointer"
                style={{ color }}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="text-label-m" style={{ color }}>
                {item}
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {showChargeStatus && (
          <span
            className="text-body-s whitespace-nowrap"
            style={{ color: isOnPhoto ? "#edebe0" : "var(--color-text-secondary)" }}
          >
            {chargeStatus}
          </span>
        )}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-brand)] text-label-s text-[var(--color-text-on-brand)]">
          SL
        </span>
      </div>
    </nav>
  );
}
