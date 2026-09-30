import "server-only";

import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import { db } from "@/db/client";
import { storyReferencePhotos } from "@/db/schema";

import { commonsPhotoRights, normalizePlaceName, photoNeedsAuthor, record } from "./creative-documentary";
import { fetchDocumentaryResource, providerLanguage } from "./creative-documentary-providers";
import { resolveGeoContact } from "./creative-geo-contact";
import { getCreativeProfile } from "./creative-profile.repository";
import { buildStoryReferenceObjectKey, deletePrivateR2Object, putPrivateR2Object } from "./r2-storage";
import { publicStoryPhoto, requireStoryMembership } from "./story-materials.repository";
import { StoryMaterialValidationError } from "./story-materials.types";

/**
 * Real people from Wikidata + Wikimedia Commons, imported as story photos for
 * the existing "documentary-portrait" use: the photograph is composed locally,
 * unmodified, with its credit, and never reaches the image model. Imports are
 * stored with providerTransmissionAllowed=false, which resolveStoryReferences
 * only accepts for documentary portraits.
 *
 * Identity is the editor's choice among exact-name human (Q5) entities; the
 * photo must carry a CC0 / CC BY / CC BY-SA 4.0 license, a named author and no
 * Commons restrictions (e.g. personality rights), exactly like place photos.
 */

export type CommonsPersonCandidate = {
  entityId: string;
  name: string;
  description?: string;
  birthYear?: number;
  thumbnailUrl: string;
  author: string;
  license: string;
  commonsUrl: string;
};

type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, { rank?: string; mainsnak?: { datavalue?: { value: unknown } } }[]>;
};
type CommonsPhoto = {
  imageUrl: string;
  thumbnailUrl: string;
  pageUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  width: number;
  height: number;
};

const MAX_CANDIDATES = 5;
/** Portraits are composed with contain-fit; below this they read as blurry on a 1080×1350 slide. */
const MIN_PORTRAIT_SIDE = 500;

export class CommonsPersonError extends StoryMaterialValidationError {}

/** Browser-only thumbnail hosts; the server downloads the original from upload.wikimedia.org. */
const THUMBNAIL_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);

async function lookupContext(topicId: string) {
  const profile = await getCreativeProfile(topicId);
  const contact = resolveGeoContact(profile.geoProviderContact, process.env.CREATIVE_GEO_CONTACT);
  if (!contact) {
    throw new CommonsPersonError("Add a Wikimedia contact (email or URL) in the Topic creative profile before searching Wikimedia Commons.");
  }
  return { contact, language: providerLanguage(profile.language ?? "en") };
}

function wikimediaApi(contact: string) {
  let calls = 0;
  return async function api(host: "www.wikidata.org" | "commons.wikimedia.org", params: Record<string, string>) {
    if (++calls > 24) throw new CommonsPersonError("Wikimedia lookup budget exhausted. Refine the name and try again.");
    const url = new URL(`https://${host}/w/api.php`);
    // No maxlag: that throttle is for unattended bots. This lookup runs only
    // when an editor clicks Search/Use, one bounded request at a time.
    url.search = new URLSearchParams({ format: "json", ...params }).toString();
    let data: unknown;
    try {
      data = JSON.parse((await fetchDocumentaryResource(url, AbortSignal.timeout(20_000), 2_000_000, contact)).toString("utf8"));
    } catch {
      throw new CommonsPersonError(`${host === "commons.wikimedia.org" ? "Wikimedia Commons" : "Wikidata"} did not respond. Try again in a moment.`);
    }
    if (!record(data)) throw new CommonsPersonError("Wikimedia returned an unreadable response. Try again.");
    if (record(data.error)) {
      const info = typeof data.error.info === "string" ? data.error.info.slice(0, 160) : String(data.error.code ?? "unknown error");
      throw new CommonsPersonError(`Wikimedia refused the lookup: ${info}`);
    }
    return data;
  };
}

