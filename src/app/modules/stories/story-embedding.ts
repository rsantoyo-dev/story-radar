import "server-only";

import {
  getStoryEmbeddingRuntimeConfig,
  StoryEmbeddingConfigurationError,
} from "./story-embedding.config";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_TIMEOUT_MS = 30_000;
const MAX_BATCH = 96;
const MAX_TEXT_CHARACTERS = 600;

export class StoryEmbeddingProviderError extends Error {}

/**
 * Title + the lead sentence. Empirically this identifies the news *event*
 * (across languages) far better than title + a long content excerpt, which
 * dilutes the signal and pulls same-topic-different-event stories together.
 */
export function buildStoryEmbeddingText(
  title: string,
  summaryOrContent: string | null | undefined,
): string {
  const clean = (summaryOrContent ?? "").replace(/\s+/g, " ").trim();
  const lead =
    clean.match(/^.{40,220}?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean.slice(0, 200);
  const text = lead ? `${title.trim()}\n\n${lead}` : title.trim();
  return text.slice(0, MAX_TEXT_CHARACTERS);
}

/**
 * Returns one vector per input text, in order. Batched; throws
 * `StoryEmbeddingProviderError` on any provider failure so callers can decide
 * to continue best-effort.
 */
export async function embedStoryTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  let config;
  try {
    config = getStoryEmbeddingRuntimeConfig();
  } catch (error) {
    if (error instanceof StoryEmbeddingConfigurationError) {
      throw new StoryEmbeddingProviderError(error.message);
    }
    throw error;
  }

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts
      .slice(start, start + MAX_BATCH)
      .map((text) => (text.trim() ? text : "(untitled)"));
    vectors.push(...(await embedBatch(batch, config.apiKey, config.model)));
  }
  return vectors;
}

async function embedBatch(
  input: string[],
  apiKey: string,
  model: string,
): Promise<number[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new StoryEmbeddingProviderError("OpenAI returned invalid embedding data");
    }
    if (!response.ok) {
      const message =
        isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
          ? payload.error.message
          : `HTTP ${response.status}`;
      throw new StoryEmbeddingProviderError(`OpenAI embeddings failed (${message})`);
    }
    const data = isRecord(payload) ? payload.data : undefined;
    if (!Array.isArray(data) || data.length !== input.length) {
      throw new StoryEmbeddingProviderError(
        "OpenAI embeddings returned an unexpected number of vectors",
      );
    }
    return data.map((item, index) => {
      const embedding = isRecord(item) ? item.embedding : undefined;
      if (
        !Array.isArray(embedding) ||
        embedding.length === 0 ||
        embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new StoryEmbeddingProviderError(
          `OpenAI embeddings returned an invalid vector at position ${index}`,
        );
      }
      return embedding as number[];
    });
  } catch (error) {
    if (error instanceof StoryEmbeddingProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new StoryEmbeddingProviderError(
        `OpenAI embeddings did not respond within ${OPENAI_TIMEOUT_MS / 1_000} seconds`,
      );
    }
    throw new StoryEmbeddingProviderError(
      `OpenAI embeddings request failed (${error instanceof Error ? error.message : "unknown error"})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
