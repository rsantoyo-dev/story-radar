import "server-only";
import { resolveGeoContact } from "./creative-geo-contact";
import { renderOpenMap } from "./open-map-render";
import { request } from "node:https";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { lookupPublicAddress } from "../sources/rss/fetch-rss-feed";
import type { CreativeGeoScope } from "./creative-content.types";
import { documentaryPhotoLicense, mentionFitsScope, normalizePlaceName, record, type PlaceMention, type PlaceEvidence, type PhotoEvidence } from "./creative-documentary";

const HOSTS = new Set(["ws.mapserver.transports.gouv.qc.ca", "www.wikidata.org", "commons.wikimedia.org", "upload.wikimedia.org"]);
/** Fixed providers, no redirects, connection-time public DNS validation, bounded body/time. */
export function fetchDocumentaryResource(url: URL, signal: AbortSignal, maxBytes = 2_000_000, contact = process.env.CREATIVE_GEO_CONTACT || ""): Promise<Buffer> {
  if (/[\r\n]/.test(contact)) throw new Error("Invalid geographic provider contact");
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) throw new Error("Unsupported documentary source");
  return new Promise((resolve, reject) => {
    const req = request(url, { signal, lookup: lookupPublicAddress, headers: {
      "User-Agent": `PressCraftor/0.1 (${contact || "documentary preparation"})`,
      "Accept-Encoding": "identity",
    } }, response => {
      if (response.statusCode !== 200 || Number(response.headers["content-length"] || 0) > maxBytes) {
        response.destroy(); reject(new Error("Documentary provider unavailable or oversized")); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) response.destroy(new Error("Documentary resource exceeds size limit"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", () => reject(new Error("Documentary provider request failed")));
    req.setTimeout(8_000, () => req.destroy(new Error("Documentary request timed out")));
    req.end();
  });
}

type Entity = { id: string; lastrevid: number; labels?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; claims?: Record<string, { rank?: string; mainsnak?: { datavalue?: { value: unknown } } }[]> };
function values(entity: Entity, property: string): unknown[] {
  return (entity.claims?.[property] ?? []).filter(c => c.rank !== "deprecated").map(c => c.mainsnak?.datavalue?.value).filter(v => v !== undefined);
}
function ids(entity: Entity, property: string): string[] {
  return values(entity, property).flatMap(v => record(v) && typeof v.id === "string" && /^Q\d+$/.test(v.id) ? [v.id] : []);
}
export function entityNames(entity: Entity): string[] {
  return [...Object.values(entity.labels ?? {}).map(v => v.value), ...Object.values(entity.aliases ?? {}).flat().map(v => v.value)].filter(v => typeof v === "string").map(normalizePlaceName);
}

/** The per-run cache bounds API calls and shares hierarchy reads across mentions. */
export function documentaryProviders(signal: AbortSignal, language = "en", profileContact?: string) {
  const contact = resolveGeoContact(profileContact, process.env.CREATIVE_GEO_CONTACT);
  let calls = 0;
  const entities = new Map<string, Entity>();
  async function api(host: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    if (++calls > 36) throw new Error("Geographic lookup budget exhausted");
    const url = new URL(`https://${host}/w/api.php`);
    url.search = new URLSearchParams({ format: "json", maxlag: "5", ...params }).toString();
    const data: unknown = JSON.parse((await fetchDocumentaryResource(url, signal, 2_000_000, contact)).toString("utf8"));
    if (!record(data) || data.error) throw new Error("Geographic lookup unavailable");
    return data;
  }
  async function entity(id: string): Promise<Entity> {
    const cached = entities.get(id); if (cached) return cached;
    if (!/^Q\d+$/.test(id)) throw new Error("Invalid entity ID");
    const data = await api("www.wikidata.org", { action: "wbgetentities", ids: id, props: "info|labels|aliases|claims" });
    if (!record(data.entities) || !record(data.entities[id])) throw new Error("Entity missing");
    const result = data.entities[id] as Entity;
    if (result.id !== id || !Number.isInteger(result.lastrevid)) throw new Error("Invalid entity");
    entities.set(id, result); return result;
  }
  async function resolve(mention: PlaceMention, scope: CreativeGeoScope): Promise<PlaceEvidence | undefined> {
    if (!contact || !mentionFitsScope(mention, scope) || mention.kind !== "named") return undefined;
    const data = await api("www.wikidata.org", { action: "wbsearchentities", search: mention.name, language: providerLanguage(language), uselang: providerLanguage(language), type: "item", limit: "6" });
    if (!Array.isArray(data.search) || data["search-continue"] !== undefined) return undefined; // incomplete results cannot establish uniqueness
    const matches: PlaceEvidence[] = [];
    for (const candidate of data.search) {
      if (!record(candidate) || typeof candidate.id !== "string") continue;
      const place = await entity(candidate.id);
      if (!entityNames(place).includes(normalizePlaceName(mention.name))) continue;
      if (ids(place, "P131").length !== 1) continue;
      const hierarchy: Entity[] = []; const pending = ids(place, "P131"); const seen = new Set([place.id]);
      while (pending.length && hierarchy.length < 10) {
        const id = pending.shift()!; if (seen.has(id)) continue; seen.add(id);
        const parent = await entity(id);
        if (ids(parent, "P131").length > 1) { hierarchy.length = 0; break; }
        hierarchy.push(parent); pending.push(...ids(parent, "P131"));
      }
      // All three scope levels must be represented by provider relationships, never a description/score.
      const countries = await Promise.all([...new Set([...ids(place, "P17"), ...hierarchy.flatMap(e => ids(e, "P17"))])].slice(0, 3).map(entity));
      if (![place, ...hierarchy].some(e => entityNames(e).includes(normalizePlaceName(scope.municipality))) ||
          !hierarchy.some(e => entityNames(e).includes(normalizePlaceName(scope.region))) ||
          countries.length !== 1 || !entityNames(countries[0]).includes(normalizePlaceName(scope.country))) continue;
      const coordinates = values(place, "P625"); const coordinate = coordinates.length === 1 ? coordinates[0] : undefined;
      const images = values(place, "P18");
      matches.push({ id: place.id, name: mention.name, sourceUrl: `https://www.wikidata.org/wiki/${place.id}`, revision: place.lastrevid, scope,
        hierarchy: [...hierarchy, ...countries].map(e => ({ id: e.id, name: e.labels?.fr?.value || e.labels?.en?.value || e.id, revision: e.lastrevid })),
        ...(record(coordinate) && validCoordinate(coordinate) ? { coordinates: { latitude: coordinate.latitude as number, longitude: coordinate.longitude as number, precision: coordinate.precision as number } } : {}),
        ...((images.filter((image): image is string => typeof image === "string")).length ? { imageTitles: images.filter((image): image is string => typeof image === "string").slice(0, 4), imageTitle: images.find(image => typeof image === "string") as string } : {}),
      });
    }
    return matches.length === 1 ? matches[0] : undefined;
  }
  async function photo(place: PlaceEvidence): Promise<{ evidence: PhotoEvidence; bytes: Buffer } | undefined> {
    for (const title of [...new Set([...(place.imageTitles ?? []), ...(place.imageTitle ? [place.imageTitle] : [])])].slice(0, 4)) {
      const candidate = await photoCandidate({ ...place, imageTitle: title });
      if (candidate) return candidate;
    }
    return undefined;
  }
  async function photoCandidate(place: PlaceEvidence): Promise<{ evidence: PhotoEvidence; bytes: Buffer } | undefined> {
    if (!place.imageTitle) return undefined;
    const data = await api("commons.wikimedia.org", { action: "query", titles: `File:${place.imageTitle}`, prop: "imageinfo", iiprop: "url|size|mime|extmetadata", formatversion: "2" });
    const query = record(data.query) ? data.query : {};
    const page = Array.isArray(query.pages) ? query.pages[0] : undefined;
    const info = record(page) && Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
    if (!record(info) || !record(info.extmetadata)) return undefined;
    const meta = info.extmetadata;
    const get = (key: string) => record(meta[key]) && typeof meta[key].value === "string" ? meta[key].value : "";
    const rights = documentaryPhotoLicense(get("LicenseUrl"));
    if (!rights || get("Restrictions") || get("Permission") || typeof info.url !== "string" || typeof info.descriptionurl !== "string") return undefined;
    const { license, licenseUrl } = rights;
    const author = get("Artist").replace(/<[^>]*>/gu, "").trim();
    if (!author || author.length > 160 || Number(info.width) < 1080 || Number(info.height) < 640 || Number(info.size) > 15_000_000) return undefined;
    const url = new URL(info.url);
    if (url.hostname !== "upload.wikimedia.org" || !url.pathname.startsWith("/wikipedia/commons/")) return undefined;
    const pageUrl = new URL(info.descriptionurl);
    if (pageUrl.origin !== "https://commons.wikimedia.org" || !pageUrl.pathname.startsWith("/wiki/File:")) return undefined;
    const bytes = await fetchDocumentaryResource(url, signal, 15_000_000, contact);
    const image = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(image.format || "") || (image.pages ?? 1) !== 1 || !image.width || !image.height || image.width < 1080 || image.height < 640) return undefined;
    return { bytes, evidence: { placeId: place.id, sourceUrl: pageUrl.toString(), resourceUrl: url.toString(), author, license, licenseUrl,
      attribution: `${author} · ${license}`,
      creditUrl: Number.isInteger(page.pageid) ? `https://commons.wikimedia.org/?curid=${page.pageid}` : pageUrl.toString(), captureDate: /^\d{4}-\d{2}-\d{2}$/.test(get("DateTimeOriginal")) ? get("DateTimeOriginal") : null,
      retrievedAt: new Date().toISOString(), sha256: createHash("sha256").update(bytes).digest("hex"), width: image.width, height: image.height, contentType: `image/${image.format}` } };
  }
  async function map(place: PlaceEvidence): Promise<Buffer | undefined> {
    if (!place.coordinates) return undefined;
    return renderOpenMap({ kind: "point", name: place.name, context: normalizePlaceName(place.name) === normalizePlaceName(place.scope.municipality) ? "city" : "venue", points: [[place.coordinates.longitude, place.coordinates.latitude]] });
  }
  return { resolve, photo, map };
}
export function validCoordinate(value: Record<string, unknown>): boolean {
  return typeof value.latitude === "number" && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 85 &&
    typeof value.longitude === "number" && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 &&
    typeof value.precision === "number" && value.precision > 0 && value.precision <= 0.0001 &&
    value.globe === "http://www.wikidata.org/entity/Q2";
}

function providerLanguage(value: string): string {
  const named: Record<string,string>={french:"fr",français:"fr",english:"en",spanish:"es",español:"es",portuguese:"pt",german:"de",japanese:"ja",arabic:"ar"};
  const text=value.toLowerCase().trim();return named[text] || (/^[a-z]{2,3}(?:-|$)/.test(text)?text.split("-")[0]:"en");
}
