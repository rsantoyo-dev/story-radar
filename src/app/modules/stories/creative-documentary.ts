import type { CreativeGeoScope, CreativeAiUsage } from "./creative-content.types";

export const DOCUMENTARY_PROVIDER = "documentary";
export const DOCUMENTARY_VERSION = "geo-documentary-v1";
export const EMPTY_GEO_USAGE: CreativeAiUsage = { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
export type PlaceMention = {
  name: string;
  kind: "named" | "generic";
  role: "event" | "secondary";
  excerpt: string;
  municipality: string;
  region: string;
  country: string;
};
export type PlaceEvidence = {
  id: string;
  name: string;
  sourceUrl: string;
  revision: number;
  scope: CreativeGeoScope;
  hierarchy: { id: string; name: string; revision: number }[];
  coordinates?: { latitude: number; longitude: number; precision: number };
  imageTitle?: string;
};
export type PhotoEvidence = {
  placeId: string;
  sourceUrl: string;
  resourceUrl: string;
  author: string;
  license: "CC0" | "CC BY 4.0";
  licenseUrl: string;
  attribution: string;
  creditUrl?: string;
  captureDate: string | null;
  retrievedAt: string;
  sha256: string;
  width: number;
  height: number;
  contentType: string;
};
export type DocumentarySnapshot = {
  version: typeof DOCUMENTARY_VERSION;
  inputHash: string;
  sourceToken: string;
  story: { id: string; title: string; url: string; excerpt: string };
  scope: CreativeGeoScope;
  policy: { mode: string; version: number };
  mentions: PlaceMention[];
  places: PlaceEvidence[];
  representation: "photo" | "map" | "typography" | "blocked";
  reasons: string[];
  photo?: PhotoEvidence;
  map?: { attribution: string; termsUrl: string; placeId: string; sha256: string };
  extraction: { model: string; attempts: number; usage: CreativeAiUsage; status: "completed" | "unavailable" | "invalid" };
  discovery?: { calls: number; sources: { url: string; title: string; imageUrl?: string }[] };
  preparedAt: string;
  reviews?: { decision: "approved" | "rejected"; actor: string; at: string }[];
  review?: { decision: "approved" | "rejected"; actor: string; at: string };
};
export type PlaceExtraction = { mentions: PlaceMention[]; purpose: "location" | "current-state" | "unknown" };
export function normalizePlaceName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[’']/gu, "'").replace(/[-‐‑–]/gu, "-").replace(/\s+/gu, " ").trim();
}
export function parsePlaceExtraction(value: unknown, source: string): PlaceExtraction {
  if (!record(value) || !Array.isArray(value.mentions) || value.mentions.length > 6 || !["location", "current-state", "unknown"].includes(String(value.purpose))) throw new Error("Invalid place extraction");
  const mentions = value.mentions.map((item): PlaceMention => {
    if (!record(item) || Object.keys(item).some(k => !["name", "kind", "role", "excerpt", "municipality", "region", "country"].includes(k))) throw new Error("Unexpected place fields");
    for (const key of ["name", "excerpt", "municipality", "region", "country"]) {
      if (typeof item[key] !== "string" || item[key].length > (key === "excerpt" ? 600 : 120)) throw new Error("Invalid place text");
    }
    if (!item.name || !item.excerpt || !source.includes(item.excerpt as string) || !(item.excerpt as string).includes(item.name as string)) throw new Error("Place evidence must be copied exactly from the article");
    if (!["named", "generic"].includes(String(item.kind)) || !["event", "secondary"].includes(String(item.role))) throw new Error("Invalid place role");
    return item as PlaceMention;
  });
  return { mentions, purpose: value.purpose as PlaceExtraction["purpose"] };
}
export function mentionFitsScope(mention: PlaceMention, scope: CreativeGeoScope): boolean {
  return Boolean(scope.municipality && scope.region && scope.country) &&
    (["municipality", "region", "country"] as const).every(key => !mention[key] || normalizePlaceName(mention[key]) === normalizePlaceName(scope[key]));
}
/** Unknown purpose is deliberately ineligible for archival photos or maps. */
export function canUseLocationVisual(extraction: PlaceExtraction): boolean {
  return extraction.purpose === "location" && extraction.mentions.length === 1 && extraction.mentions[0].role === "event" && extraction.mentions.every(m => m.kind === "named");
}
export function eligiblePhoto(photo: PhotoEvidence, place: PlaceEvidence, now = Date.now()): boolean {
  const age = now - Date.parse(photo.retrievedAt);
  return photo.placeId === place.id && photo.width >= 1080 && photo.height >= 640 &&
    /^[a-f0-9]{64}$/.test(photo.sha256) && age >= 0 && age <= 86400_000 &&
    ((photo.license === "CC0" && photo.licenseUrl === "https://creativecommons.org/publicdomain/zero/1.0/") ||
     (photo.license === "CC BY 4.0" && photo.licenseUrl === "https://creativecommons.org/licenses/by/4.0/" && Boolean(photo.author))) &&
    Boolean(photo.attribution) && ["image/jpeg", "image/png", "image/webp"].includes(photo.contentType);
}
export function documentarySnapshot(value: unknown): DocumentarySnapshot | undefined {
  if (!record(value) || !record(value.documentary)) return undefined;
  const data = value.documentary;
  return data.version === DOCUMENTARY_VERSION && typeof data.inputHash === "string" && Array.isArray(data.reasons) ? data as DocumentarySnapshot : undefined;
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
