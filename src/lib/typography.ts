/**
 * Named text styles from the Handoff Spec (1.3 Typography) / DS Style Guide.
 * Referenced by name in components rather than re-deriving size/weight/line-height
 * per the spec's instruction: "reference them by name in code... not by re-deriving
 * the numbers."
 */
export const text = {
  displayHero: "font-display text-[48px] leading-[1.2]",
  displayH1: "font-display text-[40px] leading-[1.2]",
  displayH2: "font-display text-[32px] leading-[1.25]",
  displayH3: "font-display text-[24px] leading-[1.3]",
  headingH4: "font-display text-[18px] leading-[1.35]",
  bodyLg: "font-sans text-[18px] leading-[1.5] font-normal",
  bodyBase: "font-sans text-[16px] leading-[1.5] font-normal",
  bodySm: "font-sans text-[14px] leading-[1.45] font-normal",
  labelLg: "font-sans text-[16px] leading-[1.3] font-semibold",
  labelMd: "font-sans text-[16px] leading-[1.3] font-medium",
  labelSm: "font-sans text-[14px] leading-[1.3] font-medium",
  labelOverline:
    "font-sans text-[12px] leading-[1.3] font-semibold uppercase tracking-[0.06em]",
  caption: "font-sans text-[12px] leading-[1.4] font-normal",
} as const;
