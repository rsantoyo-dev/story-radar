import type {
  FeedContentField,
  RssFeedContent,
  RssFeedItem,
} from "./rss-feed.types";
import type {
  RssContentMode,
} from "./rss-source.types";

/** Fields that rss-parser returns at runtime but does not expose in Item. */
export type ParsedRssItem = {
  title?: unknown;
  link?: unknown;
  guid?: unknown;
  id?: unknown;
  "rdf:about"?: unknown;
  "content:encoded"?: unknown;
  "content:encodedSnippet"?: unknown;
  content?: unknown;
  contentSnippet?: unknown;
  summary?: unknown;
  isoDate?: unknown;
  pubDate?: unknown;
};

type ContentCandidate = {
  field: FeedContentField;
  html?: unknown;
  text?: unknown;
};

export function normalizeRssItem(
  item: ParsedRssItem,
  contentMode: RssContentMode,
): RssFeedItem | undefined {
  const title = normalizePlainText(item.title);
  const url = normalizePlainText(item.link);

  if (!title || !url) {
    return undefined;
  }

  const content = selectContent(item, contentMode);
  const publishedAt = parseDate(item.isoDate ?? item.pubDate);

  return {
    externalId:
      normalizePlainText(item.guid) ||
      normalizePlainText(item.id) ||
      normalizePlainText(item["rdf:about"]) ||
      url,
    title,
    url,
    content,
    ...(publishedAt ? { publishedAt } : {}),
  };
}

function selectContent(
  item: ParsedRssItem,
  contentMode: RssContentMode,
): RssFeedContent {
  const candidates: ContentCandidate[] = [
    {
      field: "content:encoded",
      html: item["content:encoded"],
      text: item["content:encodedSnippet"],
    },
    {
      field: "content",
      html: item.content,
      text: item.contentSnippet,
    },
    {
      field: "summary",
      html: item.summary,
    },
    {
      field: "snippet",
      text: item.contentSnippet,
    },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);

    if (normalized) {
      return {
        text: normalized.text,
        source: "rss",
        field: candidate.field,
        status: resolveContentStatus(
          contentMode,
          normalized.text,
          normalized.html,
        ),
      };
    }
  }

  return {
    source: "rss",
    status: "missing",
  };
}

export function resolveContentStatus(
  mode: RssContentMode,
  text?: string,
  html?: string,
): RssFeedContent["status"] {
  if (!text?.trim()) {
    return "missing";
  }

  if (mode === "full") {
    return "full";
  }

  if (mode === "excerpt") {
    return "excerpt";
  }

  const textLength = text.trim().length;
  const blockCount = html?.match(/<(p|h2|h3|ul|ol)\b/gi)?.length ?? 0;

  if (textLength >= 1_200 && blockCount >= 3) {
    return "likely-full";
  }

  return "excerpt";
}

function normalizeCandidate(
  candidate: ContentCandidate,
): { html?: string; text: string } | undefined {
  const html = normalizeHtml(candidate.html);
  const candidateText = normalizePlainText(candidate.text);
  const text = candidateText ?? (html ? htmlToText(html) : undefined);
  const normalizedText = text && !isUrlOnly(text) ? text : undefined;

  if (!normalizedText) {
    return undefined;
  }

  return {
    ...(html ? { html } : {}),
    text: normalizedText,
  };
}

function normalizeHtml(value: unknown): string | undefined {
  const html = stringValue(value)?.trim();

  return html || undefined;
}

function normalizePlainText(value: unknown): string | undefined {
  const text = stringValue(value)
    ?.replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "_" in value &&
    typeof value._ === "string"
  ) {
    return value._;
  }

  return undefined;
}

function htmlToText(html: string): string | undefined {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(
      /<\/(?:p|div|li|h[1-6]|blockquote|pre|section|article|tr|table)>/gi,
      "\n",
    )
    .replace(/<[^>]*>/g, " ");

  return normalizePlainText(decodeHtmlEntities(text));
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x")) {
        return codePointToString(parseInt(code.slice(2), 16), entity);
      }

      if (code.startsWith("#")) {
        return codePointToString(parseInt(code.slice(1), 10), entity);
      }

      return namedEntities[code.toLowerCase()] ?? entity;
    },
  );
}

function codePointToString(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function isUrlOnly(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}