function claimValues(entity: Entity, property: string): unknown[] {
  return (entity.claims?.[property] ?? []).filter((claim) => claim.rank !== "deprecated").map((claim) => claim.mainsnak?.datavalue?.value).filter((value) => value !== undefined);
}
function isHuman(entity: Entity): boolean {
  return claimValues(entity, "P31").some((value) => record(value) && value.id === "Q5");
}
function names(entity: Entity): string[] {
  return [...Object.values(entity.labels ?? {}).map((label) => label.value), ...Object.values(entity.aliases ?? {}).flat().map((alias) => alias.value)]
    .filter((value): value is string => typeof value === "string").map(normalizePlaceName);
}
function label(entity: Entity, language: string): string {
  return entity.labels?.[language]?.value ?? entity.labels?.fr?.value ?? entity.labels?.en?.value ?? entity.id;
}
function birthYear(entity: Entity): number | undefined {
  const value = claimValues(entity, "P569")[0];
  const time = record(value) && typeof value.time === "string" ? /^[+-](\d{4})-/.exec(value.time) : null;
  return time ? Number(time[1]) : undefined;
}
function imageTitles(entity: Entity): string[] {
  return claimValues(entity, "P18").filter((value): value is string => typeof value === "string").slice(0, 3);
}

async function getEntities(api: ReturnType<typeof wikimediaApi>, ids: string[]): Promise<Entity[]> {
  if (!ids.length) return [];
  const data = await api("www.wikidata.org", { action: "wbgetentities", ids: ids.join("|"), props: "labels|aliases|descriptions|claims" });
  const entities = record(data.entities) ? data.entities : {};
  return ids.flatMap((id) => {
    const entity = entities[id];
    return record(entity) && entity.id === id ? [entity as unknown as Entity] : [];
  });
}

/** The first usable Commons photo: open license, named author, no restrictions, large enough. */
async function commonsPhoto(api: ReturnType<typeof wikimediaApi>, titles: string[]): Promise<CommonsPhoto | undefined> {
  for (const title of titles) {
    const data = await api("commons.wikimedia.org", {
      action: "query", titles: `File:${title}`, prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "320", formatversion: "2",
    });
    const query = record(data.query) ? data.query : {};
    const page = Array.isArray(query.pages) ? query.pages[0] : undefined;
    const info = record(page) && Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
    if (!record(info) || !record(info.extmetadata)) continue;
    const meta = info.extmetadata;
    const get = (key: string) => (record(meta[key]) && typeof meta[key].value === "string" ? meta[key].value : "");
    const rights = commonsPhotoRights({ licenseUrl: get("LicenseUrl"), license: get("License"), licenseShortName: get("LicenseShortName") });
    // Restrictions carries Commons' personality-rights warnings; never import those.
    if (!rights || get("Restrictions") || get("Permission")) continue;
    const rawArtist = get("Artist").replace(/<[^>]*>/gu, "").replace(/\s+/g, " ").trim();
    const artist = /no machine-readable author/i.test(rawArtist) ? "" : rawArtist;
    // Attribution is owed for every license except the public domain.
    const author = artist || (photoNeedsAuthor(rights.license) ? "" : "Unknown author");
    const width = Number(info.width), height = Number(info.height);
    if (!author || author.length > 160 || Math.min(width, height) < MIN_PORTRAIT_SIDE || Number(info.size) > 15_000_000) continue;
    if (typeof info.url !== "string" || typeof info.descriptionurl !== "string" || typeof info.thumburl !== "string") continue;
    const imageUrl = new URL(info.url), thumbnailUrl = new URL(info.thumburl), pageUrl = new URL(info.descriptionurl);
    if (imageUrl.hostname !== "upload.wikimedia.org" || !THUMBNAIL_HOSTS.has(thumbnailUrl.hostname)) continue;
    if (pageUrl.origin !== "https://commons.wikimedia.org" || !pageUrl.pathname.startsWith("/wiki/File:")) continue;
    return { imageUrl: imageUrl.toString(), thumbnailUrl: thumbnailUrl.toString(), pageUrl: pageUrl.toString(), author, license: rights.license, licenseUrl: rights.licenseUrl, width, height };
  }
  return undefined;
}

/**
 * Real people whose name matches exactly, each with a usable Commons photo.
 * The editor picks the right person; nothing is chosen automatically.
 */
export type CommonsSubjectKind = "person" | "place";

export function parseCommonsSubjectKind(value: unknown): CommonsSubjectKind {
  return value === "place" ? "place" : "person";
}

