import "server-only";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import type { StoryContentStatus } from "./story-candidate.types";

const MIN_ARTICLE_CHARACTERS = 300;
const MIN_ARTICLE_WORDS = 50;
const LIKELY_FULL_CHARACTERS = 1_200;
const LIKELY_FULL_WORDS = 180;

export type ExtractedArticleContent = {
  title?: string;
  byline?: string;
  excerpt?: string;
  text: string;
  wordCount: number;
  status: Extract<StoryContentStatus, "excerpt" | "likely-full">;
};

export class ArticleExtractionError extends Error {}
export class ArticlePaywallError extends ArticleExtractionError {}

export function extractArticleContent(
  html: string,
  resolvedUrl: string,
): ExtractedArticleContent {
  const dom = new JSDOM(html, { url: resolvedUrl });

  try {
    const article = new Readability(dom.window.document, {
      charThreshold: MIN_ARTICLE_CHARACTERS,
      keepClasses: false,
      maxElemsToParse: 50_000,
    }).parse();

    return finalizeExtractedArticleContent(article?.textContent, {
      title: article?.title,
      byline: article?.byline,
      excerpt: article?.excerpt,
    });
  } finally {
    dom.window.close();
  }
}

export function extractReaderArticleContent(input: {
  markdown: string;
  title?: string;
  description?: string;
}): ExtractedArticleContent {
  return finalizeExtractedArticleContent(markdownToPlainText(input.markdown), {
    title: input.title,
    excerpt: input.description,
  });
}

function finalizeExtractedArticleContent(
  value: string | null | undefined,
  metadata: {
    title?: string | null;
    byline?: string | null;
    excerpt?: string | null;
  },
): ExtractedArticleContent {
  const text = normalizeArticleText(value);
  const title = normalizeMetadata(metadata.title);
  const byline = normalizeMetadata(metadata.byline);
  const excerpt = normalizeMetadata(metadata.excerpt);
  const wordCount = countWords(text);

  if (looksLikeAccessWall(text, title)) {
    throw new ArticlePaywallError(
      "The publisher returned a paywall or sign-in page",
    );
  }

  if (
    text.length < MIN_ARTICLE_CHARACTERS ||
    wordCount < MIN_ARTICLE_WORDS
  ) {
    throw new ArticleExtractionError(
      "The page did not contain enough readable article text",
    );
  }

  const status =
    text.length >= LIKELY_FULL_CHARACTERS && wordCount >= LIKELY_FULL_WORDS
      ? "likely-full"
      : "excerpt";

  return {
    ...(title ? { title } : {}),
    ...(byline ? { byline } : {}),
    ...(excerpt ? { excerpt } : {}),
    text,
    wordCount,
    status,
  };
}

function markdownToPlainText(value: string): string {
  return value
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_~`]+/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeArticleText(value: string | null | undefined): string {
  return (value ?? "")
    .split(/\n+/)
    .map((paragraph) => paragraph.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function normalizeMetadata(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized || undefined;
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function looksLikeAccessWall(
  text: string,
  title: string | null | undefined,
): boolean {
  if (text.length >= MIN_ARTICLE_CHARACTERS * 2) {
    return false;
  }

  const sample = `${title ?? ""} ${text}`.toLocaleLowerCase("en-US");

  return [
    "subscribe to continue",
    "sign in to continue",
    "log in to continue",
    "enable javascript",
    "verify you are human",
    "access denied",
  ].some((phrase) => sample.includes(phrase));
}
