import { normalizePlaceName, photoNeedsAuthor, portraitPhotoLicense, record } from "./creative-documentary";

/**
 * Openverse as the second source of a place's identity photo, after Commons
 * (FEAT-GEO). It only runs for a place Wikidata already verified, and its
 * search is by text: nothing in a result proves which place it shows. So a
 * candidate must name the place in its title, carry a reusable license that
 * allows commercial use and modification, come from Flickr or Wikimedia, and
 * pass an automated visual check before it can ground an AI adaptation —
 * never a published photo card.
 */

export const OPENVERSE_SEARCH = "https://api.openverse.org/v1/images/";
/** Hosts a candidate's image may be downloaded from (Flickr and Wikimedia). */
export const OPENVERSE_IMAGE_HOSTS = new Set(["live.staticflickr.com", "upload.wikimedia.org"]);
const LANDING_HOSTS = new Set(["www.flickr.com", "flickr.com", "commons.wikimedia.org"]);
const SOURCES = new Set(["flickr", "wikimedia"]);
const LICENSES = new Set(["cc0", "pdm", "by", "by-sa"]);
/** An identity reference needs less than a printed photo: Flickr's indexed size is 1024 on the long side. */
export const OPENVERSE_MIN_LONG_SIDE = 900;
export const OPENVERSE_MIN_SHORT_SIDE = 500;

export type OpenverseCandidate = {
  id: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  imageUrl: string;
  landingUrl: string;
  width: number;
  height: number;
  source: string;
};

/** The exact place name as a phrase, with only the licenses that allow commercial reuse and changes. */
export function openverseSearchUrl(placeName: string): URL {
  const url = new URL(OPENVERSE_SEARCH);
  url.search = new URLSearchParams({ q: `"${placeName.replaceAll('"', "")}"`, license_type: "commercial,modification", page_size: "20" }).toString();
  return url;
}

export function openverseSizeFits(width: number, height: number): boolean {
  return Math.max(width, height) >= OPENVERSE_MIN_LONG_SIDE && Math.min(width, height) >= OPENVERSE_MIN_SHORT_SIDE;
}

/** The place name as whole words of the title, after the same normalization Wikidata matching uses. */
export function titleNamesPlace(title: string, placeName: string): boolean {
  const name = normalizePlaceName(placeName);
  if (!name) return false;
  const words = (value: string) => ` ${value.replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/gu, " ").trim()} `;
  return words(normalizePlaceName(title)).includes(words(name));
}

/**
 * The search results worth a visual check, best first: titles closest to the
 * bare place name lead ("Austin Zoo" before "Lion at the Austin Zoo").
 */
export function openverseCandidates(response: unknown, placeName: string, limit = 3): OpenverseCandidate[] {
  if (!record(response) || !Array.isArray(response.results)) return [];
  const candidates: OpenverseCandidate[] = [];
  for (const item of response.results) {
    if (!record(item)) continue;
    const text = (key: string) => (typeof item[key] === "string" ? (item[key] as string).trim() : "");
    const width = Number(item.width), height = Number(item.height);
    if (!SOURCES.has(text("source")) || item.mature === true) continue;
    if (Array.isArray(item.unstable__sensitivity) && item.unstable__sensitivity.length) continue;
    if (!LICENSES.has(text("license").toLowerCase())) continue;
    const rights = portraitPhotoLicense(text("license_url"));
    if (!rights) continue;
    const creator = text("creator").slice(0, 160);
    if (photoNeedsAuthor(rights.license) && !creator) continue;
    if (!Number.isFinite(width) || !Number.isFinite(height) || !openverseSizeFits(width, height)) continue;
    const title = text("title").slice(0, 300);
    if (!titleNamesPlace(title, placeName)) continue;
    let imageUrl: URL, landingUrl: URL;
    try { imageUrl = new URL(text("url")); landingUrl = new URL(text("foreign_landing_url")); } catch { continue; }
    if (imageUrl.protocol !== "https:" || !OPENVERSE_IMAGE_HOSTS.has(imageUrl.hostname) || imageUrl.port || imageUrl.username) continue;
    if (landingUrl.protocol !== "https:" || !LANDING_HOSTS.has(landingUrl.hostname)) continue;
    candidates.push({ id: text("id"), title, creator, license: rights.license, licenseUrl: rights.licenseUrl,
      imageUrl: imageUrl.toString(), landingUrl: landingUrl.toString(), width, height, source: text("source") });
  }
  const extra = (candidate: OpenverseCandidate) => normalizePlaceName(candidate.title).length - normalizePlaceName(placeName).length;
  return candidates.sort((left, right) => extra(left) - extra(right)).slice(0, limit);
}

export const PLACE_PHOTO_REVIEW_VERSION = "place-photo-review-v1";

export const PLACE_PHOTO_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["showsPlace", "consistentWithPlace", "peopleAsSubject", "watermarkOrOverlay", "summary"],
  properties: {
    showsPlace: { type: "boolean" },
    consistentWithPlace: { type: "boolean" },
    peopleAsSubject: { type: "boolean" },
    watermarkOrOverlay: { type: "boolean" },
    summary: { type: "string" },
  },
} as const;

export function placePhotoReviewInstructions(): string {
  return [
    "You check whether one photograph can serve as the visual reference for a named real place. Answer only from what is visible.",
    "showsPlace: true if the photo's main subject is the place itself — its building, entrance, grounds, interior, stage or landscape — rather than a single animal, object, dish, product, vehicle or event happening there.",
    "consistentWithPlace: false if visible signage, text or features name or show a different place, or the scene cannot be this kind of place (for example a beach for a museum); otherwise true.",
    "peopleAsSubject: true if one or more identifiable people are the main subject (portraits, close groups). Distant crowds or small figures in a wide view are not.",
    "watermarkOrOverlay: true if the photo carries a watermark, a logo overlay, added text, a collage layout or heavy filters.",
    "summary: one short sentence describing what the photo shows.",
  ].join("\n");
}

export function placePhotoReviewContents(place: { name: string; municipality: string; region: string; country: string }, candidate: Pick<OpenverseCandidate, "title">): string {
  return JSON.stringify({ place: place.name, municipality: place.municipality, region: place.region, country: place.country, photoTitle: candidate.title });
}

export type PlacePhotoReview = { accepted: boolean; summary: string };

/** Only the structured fields are trusted; anything malformed is a rejection. */
export function parsePlacePhotoReview(text: string): PlacePhotoReview {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { accepted: false, summary: "The visual check returned no verdict." }; }
  if (!record(value)) return { accepted: false, summary: "The visual check returned no verdict." };
  const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 300) : "";
  const accepted = value.showsPlace === true && value.consistentWithPlace === true && value.peopleAsSubject === false && value.watermarkOrOverlay === false;
  return { accepted, summary };
}
