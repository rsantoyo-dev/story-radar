import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  storySocialPublications,
  topicStories,
} from "@/db/schema";

import {
  isSocialPublicationPlatform,
  isSocialPublicationStatus,
  type SocialPublicationPlatform,
  type SocialPublicationStatus,
  type StorySocialPublication,
  type UpsertStorySocialPublicationInput,
} from "./social-publications.types";

const MAX_POST_URL_LENGTH = 2_000;
const MAX_NOTE_LENGTH = 2_000;

/**
 * Lists tracking records only for stories that are still human-approved in
 * this topic. An omitted storyIds filter returns every approved story record
 * in the topic; an empty filter deliberately returns no rows.
 */
export async function listStoryPublications(
  topicId: string,
  storyIds?: readonly string[],
): Promise<StorySocialPublication[]> {
  if (storyIds?.length === 0) {
    return [];
  }

  const uniqueStoryIds = storyIds ? [...new Set(storyIds)] : undefined;
  const rows = await db
    .select()
    .from(storySocialPublications)
    .innerJoin(
      topicStories,
      and(
        eq(topicStories.topicId, storySocialPublications.topicId),
        eq(topicStories.storyId, storySocialPublications.storyId),
      ),
    )
    .where(
      and(
        eq(storySocialPublications.topicId, topicId),
        eq(topicStories.reviewDecision, "approved"),
        ...(uniqueStoryIds
          ? [inArray(storySocialPublications.storyId, uniqueStoryIds)]
          : []),
      ),
    )
    .orderBy(
      asc(storySocialPublications.storyId),
      asc(storySocialPublications.platform),
    );

  return rows.map((row) => mapStorySocialPublication(row.story_social_publications));
}

/** Backwards-friendly descriptive alias for callers that already have IDs. */
export const listSocialPublicationsBySelectedStoryIds = listStoryPublications;

/**
 * Creates or replaces the one current tracking record for a topic/story and
 * platform. Publication tracking is available only after human approval; it
 * does not change the story's editorial processing state.
 */
export async function upsertStorySocialPublication(
  topicId: string,
  storyId: string,
  input: UpsertStorySocialPublicationInput,
): Promise<StorySocialPublication> {
  const publication = validateStorySocialPublicationInput(input);
  await requireApprovedTopicStory(topicId, storyId);

  const now = new Date();
  const [row] = await db
    .insert(storySocialPublications)
    .values({
      topicId,
      storyId,
      platform: publication.platform,
      status: publication.status,
      scheduledAt: publication.scheduledAt ?? null,
      publishedAt: publication.publishedAt ?? null,
      postUrl: publication.postUrl ?? null,
      note: publication.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        storySocialPublications.topicId,
        storySocialPublications.storyId,
        storySocialPublications.platform,
      ],
      set: {
        status: publication.status,
        scheduledAt: publication.scheduledAt ?? null,
        publishedAt: publication.publishedAt ?? null,
        postUrl: publication.postUrl ?? null,
        note: publication.note ?? null,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("The social publication record could not be saved");
  }

  return mapStorySocialPublication(row);
}

/**
 * Removes a platform record without changing editorial selection. The method
 * is deliberately idempotent so callers can safely retry cleanup requests.
 */
export async function deleteStorySocialPublication(
  topicId: string,
  storyId: string,
  platform: SocialPublicationPlatform,
): Promise<boolean> {
  const deleted = await db
    .delete(storySocialPublications)
    .where(
      and(
        eq(storySocialPublications.topicId, topicId),
        eq(storySocialPublications.storyId, storyId),
        eq(storySocialPublications.platform, platform),
      ),
    )
    .returning({ id: storySocialPublications.id });

  return deleted.length > 0;
}

export function parseStorySocialPublicationInput(
  value: unknown,
): UpsertStorySocialPublicationInput {
  if (!isRecord(value)) {
    throw new SocialPublicationValidationError("A publication object is required");
  }

  return validateStorySocialPublicationInput({
    platform: parseSocialPublicationPlatform(value.platform),
    status: parseSocialPublicationStatus(value.status),
    scheduledAt: optionalDate(value.scheduledAt, "scheduledAt"),
    publishedAt: optionalDate(value.publishedAt, "publishedAt"),
    postUrl: optionalUrl(value.postUrl, "postUrl"),
    note: optionalText(value.note, "note", MAX_NOTE_LENGTH),
  });
}

export function parseSocialPublicationPlatform(
  value: unknown,
): SocialPublicationPlatform {
  const platform = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isSocialPublicationPlatform(platform)) {
    throw new SocialPublicationValidationError(
      "platform must be one of instagram, linkedin, tiktok, facebook, x, youtube, or newsletter",
    );
  }

  return platform;
}

