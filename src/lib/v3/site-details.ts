import { AMENITY_LABELS } from "@/lib/amenities";
import { rangesOverlap } from "@/lib/dates";
import { describeFamilyFeatures } from "@/lib/family-features";
import { describeCancellationPolicy } from "@/lib/reservation";
import type { Campsite } from "@/lib/schemas";
import { describeWater } from "@/lib/v3/fit";
import { driveHours, formatDrive, tripRange } from "@/lib/v3/search";
import type { V3TripIntent } from "@/lib/v3/schemas";

export type SiteFact = { label: string; value: string };

const NOISE: Record<Campsite["noiseLevel"], string> = { low: "Quiet", medium: "Some noise", high: "Can be loud" };
const PRIVACY: Record<Campsite["seclusion"], string> = {
  high: "Secluded",
  medium: "Some privacy",
  low: "Close to neighbors",
};

/**
 * Everything the dataset knows about a campsite, in plain words (v2's
 * Candidate Card showed these; v3's cards only show what matched the
 * request). Trip-relative facts — drive time, total, cancellation date,
 * availability — are worked out from this trip, never stored on the site.
 */
export function siteDetails(site: Campsite, intent: V3TripIntent) {
  const range = tripRange(intent);
  const hours = driveHours(intent, site);
  const facts: SiteFact[] = [
    { label: "Site type", value: site.siteType },
    { label: "Sleeps", value: `Up to ${site.capacity}` },
    { label: "Pets", value: site.petPolicy.allowed ? `Allowed, up to ${site.petPolicy.maxPets}` : "Not allowed" },
    { label: "Water", value: describeWater(site) },
    { label: "Sound", value: NOISE[site.noiseLevel] },
    { label: "Privacy", value: PRIVACY[site.seclusion] },
    ...(hours != null ? [{ label: "Drive", value: `${formatDrive(hours)} from ${intent.origin}` }] : []),
    { label: "Price", value: `$${site.pricePerNight} a night${site.serviceFee > 0 ? ` + $${site.serviceFee} service fee` : ""}` },
    ...(range
      ? [
          {
            label: `Your ${range.nights} night${range.nights === 1 ? "" : "s"}`,
            value: `$${Math.round((site.pricePerNight * range.nights + site.serviceFee) * 100) / 100}`,
          },
          {
            label: "Your dates",
            value: site.unavailableRanges.some((r) => rangesOverlap(range.startISO, range.endISO, r.start, r.end))
              ? "Booked for part of your stay"
              : "Open",
          },
          { label: "Cancellation", value: describeCancellationPolicy(site.cancellationPolicy, range.startISO) },
        ]
      : [
          {
            label: "Cancellation",
            value: `Free until ${site.cancellationPolicy.freeUntilDaysBeforeCheckIn} days before check-in`,
          },
        ]),
  ];
  const family = describeFamilyFeatures(site.familyFeatures);
  return {
    // "Austin / Central Texas" already names the town.
    location: site.region.includes(site.city) ? site.region : `${site.city}, ${site.region}`,
    address: site.address,
    description: site.description,
    facts,
    amenities: site.amenities.map((code) => AMENITY_LABELS[code]),
    family: family ? `Good for families: ${family}.` : null,
  };
}
