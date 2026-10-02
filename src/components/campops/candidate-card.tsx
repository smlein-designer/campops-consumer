import { Banknote, Calendars, MapPin, Users } from "lucide-react";
import { text } from "@/lib/typography";
import { RequirementChip } from "@/components/campops/requirement-chip";
import { Pill } from "@/components/campops/badge";
import type { ChipSource } from "@/lib/requirements";

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        {icon}
        <span className={`${text.labelOverline} text-muted-foreground`}>
          {label}
        </span>
      </div>
      <p className={`${text.labelSm} text-card-foreground`}>{value}</p>
    </div>
  );
}

/**
 * Rich candidate presentation card (CampOps DS "Candidate Card").
 *
 * Photo: one stand-in photo per site (`photoSrc`, chosen deterministically
 * from the DS photo set by setting and site type — see campsite-photos.ts),
 * with an honest "1 / 1" counter. The DS card's
 * carousel dots and expand (lightbox) button are deliberately omitted —
 * with a single image there is nothing to page through, and no expansion
 * behavior exists to back an expand affordance.
 *
 * The fact row and "How this fits" chips wrap rather than clip (the DS
 * master uses single non-wrapping rows; Pages v2 mobile wraps the facts).
 *
 * Preserved/Compromise chip removal (design-resolution update, 2026-09-01):
 * direct-manipulation chip removal is now available here too, not only on
 * the Trip Panel's plain-chip fallback — the same remove control, wired to
 * the same `onRemoveRequirement` state transition the caller also uses for
 * the plain chip list. Every chip's X works: `chipSourceFor` maps it to the
 * trip fact it stands for — a literal requirement in any tier, or the field
 * a derived chip comes from ("Capacity for 4" → party size, "In Hill
 * Country" → destination, "Available for your dates" → dates).
 */
export function CandidateCard({
  photoSrc,
  location,
  siteName,
  siteType,
  capacityValue,
  distanceValue,
  datesValue,
  priceValue,
  amenities,
  preserved,
  compromises,
  explanation,
  chipSourceFor,
  onRemoveChip,
}: {
  photoSrc: string;
  location: string;
  siteName: string;
  siteType: string;
  capacityValue: string;
  distanceValue: string;
  datesValue: string;
  priceValue: string;
  amenities: string[];
  preserved: string[];
  compromises: string[];
  explanation: string;
  /** The trip fact a chip (by display label) stands for. */
  chipSourceFor?: (displayLabel: string) => ChipSource | null;
  /** Called with the chip's source and display label to remove it. */
  onRemoveChip?: (source: ChipSource, displayLabel: string) => void;
}) {
  function removeHandlerFor(displayLabel: string): (() => void) | undefined {
    const source = chipSourceFor?.(displayLabel);
    if (!source || !onRemoveChip) return undefined;
    return () => onRemoveChip(source, displayLabel);
  }
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-4 overflow-hidden rounded-md border border-border bg-card">
      <div className="relative h-[180px] w-full shrink-0 bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- static
            stand-in photo (see doc comment above). */}
        <img
          src={photoSrc}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute top-3 left-3 rounded-[10px] bg-black/45 px-2.5 py-1 text-xs font-medium text-white">
          1 / 1
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col items-start gap-4 px-6 pb-6">
        <div className="flex items-center gap-1">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <p className={`${text.bodySm} text-muted-foreground`}>{location}</p>
        </div>

        <div className="flex w-full items-center justify-between gap-2">
          <p
            className={`${text.headingH4} min-w-0 truncate text-card-foreground`}
          >
            {siteName}
          </p>
          <Pill label={siteType} variant="secondary" />
        </div>

        <div className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <Fact
            icon={<Users className="size-4 text-muted-foreground" />}
            label="Capacity"
            value={capacityValue}
          />
          <Fact
            icon={<MapPin className="size-4 text-muted-foreground" />}
            label="Distance"
            value={distanceValue}
          />
          <Fact
            icon={<Calendars className="size-4 text-muted-foreground" />}
            label="Dates"
            value={datesValue}
          />
          <Fact
            icon={<Banknote className="size-4 text-muted-foreground" />}
            label="Price"
            value={priceValue}
          />
        </div>

        <div className="h-px w-full bg-border" />

        <div className="flex w-full flex-col items-start gap-1">
          <span className={`${text.labelOverline} text-muted-foreground`}>
            Amenities
          </span>
          <div className="flex flex-wrap items-start gap-x-1 gap-y-2">
            {amenities.map((amenity) => (
              <Pill key={amenity} label={amenity} variant="outline" />
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-border" />

        <div className="flex w-full flex-col items-start gap-1">
          <span className={`${text.labelOverline} text-muted-foreground`}>
            How this fits
          </span>
          <div className="flex flex-wrap items-start gap-x-1 gap-y-2">
            {preserved.map((label) => (
              <RequirementChip
                key={label}
                label={label}
                tier="hard"
                onRemove={removeHandlerFor(label)}
              />
            ))}
            {compromises.map((label) => (
              <RequirementChip
                key={label}
                label={label}
                tier="flexible"
                onRemove={removeHandlerFor(label)}
              />
            ))}
          </div>
        </div>

        <p className={`${text.bodySm} text-muted-foreground`}>{explanation}</p>
      </div>
    </div>
  );
}
