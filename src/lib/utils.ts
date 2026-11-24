import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Our custom type-ramp classes (text-label-l, text-body-s, ...) are plain
// CSS classes, not Tailwind's generated ones — without this, tailwind-merge
// lumps them into the same "text color" group as an arbitrary-value text
// color class and silently drops one of the two (see globals.css's .text-* rules).
const twMerge = extendTailwindMerge<"v3-type-ramp">({
  extend: {
    classGroups: {
      "v3-type-ramp": [
        "text-display-xl",
        "text-display-l",
        "text-heading-l",
        "text-heading-m",
        "text-heading-s",
        "text-price-l",
        "text-body-l",
        "text-body-m",
        "text-body-s",
        "text-label-l",
        "text-label-m",
        "text-label-s",
        "text-overline",
        "text-caption",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
