import "server-only";
import { request } from "node:https";
import { createHmac } from "node:crypto";
import { lookupPublicAddress } from "../sources/rss/fetch-rss-feed";
import { normalizePlaceName, record } from "./creative-documentary";
import type { MapsPreviewInput, MapsPreviewAttribution } from "./google-maps-preview.types";

export class MapsPreviewError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}
export type GoogleMapsConfig = {
  enabled: boolean; apiKey: string; signingSecret: string;
  maxPhotos: number; maxPreviewsPerDay: number;
};
export function googleMapsConfig(env: Record<string, string | undefined> = process.env): GoogleMapsConfig {
  const integer = (key: string, fallback: number, max: number) => {
    const value = env[key]?.trim();
    if (!value) return fallback;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
      throw new MapsPreviewError(`${key} must be between 1 and ${max}.`, 503);
    }
    return Number(value);
  };
  const signingSecret = env.CREATIVE_GOOGLE_MAPS_SIGNING_SECRET?.trim() || "";
  if (signingSecret && !/^[A-Za-z0-9_-]{20,100}={0,2}$/.test(signingSecret)) {
    throw new MapsPreviewError("The Google Maps URL signing secret has an invalid format.", 503);
  }
  return {
    enabled: env.CREATIVE_GOOGLE_MAPS_PREVIEW_ENABLED === "true",
    apiKey: env.CREATIVE_GOOGLE_MAPS_API_KEY?.trim() || "",
    signingSecret,
    maxPhotos: integer("CREATIVE_GOOGLE_MAPS_MAX_PHOTOS", 2, 2),
    maxPreviewsPerDay: integer("CREATIVE_GOOGLE_MAPS_MAX_PREVIEWS_PER_DAY", 10, 50),
  };
}

export function parseMapsPreviewInput(value: unknown): MapsPreviewInput {
  if (!record(value) || !["google", "demo"].includes(String(value.mode))) {
    throw new MapsPreviewError("Choose Google or demo mode.", 400);
  }
  const text = (field: string, required: boolean, limit: number) => {
    const item = value[field];
    if (typeof item !== "string" || item.length > limit || /[\u0000-\u001f]/u.test(item) || (required && !item.trim())) {
      throw new MapsPreviewError(`Invalid ${field}.`, 400);
    }
    return item.trim();
  };
  const required = value.mode === "google";
  const languageCode = value.languageCode === undefined ? "en" : value.languageCode;
  if (typeof languageCode !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(languageCode)) throw new MapsPreviewError("Use a language code such as en, fr or es.", 400);
  return { mode: value.mode as MapsPreviewInput["mode"], name: text("name", required, 160),
    municipality: text("municipality", required, 100), region: text("region", false, 100), country: text("country", required, 100), languageCode };
}

export type GoogleResourceRequest = {
  method?: "GET" | "POST"; headers?: Record<string, string>; body?: string;
  maxBytes: number; signal: AbortSignal;
};
export type GoogleTransport = (url: URL, input: GoogleResourceRequest) => Promise<Buffer>;
const API_HOSTS = new Set(["places.googleapis.com", "maps.googleapis.com"]);
const PHOTO_HOST = /^lh[3-6]\.googleusercontent\.com$/;
export function assertGoogleResourceUrl(url: URL): void {
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      (!API_HOSTS.has(url.hostname) && !PHOTO_HOST.test(url.hostname))) {
    throw new MapsPreviewError("Google returned an unsupported resource destination.");
  }
}

/** Connection-time public DNS checking; never follow redirects or log keyed URLs. */
export const fetchGoogleResource: GoogleTransport = (url, input) => {
  assertGoogleResourceUrl(url);
  return new Promise((resolve, reject) => {
    const req = request(url, { method: input.method || "GET", signal: input.signal, lookup: lookupPublicAddress,
      headers: { "Accept-Encoding": "identity", ...input.headers } }, (response) => {
      const status = response.statusCode || 0;
      if (status !== 200 || response.headers["x-staticmap-api-warning"] || Number(response.headers["content-length"] || 0) > input.maxBytes) {
        response.destroy();
        reject(new MapsPreviewError(status === 403 ? "Google denied access. Check enabled APIs, billing and key restrictions."
          : status === 429 ? "Google Maps quota was exceeded."
            : "Google returned an incomplete, oversized or unsuccessful response."));
        return;
      }
      let size = 0; const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > input.maxBytes) response.destroy(new Error("Response limit"));
        else chunks.push(chunk);
      });
      response.on("error", () => reject(new MapsPreviewError("Google resource download was interrupted.")));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", () => reject(new MapsPreviewError("Google Maps request failed or timed out.")));
    req.setTimeout(8_000, () => req.destroy());
    req.end(input.body);
  });
};

