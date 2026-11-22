// Start · Empty (Handoff Spec §4.1 node 5:64) — static reference screen for
// comparing against Figma; the real app renders the same LandingHero live
// at /trip/live.
import { LandingHero } from "@/components/v3/landing-hero";

export default function StartEmptyPage() {
  return <LandingHero />;
}
