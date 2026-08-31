import { Menu } from "lucide-react";
import { text } from "@/lib/typography";

/**
 * Site header (Handoff Spec 2.1 / Figma DS node 2033:6, Desktop symbol 2065:15).
 * Background is bound to the `trees` primitive directly, not `primary` —
 * brand chrome stays independent of whatever `primary` is used for as a CTA color.
 *
 * Breakpoint (Handoff Spec 2.1): Desktop (64px) — logo (Display/H3) + nav
 * links grouped left, avatar right. Mobile (56px, <1024px here — see
 * docs/implementation-decisions.md for why this slice treats the Handoff
 * Spec's unspecified 600–1024px gap as mobile rather than opening a third,
 * undesigned layout) — hamburger (left) + logo (Body/Base) + avatar (right).
 * The hamburger's open/menu state was never designed (out of scope per the
 * PRD — no multi-page navigation exists yet), so it's an inert placeholder,
 * not a no-op pretending to be a real menu trigger.
 *
 * Decorative mountain-silhouette background (design-provided assets,
 * `public/assets/Mountain Silhouette-{desktop,mobile}.svg` — real exported
 * artwork, not hand-recreated; resolves the visual-fidelity gap flagged
 * 2026-09-01, see docs/implementation-decisions.md). Layered between the
 * solid `bg-trees` fill and the actual header content: `aria-hidden` +
 * `pointer-events-none` (purely decorative, never intercepts clicks or
 * reaches assistive tech), no z-index of its own (sits below the `z-10`
 * content by default stacking order). The SVGs already bake in their own
 * 32% opacity and `#2F4F25` fill — no CSS opacity is added on top of them,
 * which would double up and wash the art out.
 *
 * `onLogoClick`, when supplied, makes the "CampOps" wordmark a real button
 * (both breakpoints) — the conventional "click the logo to go home"
 * affordance. Optional so Header stays usable standalone without forcing
 * every caller to wire a handler; the app itself always passes one (a full
 * reset back to the landing/Start screen, the same transition "Start a new
 * search" already performs).
 *
 * Logo styling (corrected 2026-08-30): the Handoff Spec's Body/Base
 * treatment for the compact row's logo is superseded here — the "CampOps"
 * wordmark keeps its stylized Display/H3 look at every width, including
 * true mobile, so it never renders as plain/unstyled text. Only the
 * surrounding layout (hamburger vs. full nav) still varies by breakpoint.
 */
function Logo({
  className,
  onLogoClick,
}: {
  className: string;
  onLogoClick?: () => void;
}) {
  if (!onLogoClick) {
    return <p className={className}>CampOps</p>;
  }
  return (
    <button
      type="button"
      onClick={onLogoClick}
      aria-label="CampOps — back to start"
      className={`${className} cursor-pointer`}
    >
      CampOps
    </button>
  );
}

export function Header({ onLogoClick }: { onLogoClick?: () => void }) {
  return (
    <header className="relative flex h-14 w-full items-center justify-between overflow-hidden border-b border-trees-pressed bg-trees px-4 lg:h-16 lg:px-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative
          background art, not content; plain <img> avoids Next's image
          pipeline re-processing an already-final SVG. */}
      <img
        src="/assets/Mountain Silhouette-mobile.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom lg:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img
        src="/assets/Mountain Silhouette-desktop.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover object-bottom lg:block"
      />
      <div className="relative z-10 flex items-center gap-3 lg:hidden">
        <button
          type="button"
          aria-label="Menu"
          disabled
          className="flex size-8 items-center justify-center text-primary-foreground opacity-80"
        >
          <Menu className="size-5" />
        </button>
        <Logo
          className={`${text.displayH3} whitespace-nowrap text-primary-foreground`}
          onLogoClick={onLogoClick}
        />
      </div>
      <div
        className={`${text.displayH3} relative z-10 hidden items-center gap-8 whitespace-nowrap text-primary-foreground lg:flex`}
      >
        <Logo className="whitespace-nowrap" onLogoClick={onLogoClick} />
        <p className={text.labelMd}>Explore</p>
        <p className={text.labelMd}>My Trips</p>
      </div>
      <div className="relative z-10 flex size-[40px] shrink-0 items-center justify-center rounded-full border-2 border-sky p-1">
        <div className="size-full rounded-full bg-muted-foreground" />
      </div>
    </header>
  );
}