type Photo = { name: string; attributions: MapsPreviewAttribution[] };
export type GooglePlaceCandidate = {
  id: string; name: string; address: string; sourceUrl: string;
  latitude: number; longitude: number; matchesScope: boolean; exactName: boolean;
  pointSuitable: boolean; photos: Photo[]; attributions: MapsPreviewAttribution[];
  namedPoint: boolean;
  exclusions: string[];
};
/** Tolerate typing differences in scope, not different names or geographic levels.
 * Latin accents and hyphens/spaces are equivalent; preserve marks in other scripts.
 * This does not establish the identity of a business at an address.
 */
export function normalizeGoogleScope(value: string): string {
  return normalizePlaceName(value).normalize("NFD")
    .replace(/([a-z])[\u0300-\u036f]+/giu, "$1").normalize("NFC")
    .replace(/\p{Pd}/gu, " ").replace(/\s+/gu, " ").trim();
}
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
function sourceUrl(id: string, name: string): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.search = new URLSearchParams({ api: "1", query: name, query_place_id: id }).toString();
  return url.toString();
}
function attributionUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["www.google.com", "maps.google.com"].includes(url.hostname) && !/key|token|signature/i.test(url.search)) return url.toString();
  } catch { /* optional link is not trusted */ }
}
function authors(value: unknown): MapsPreviewAttribution[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return undefined;
  const parsed = value.map(item => record(item) ? { name: text(item.displayName || item.provider, 160), url: attributionUrl(item.uri || item.providerUri) } : undefined);
  return parsed.every(item => item?.name) ? parsed as MapsPreviewAttribution[] : undefined;
}
export function parseGooglePlaces(value: unknown, input: MapsPreviewInput): { candidates: GooglePlaceCandidate[]; incomplete: boolean } {
  if (!record(value) || value.error || (value.places !== undefined && !Array.isArray(value.places))) throw new MapsPreviewError("Google returned invalid place data.");
  const candidates: GooglePlaceCandidate[] = [];
  const places = (value.places ?? []) as unknown[];
  let incomplete = Boolean(value.nextPageToken) || places.length > 5;
  for (const raw of places.slice(0, 5)) {
    if (!record(raw)) { incomplete = true; continue; }
    const id = text(raw.id, 256), name = record(raw.displayName) ? text(raw.displayName.text, 200) : "";
    const address = text(raw.formattedAddress, 500);
    const coordinates = record(raw.location) ? raw.location : {};
    const { latitude, longitude } = coordinates;
    const attribution = authors(raw.attributions);
    if (!/^[\w-]+$/.test(id) || !name || !address || !attribution || typeof latitude !== "number" || typeof longitude !== "number" ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) { incomplete = true; continue; }
    const components = Array.isArray(raw.addressComponents) ? raw.addressComponents.filter(record) : [];
    const exclusions: string[] = [];
    const matches = (expected: string, types: string[]) => !expected || components.some(component =>
      Array.isArray(component.types) && types.some(type => (component.types as unknown[]).includes(type)) &&
      [component.longText, component.shortText].some(name => typeof name === "string" && normalizeGoogleScope(name) === normalizeGoogleScope(expected)));
    for (const [field, types] of [
      ["country", ["country"]],
      ["region", ["administrative_area_level_1", "administrative_area_level_2"]],
      ["municipality", ["locality", "postal_town", "administrative_area_level_3"]],
    ] as const) {
      if (!matches(input[field], [...types])) exclusions.push(`The provider's ${field} does not match or does not confirm "${input[field]}".`);
    }
    const matchesScope = exclusions.length === 0;
    const types = Array.isArray(raw.types) ? raw.types : [];
    const pointSuitable = types.length > 0 && !types.some(type => typeof type === "string" && /^(route|locality|country|postal_code|administrative_area_level_\d)$/.test(type));
    const exactName = normalizePlaceName(name) === normalizePlaceName(input.name);
    const namedPoint = pointSuitable && types.some(type => type === "establishment" || type === "point_of_interest") && !types.includes("street_address");
    if (!exactName) exclusions.push(`Google returned "${name}", not the requested name "${input.name}". ${namedPoint ? "This named search result can be inspected, but its identity is not verified." : "An address alone does not confirm which business or event is there."}`);
    if (!pointSuitable) exclusions.push("This result is a road, area or unclassified location, not a suitable point for this test.");
    const photos: Photo[] = [];
    for (const entry of Array.isArray(raw.photos) ? raw.photos.slice(0, 10) : []) {
      if (!record(entry) || typeof entry.name !== "string" || !entry.name.startsWith(`places/${id}/photos/`)) continue;
      const reference = entry.name.slice(`places/${id}/photos/`.length);
      const attribution = authors(entry.authorAttributions);
      if (!/^[A-Za-z0-9_-]{1,2048}$/.test(reference) || !attribution) continue;
      photos.push({ name: entry.name, attributions: attribution });
    }
    candidates.push({ id, name, address, sourceUrl: sourceUrl(id, name), latitude, longitude, matchesScope,
      exactName, pointSuitable, namedPoint, photos, attributions: attribution, exclusions });
  }
  return { candidates, incomplete };
}

