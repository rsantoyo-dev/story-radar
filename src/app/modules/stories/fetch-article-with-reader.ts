import "server-only";

import {
  ArticleFetchError,
  PublisherArticleAccessBlockedError,
} from "./fetch-article-html";

const READER_ENDPOINT = "https://r.jina.ai/";
const READER_TIMEOUT_MS = 30_000;
const MAX_READER_RESPONSE_BYTES = 2_000_000;

export type ReaderArticleResult = {
  markdown: string;
  resolvedUrl: string;
  title?: string;
  description?: string;
};

export async function fetchArticleWithReader(
  sourceUrl: string,
): Promise<ReaderArticleResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "StoryRadar/0.1 (selected story enrichment)",
  };
  const apiKey = process.env.JINA_API_KEY?.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;

  try {
    response = await fetch(`${READER_ENDPOINT}${encodeURIComponent(sourceUrl)}`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
    });
  } catch {
    throw new ArticleFetchError("The Reader fallback could not be reached");
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);

    if ([401, 403, 451].includes(response.status)) {
      throw new PublisherArticleAccessBlockedError(
        `The Reader fallback was blocked (HTTP ${response.status})`,
      );
    }

    if (response.status === 429) {
      throw new ArticleFetchError(
        "The Reader fallback rate limit was reached; try again later",
      );
    }

    throw new ArticleFetchError(
      `The Reader fallback returned HTTP ${response.status}`,
    );
  }

  const payload = parseReaderPayload(await readLimitedResponse(response));

  if (
    typeof payload.data.httpStatus === "number" &&
    payload.data.httpStatus >= 400
  ) {
    throw new PublisherArticleAccessBlockedError(
      `The publisher blocked the Reader fallback (HTTP ${payload.data.httpStatus})`,
    );
  }

  return {
    markdown: payload.data.content,
    resolvedUrl: payload.data.url ?? sourceUrl,
    ...(payload.data.title ? { title: payload.data.title } : {}),
    ...(payload.data.description
      ? { description: payload.data.description }
      : {}),
  };
}

export function isArticleReaderFallbackEnabled(): boolean {
  const configured = process.env.ARTICLE_READER_FALLBACK_ENABLED
    ?.trim()
    .toLocaleLowerCase("en-US");

  return !configured || !["0", "false", "no", "off"].includes(configured);
}

async function readLimitedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_READER_RESPONSE_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new ArticleFetchError("The Reader response exceeded the size limit");
  }

  if (!response.body) {
    throw new ArticleFetchError("The Reader fallback returned an empty response");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_READER_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ArticleFetchError(
        "The Reader response exceeded the size limit",
      );
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return new TextDecoder("utf-8").decode(body);
}

function parseReaderPayload(value: string): {
  data: {
    content: string;
    title?: string;
    description?: string;
    url?: string;
    httpStatus?: number;
  };
} {
  let payload: unknown;

  try {
    payload = JSON.parse(value) as unknown;
  } catch {
    throw new ArticleFetchError("The Reader fallback returned invalid JSON");
  }

  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new ArticleFetchError("The Reader fallback returned invalid data");
  }

  const content = optionalString(payload.data.content);
  const title = optionalString(payload.data.title);
  const description = optionalString(payload.data.description);
  const url = optionalString(payload.data.url);

  if (!content) {
    throw new ArticleFetchError(
      "The Reader fallback returned no article content",
    );
  }

  return {
    data: {
      content,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      ...(typeof payload.data.httpStatus === "number"
        ? { httpStatus: payload.data.httpStatus }
        : {}),
    },
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
