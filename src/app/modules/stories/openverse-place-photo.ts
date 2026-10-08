import "server-only";

import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import { recordUsageCharge } from "../credits/usage-charges.repository";
import type { CreativeGeoScope } from "./creative-content.types";
import type { PhotoEvidence, PlaceEvidence } from "./creative-documentary";
import { fetchDocumentaryResource } from "./creative-documentary-providers";
import { resolveGeoContact } from "./creative-geo-contact";
import { textCostMicros, textRate } from "./creative-text-cost";
import { generateOpenAiStructuredResponse } from "./openai-structured-response";
import {
  openverseCandidates,
  openverseSearchUrl,
  openverseSizeFits,
  parsePlacePhotoReview,
  PLACE_PHOTO_REVIEW_SCHEMA,
  PLACE_PHOTO_REVIEW_VERSION,
  placePhotoReviewContents,
  placePhotoReviewInstructions,
  type OpenverseCandidate,
} from "./openverse-place-photo.core";

const DEFAULT_REVIEW_MODEL = "gpt-6-luna";
/** Openverse searches answer in about 20 s; a silent provider is dropped after this. */
const SEARCH_IDLE_MS = 25_000;
// Wikimedia originals found through Openverse can be large; the same bound as a Commons photo.
const IMAGE_MAX_BYTES = 15_000_000;

/** One verdict per exact image in this process; a refreshed slide does not pay twice. */
const verdicts = new Map<string, { accepted: boolean; summary: string; model: string }>();

export function openverseEnabled(): boolean {
  return process.env.CREATIVE_OPENVERSE?.trim().toLowerCase() !== "off" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * A reviewed Openverse photograph of a place Wikidata already verified, or
 * nothing. Used only as an identity reference for an AI adaptation in the
 * brand's style; never as evidence of an event or current conditions.
 */
export async function openversePlacePhoto(input: {
  place: PlaceEvidence;
  scope: CreativeGeoScope;
  topicId: string;
  storyId: string;
  signal: AbortSignal;
  contact?: string;
}): Promise<{ evidence: PhotoEvidence; bytes: Buffer } | undefined> {
  if (!openverseEnabled()) return undefined;
  const contact = resolveGeoContact(input.contact, process.env.CREATIVE_GEO_CONTACT);
  const search = await fetchDocumentaryResource(openverseSearchUrl(input.place.name), input.signal, 2_000_000, contact, SEARCH_IDLE_MS);
  const candidates = openverseCandidates(JSON.parse(search.toString("utf8")) as unknown, input.place.name);
  for (const candidate of candidates) {
    const accepted = await reviewedCandidate(input, candidate, contact).catch(() => undefined);
    if (accepted) return accepted;
  }
  return undefined;
}

async function reviewedCandidate(
  input: { place: PlaceEvidence; scope: CreativeGeoScope; topicId: string; storyId: string; signal: AbortSignal },
  candidate: OpenverseCandidate,
  contact: string,
): Promise<{ evidence: PhotoEvidence; bytes: Buffer } | undefined> {
  const bytes = await fetchDocumentaryResource(new URL(candidate.imageUrl), input.signal, IMAGE_MAX_BYTES, contact);
  const image = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  if (!["jpeg", "png", "webp"].includes(image.format || "") || (image.pages ?? 1) !== 1 || !image.width || !image.height || !openverseSizeFits(image.width, image.height)) return undefined;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const verdict = verdicts.get(sha256) ?? await reviewPhoto(input, candidate, bytes);
  verdicts.set(sha256, verdict);
  if (!verdict.accepted) return undefined;
  const author = candidate.creator || "Unknown author";
  return {
    bytes,
    evidence: {
      placeId: input.place.id, provider: "openverse", sourceUrl: candidate.landingUrl, resourceUrl: candidate.imageUrl,
      author, license: candidate.license, licenseUrl: candidate.licenseUrl, attribution: `${author} · ${candidate.license}`,
      creditUrl: candidate.landingUrl, captureDate: null, retrievedAt: new Date().toISOString(), sha256,
      width: image.width, height: image.height, contentType: `image/${image.format}`,
      review: { model: verdict.model, version: PLACE_PHOTO_REVIEW_VERSION, summary: verdict.summary },
    },
  };
}

async function reviewPhoto(
  input: { place: PlaceEvidence; scope: CreativeGeoScope; topicId: string; storyId: string; signal: AbortSignal },
  candidate: OpenverseCandidate,
  bytes: Buffer,
): Promise<{ accepted: boolean; summary: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { accepted: false, summary: "", model: "" };
  const model = process.env.CREATIVE_PLACE_PHOTO_REVIEW_MODEL?.trim() || process.env.CREATIVE_IMAGE_REVIEW_MODEL?.trim() || DEFAULT_REVIEW_MODEL;
  const preview = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const runId = randomUUID();
  const response = await generateOpenAiStructuredResponse({
    selfMetered: true,
    apiKey,
    model,
    instructions: placePhotoReviewInstructions(),
    contents: placePhotoReviewContents({ name: input.place.name, ...input.scope }, candidate),
    images: [`data:image/jpeg;base64,${preview.toString("base64")}`],
    schema: PLACE_PHOTO_REVIEW_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "place_photo_review",
    maxOutputTokens: 800,
    reasoningEffort: "low",
    timeoutMs: 30_000,
    auditContext: { runId, topicId: input.topicId, storyId: input.storyId },
  });
  await chargeReview(input.topicId, input.storyId, runId, response.model, response.usage, response.cachedInputTokens ?? 0);
  return { ...parsePlacePhotoReview(response.text), model: response.model };
}

async function chargeReview(topicId: string, storyId: string, runId: string, model: string, usage: Parameters<typeof textCostMicros>[1], cachedTokens: number) {
  let costMicros: number | null = null;
  let rate: Record<string, unknown> = { unpriced: true };
  try {
    const resolved = textRate("openai", model, usage.promptTokens);
    costMicros = textCostMicros(resolved, usage, cachedTokens);
    rate = { ...resolved };
  } catch { /* an unknown model is recorded unpriced */ }
  await recordUsageCharge({
    topicId, storyId, kind: "text", provider: "openai", model, operation: "place_photo_review",
    units: { promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, cachedTokens },
    costMicros, estimated: false, rate, idempotencyKey: `place-photo-review:${runId}`,
  });
}
