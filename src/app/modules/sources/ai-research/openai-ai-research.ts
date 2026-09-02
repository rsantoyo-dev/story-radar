import "server-only";

import { canonicalizeStoryUrl } from "@/app/modules/stories/deduplicate-story-candidates";
import type { EditorialProfile } from "@/app/modules/stories/editorial-profile.types";

import type { AiResearchSourceConfig } from "./ai-research.types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = 90_000;
const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_REASON_LENGTH = 400;
/** Only keep discoveries that clear the strict collector-quality floor. */
export const MIN_AI_RESEARCH_SCORE = 70;

export type AiResearchDiscovery = {
  title: string;
  url: string;
  publishedAt: Date;
  summary?: string;
  researchScore: number;
  scoreReasons: string[];
};

type DiscoverAiResearchStoriesInput = {
  config: AiResearchSourceConfig;
  profile: EditorialProfile;
  from: Date;
  to: Date;
};

type OpenAiResponsesPayload = {
  output_text?: unknown;
  output?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
};

/**
 * Uses OpenAI web search as an evidence layer. Returned candidates are only
 * accepted when their URL matches a source emitted by the web-search call.
 */
export async function discoverAiResearchStories(
  input: DiscoverAiResearchStoriesInput,
): Promise<AiResearchDiscovery[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiResearchProviderError("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_RESEARCH_OPENAI_MODEL?.trim() || DEFAULT_MODEL,
        instructions: researchInstructions(),
        input: JSON.stringify(researchInput(input)),
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        max_tool_calls: 8,
        include: ["web_search_call.action.sources"],
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "ai_research_stories",
            strict: true,
            schema: researchSchema(),
          },
        },
        max_output_tokens: 4_000,
        store: false,
      }),
      signal: controller.signal,
    });
    const rawText = await response.text();
    const payload = parsePayload(rawText);

    if (!response.ok) {
      throw new AiResearchProviderError(
        `OpenAI AI research failed (HTTP ${response.status}: ${responseError(payload)})`,
      );
    }

    const sourceUrls = webSearchSourceUrls(payload.output);
    if (sourceUrls.size === 0) {
      throw new AiResearchProviderError(
        "OpenAI AI research returned no web-search sources",
      );
    }

    return parseDiscoveries(extractOutputText(payload), sourceUrls, input.config.resultLimit);
  } catch (error) {
    if (error instanceof AiResearchProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiResearchProviderError(
        `OpenAI AI research did not respond within ${OPENAI_TIMEOUT_MS / 1_000} seconds`,
      );
    }
    throw new AiResearchProviderError(
      `OpenAI AI research request failed (${error instanceof Error ? error.message : "unknown error"})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function researchInstructions(): string {
  return `You are a news research collector for an editorial system. You must use web search before returning results.

Return only independently published, real news or reporting items. Every item must use the original publisher URL found through web search; never use a search-result, social-media, home-page, tracking, or invented URL. Include only articles published inside the requested date range. Do not claim full article text: summary is a concise, factual excerpt grounded in the cited publisher page.

researchScore is a strict source-selection confidence, not a popularity score. Score direct adherence to the configured topic, free-text instruction, requested date range, orientation, language/region, publisher credibility, and concrete evidence in the reporting. Scores of 90–100 require a direct match and a credible original publisher; below 70 is not eligible. Return fewer items rather than weak, tangential, unsupported, or speculative items. In scoreReasons, state the specific matching evidence briefly.`;
}

function researchInput({
  config,
  profile,
  from,
  to,
}: DiscoverAiResearchStoriesInput) {
  return {
    topic: {
      name: config.topicName,
      description: config.topicDescription ?? "",
      audience: profile.audience,
      mission: profile.mission,
      contentPillars: profile.contentPillars,
      exclusions: profile.exclusions,
    },
    researchRequest: {
      instruction: config.instruction,
      orientation: config.orientation,
      resultLimit: config.resultLimit,
      language: config.language,
      region: config.region,
      dateRange: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    },
  };
}

function researchSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "url",
            "publishedAt",
            "summary",
            "researchScore",
            "scoreReasons",
          ],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 500 },
            url: { type: "string", minLength: 1, maxLength: 2_048 },
            publishedAt: { type: "string", minLength: 1, maxLength: 64 },
            summary: { type: "string", maxLength: MAX_SUMMARY_LENGTH },
            researchScore: { type: "integer", minimum: 0, maximum: 100 },
            scoreReasons: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: { type: "string", minLength: 1, maxLength: MAX_REASON_LENGTH },
            },
          },
        },
      },
    },
  };
}

function parsePayload(value: string): OpenAiResponsesPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) return parsed as OpenAiResponsesPayload;
  } catch {
    // Do not echo provider output: it can contain the submitted topic prompt.
  }
  throw new AiResearchProviderError("OpenAI returned invalid AI research data");
}

function extractOutputText(payload: OpenAiResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) {
    throw new AiResearchProviderError("OpenAI returned no AI research output");
  }
  const text = payload.output
    .flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return [];
      return item.content.flatMap((part) =>
        isRecord(part) && part.type === "output_text" && typeof part.text === "string"
          ? [part.text]
          : [],
      );
    })
    .join("")
    .trim();
  if (!text) throw new AiResearchProviderError("OpenAI returned no AI research output");
  return text;
}

function webSearchSourceUrls(output: unknown): Set<string> {
  if (!Array.isArray(output)) return new Set();
  const urls = new Set<string>();
  output.forEach((item) => {
    if (!isRecord(item) || item.type !== "web_search_call") return;
    collectSourceUrls(item.action, urls);
  });
  return urls;
}

function collectSourceUrls(value: unknown, urls: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceUrls(item, urls));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.url === "string" && normalizedHttpUrl(value.url)) {
    urls.add(normalizeUrl(value.url));
  }
  Object.values(value).forEach((child) => collectSourceUrls(child, urls));
}

function parseDiscoveries(
  outputText: string,
  sourceUrls: ReadonlySet<string>,
  limit: number,
): AiResearchDiscovery[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AiResearchProviderError("OpenAI returned malformed AI research JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new AiResearchProviderError("OpenAI returned an invalid AI research result");
  }

  const discoveries: AiResearchDiscovery[] = [];
  const seenUrls = new Set<string>();
  parsed.items.forEach((item) => {
    const discovery = parseDiscovery(item, sourceUrls);
    if (!discovery) return;
    const key = normalizeUrl(discovery.url);
    if (seenUrls.has(key) || discoveries.length >= limit) return;
    seenUrls.add(key);
    discoveries.push(discovery);
  });
  return discoveries;
}

function parseDiscovery(
  value: unknown,
  sourceUrls: ReadonlySet<string>,
): AiResearchDiscovery | undefined {
  if (!isRecord(value)) return undefined;
  const title = boundedText(value.title, 500);
  const url = typeof value.url === "string" && normalizedHttpUrl(value.url)
    ? normalizeUrl(value.url)
    : undefined;
  const publishedAt = typeof value.publishedAt === "string"
    ? new Date(value.publishedAt)
    : undefined;
  const researchScore = value.researchScore;
  const scoreReasons = Array.isArray(value.scoreReasons)
    ? value.scoreReasons
      .map((reason) => boundedText(reason, MAX_REASON_LENGTH))
      .filter((reason): reason is string => Boolean(reason))
    : [];

  if (
    !title ||
    !url ||
    !matchesWebSearchSource(url, sourceUrls) ||
    !publishedAt ||
    !Number.isFinite(publishedAt.getTime()) ||
    typeof researchScore !== "number" ||
    !Number.isInteger(researchScore) ||
    researchScore < 0 ||
    researchScore > 100 ||
    researchScore < MIN_AI_RESEARCH_SCORE ||
    scoreReasons.length === 0
  ) {
    return undefined;
  }

  const summary = boundedText(value.summary, MAX_SUMMARY_LENGTH);
  return {
    title,
    url,
    publishedAt,
    ...(summary ? { summary } : {}),
    researchScore,
    scoreReasons,
  };
}

/**
 * Web search sources can carry tracking parameters or an alternate publisher
 * URL while the model returns the publisher's canonical URL. Keep the source
 * gate, but compare publisher hostnames when exact canonical URLs differ.
 */
function matchesWebSearchSource(
  candidateUrl: string,
  sourceUrls: ReadonlySet<string>,
): boolean {
  if (sourceUrls.has(candidateUrl)) return true;

  try {
    const candidateHost = new URL(candidateUrl).hostname
      .replace(/^www\./, "")
      .toLocaleLowerCase("en-US");

    return [...sourceUrls].some((sourceUrl) => {
      try {
        return new URL(sourceUrl).hostname
          .replace(/^www\./, "")
          .toLocaleLowerCase("en-US") === candidateHost;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function normalizedHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  return canonicalizeStoryUrl(value);
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function responseError(payload: OpenAiResponsesPayload): string {
  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (
    isRecord(payload.incomplete_details) &&
    typeof payload.incomplete_details.reason === "string"
  ) {
    return payload.incomplete_details.reason;
  }
  return "unknown provider error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AiResearchProviderError extends Error {}
