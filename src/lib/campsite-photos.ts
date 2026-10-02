import type { Campsite } from "@/lib/schemas";

/**
 * Candidate Card photography — stand-in photos from the CampOps DS
 * "Candidate Card" page, exported to
 * `public/assets/campsites/{setting}-{type}.jpg` at Figma's native
 * 1024×1024 (the card crops them with Figma's FILL treatment,
 * `object-cover`).
 *
 * Figma names the photos but doesn't assign them to campsites, so each
 * fixture gets an explicit, deterministic setting chosen for geographic
 * plausibility first, then variety within a region (so a recommendation
 * and its alternatives look like different places):
 *  - river:  Hill Country / Edwards Plateau limestone creeks and rivers
 *  - forest: Piney Woods, wooded lakes and hills
 *  - dunes:  the Gulf coast (Galveston) only
 *  - desert: West Texas canyons and desert mountains
 * Photos that fit no campsite (the coastal-dunes tent and cabin) are
 * deliberately not shipped. The site type always comes from the record
 * itself, so an RV site never shows a tent.
 */
export type PhotoSetting = "forest" | "river" | "dunes" | "desert";
type PhotoType = "tent" | "rv" | "cabin";

export const SITE_PHOTO_SETTING: Record<string, PhotoSetting> = {
  // Hill Country
  "blue-ridge-14": "forest",
  "blue-ridge-22": "river",
  "silver-creek-7": "river",
  "timber-hollow-2": "forest",
  "pedernales-falls-6": "river",
  "guadalupe-river-3": "river",
  "enchanted-rock-2": "forest",
  // East Texas (Piney Woods)
  "cedar-hollow-3": "forest",
  "tyler-state-park-7": "forest",
  "caddo-lake-4": "forest",
  // Austin / Central Texas
  "pine-ridge-9": "forest",
  "lakeview-11": "forest",
  "mossy-creek-4": "river",
  // San Antonio (Edwards Plateau edge)
  "eagle-point-5": "forest",
  "government-canyon-5": "river",
  "medina-lake-8": "forest",
  // Houston / Gulf
  "huntsville-4": "forest",
  "galveston-island-1": "dunes",
  "lake-conroe-9": "forest",
  // Dallas / North Texas
  "possum-kingdom-2": "forest",
  "cedar-hill-6": "forest",
  "ray-roberts-3": "forest",
  // West Texas
  "north-ridge-1": "desert",
  "guadalupe-mountains-1": "desert",
  "palo-duro-canyon-5": "desert",
};

function photoType(siteType: string): PhotoType {
  if (/rv/i.test(siteType)) return "rv";
  if (/cabin/i.test(siteType)) return "cabin";
  return "tent";
}

/** Public path of the photo for this campsite. Unmapped sites fall back to
 * the forest photo for their site type — still deterministic. */
export function campsitePhotoSrc(site: Pick<Campsite, "id" | "siteType">): string {
  const setting = SITE_PHOTO_SETTING[site.id] ?? "forest";
  return `/assets/campsites/${setting}-${photoType(site.siteType)}.jpg`;
}
