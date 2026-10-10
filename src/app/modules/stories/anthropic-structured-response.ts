import { meterCreativeText } from "./creative-text-meter";
import "server-only";
import { randomUUID } from "node:crypto";

import type { CreativeAiUsage } from "./creative-content.types";

/**
 * Claude (Anthropic Messages API) as a structured-output provider, built like
 * the OpenAI adapter: one request, a JSON result validated by the caller,
 * usage metered against the Story text budget, receipts that never carry
 * credentials, prompts or generated text.
 *
 * Structured output uses the API's JSON outputs (`output_config.format`,
 * constrained decoding): the answer is the JSON in the response's text
 * block. Forced tool calls are not an option, since Claude Sonnet 5.5 and
 * later reject `tool_choice` of type "tool". The API accepts a subset of
 * JSON Schema, so numeric, length and array-size constraints are stripped
 * before sending; the callers' parsers keep enforcing them.
 */
type AnthropicMessagesPayload = {
  content?: unknown;
  stop_reason?: unknown;
  usage?: unknown;
  error?: unknown;
};

export type AnthropicStructuredResponse = {
  text: string;
  provider: "anthropic";
  model: string;
  usage: CreativeAiUsage;
  /** Prompt-cache reads, already counted inside usage.promptTokens. */
  cachedInputTokens?: number;
  /** Prompt-cache writes, also counted inside usage.promptTokens; the API bills them above the base input rate. */
  cacheWriteTokens?: number;
  stopReason?: string;
};

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_TIMEOUT_MS = 120_000;
/** Transient provider states worth one more attempt. A rate limit (429) is not retried: the caller decides. */
const RETRIED_STATUSES = new Set([500, 502, 503, 529]);
/** JSON Schema keywords the API's structured outputs reject; the caller's parser validates them instead. */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems"]);

export type AnthropicUsageContext = { runId: string; topicId: string; storyId: string };
export type AnthropicHistoryTurn = { role: "user" | "assistant"; text: string };
export type AnthropicEffort = "low" | "medium" | "high";

export async function generateAnthropicStructuredResponse(options: Parameters<typeof requestAnthropicStructuredResponse>[0] & {
  /** The caller records this call's usage charge itself. */
  selfMetered?: boolean;
}): Promise<AnthropicStructuredResponse> {
  const { selfMetered, ...request } = options;
  return meterCreativeText({provider:"anthropic",model:request.model,operation:request.schemaName,
    payload:{instructions:request.instructions,contents:request.contents,schema:request.schema},maxOutputTokens:request.maxOutputTokens,selfMetered},
    () => requestAnthropicStructuredResponse(request), value => value.usage.totalTokens > 0 ? {...value.usage,cachedInputTokens:value.cachedInputTokens} : undefined);
}

