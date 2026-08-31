import { Banknote, CalendarDays, MapPin, Users } from "lucide-react";
import { text } from "@/lib/typography";
import { RequirementChip } from "@/components/campops/requirement-chip";
import { rawRequirementLabel } from "@/lib/requirements";

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
 * Rich candidate presentation card (Handoff Spec 2.7 / Figma DS node 2085:6).
 *
 * The photo carousel/lightbox affordance is a static illustrative placeholder
 * in the design — "the design specifies the affordance, not the interaction
 * logic" — so this slice renders the static photo indicators without real
 * carousel/lightbox behavior.
 *
 * Preserved/Compromise chip removal (design-resolution update, 2026-09-01):
 * direct-manipulation chip removal is now available here too, not only on
 * the Trip Panel's plain-chip fallback — the same remove control, wired to
 * the same `onRemoveRequirement` state transition the caller also uses for
 * the plain chip list. `removableHardLabels` gates it per-chip: only labels
 * that correspond to a literal `hardRequirements` entry get a working remove
 * icon (synthetic checks like "Capacity for 4" — derived from `guestCount`,
 * not from requirement text — render the same non-interactive chip as
 * always, since there is nothing in `hardRequirements` for them to remove).
 */
export function CandidateCard({
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
  removableHardLabels,
  onRemoveRequirement,
}: {
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
  /** Set of raw `hardRequirements` labels currently removable this way. */
  removableHardLabels?: Set<string>;
  /** Called with the raw (unprefixed) requirement label to remove. */
  onRemoveRequirement?: (rawLabel: string) => void;
}) {
  function removeHandlerFor(displayLabel: string): (() => void) | undefined {
    const raw = rawRequirementLabel(displayLabel);
    if (!removableHardLabels?.has(raw) || !onRemoveRequirement) return undefined;
    return () => onRemoveRequirement(raw);
  }
  return (
    <div className="flex w-full max-w-[460px] flex-col items-start gap-4 rounded-md border border-border bg-card">
      {/* Photo — illustrative placeholder, no real photo assets in the POC dataset */}
      <div className="relative h-[180px] w-full shrink-0 overflow-hidden rounded-t-md bg-gradient-to-b from-sky-tint to-earth-tint">
        <div className="absolute top-3 left-3 rounded-[10px] bg-black/45 px-2.5 py-1 text-xs font-medium text-white">
          1 / 1
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col items-start gap-4 px-6 pb-6">
        <div className="flex items-center gap-1">
          <MapPin className="size-4 text-muted-foreground" />
          <p className={`${text.bodySm} text-muted-foreground`}>{location}</p>
        </div>

        <div className="flex w-full items-center justify-between gap-2">
          <p
            className={`${text.labelLg} min-w-0 truncate text-card-foreground`}
          >
            {siteName}
          </p>
          <div className="shrink-0 rounded-full bg-secondary px-2 py-0.5">
            <span className={`${text.caption} font-semibold`}>{siteType}</span>
          </div>
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
            icon={<CalendarDays className="size-4 text-muted-foreground" />}
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
          <div className="flex flex-wrap items-start gap-1">
            {amenities.map((amenity) => (
              <div
                key={amenity}
                className="rounded-full border border-border bg-card px-2 py-0.5"
              >
                <span className={`${text.caption} font-semibold`}>
                  {amenity}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-border" />

        <div className="flex w-full flex-col items-start gap-1">
          <span className={`${text.labelOverline} text-muted-foreground`}>
            How this fits
          </span>
          <div className="flex flex-wrap items-start gap-1">
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
