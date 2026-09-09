import "server-only";
import sharp from "sharp";
import { escapeDocumentaryText } from "./creative-documentary-render";
import { googleMapsConfig, googleMapsProvider, MapsPreviewError, type GoogleMapsConfig, type GoogleTransport } from "./google-maps-provider";
import type { CreativeProfile } from "./creative-content.types";
import type { MapsPreviewCard, MapsPreviewInput, MapsPreviewResult } from "./google-maps-preview.types";

// Deliberately process-local for the prototype. Production quotas are GMAP-02.
let day = ""; let previews = 0;
const activeTopics = new Set<string>();
function reserve(topicId: string, mode: MapsPreviewInput["mode"], limit: number) {
  const today = new Date().toISOString().slice(0, 10);
  if (day !== today) { day = today; previews = 0; }
  if (activeTopics.size >= 2 || activeTopics.has(topicId)) throw new MapsPreviewError("A map preview is already running. Try again after it finishes.", 429);
  if (mode === "google" && previews >= limit) throw new MapsPreviewError("The daily map preview limit for this server process was reached.", 429);
  if (mode === "google") previews++;
  activeTopics.add(topicId);
  return () => activeTopics.delete(topicId);
}

/** Validate raster content without cropping, editing or stripping provider marks. */
export async function previewRaster(bytes: Buffer): Promise<Pick<MapsPreviewCard, "image" | "width" | "height">> {
  if (bytes.length > 5_000_000) throw new MapsPreviewError("The map or photo exceeds the preview size limit.");
  const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 240 || metadata.height < 160 ||
      !["png", "jpeg", "webp"].includes(metadata.format || "") || (metadata.pages ?? 1) > 1) {
    throw new MapsPreviewError("The map or photo is not a suitable preview image.");
  }
  // Full decode catches corrupt/truncated files that metadata alone accepts.
  await sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" }).stats();
  return { image: `data:image/${metadata.format === "jpeg" ? "jpeg" : metadata.format};base64,${bytes.toString("base64")}`,
    width: metadata.width, height: metadata.height };
}

async function demoCard(kind: "map" | "photo"): Promise<MapsPreviewCard> {
  const label = kind === "map" ? "MAP PLACEHOLDER" : "PHOTO PLACEHOLDER";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="680"><rect width="1080" height="680" fill="#edf4ef"/><rect x="80" y="100" width="920" height="440" rx="24" fill="#d9e8dd"/><text x="540" y="290" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#18392d">${escapeDocumentaryText(label)}</text><text x="540" y="370" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#18392d">DEMO · no real geographic information</text></svg>`;
  return { kind, ...await previewRaster(await sharp(Buffer.from(svg)).png().toBuffer()), label: "Demo placeholder — not a real place", attributions: [] };
}

