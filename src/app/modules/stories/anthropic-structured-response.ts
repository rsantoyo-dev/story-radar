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
 * Structured output is a forced tool call: the schema is the tool's input
 * schema, so the answer arrives as the tool's `input` object. Extended
 * thinking is deliberately not enabled here, because the API does not allow
 * forcing a tool while thinking is on.
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
  stopReason?: string;
};

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_TIMEOUT_MS = 120_000;
/** Transient provider states worth one more attempt. A rate limit (429) is not retried: the caller decides. */
const RETRIED_STATUSES = new Set([500, 502, 503, 529]);

export type AnthropicUsageContext = { runId: string; topicId: string; storyId: string };

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
  timeoutMs = ANTHROPIC_TIMEOUT_MS,
  attempts = 2,
  retryDelayMs = 1_500,
  auditContext,
  images = [],
}: {
  apiKey: string;
  model: string;
  instructions: string;
  contents: unknown;
  /** A JSON schema object (type "object"); it becomes the forced tool's input schema. */
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs?: number;
  /** Attempts for transient failures (overload, 5xx, transport); a timeout is never retried. */
  attempts?: number;
  retryDelayMs?: number;
  auditContext?: AnthropicUsageContext;
  /** Images (data URLs or https URLs) the model reads alongside the contents. */
  images?: string[];
}): Promise<AnthropicStructuredResponse> {
  const auditId = randomUUID();
  const startedAt = Date.now();
  // Safe per-call receipts: never log credentials, prompts or generated text.
  const receipt = (details: Record<string, unknown>) => console.info("[anthropic-usage]", JSON.stringify({
    auditId, at: new Date().toISOString(), model, operation: schemaName,
    maxOutputTokens, ...(auditContext ? { context: auditContext } : {}), ...details,
  }));
  receipt({ event: "started" });
  const body = JSON.stringify({
    model,
    max_tokens: maxOutputTokens,
    system: instructions,
    messages: [{
      role: "user",
      content: [{ type: "text", text: JSON.stringify(contents) }, ...images.map((image) => ({ type: "image", source: imageSource(image) }))],
    }],
    tools: [{ name: schemaName, description: "Record the structured result of this task.", input_schema: schema }],
    tool_choice: { type: "tool", name: schemaName, disable_parallel_tool_use: true },
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
    const stopReason = typeof payload.stop_reason === "string" ? payload.stop_reason : undefined;
    receipt({
      event: response.ok ? "response-received" : "http-error", attempt,
      requestId: response.headers?.get?.("request-id") ?? undefined,
      httpStatus: response.status, elapsedMs: Date.now() - startedAt,
      usageKnown: Boolean(payload.usage), usage, cachedInputTokens, stopReason,
    });
    if (!response.ok) {
      lastError = Object.assign(new AnthropicEditorialError(
        `Claude ${model} failed (HTTP ${response.status}: ${responseError(payload)})`,
      ), { status: response.status });
      if (RETRIED_STATUSES.has(response.status) && attempt < attempts) { await wait(retryDelayMs); continue; }
      throw lastError;
    }

    const text = extractAnthropicToolInput(payload, schemaName);
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

/** The forced tool's input as JSON text. Prose without a tool call is not structured output (a truncated answer). */
export function extractAnthropicToolInput(payload: AnthropicMessagesPayload, toolName: string): string {
  if (!Array.isArray(payload.content)) return "";
  const calls = payload.content.filter((block): block is Record<string, unknown> =>
    Boolean(block) && typeof block === "object" && (block as Record<string, unknown>).type === "tool_use"
    && Boolean((block as Record<string, unknown>).input) && typeof (block as Record<string, unknown>).input === "object");
  const call = calls.find((block) => block.name === toolName) ?? calls[0];
  return call ? JSON.stringify(call.input) : "";
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
