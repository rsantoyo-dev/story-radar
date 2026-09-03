import "server-only";

import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  ownedContentEntries,
  stories,
  storySources,
  topicStories,
} from "@/db/schema";

const OWNED_CONTENT_TYPES = [
  "campaign",
  "launch",
  "promotion",
  "product",
  "announcement",
  "educational",
] as const;

export type OwnedContentType = (typeof OWNED_CONTENT_TYPES)[number];

export type CreateOwnedContentInput = {
  title: string;
  content: string;
  contentType?: OwnedContentType;
  language?: string;
  region?: string;
  sourceUrl?: string;
  publishedAt?: string | Date;
};

export type OwnedContentEntry = {
  id: string;
  storyId: string;
  title: string;
  content: string;
  contentType: OwnedContentType;
  language: string;
  region: string;
  sourceUrl?: string;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ValidatedOwnedContentInput = {
  title: string;
  content: string;
  contentType: OwnedContentType;
  language: string;
  region: string;
  sourceUrl?: string;
  publishedAt: Date;
};

export async function createOwnedContentStory(
  topicId: string,
  input: CreateOwnedContentInput,
): Promise<OwnedContentEntry> {
  const value = validateOwnedContentInput(input);
  const now = new Date();
  const entryId = randomUUID();
  const storyId = randomUUID();
  const internalUrl = ownedContentUrl(entryId);
  const sourceUrl = value.sourceUrl ?? internalUrl;
  const sourceId = `owned-content:${topicId}`;
  const relevanceScore = 85;
  const tags = ["owned-content", value.contentType];
  const relevanceReasons = [
    "owned-content: editor-created source",
    `owned-content-type: ${value.contentType}`,
    "editorial-readiness: ready for AI evaluation",
  ];

  await db.batch([
    db.insert(stories).values({
      id: storyId,
      canonicalUrl: internalUrl,
      originalUrl: sourceUrl,
      title: value.title,
      contentText: value.content,
      contentStatus: "full",
      language: value.language,
      region: value.region,
      tags,
      publishedAt: value.publishedAt,
      firstSeenAt: now,
      lastSeenAt: now,
      relevanceScore,
      relevanceReasons,
      processingStatus: "ready",
    }),
    db.insert(topicStories).values({
      topicId,
      storyId,
      relevanceScore,
      relevanceReasons,
      processingStatus: "ready",
      firstSeenAt: now,
      lastSeenAt: now,
    }),
    db.insert(storySources).values({
      storyId,
      sourceId,
      sourceName: "Owned content",
      externalId: entryId,
      sourceUrl,
      fetchedAt: now,
    }),
    db.insert(ownedContentEntries).values({
      id: entryId,
      topicId,
      storyId,
      title: value.title,
      content: value.content,
      contentType: value.contentType,
      language: value.language,
      region: value.region,
      sourceUrl: value.sourceUrl ?? null,
      publishedAt: value.publishedAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return {
    id: entryId,
    storyId,
    title: value.title,
    content: value.content,
    contentType: value.contentType,
    language: value.language,
    region: value.region,
    ...(value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}),
    publishedAt: value.publishedAt,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listOwnedContentEntries(
  topicId: string,
): Promise<OwnedContentEntry[]> {
  const rows = await db
    .select()
    .from(ownedContentEntries)
    .where(eq(ownedContentEntries.topicId, topicId))
    .orderBy(desc(ownedContentEntries.publishedAt), desc(ownedContentEntries.createdAt));

  return rows.map((row) => ({
    id: row.id,
    storyId: row.storyId,
    title: row.title,
    content: row.content,
    contentType: row.contentType as OwnedContentType,
    language: row.language,
    region: row.region,
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function validateOwnedContentInput(
  input: CreateOwnedContentInput,
): ValidatedOwnedContentInput {
  const title = requiredText(input.title, "Title", 240);
  const content = requiredText(input.content, "Content", 12_000);
  const contentType = input.contentType ?? "campaign";
  if (!OWNED_CONTENT_TYPES.includes(contentType)) {
    throw new OwnedContentValidationError("Content type is invalid");
  }
  const language = requiredText(input.language ?? "en", "Language", 32);
  const region = requiredText(input.region ?? "global", "Region", 80);
  const sourceUrl = optionalUrl(input.sourceUrl);
  const publishedAt = validDate(input.publishedAt);
  return {
    title,
    content,
    contentType,
    language,
    region,
    ...(sourceUrl ? { sourceUrl } : {}),
    publishedAt,
  };
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OwnedContentValidationError(`${label} is required`);
  }
  return value.replace(/\r\n?/gu, "\n").trim().slice(0, maxLength);
}

function optionalUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new OwnedContentValidationError("Source URL must be a URL");
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new OwnedContentValidationError("Source URL must be an http(s) URL");
  }
}

function validDate(value: unknown): Date {
  if (value === undefined || value === null || value === "") return new Date();
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new OwnedContentValidationError("Published date is invalid");
  }
  return date;
}

function ownedContentUrl(entryId: string): string {
  return `https://presscraftor.local/owned-content/${entryId}`;
}

export class OwnedContentValidationError extends Error {}
