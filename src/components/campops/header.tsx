import { text } from "@/lib/typography";

/**
 * Site header (Handoff Spec 2.1 / Figma DS node 2033:6, Desktop symbol 2065:15).
 * Background is bound to the `trees` primitive directly, not `primary` —
 * brand chrome stays independent of whatever `primary` is used for as a CTA color.
 *
 * Desktop only for this vertical slice; the Mobile breakpoint (hamburger menu)
 * is deferred along with the rest of responsive parity.
 */
export function Header() {
  return (
    <header className="relative flex h-16 w-full items-center justify-between overflow-hidden border-b border-trees-pressed bg-trees px-6">
      <div
        className={`${text.displayH3} relative z-10 flex items-center gap-8 whitespace-nowrap text-primary-foreground`}
      >
        <p>CampOps</p>
        <p className={text.labelMd}>Explore</p>
        <p className={text.labelMd}>My Trips</p>
      </div>
      <div className="relative z-10 flex size-[40px] shrink-0 items-center justify-center rounded-full border-2 border-sky p-1">
        <div className="size-full rounded-full bg-muted-foreground" />
      </div>
    </header>
  );
}