async function requestAnthropicStructuredResponse({
  apiKey,
  model,
  instructions,
  contents,
  schema,
  schemaName,
  maxOutputTokens,
  effort,
  timeoutMs = ANTHROPIC_TIMEOUT_MS,
  attempts = 2,
  retryDelayMs = 1_500,
  auditContext,
  images = [],
  history = [],
  context,
}: {
  apiKey: string;
  model: string;
  instructions: string;
  contents: unknown;
  /** A JSON schema object (type "object", additionalProperties false on every object); unsupported constraints are stripped. */
  schema: Record<string, unknown>;
  /** Names the operation in receipts and accounting. */
  schemaName: string;
  /** Covers the answer and the model's thinking, which the API counts against the same ceiling. */
  maxOutputTokens: number;
  /** The model's reasoning effort; the model's default when unset. */
  effort?: AnthropicEffort;
  timeoutMs?: number;
  /** Attempts for transient failures (overload, 5xx, transport); a timeout is never retried. */
  attempts?: number;
  retryDelayMs?: number;
  auditContext?: AnthropicUsageContext;
  /** Images (data URLs or https URLs) the model reads alongside the contents. */
  images?: string[];
  /**
   * Earlier turns of a kept conversation, oldest first and ending with an
   * assistant turn. The API keeps no conversation state, so the caller
   * resends them; the first user turn is marked for prompt caching so later
   * calls reread it at the cached rate.
   */
  history?: AnthropicHistoryTurn[];
  /**
   * The stable part of a request every call of a step repeats (such as the
   * verified facts): sent as the first block of the user turn and marked for
   * prompt caching, so later calls with the same instructions read it at
   * the cached rate instead of carrying a growing history.
   */
  context?: unknown;
}): Promise<AnthropicStructuredResponse> {
  const auditId = randomUUID();
  const startedAt = Date.now();
  // Safe per-call receipts: never log credentials, prompts or generated text.
  const receipt = (details: Record<string, unknown>) => console.info("[anthropic-usage]", JSON.stringify({
    auditId, at: new Date().toISOString(), model, operation: schemaName,
    maxOutputTokens, ...(effort ? { effort } : {}), ...(auditContext ? { context: auditContext } : {}), ...details,
  }));
  receipt({ event: "started", historyTurns: history.length });
  const body = JSON.stringify({
    model,
    max_tokens: maxOutputTokens,
    system: instructions,
    messages: [
      ...history.map((turn, index) => ({
        role: turn.role,
        content: [{ type: "text", text: turn.text, ...(index === 0 && turn.role === "user" ? { cache_control: { type: "ephemeral" } } : {}) }],
      })),
      {
        role: "user",
        content: [
          ...(context === undefined ? [] : [{ type: "text", text: JSON.stringify(context), cache_control: { type: "ephemeral" } }]),
          { type: "text", text: JSON.stringify(contents) },
          ...images.map((image) => ({ type: "image", source: imageSource(image) })),
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: anthropicSchema(schema) }, ...(effort ? { effort } : {}) },
  });

  let lastError: AnthropicEditorialError | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let rawText: string;
    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body,
        signal: controller.signal,
      });
      rawText = await response.text();
    } catch (error) {
      receipt({ event: "transport-error", attempt, elapsedMs: Date.now() - startedAt, usageKnown: false });
      if (error instanceof Error && error.name === "AbortError") {
        throw new AnthropicEditorialError(
          `Claude ${model} did not respond within ${timeoutMs / 1_000} seconds`,
        );
      }
      lastError = new AnthropicEditorialError(
        `Claude ${model} request failed (${errorMessage(error)})`,
      );
      if (attempt < attempts) { await wait(retryDelayMs); continue; }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }

    let payload: AnthropicMessagesPayload;
    try {
      payload = parsePayload(rawText);
    } catch (error) {
      receipt({ event: "invalid-response", attempt, httpStatus: response.status, elapsedMs: Date.now() - startedAt, usageKnown: false });
      throw error;
    }
    const usage = anthropicUsage(payload.usage);
    const cachedInputTokens = cacheReadTokens(payload.usage);
    const cacheWriteTokens = cacheCreationTokens(payload.usage);
    const stopReason = typeof payload.stop_reason === "string" ? payload.stop_reason : undefined;
    receipt({
      event: response.ok ? "response-received" : "http-error", attempt,
      requestId: response.headers?.get?.("request-id") ?? undefined,
      httpStatus: response.status, elapsedMs: Date.now() - startedAt,
      usageKnown: Boolean(payload.usage), usage, cachedInputTokens, cacheWriteTokens, stopReason,
    });
    if (!response.ok) {
      lastError = Object.assign(new AnthropicEditorialError(
        `Claude ${model} failed (HTTP ${response.status}: ${responseError(payload)})`,
      ), { status: response.status });
      if (RETRIED_STATUSES.has(response.status) && attempt < attempts) { await wait(retryDelayMs); continue; }
      throw lastError;
    }

    // A refusal or a cut-off answer is not structured output; the usage travels with the error so the meter settles it.
    if (stopReason === "refusal" || stopReason === "max_tokens") {
      throw new AnthropicEditorialError(
        stopReason === "refusal" ? `Claude ${model} refused the request` : `Claude ${model} ran out of output tokens before finishing (${maxOutputTokens})`,
        usage,
      );
    }
    const text = extractAnthropicText(payload);
    if (!text) {
      throw new AnthropicEditorialError(
        `Claude ${model} returned no structured output (${stopReason ?? "unknown stop reason"})`,
        usage,
      );
    }

    return {
      text,
      provider: "anthropic",
      model,
      usage,
      cachedInputTokens,
      cacheWriteTokens,
      ...(stopReason ? { stopReason } : {}),
    };
  }
  throw lastError ?? new AnthropicEditorialError(`Claude ${model} request failed`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A data URL becomes an inline base64 source; anything else is passed as a URL source. */
function imageSource(image: string): Record<string, string> {
  const dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/.exec(image);
  return dataUrl
    ? { type: "base64", media_type: dataUrl[1], data: dataUrl[2] }
    : { type: "url", url: image };
}

/** The schema without the constraints the API rejects; `minItems` keeps at most 1. */
export function anthropicSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anthropicSchema);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    if (key === "minItems") { if (typeof entry === "number") result[key] = Math.min(1, Math.max(0, entry)); continue; }
    // Keyword names inside `properties` are field names, not constraints.
    result[key] = key === "properties" && entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).map(([field, fieldSchema]) => [field, anthropicSchema(fieldSchema)]))
      : anthropicSchema(entry);
  }
  return result;
}

function parsePayload(value: string): AnthropicMessagesPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AnthropicMessagesPayload;
    }
  } catch {
    // The error below intentionally avoids echoing provider bodies, which can
    // contain request context.
  }
  throw new AnthropicEditorialError("Claude returned an invalid JSON response");
}

/** The answer's text blocks joined; thinking blocks are never part of the output. */
export function extractAnthropicText(payload: AnthropicMessagesPayload): string {
  if (!Array.isArray(payload.content)) return "";
  return payload.content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const value = block as { type?: unknown; text?: unknown };
      return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
    })
    .join("")
    .trim();
}

/**
 * Claude reports uncached, cache-write and cache-read input separately;
 * promptTokens is their sum, so the meter prices the whole prompt and
 * discounts the cached reads it is told about. Thinking is already part of
 * output tokens.
 */
export function anthropicUsage(value: unknown): CreativeAiUsage {
  if (!value || typeof value !== "object") return emptyUsage();
  const usage = value as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
  };
  const promptTokens = usageNumber(usage.input_tokens) + usageNumber(usage.cache_creation_input_tokens) + usageNumber(usage.cache_read_input_tokens);
  const outputTokens = usageNumber(usage.output_tokens);
  return { promptTokens, outputTokens, thoughtsTokens: 0, totalTokens: promptTokens + outputTokens };
}

function cacheReadTokens(value: unknown): number {
  return value && typeof value === "object" ? usageNumber((value as { cache_read_input_tokens?: unknown }).cache_read_input_tokens) : 0;
}

function cacheCreationTokens(value: unknown): number {
  return value && typeof value === "object" ? usageNumber((value as { cache_creation_input_tokens?: unknown }).cache_creation_input_tokens) : 0;
}

function emptyUsage(): CreativeAiUsage {
  return { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
}

function usageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function responseError(payload: AnthropicMessagesPayload): string {
  const error = payload.error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "unknown provider error";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export class AnthropicEditorialError extends Error {
  constructor(
    message: string,
    readonly usage?: CreativeAiUsage,
  ) {
    super(message);
  }
}
