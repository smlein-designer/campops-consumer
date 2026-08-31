/**
 * Canonical, machine-readable amenity vocabulary (Dataset Depth correction,
 * 2026-09-04 — see docs/implementation-decisions.md). The prior dataset
 * stored amenities as free-text DISPLAY strings ("Restrooms", "Showers"),
 * which is what campsites.ts happened to author them as and what a
 * requirement label happened to be phrased as — never a real enforcement
 * contract, since matching relied on raw substring comparison ("bathroom"
 * would never match "Restrooms"). Amenities are now a finite, canonical
 * union; `site.amenities` only ever contains these codes, and a free-text
 * requirement label is normalized to one of these codes (or gives up
 * honestly, staying unverifiable) before ever being compared to it.
 * Presentation still renders the friendly `AMENITY_LABELS` text — the
 * canonical code is never shown to the user directly.
 */

export const AMENITY_CODES = [
  "restroom",
  "vault_toilet",
  "shower",
  "potable_water",
  "electric_hookup",
  "dump_station",
  "boat_launch",
  "fire_pit",
  "wifi",
  "hiking_trails",
  "picnic_table",
  "fishing_pier",
  "sauna",
  "stargazing",
  "tubing_access",
] as const;

export type AmenityCode = (typeof AMENITY_CODES)[number];

export const AMENITY_LABELS: Record<AmenityCode, string> = {
  restroom: "Restrooms",
  vault_toilet: "Vault toilet",
  shower: "Showers",
  potable_water: "Potable water",
  electric_hookup: "Electric hookup",
  dump_station: "Dump station",
  boat_launch: "Boat launch",
  fire_pit: "Fire pit",
  wifi: "Wifi",
  hiking_trails: "Hiking trails",
  picnic_table: "Picnic table",
  fishing_pier: "Fishing pier",
  sauna: "Sauna",
  stargazing: "Stargazing",
  tubing_access: "Tubing access",
};

/**
 * Natural-language variants that mean the same canonical amenity —
 * "bathroom"/"bathrooms"/"toilet"/"toilets" all mean `restroom`, "hookups"
 * alone (no "electric"/"water" qualifier) defaults to the far more common
 * `electric_hookup`, etc. Checked as whole-phrase keys first, then as a
 * substring of the requirement label (see `normalizeAmenityLabel`).
 */
const AMENITY_ALIASES: Record<string, AmenityCode> = {
  restroom: "restroom",
  restrooms: "restroom",
  bathroom: "restroom",
  bathrooms: "restroom",
  toilet: "restroom",
  toilets: "restroom",
  "vault toilet": "vault_toilet",
  "pit toilet": "vault_toilet",
  shower: "shower",
  showers: "shower",
  "potable water": "potable_water",
  "drinking water": "potable_water",
  water: "potable_water",
  "electric hookup": "electric_hookup",
  "electrical hookup": "electric_hookup",
  hookup: "electric_hookup",
  hookups: "electric_hookup",
  electricity: "electric_hookup",
  "dump station": "dump_station",
  "boat launch": "boat_launch",
  "fire pit": "fire_pit",
  campfire: "fire_pit",
  campfires: "fire_pit",
  wifi: "wifi",
  internet: "wifi",
  "hiking trails": "hiking_trails",
  "hiking trail": "hiking_trails",
  trails: "hiking_trails",
  "picnic table": "picnic_table",
  "picnic tables": "picnic_table",
  "fishing pier": "fishing_pier",
  fishing: "fishing_pier",
  sauna: "sauna",
  stargazing: "stargazing",
  tubing: "tubing_access",
  "tubing access": "tubing_access",
};

/**
 * Normalizes a free-text requirement label (or raw amenity string) to a
 * canonical `AmenityCode`, or null if it doesn't correspond to any known
 * amenity — a null result must be treated as "not an amenity concept at
 * all," not "amenity confirmed absent."
 */
export function normalizeAmenityLabel(label: string): AmenityCode | null {
  const key = label.toLowerCase().trim();
  if ((AMENITY_CODES as readonly string[]).includes(key)) {
    return key as AmenityCode;
  }
  if (AMENITY_ALIASES[key]) return AMENITY_ALIASES[key];
  for (const [alias, code] of Object.entries(AMENITY_ALIASES)) {
    if (key.includes(alias)) return code;
  }
  return null;
}
