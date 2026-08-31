/**
 * Camp Illustration — the canonical campsite background artwork (Figma
 * "Camp Illustration — Full Color", real exported assets in
 * `public/assets/`, added verbatim — not hand-recreated, recolored, or
 * simplified). One asset per breakpoint (mobile/desktop), reused for BOTH
 * presentation treatments Figma uses:
 *
 * - Full color, on the landing/Start screen.
 * - "Tinted", behind active-task chat columns — this is NOT a separate
 *   recolored asset. Sampling actual pixel values from a live Figma export
 *   of the tinted treatment against this same canonical artwork's known
 *   fill colors (see docs/implementation-decisions.md for the method)
 *   showed a consistent ~82% blend toward a near-white color across every
 *   channel — i.e. a plain translucent veil over the untouched artwork,
 *   not a blend mode and not different vector fills. Implemented here as
 *   exactly that: one extra CSS layer, reusing the app's own `--background`
 *   token as the veil color (visually indistinguishable from the sampled
 *   value at this opacity, and keeps the tint tied to the same token the
 *   surrounding page already uses rather than a second hardcoded color).
 *
 * Purely decorative: `aria-hidden` and `pointer-events-none` throughout —
 * never intercepts focus, click, or touch, and never carries semantic
 * content. Callers are responsible for their own `relative` positioning
 * context and giving real content `relative z-10` (or higher) so it
 * layers above this.
 *
 * Asset breakpoint is intentionally `md` (768px), NOT this app's usual
 * `lg` (1024px) layout breakpoint: the mobile asset is portrait-oriented
 * (390×788, aspect ≈0.5) and `object-cover` on a mid-width viewport whose
 * own aspect ratio is far wider than that crops away nearly all of its sky
 * band — found live at 768px, where the landing headline ended up sitting
 * entirely over solid ground instead of sky. The desktop asset's much
 * wider native aspect (1440×960 ≈1.5) tolerates that range far better, so
 * it takes over earlier, before the two-column app layout itself changes.
 */
export function CampIllustration({
  tinted = false,
}: {
  /** Full color by default (landing/Start screen); true behind active-task chat. */
  tinted?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative
          background art, not content; plain <img> avoids Next's image
          pipeline re-processing an already-final SVG. */}
      <img
        src="/assets/Camp Illustration — Full Color-mobile.svg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-bottom md:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img
        src="/assets/Camp Illustration — Full Color-desktop.svg"
        alt=""
        className="absolute inset-0 hidden h-full w-full object-cover object-bottom md:block"
      />
      {tinted && (
        <div className="absolute inset-0 bg-background" style={{ opacity: 0.82 }} />
      )}
    </div>
  );
}
