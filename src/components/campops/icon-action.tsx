import { Tooltip } from "@base-ui/react/tooltip";

/**
 * 44×44 icon-only action with a tooltip — the shared interaction target
 * behind the DS Panel Header's Activity icon and the DS Mobile Status Bar's
 * trip-details icon. Both DS annotations specify the same contract: an
 * explicit accessible name (`label`) plus a tooltip showing that name on
 * hover and keyboard focus. The tooltip repeats the accessible name rather
 * than adding a second description, so screen readers announce it once.
 */
export function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        onClick={onClick}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={4} className="z-[60]">
          <Tooltip.Popup className="rounded-sm bg-foreground px-2 py-1 font-sans text-xs leading-[1.4] text-card shadow-sm">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
