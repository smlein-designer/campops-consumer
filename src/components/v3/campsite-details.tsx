import type { ReactNode } from "react";
import { ExpandablePhoto } from "@/components/v3/expandable-photo";
import { FitRow, type FitRowState } from "@/components/v3/fit-row";
import type { SiteFact } from "@/lib/v3/site-details";

/**
 * Everything about one campsite: the facts from the dataset, its amenities,
 * and how it fits this trip. Built from the same parts as the Campsite
 * Option card (Figma 29:217), at full width.
 */
export function CampsiteDetails({
  photo,
  eyebrow,
  title,
  location,
  address,
  description,
  facts,
  amenities,
  family,
  fit,
  actions,
}: {
  photo?: string;
  eyebrow: string;
  title: string;
  location: string;
  address: string;
  description: string;
  facts: SiteFact[];
  amenities: string[];
  family: string | null;
  fit: { state: FitRowState; requirement: string; detail: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--color-bg-surface)]">
      {photo && <ExpandablePhoto src={photo} alt={title} className="h-48 md:h-60" />}
      <div className="space-y-6 p-4 md:p-6">
        <div className="space-y-1">
          <p className="text-overline text-[var(--color-text-secondary)]">{eyebrow}</p>
          <h2 className="text-heading-m text-[var(--color-text-primary)]">{title}</h2>
          <p className="text-body-s text-[var(--color-text-secondary)]">
            {location} · {address}
          </p>
          <p className="pt-2 text-body-m text-[var(--color-text-primary)]">{description}</p>
        </div>

        <section className="space-y-3">
          <h3 className="text-overline text-[var(--color-text-secondary)]">The site</h3>
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-3">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-caption text-[var(--color-text-tertiary)]">{fact.label}</dt>
                <dd className="text-label-m text-[var(--color-text-primary)]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-3">
          <h3 className="text-overline text-[var(--color-text-secondary)]">Amenities</h3>
          {amenities.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="rounded-[4px] border border-[var(--color-border-default)] px-2 py-1 text-label-s text-[var(--color-text-primary)]"
                >
                  {amenity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-s text-[var(--color-text-secondary)]">None listed.</p>
          )}
          {family && <p className="text-body-s text-[var(--color-text-secondary)]">{family}</p>}
        </section>

        {fit.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-overline text-[var(--color-text-secondary)]">How it fits your trip</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {fit.map((row) => (
                <FitRow key={row.requirement} {...row} />
              ))}
            </div>
          </section>
        )}

        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
