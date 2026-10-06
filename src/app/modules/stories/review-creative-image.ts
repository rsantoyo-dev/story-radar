import "server-only";

import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { recordUsageCharge } from "../credits/usage-charges.repository";
import {
  buildImageReviewInstructions,
  buildImageReviewText,
  CREATIVE_IMAGE_REVIEW_SCHEMA,
  imageReviewIssues,
  parseImageReviewAnswer,
  type CreativeImageReviewInput,
} from "./creative-image-review";
import { textCostMicros, textRate } from "./creative-text-cost";
import { generateOpenAiStructuredResponse } from "./openai-structured-response";

const DEFAULT_MODEL = "gpt-6-luna";
const TIMEOUT_MS = 60_000;

export class CreativeImageReviewUnavailableError extends Error {}

/** One verdict per exact image; a retried approval does not pay twice. */
const verdicts = new Map<string, string[]>();

export function creativeImageReviewEnabled(): boolean {
  return process.env.CREATIVE_IMAGE_REVIEW?.trim().toLowerCase() !== "off";
}

/** The blocking issues for this image; empty when it may be approved. */
export async function reviewCreativeImage(input: CreativeImageReviewInput & {
  topicId: string;
  storyId: string;
  cacheKey: string;
  image: Uint8Array;
}): Promise<string[]> {
  const cached = verdicts.get(input.cacheKey);
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new CreativeImageReviewUnavailableError("OPENAI_API_KEY is not configured; images cannot be reviewed for invented people before approval.");
  const model = process.env.CREATIVE_IMAGE_REVIEW_MODEL?.trim() || DEFAULT_MODEL;
  const preview = await sharp(input.image).resize({ width: 864, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const runId = randomUUID();
  let response: Awaited<ReturnType<typeof generateOpenAiStructuredResponse>>;
  try {
    response = await generateOpenAiStructuredResponse({
      selfMetered: true,
      apiKey,
      model,
      instructions: buildImageReviewInstructions(),
      contents: buildImageReviewText(input),
      images: [`data:image/jpeg;base64,${preview.toString("base64")}`],
      schema: CREATIVE_IMAGE_REVIEW_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "image_review",
      maxOutputTokens: 1_500,
      reasoningEffort: "low",
      timeoutMs: TIMEOUT_MS,
      auditContext: { runId, topicId: input.topicId, storyId: input.storyId },
    });
  } catch (error) {
    throw new CreativeImageReviewUnavailableError(`The automatic image review is unavailable (${error instanceof Error ? error.message : "unknown error"}). Try approving again.`);
  }
  await chargeReview(input.topicId, runId, response.model, response.usage, response.cachedInputTokens ?? 0);
  const issues = imageReviewIssues(parseImageReviewAnswer(response.text), input);
  verdicts.set(input.cacheKey, issues);
  return issues;
}

async function chargeReview(topicId: string, runId: string, model: string, usage: Parameters<typeof textCostMicros>[1], cachedTokens: number) {
  let costMicros: number | null = null;
  let rate: Record<string, unknown> = { unpriced: true };
  try {
    const resolved = textRate("openai", model, usage.promptTokens);
    costMicros = textCostMicros(resolved, usage, cachedTokens);
    rate = { ...resolved };
  } catch { /* an unknown model is recorded unpriced */ }
  await recordUsageCharge({
    topicId, kind: "text", provider: "openai", model, operation: "image_review",
    units: { promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, cachedTokens },
    costMicros, estimated: false, rate, idempotencyKey: `image-review:${runId}`,
  });
}