export async function searchCommonsPeople(topicId: string, storyId: string, query: unknown, kind: CommonsSubjectKind = "person"): Promise<CommonsPersonCandidate[]> {
  await requireStoryMembership(topicId, storyId);
  const name = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 120) throw new CommonsPersonError("Write the person's full name (3–120 characters).");
  const { contact, language } = await lookupContext(topicId);
  const api = wikimediaApi(contact);
  const search = await api("www.wikidata.org", { action: "wbsearchentities", search: name, language, uselang: language, type: "item", limit: "10" });
  const ids = (Array.isArray(search.search) ? search.search : [])
    .flatMap((item) => (record(item) && typeof item.id === "string" && /^Q\d+$/.test(item.id) ? [item.id] : []));
  const wanted = normalizePlaceName(name);
  // A person must match the name exactly (namesakes are common); a place is
  // chosen by the editor among the best-ranked non-human entries.
  const people = (await getEntities(api, ids)).filter((entity) => imageTitles(entity).length &&
    (kind === "person" ? isHuman(entity) && names(entity).includes(wanted) : !isHuman(entity)));
  const candidates: CommonsPersonCandidate[] = [];
  for (const person of people.slice(0, MAX_CANDIDATES)) {
    const photo = await commonsPhoto(api, imageTitles(person));
    if (!photo) continue;
    const description = person.descriptions?.[language]?.value ?? person.descriptions?.fr?.value ?? person.descriptions?.en?.value;
    const year = birthYear(person);
    candidates.push({
      entityId: person.id, name: label(person, language), ...(description ? { description } : {}), ...(year ? { birthYear: year } : {}),
      thumbnailUrl: photo.thumbnailUrl, author: photo.author, license: photo.license, commonsUrl: photo.pageUrl,
    });
  }
  return candidates;
}

/**
 * Imports the chosen person's Commons photo as a documentary-portrait-only
 * story photo. Everything is re-resolved server-side from the entity id; the
 * browser never supplies a URL.
 */
export async function importCommonsPersonPhoto(topicId: string, storyId: string, entityId: unknown, kind: CommonsSubjectKind = "person") {
  await requireStoryMembership(topicId, storyId);
  if (typeof entityId !== "string" || !/^Q\d+$/.test(entityId)) throw new CommonsPersonError("Choose a person from the search results.");
  const { contact, language } = await lookupContext(topicId);
  const api = wikimediaApi(contact);
  const [person] = await getEntities(api, [entityId]);
  if (!person || isHuman(person) !== (kind === "person")) throw new CommonsPersonError(kind === "person" ? "This Wikidata entry is not a person." : "This Wikidata entry is a person, not a place.");
  const photo = await commonsPhoto(api, imageTitles(person));
  if (!photo) throw new CommonsPersonError("No Commons photo of this person has a reusable license and credit.");
  const bytes = await fetchDocumentaryResource(new URL(photo.imageUrl), AbortSignal.timeout(30_000), 15_000_000, contact);
  let normalized: Buffer;
  try {
    const pipeline = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < MIN_PORTRAIT_SIDE || (metadata.pages ?? 1) > 1) throw new Error("Invalid image");
    normalized = await pipeline.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch {
    throw new CommonsPersonError("The Commons photo could not be decoded as a still image.");
  }
  const personName = label(person, language);
  const description = person.descriptions?.[language]?.value ?? person.descriptions?.fr?.value ?? person.descriptions?.en?.value;
  const id = randomUUID();
  const objectKey = buildStoryReferenceObjectKey(topicId, storyId, id);
  await putPrivateR2Object({ objectKey, body: normalized, contentType: "image/webp" });
  try {
    const [row] = await db.insert(storyReferencePhotos).values({
      id, topicId, storyId,
      name: personName.slice(0, 150),
      description: `${personName}${description ? ` — ${description}` : ""}. ${kind === "person" ? "Portrait" : "Photo"} from Wikimedia Commons (Wikidata ${person.id}).`.slice(0, 1000),
      provenance: `Photo: ${photo.author} · ${photo.license} (${photo.licenseUrl}) · ${photo.pageUrl} · via Wikimedia Commons`.slice(0, 1000),
      // A real person's photo is documentary-portrait only: never sent to the
      // image provider. A place photo's license (CC0 / PD / BY / BY-SA, never
      // ND) allows adaptation, so it may also be an AI reference; the adapted
      // slide then carries an "Adaptation IA" credit (post-processor).
      providerTransmissionAllowed: kind === "place",
      objectKey,
      sha256: createHash("sha256").update(normalized).digest("hex"),
      fileName: `${id}.webp`,
      fileSize: normalized.byteLength,
    }).returning();
    return publicStoryPhoto(row);
  } catch (error) {
    await deletePrivateR2Object(objectKey).catch(() => undefined);
    throw error;
  }
}
