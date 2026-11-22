/** Public path for a Handoff Spec §6 photo key, e.g. photoSrc("hero") -> "/photos/hero.jpg". */
export function photoSrc(key: string): string {
  return `/photos/${key}.jpg`;
}