export function staticGoogleMapUrl(place: GooglePlaceCandidate, config: GoogleMapsConfig): URL {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  const point = `${place.latitude},${place.longitude}`;
  url.search = new URLSearchParams({ center: point, zoom: "16", size: "540x340", scale: "2", maptype: "roadmap", format: "png", markers: `color:red|${point}`, key: config.apiKey }).toString();
  if (config.signingSecret) {
    const signature = createHmac("sha1", Buffer.from(config.signingSecret, "base64url")).update(url.pathname + url.search).digest("base64url");
    url.searchParams.set("signature", signature);
  }
  return url;
}

export function googleMapsProvider(config: GoogleMapsConfig, signal: AbortSignal, transport: GoogleTransport = fetchGoogleResource) {
  let requests = 0;
  async function fetch(url: URL, maxBytes: number, options: Partial<GoogleResourceRequest> = {}) {
    if (++requests > 6 || signal.aborted) throw new MapsPreviewError("The Google Maps preview request limit was reached.");
    assertGoogleResourceUrl(url);
    return transport(url, { ...options, signal, maxBytes });
  }
  async function json(url: URL, options: Partial<GoogleResourceRequest> = {}) {
    try { return JSON.parse((await fetch(url, 512_000, options)).toString("utf8")) as unknown; }
    catch (error) { if (error instanceof MapsPreviewError) throw error; throw new MapsPreviewError("Google returned invalid JSON."); }
  }
  return {
    get requests() { return requests; },
    async search(input: MapsPreviewInput) {
      const response = await json(new URL("https://places.googleapis.com/v1/places:searchText"), {
        method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": config.apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types,places.photos,places.attributions,nextPageToken" },
        body: JSON.stringify({ textQuery: [input.name, input.municipality, input.region, input.country].filter(Boolean).join(", "), pageSize: 5, languageCode: input.languageCode || "en" }),
      });
      return parseGooglePlaces(response, input);
    },
    map(place: GooglePlaceCandidate) { return fetch(staticGoogleMapUrl(place, config), 5_000_000); },
    async photo(photo: Photo) {
      const url = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
      url.search = new URLSearchParams({ maxWidthPx: "1080", maxHeightPx: "800", skipHttpRedirect: "true" }).toString();
      const metadata = await json(url, { headers: { "X-Goog-Api-Key": config.apiKey } });
      if (!record(metadata) || typeof metadata.photoUri !== "string") throw new MapsPreviewError("Google returned an invalid photo reference.");
      let imageUrl: URL;
      try { imageUrl = new URL(metadata.photoUri); } catch { throw new MapsPreviewError("Google returned an invalid photo destination."); }
      if (!PHOTO_HOST.test(imageUrl.hostname)) throw new MapsPreviewError("Google returned an unsupported photo host.");
      // Never forward the API key or other API headers to the image host.
      return fetch(imageUrl, 5_000_000);
    },
  };
}
