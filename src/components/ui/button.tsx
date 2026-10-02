import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // cursor-pointer: Tailwind's Preflight resets <button> to the native
  // `cursor: default`, not `pointer` — every button in this app needs the
  // explicit opt-in or hovering an actionable control shows no clickability
  // affordance at all (found live: Accept/Reserve/Authorize/etc. all showed
  // the plain arrow cursor).
  //
  // CampOps DS "Button" (Primary/Secondary/Outline/Destructive × Default/
  // Hover & Active/Focus/Disabled): 8px radius, DS Label/Small label (Public
  // Sans Medium 14px / 130%), Focus = solid 3px water ring, Disabled = 50%
  // opacity. Hover darkens via tokens rather than the master's opacity
  // fade, which washes out over the photographic workspace background.
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm leading-[1.3] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
        outline:
          "border-border bg-card text-foreground hover:bg-[color-mix(in_srgb,var(--card),black_5%)] hover:shadow-[0_1px_2px_rgb(0_0_0/0.05)] aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary",
        ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "bg-[color-mix(in_srgb,var(--destructive)_15%,white)] text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_22%,white)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // CampOps DS Button: 12px padding around the Label/Small line gives
        // a 42px control (superseding the earlier Handoff Spec 2.9 44px
        // minimum; still well above the WCAG 2.2 AA 24px target size).
        default:
          "h-[42px] gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
