import { cn } from "@/lib/utils";

/** Figma node 16:81. Logo is lowercase "campops"; charge status always
 * states whether money has moved; the avatar sits to its right. */
export function TopNav({
  theme = "default",
  active,
  chargeStatus,
  showChargeStatus = true,
  onNavigate,
  onLogoClick,
}: {
  theme?: "default" | "onPhoto";
  active: "Trips" | "Activity" | "Permissions";
  chargeStatus: string;
  showChargeStatus?: boolean;
  /** Real in-app navigation (the live page only) — omitted elsewhere, where
   * these items stay plain text (Figma-comparison static screens). */
  onNavigate?: (item: "Trips" | "Activity" | "Permissions") => void;
  /** Starts a new trip (v2: the logo always led back to a fresh search). */
  onLogoClick?: () => void;
}) {
  const items = ["Trips", "Activity", "Permissions"] as const;
  const isOnPhoto = theme === "onPhoto";
  return (
    <nav
      className={cn(
        "flex h-16 items-center justify-between px-4 md:px-8",
        // Stays at the top while the page scrolls under it.
        !isOnPhoto && "sticky top-0 z-30 border-b border-[var(--color-border-default)] bg-[var(--color-bg-canvas)]",
      )}
    >
      <div className="flex items-center gap-4 md:gap-10">
        <button
          type="button"
          onClick={onLogoClick}
          disabled={!onLogoClick}
          aria-label={onLogoClick ? "campops — start a new trip" : "campops"}
          className={cn("text-heading-s", onLogoClick && "cursor-pointer")}
          style={{ color: isOnPhoto ? "white" : "var(--color-text-link)" }}
        >
          campops
        </button>
        <div className="flex gap-4 md:gap-7">
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
      {/* The phone layout has room for the nav itself, not its extras. */}
      <div className="hidden items-center gap-4 sm:flex">
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