export async function prepareGoogleMapsPreview(
  topicId: string,
  input: MapsPreviewInput,
  profile: Pick<CreativeProfile, "name" | "brandPalette">,
  options: { config?: GoogleMapsConfig; transport?: GoogleTransport; signal?: AbortSignal } = {},
): Promise<MapsPreviewResult> {
  const config = options.config ?? googleMapsConfig();
  if (input.mode === "google" && (!config.enabled || !config.apiKey)) {
    throw new MapsPreviewError("Set CREATIVE_GOOGLE_MAPS_API_KEY and CREATIVE_GOOGLE_MAPS_PREVIEW_ENABLED=true to test Google. Demo mode needs no key.", 503);
  }
  const release = reserve(topicId, input.mode, config.maxPreviewsPerDay);
  const signal = AbortSignal.any([AbortSignal.timeout(40_000), ...(options.signal ? [options.signal] : [])]);
  const now = Date.now();
  const result: MapsPreviewResult = {
    mode: input.mode, status: "not-found", exportable: false,
    preparedAt: new Date(now).toISOString(), expiresAt: new Date(now + 15 * 60_000).toISOString(),
    brand: { name: profile.name, color: profile.brandPalette.find(item => /^#[\da-f]{6}$/i.test(item.color))?.color || "#246b4a" },
    candidates: [], cards: [], reasons: [], requests: 0,
  };
  try {
    if (input.mode === "demo") {
      result.status = "demo";
      result.cards = await Promise.all([demoCard("map"), demoCard("photo")]);
      result.reasons.push("Layout demonstration only. No Google request, real map, photograph or location verification was performed.");
      return result;
    }
    const provider = googleMapsProvider(config, signal, options.transport);
    const { candidates, incomplete } = await provider.search(input);
    result.candidates = candidates.map(({ name, address, sourceUrl, matchesScope, attributions, exclusions }) => ({ name, address, sourceUrl, matchesScope, attributions, exclusions }));
    result.requests = provider.requests;
    const localPoints = candidates.filter(place => place.matchesScope && place.pointSuitable);
    const matches = localPoints.filter(place => place.exactName);
    // Previewing one named local search result is not verifying its identity.
    // Only this ephemeral test allows it; production documentary policy is unchanged.
    const place = matches.length === 1 ? matches[0]
      : matches.length === 0 && localPoints.length === 1 && localPoints[0].namedPoint ? localPoints[0] : undefined;
    if (!place || incomplete) {
      result.status = candidates.length ? "ambiguous" : "not-found";
      if (incomplete) result.reasons.push("Google returned an incomplete result set; a unique match cannot be established.");
      else if (!candidates.length) result.reasons.push("Google returned no places for this query.");
      else if (!candidates.some(place => place.matchesScope)) result.reasons.push("No result confirms the requested geographic scope. See the specific municipality, region or country mismatch below.");
      else if (!candidates.some(place => place.matchesScope && place.exactName)) result.reasons.push("The geographic scope matches, but Google did not confirm the requested place name. A matching address does not establish the identity of a school, business or event.");
      else if (!matches.length) result.reasons.push("The matching result is not suitable for a precise point marker. Road segments and areas require a geometry workflow.");
      else result.reasons.push("More than one place matches the name and scope; no unique location was selected.");
      result.reasons.push("No marker or photo was selected. Review the candidate details below; do not substitute a nearby place for the subject of the news.");
      return result;
    }
    result.status = "candidate";
    result.place = { name: place.name, address: place.address, sourceUrl: place.sourceUrl, nameMatch: place.exactName ? "literal" : "search-candidate" };
    result.reasons.push(place.exactName
      ? "Name and geographic scope match the provider record. This is a candidate for visual review, not proof of a news event or current conditions."
      : `Google returned one named point in the requested geographic scope: "${place.name}". Showing its map and photos for inspection under Google's name; identity with "${input.name}" is not verified.`);
    try {
      result.cards.push({ kind: "map", ...await previewRaster(await provider.map(place)), label: "Candidate location · Google Maps", attributions: place.attributions });
    } catch (error) {
      result.reasons.push(error instanceof MapsPreviewError ? error.message : "The map could not be decoded.");
    }
    const photos = place.photos.slice(0, config.maxPhotos);
    for (const photo of photos) {
      if (signal.aborted) { result.reasons.push("Preview time budget exhausted."); break; }
      try {
        result.cards.push({ kind: "photo", ...await previewRaster(await provider.photo(photo)), label: "Candidate photo · capture date unknown", attributions: [...place.attributions, ...photo.attributions] });
      } catch (error) {
        result.reasons.push(error instanceof MapsPreviewError ? error.message : "A candidate photo could not be decoded.");
      }
    }
    if (!photos.length) result.reasons.push("Google did not return usable photos for this place. The map remains available when its request succeeds.");
    result.requests = provider.requests;
    result.reasons.push("Temporary in-app composition. Not approved for export, publication or use as an AI reference. Content is not saved to the draft or R2.");
    return result;
  } finally { release(); }
}
