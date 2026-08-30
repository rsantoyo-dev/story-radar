import "server-only";

import type { CreativeAiUsage } from "./creative-content.types";

type OpenAiReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type OpenAiResponsesPayload = {
  output_text?: unknown;
  output?: unknown;
  usage?: unknown;
  incomplete_details?: unknown;
  error?: unknown;
};

export type OpenAiStructuredResponse = {
  text: string;
  provider: "openai";
  model: string;
  usage: CreativeAiUsage;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = 120_000;

export async function generateOpenAiStructuredResponse({
  apiKey,
  model,
  instructions,
  contents,
  schema,
  schemaName,
  maxOutputTokens,
  reasoningEffort = "high",
}: {
  apiKey: string;
  model: string;
  instructions: string;
  contents: unknown;
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  reasoningEffort?: OpenAiReasoningEffort;
}): Promise<OpenAiStructuredResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input: JSON.stringify(contents),
        reasoning: { effort: reasoningEffort },
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAiEditorialError(
        `OpenAI ${model} did not respond within ${OPENAI_TIMEOUT_MS / 1_000} seconds`,
      );
    }
    throw new OpenAiEditorialError(
      `OpenAI ${model} request failed (${errorMessage(error)})`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();
  const payload = parsePayload(rawText);
  if (!response.ok) {
    throw new OpenAiEditorialError(
      `OpenAI ${model} failed (HTTP ${response.status}: ${responseError(payload)})`,
    );
  }

  const text = extractOpenAiOutputText(payload);
  if (!text) {
    const incomplete = responseError(payload);
    throw new OpenAiEditorialError(
      `OpenAI ${model} returned no structured output (${incomplete})`,
      openAiUsage(payload.usage),
    );
  }

  return {
    text,
    provider: "openai",
    model,
    usage: openAiUsage(payload.usage),
  };
}

function parsePayload(value: string): OpenAiResponsesPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OpenAiResponsesPayload;
    }
  } catch {
    // The error below intentionally avoids echoing provider bodies, which can
    // contain request context.
  }
  throw new OpenAiEditorialError("OpenAI returned an invalid JSON response");
}

export function extractOpenAiOutputText(
  payload: OpenAiResponsesPayload,
): string {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) return "";

  return payload.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const value = part as { type?: unknown; text?: unknown };
        return value.type === "output_text" && typeof value.text === "string"
          ? [value.text]
          : [];
      });
    })
    .join("")
    .trim();
}

function openAiUsage(value: unknown): CreativeAiUsage {
  if (!value || typeof value !== "object") return emptyUsage();
  const usage = value as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
    output_tokens_details?: { reasoning_tokens?: unknown };
  };
  const promptTokens = usageNumber(usage.input_tokens);
  const outputTokens = usageNumber(usage.output_tokens);
  const thoughtsTokens = usageNumber(
    usage.output_tokens_details?.reasoning_tokens,
  );
  return {
    promptTokens,
    outputTokens,
    thoughtsTokens,
    totalTokens: usageNumber(usage.total_tokens) || promptTokens + outputTokens,
  };
}

function emptyUsage(): CreativeAiUsage {
  return { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
}

function usageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function responseError(payload: OpenAiResponsesPayload): string {
  const error = payload.error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  const incomplete = payload.incomplete_details;
  if (incomplete && typeof incomplete === "object" && "reason" in incomplete) {
    const reason = (incomplete as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
  }
  return "unknown provider error";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export class OpenAiEditorialError extends Error {
  constructor(
    message: string,
    readonly usage?: CreativeAiUsage,
  ) {
    super(message);
  }
}
