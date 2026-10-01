/**
 * Camp Illustration — the atmospheric workspace background (Pages v2
 * "Workspace" / "Camp Illustration — Tinted" layers): a greyscale campsite
 * photograph (exported from Figma, `public/assets/workspace-background.jpg`)
 * at 20% opacity over the page background, identical on every screen. It is
 * deliberately subordinate to interaction content.
 *
 * Purely decorative: `aria-hidden` and `pointer-events-none` — never
 * intercepts focus, click, or touch. Callers provide their own `relative`
 * positioning context and layer real content above it.
 *
 * On portrait (mobile) viewports the crop favors the left-of-center tent
 * and lake, matching the Figma mobile frames' image offset.
 */
export function CampIllustration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative
          background art, not content. */}
      <img
        src="/assets/workspace-background.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover object-[25%_center] opacity-20 md:object-center"
      />
    </div>
  );
}
