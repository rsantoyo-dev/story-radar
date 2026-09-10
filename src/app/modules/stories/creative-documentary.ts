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
  /** Optional on historical snapshots; assessed independently for each venue. */
  purpose?: PlaceExtraction["purpose"];
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
  imageTitles?: string[];
};
export type PhotoEvidence = {
  placeId: string;
  sourceUrl: string;
  resourceUrl: string;
  author: string;
  license: "CC0" | "CC BY 4.0" | "CC BY-SA 4.0";
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
  return value.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLocaleLowerCase().replace(/[’']/gu, "'").replace(/[-‐‑–]/gu, " ").replace(/\s+/gu, " ").trim();
}
export function parsePlaceExtraction(value: unknown, source: string): PlaceExtraction {
  if (!record(value) || !Array.isArray(value.mentions) || value.mentions.length > 6 || !["location", "current-state", "unknown"].includes(String(value.purpose))) throw new Error("Invalid place extraction");
  const mentions = value.mentions.map((item): PlaceMention => {
    if (!record(item) || Object.keys(item).some(k => !["name", "kind", "role", "excerpt", "municipality", "region", "country", "purpose"].includes(k))) throw new Error("Unexpected place fields");
    for (const key of ["name", "excerpt", "municipality", "region", "country"]) {
      if (typeof item[key] !== "string" || item[key].length > (key === "excerpt" ? 600 : 120)) throw new Error("Invalid place text");
    }
    if (!item.name || !item.excerpt || !source.includes(item.excerpt as string) || !(item.excerpt as string).includes(item.name as string)) throw new Error("Place evidence must be copied exactly from the article");
    if (!["named", "generic"].includes(String(item.kind)) || !["event", "secondary"].includes(String(item.role))) throw new Error("Invalid place role");
    if (item.purpose !== undefined && !["location", "current-state", "unknown"].includes(String(item.purpose))) throw new Error("Invalid place purpose");
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
/** Only known licenses; normalize transport and optional trailing slash, not arbitrary paths. */
export function documentaryPhotoLicense(value: string): { license: PhotoEvidence["license"]; licenseUrl: string } | undefined {
  const match = /^https?:\/\/creativecommons\.org\/(publicdomain\/zero\/1\.0|licenses\/by\/4\.0|licenses\/by-sa\/4\.0)\/?$/.exec(value.trim());
  if (!match) return undefined;
  return {
    license: match[1] === "publicdomain/zero/1.0" ? "CC0" : match[1] === "licenses/by/4.0" ? "CC BY 4.0" : "CC BY-SA 4.0",
    licenseUrl: `https://creativecommons.org/${match[1]}/`,
  };
}
export function eligiblePhoto(photo: PhotoEvidence, place: PlaceEvidence, now = Date.now()): boolean {
  const age = now - Date.parse(photo.retrievedAt);
  const rights = documentaryPhotoLicense(photo.licenseUrl);
  return photo.placeId === place.id && photo.width >= 1080 && photo.height >= 640 &&
    /^[a-f0-9]{64}$/.test(photo.sha256) && age >= 0 && age <= 86400_000 &&
    Boolean(rights && rights.license === photo.license && (photo.license === "CC0" || photo.author.trim())) &&
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


/** Physical-condition claims in visible copy must not be illustrated with archive imagery. */
export function reportsChangedPlaceState(text: string): boolean {
  return /\b(rénov|travaux|fermeture|fermé|construction|inaugur|réaménag|demolit|damage|renovat|closure|closed|réfection|cierre|remodel)/iu.test(text) ||
    /\bobras\s+(?:de\s+)?(?:construcción|reparación|remodelación)/iu.test(text);
}

/** Select only an unambiguous venue actually named in this slide's visible copy. */
export function documentarySceneExtraction(extraction: PlaceExtraction, title: string, excerpt: string): PlaceExtraction {
  const visible = normalizePlaceName(excerpt);
  const mentions = extraction.mentions.filter(m => visible.includes(normalizePlaceName(m.name)));
  const unique = [...new Map(mentions.map(m => [normalizePlaceName(m.name), m])).values()];
  const purpose = reportsChangedPlaceState(`${title}\n${excerpt}`) ? "current-state"
    : unique.length === 1 ? unique[0].purpose ?? extraction.purpose : "unknown";
  return { mentions: unique, purpose };
}

/** Keep source sentences intact while giving separate venues their own scenes. */
export function selectDocumentaryExcerpts(sentences: string[], extraction: PlaceExtraction): string[] {
  const selected = sentences.slice(0, 1);
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const scene = documentarySceneExtraction(extraction, "", sentence);
    if (!canUseLocationVisual(scene)) continue;
    const name = normalizePlaceName(scene.mentions[0].name);
    if (seen.has(name)) continue;
    seen.add(name);
    if (!selected.includes(sentence)) selected.push(sentence);
    if (selected.length === 3) return selected;
  }
  for (const sentence of sentences) {
    if (!selected.includes(sentence)) selected.push(sentence);
    if (selected.length === 3) break;
  }
  return selected;
}


/** Discovery is informational: retain complete place-name matches, never name fragments. */
export function relevantPlaceDiscovery(discovery: DocumentarySnapshot["discovery"], mentions: PlaceMention[]): DocumentarySnapshot["discovery"] {
  if (!discovery) return undefined;
  const searchable = (text: string) => normalizePlaceName(text).normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const names = mentions.filter(m => m.kind === "named").map(m => searchable(m.name)).filter(Boolean);
  return { ...discovery, sources: discovery.sources.filter(item => {
    let url = item.url;
    try { url = decodeURIComponent(url); } catch { /* keep original */ }
    const text = ` ${searchable(`${item.title} ${url}`)} `;
    return names.some(name => text.includes(` ${name} `));
  }) };
}
