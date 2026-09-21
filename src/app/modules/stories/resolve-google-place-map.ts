import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  googleMapsConfig,
  googleMapsProvider,
  selectMatchingGooglePlace,
  type GoogleMapsConfig,
  type GoogleTransport,
} from "./google-maps-provider";
import { providerLanguage } from "./creative-documentary-providers";
import type { CreativeGeoScope } from "./creative-content.types";
import { PLACE_VISUAL_VERSION, type PlaceVisualEvidence } from "./creative-place-visual";

export type GoogleGenerationConfig = { maxPerDay: number };
export function googleGenerationConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleGenerationConfig {
  const raw = env.CREATIVE_GOOGLE_MAPS_GENERATION_MAX_PER_DAY?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return {
    maxPerDay:
      Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000 ? parsed : 100,
  };
}

// Deliberately process-local, matching the preview quota's own prototype-grade
// tracking (GMAP-02 covers durable, multi-instance quotas for both paths).
// A separate counter from the preview panel's so generation cannot exhaust an
// editor's manual place-fidelity testing budget, or vice versa.
let day = "";
let used = 0;
function reserveGenerationCall(limit: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (day !== today) {
    day = today;
    used = 0;
  }
  if (used >= limit) return false;
  used++;
  return true;
}

/**
 * A real Google Maps Platform static map centered on a name- and
 * scope-verified place, or undefined when no key is configured, the daily
 * generation budget is spent, or Google cannot confirm a unique match — the
 * caller falls back to the existing Wikidata/OpenStreetMap path in either
 * case, never to a fabricated map. Photos are intentionally out of scope
 * here: Google Places photos carry Google's own API terms, not one of the
 * Creative Commons licenses this codebase's PhotoEvidence type asserts.
 */
export async function resolveGooglePlaceMap(
  mentionName: string,
  scope: CreativeGeoScope,
  language: string,
  signal: AbortSignal,
  config: GoogleMapsConfig = googleMapsConfig(),
  generation: GoogleGenerationConfig = googleGenerationConfig(),
  transport?: GoogleTransport,
): Promise<{ evidence: PlaceVisualEvidence; bytes: Buffer } | undefined> {
  if (!config.enabled || !config.apiKey) return undefined;
  if (!reserveGenerationCall(generation.maxPerDay)) return undefined;
  try {
    const provider = googleMapsProvider(config, signal, transport);
    const { candidates, incomplete } = await provider.search({
      mode: "google",
      name: mentionName,
      municipality: scope.municipality,
      region: scope.region,
      country: scope.country,
      languageCode: providerLanguage(language),
    });
    const place = selectMatchingGooglePlace(candidates, incomplete);
    if (!place) return undefined;
    const bytes = await provider.map(place);
    const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      !["png", "jpeg", "webp"].includes(metadata.format || "") ||
      (metadata.pages ?? 1) > 1
    ) {
      return undefined;
    }
    // Full decode catches corrupt/truncated files that metadata alone accepts.
    await sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" }).stats();
    return {
      bytes,
      evidence: {
        version: PLACE_VISUAL_VERSION,
        representation: "map",
        preparedAt: new Date().toISOString(),
        adapter: "google-maps",
        sourceUrl: place.sourceUrl,
        attribution: `Google Maps · ${place.name}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        reasons: [
          place.exactName
            ? "Google Maps confirmed this place's name and geographic scope; static map centered on its verified coordinates, not a live closure or event map."
            : `Google returned one named point in the requested scope ("${place.name}"); identity with the story's mention is not independently verified beyond that match.`,
        ],
      },
    };
  } catch {
    // A denied key, quota, transport failure or malformed response is not a
    // fabricated-map risk; fall back to the existing provider chain instead
    // of failing the whole unit.
    return undefined;
  }
}