export function parseSocialPublicationStatus(
  value: unknown,
): SocialPublicationStatus {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isSocialPublicationStatus(status)) {
    throw new SocialPublicationValidationError(
      "status must be one of draft, scheduled, or published",
    );
  }

  return status;
}

async function requireApprovedTopicStory(
  topicId: string,
  storyId: string,
): Promise<void> {
  const [story] = await db
    .select({ id: topicStories.id })
    .from(topicStories)
    .where(
      and(
        eq(topicStories.topicId, topicId),
        eq(topicStories.storyId, storyId),
        eq(topicStories.reviewDecision, "approved"),
      ),
    )
    .limit(1);

  if (!story) {
    throw new SelectedStoryPublicationNotFoundError(
      "Only approved stories can have publication tracking",
    );
  }
}

function validateStorySocialPublicationInput(
  input: UpsertStorySocialPublicationInput,
): UpsertStorySocialPublicationInput {
  const scheduledAt = optionalDate(input.scheduledAt, "scheduledAt");
  const status = parseSocialPublicationStatus(input.status);
  const publishedAt =
    optionalDate(input.publishedAt, "publishedAt") ??
    (status === "published" ? new Date() : undefined);

  if (scheduledAt && publishedAt && publishedAt < scheduledAt) {
    throw new SocialPublicationValidationError(
      "publishedAt cannot be earlier than scheduledAt",
    );
  }

  return {
    platform: parseSocialPublicationPlatform(input.platform),
    status,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(input.postUrl !== undefined
      ? { postUrl: optionalUrl(input.postUrl, "postUrl") }
      : {}),
    ...(input.note !== undefined
      ? { note: optionalText(input.note, "note", MAX_NOTE_LENGTH) }
      : {}),
  };
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!(value instanceof Date) && typeof value !== "string") {
    throw new SocialPublicationValidationError(`${field} must be a valid date`);
  }

  const date = value instanceof Date ? new Date(value) : new Date(value.trim());
  if (Number.isNaN(date.getTime())) {
    throw new SocialPublicationValidationError(`${field} must be a valid date`);
  }

  return date;
}

function optionalUrl(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field, MAX_POST_URL_LENGTH);
  if (!text) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SocialPublicationValidationError(`${field} must be a valid URL`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SocialPublicationValidationError(`${field} must use http or https`);
  }

  return text;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new SocialPublicationValidationError(`${field} must be text`);
  }

  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return undefined;
  }

  if (text.length > maxLength) {
    throw new SocialPublicationValidationError(
      `${field} must be at most ${maxLength} characters`,
    );
  }

  return text;
}

function mapStorySocialPublication(
  row: typeof storySocialPublications.$inferSelect,
): StorySocialPublication {
  return {
    id: row.id,
    topicId: row.topicId,
    storyId: row.storyId,
    platform: row.platform,
    status: row.status,
    ...(row.scheduledAt ? { scheduledAt: row.scheduledAt } : {}),
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    ...(row.postUrl ? { postUrl: row.postUrl } : {}),
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class SocialPublicationValidationError extends Error {}

export class SelectedStoryPublicationNotFoundError extends Error {}
