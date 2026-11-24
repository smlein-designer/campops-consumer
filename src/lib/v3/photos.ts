import type { Campsite } from "@/lib/schemas";
import type { V3TripIntent } from "@/lib/v3/schemas";

/** Public path for a Handoff Spec §6 photo key, e.g. photoSrc("hero") -> "/photos/hero.jpg". */
export function photoSrc(key: string): string {
  return `/photos/${key}.jpg`;
}

/** A campsite's own photo: every site has one (CampOps Photo List,
 * "Campsites" tab). The four original demo sites keep their named photos;
 * the rest live at /photos/sites/{id}.jpg. */
export function campsitePhoto(site: Pick<Campsite, "id" | "photoKey">): string {
  return site.photoKey ? photoSrc(site.photoKey) : `/photos/sites/${site.id}.jpg`;
}

/** The trip header scenes (CampOps Photo List, "Trip Headers" tab): general
 * landscapes, never a specific campground. */
export type HeaderScene =
  | "hill-country-lake"
  | "hill-country-river"
  | "hill-country-hills"
  | "piney-woods"
  | "cypress-bayou"
  | "gulf-beach"
  | "north-texas-lake"
  | "west-texas-desert"
  | "west-texas-mountains"
  | "panhandle-canyon"
  | "camping-anywhere"
  | "dark-skies";

export function headerSrc(scene: HeaderScene): string {
  // The original header photo is the Hill Country lake.
  return scene === "hill-country-lake" ? photoSrc("hero") : `/photos/headers/${scene}.jpg`;
}

/** The landscape a campsite sits in. */
export function sceneForSite(site: Pick<Campsite, "region" | "city" | "waterAccess">): HeaderScene {
  const water = site.waterAccess.type;
  switch (site.region) {
    case "West Texas":
      return site.city === "Canyon" ? "panhandle-canyon" : site.city === "Terlingua" ? "west-texas-desert" : "west-texas-mountains";
    case "East Texas":
      return site.city === "Karnack" ? "cypress-bayou" : "piney-woods";
    case "Houston / Gulf":
      return water === "beach" ? "gulf-beach" : "piney-woods";
    case "Dallas / North Texas":
      return "north-texas-lake";
    default:
      // Hill Country, Austin / Central Texas, San Antonio.
      return water === "lake" ? "hill-country-lake" : water === "none" ? "hill-country-hills" : "hill-country-river";
  }
}

/** An area the user named, before any site is picked. */
function sceneForArea(area: string, wantsWater: boolean): HeaderScene | null {
  const a = area.toLowerCase();
  if (/galveston|gulf|coast|beach/.test(a)) return "gulf-beach";
  if (/caddo|bayou/.test(a)) return "cypress-bayou";
  if (/east texas|piney|tyler|nacogdoches|huntsville|conroe|houston/.test(a)) return "piney-woods";
  if (/palo duro|panhandle|amarillo|canyon, tx/.test(a)) return "panhandle-canyon";
  if (/big bend|terlingua|desert/.test(a)) return "west-texas-desert";
  if (/west texas|guadalupe mountains|davis mountains|mountain/.test(a)) return "west-texas-mountains";
  if (/north texas|dallas|fort worth|denton|possum kingdom/.test(a)) return "north-texas-lake";
  if (/hill country|austin|san antonio|central texas|fredericksburg|wimberley|kerrville|new braunfels/.test(a)) {
    return wantsWater ? "hill-country-lake" : "hill-country-hills";
  }
  return null;
}

/**
 * The trip header's scene, read off the trip as it stands: the landscape of
 * the campsite in play, else of the area asked for. Stargazing trips get the
 * night sky. Before CampOps knows where, a neutral camping scene — never a
 * place nobody chose.
 */
export function tripHeaderScene(intent: V3TripIntent, site?: Pick<Campsite, "region" | "city" | "waterAccess">): HeaderScene {
  const labels = intent.requirements.map((r) => r.label.toLowerCase());
  if (labels.some((l) => /stargaz|dark sk|night sky/.test(l))) return "dark-skies";
  if (site) return sceneForSite(site);
  const wantsWater = labels.some((l) => /lake|water|boat|kayak|swim|fish/.test(l));
  return (intent.destination && sceneForArea(intent.destination, wantsWater)) || "camping-anywhere";
}
