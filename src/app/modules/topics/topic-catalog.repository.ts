import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import type {
  RssContentMode,
  RssSourceConfig,
} from "@/app/modules/sources/rss/rss-source.types";
import { parseAllowedRssUrl } from "@/app/modules/sources/rss/fetch-rss-feed";
import {
  DEFAULT_TOPIC_THEME_KEY,
  isTopicThemeKey,
  type TopicThemeKey,
} from "@/design/topic-themes";
import { db } from "@/db/client";
import {
  rssSources,
  topicSources,
  topics,
  workspaces,
  type RssSource,
  type Topic,
  type TopicSource,
  type Workspace,
} from "@/db/schema";

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_TOPIC_SLUG = "tech";

export type CreateTopicInput = {
  name: string;
  slug?: string;
  description?: string | null;
  themeKey?: TopicThemeKey;
  isActive?: boolean;
};

export type UpdateTopicInput = Partial<CreateTopicInput>;

export type CreateRssSourceInput = {
  name: string;
  slug?: string;
  url: string;
  language: string;
  region: string;
  contentMode?: RssContentMode;
  pollEveryMinutes?: number;
  isActive?: boolean;
};

export type UpdateRssSourceInput = Partial<CreateRssSourceInput>;

export type AttachTopicSourceInput = {
  enabled?: boolean;
  tags?: readonly string[];
  priority?: number;
};

export type UpdateTopicSourceInput = AttachTopicSourceInput;

export type TopicRssSourceConfig = RssSourceConfig & {
  topicSourceId: string;
  topicId: string;
  sourceEnabled: boolean;
  topicEnabled: boolean;
  priority: number;
};

/**
 * Retrieves the seeded workspace. If this fails, migrations have not been run
 * and the caller should not silently create tenancy data at request time.
 */
export async function getDefaultWorkspace(): Promise<Workspace> {
  const workspace = await getWorkspaceById(DEFAULT_WORKSPACE_ID);

  if (!workspace) {
    throw new TopicCatalogNotFoundError(
      "The default workspace is not initialized. Run database migrations first.",
    );
  }

  return workspace;
}

export async function getWorkspaceById(
  workspaceId: string,
): Promise<Workspace | undefined> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace;
}

export async function listTopics(
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<Topic[]> {
  return db
    .select()
    .from(topics)
    .where(eq(topics.workspaceId, workspaceId))
    .orderBy(asc(topics.name));
}

export async function getTopicById(
  topicId: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<Topic | undefined> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(
      and(eq(topics.id, topicId), eq(topics.workspaceId, workspaceId)),
    )
    .limit(1);

  return topic;
}

export async function getTopicBySlug(
  slug: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<Topic | undefined> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(
      and(eq(topics.slug, slug), eq(topics.workspaceId, workspaceId)),
    )
    .limit(1);

  return topic;
}

export async function getDefaultTopic(): Promise<Topic> {
  const topic = await getTopicBySlug(DEFAULT_TOPIC_SLUG);

  if (!topic) {
    throw new TopicCatalogNotFoundError(
      "The default Tech topic is not initialized. Run database migrations first.",
    );
  }

  return topic;
}

export async function createTopic(
  input: CreateTopicInput,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<Topic> {
  await assertWorkspaceExists(workspaceId);

  const topic = normalizeTopicInput(input);
  const [created] = await db
    .insert(topics)
    .values({ workspaceId, ...topic })
    .returning();

  if (!created) {
    throw new Error("Topic could not be created");
  }

  return created;
}

export async function updateTopic(
  topicId: string,
  input: UpdateTopicInput,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<Topic> {
  const existing = await assertTopicExists(topicId, workspaceId);
  const update = normalizeTopicUpdate(input, existing);
  const [saved] = await db
    .update(topics)
    .set({ ...update, updatedAt: new Date() })
    .where(
      and(eq(topics.id, topicId), eq(topics.workspaceId, workspaceId)),
    )
    .returning();

  if (!saved) {
    throw new Error("Topic could not be updated");
  }

  return saved;
}

export async function deleteTopic(
  topicId: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const deleted = await db
    .delete(topics)
    .where(
      and(eq(topics.id, topicId), eq(topics.workspaceId, workspaceId)),
    )
    .returning({ id: topics.id });

  if (deleted.length === 0) {
    throw new TopicCatalogNotFoundError("Topic was not found");
  }
}

export async function listRssSources(
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<RssSource[]> {
  return db
    .select()
    .from(rssSources)
    .where(eq(rssSources.workspaceId, workspaceId))
    .orderBy(asc(rssSources.name));
}

export async function getRssSourceById(
  sourceId: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<RssSource | undefined> {
  const [source] = await db
    .select()
    .from(rssSources)
    .where(
      and(
        eq(rssSources.id, sourceId),
        eq(rssSources.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  return source;
}

export async function createRssSource(
  input: CreateRssSourceInput,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<RssSource> {
  await assertWorkspaceExists(workspaceId);

  const source = normalizeRssSourceInput(input);
  const [created] = await db
    .insert(rssSources)
    .values({ workspaceId, ...source })
    .returning();

  if (!created) {
    throw new Error("RSS source could not be created");
  }

  return created;
}

/**
 * Creates a reusable feed or returns the existing workspace feed for the same
 * normalized URL. Topic-level settings remain on topic_sources, so attaching
 * the same RSS URL to a second topic must not fail on the source URL unique
 * constraint or overwrite the connection fields owned by the first topic.
 */
export async function createOrReuseRssSource(
  input: CreateRssSourceInput,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<RssSource> {
  await assertWorkspaceExists(workspaceId);

  const source = normalizeRssSourceInput(input);
  const [created] = await db
    .insert(rssSources)
    .values({ workspaceId, ...source })
    .onConflictDoNothing({
      target: [rssSources.workspaceId, rssSources.url],
    })
    .returning();

  if (created) {
    return created;
  }

  const [existing] = await db
    .select()
    .from(rssSources)
    .where(
      and(
        eq(rssSources.workspaceId, workspaceId),
        eq(rssSources.url, source.url),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("RSS source could not be created or reused");
  }

  return existing;
}

export async function updateRssSource(
  sourceId: string,
  input: UpdateRssSourceInput,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<RssSource> {
  const existing = await assertRssSourceExists(sourceId, workspaceId);
  const update = normalizeRssSourceUpdate(input, existing);
  const [saved] = await db
    .update(rssSources)
    .set({ ...update, updatedAt: new Date() })
    .where(
      and(
        eq(rssSources.id, sourceId),
        eq(rssSources.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!saved) {
    throw new Error("RSS source could not be updated");
  }

  return saved;
}

export async function deleteRssSource(
  sourceId: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const deleted = await db
    .delete(rssSources)
    .where(
      and(
        eq(rssSources.id, sourceId),
        eq(rssSources.workspaceId, workspaceId),
      ),
    )
    .returning({ id: rssSources.id });

  if (deleted.length === 0) {
    throw new TopicCatalogNotFoundError("RSS source was not found");
  }
}

/**
 * Returns source configurations in the shape used by the current collector.
 * Tags and enabled state come from the topic-source relationship; connection
 * data comes from the reusable RSS source.
 */
export async function listTopicRssSourceConfigs(
  topicId: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<TopicRssSourceConfig[]> {
  await assertTopicExists(topicId, workspaceId);

  const rows = await db
    .select({
      topicSourceId: topicSources.id,
      topicId: topicSources.topicId,
      topicEnabled: topicSources.enabled,
      tags: topicSources.tags,
      priority: topicSources.priority,
      sourceId: rssSources.id,
      name: rssSources.name,
      url: rssSources.url,
      language: rssSources.language,
      region: rssSources.region,
      contentMode: rssSources.contentMode,
      pollEveryMinutes: rssSources.pollEveryMinutes,
      sourceEnabled: rssSources.isActive,
    })
    .from(topicSources)
    .innerJoin(
      rssSources,
      and(
        eq(topicSources.rssSourceId, rssSources.id),
        eq(topicSources.workspaceId, rssSources.workspaceId),
      ),
    )
    .where(
      and(
        eq(topicSources.workspaceId, workspaceId),
        eq(topicSources.topicId, topicId),
      ),
    )
    .orderBy(desc(topicSources.priority), asc(rssSources.name));

  return rows.map((row) => ({
    id: row.sourceId,
    name: row.name,
    url: row.url,
    enabled: row.sourceEnabled && row.topicEnabled,
    language: row.language,
    region: row.region,
    tags: row.tags,
    pollEveryMinutes: row.pollEveryMinutes,
    contentMode: row.contentMode,
    topicSourceId: row.topicSourceId,
    topicId: row.topicId,
    sourceEnabled: row.sourceEnabled,
    topicEnabled: row.topicEnabled,
    priority: row.priority,
  }));
}

export async function attachRssSourceToTopic(
  topicId: string,
  sourceId: string,
  input: AttachTopicSourceInput = {},
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<TopicSource> {
  await Promise.all([
    assertTopicExists(topicId, workspaceId),
    assertRssSourceExists(sourceId, workspaceId),
  ]);

  const source = normalizeTopicSourceInput(input);
  const [attached] = await db
    .insert(topicSources)
    .values({
      workspaceId,
      topicId,
      rssSourceId: sourceId,
      ...source,
    })
    .onConflictDoUpdate({
      target: [topicSources.topicId, topicSources.rssSourceId],
      set: { ...source, updatedAt: new Date() },
    })
    .returning();

  if (!attached) {
    throw new Error("RSS source could not be attached to the topic");
  }

  return attached;
}

export async function updateTopicSource(
  topicSourceId: string,
  input: UpdateTopicSourceInput,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<TopicSource> {
  const existing = await getTopicSourceById(topicSourceId, workspaceId);

  if (!existing) {
    throw new TopicCatalogNotFoundError("Topic source was not found");
  }

  const source = normalizeTopicSourceInput(input, existing);
  const [saved] = await db
    .update(topicSources)
    .set({ ...source, updatedAt: new Date() })
    .where(
      and(
        eq(topicSources.id, topicSourceId),
        eq(topicSources.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!saved) {
    throw new Error("Topic source could not be updated");
  }

  return saved;
}

export async function detachRssSourceFromTopic(
  topicSourceId: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const deleted = await db
    .delete(topicSources)
    .where(
      and(
        eq(topicSources.id, topicSourceId),
        eq(topicSources.workspaceId, workspaceId),
      ),
    )
    .returning({ id: topicSources.id });

  if (deleted.length === 0) {
    throw new TopicCatalogNotFoundError("Topic source was not found");
  }
}

export class TopicCatalogValidationError extends Error {}

export class TopicCatalogNotFoundError extends Error {}

async function assertWorkspaceExists(workspaceId: string): Promise<Workspace> {
  const workspace = await getWorkspaceById(workspaceId);

  if (!workspace) {
    throw new TopicCatalogNotFoundError("Workspace was not found");
  }

  return workspace;
}

async function assertTopicExists(
  topicId: string,
  workspaceId: string,
): Promise<Topic> {
  const topic = await getTopicById(topicId, workspaceId);

  if (!topic) {
    throw new TopicCatalogNotFoundError("Topic was not found");
  }

  return topic;
}

async function assertRssSourceExists(
  sourceId: string,
  workspaceId: string,
): Promise<RssSource> {
  const source = await getRssSourceById(sourceId, workspaceId);

  if (!source) {
    throw new TopicCatalogNotFoundError("RSS source was not found");
  }

  return source;
}

async function getTopicSourceById(
  topicSourceId: string,
  workspaceId: string,
): Promise<TopicSource | undefined> {
  const [source] = await db
    .select()
    .from(topicSources)
    .where(
      and(
        eq(topicSources.id, topicSourceId),
        eq(topicSources.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  return source;
}

function normalizeTopicInput(input: CreateTopicInput) {
  const name = textValue(input.name, "name", 120);

  return {
    name,
    slug: slugValue(input.slug ?? name, "slug"),
    description: optionalTextValue(input.description, "description", 1_000),
    themeKey: themeKeyValue(input.themeKey ?? DEFAULT_TOPIC_THEME_KEY),
    isActive: optionalBoolean(input.isActive, true, "isActive"),
  };
}

function normalizeTopicUpdate(input: UpdateTopicInput, existing: Topic) {
  const name = input.name === undefined
    ? existing.name
    : textValue(input.name, "name", 120);

  return {
    name,
    slug: input.slug === undefined
      ? existing.slug
      : slugValue(input.slug, "slug"),
    description: input.description === undefined
      ? existing.description
      : optionalTextValue(input.description, "description", 1_000),
    themeKey: input.themeKey === undefined
      ? existing.themeKey
      : themeKeyValue(input.themeKey),
    isActive: input.isActive === undefined
      ? existing.isActive
      : optionalBoolean(input.isActive, existing.isActive, "isActive"),
  };
}

function themeKeyValue(value: unknown): TopicThemeKey {
  if (isTopicThemeKey(value)) {
    return value;
  }

  throw new TopicCatalogValidationError("themeKey must be a configured topic theme");
}

function normalizeRssSourceInput(input: CreateRssSourceInput) {
  const name = textValue(input.name, "name", 160);

  return {
    name,
    slug: slugValue(input.slug ?? name, "slug"),
    url: rssUrlValue(input.url),
    language: textValue(input.language, "language", 32),
    region: textValue(input.region, "region", 80),
    contentMode: contentModeValue(input.contentMode ?? "auto"),
    pollEveryMinutes: pollingIntervalValue(input.pollEveryMinutes ?? 60),
    isActive: optionalBoolean(input.isActive, true, "isActive"),
  };
}

function normalizeRssSourceUpdate(
  input: UpdateRssSourceInput,
  existing: RssSource,
) {
  return {
    name: input.name === undefined
      ? existing.name
      : textValue(input.name, "name", 160),
    slug: input.slug === undefined
      ? existing.slug
      : slugValue(input.slug, "slug"),
    url: input.url === undefined ? existing.url : rssUrlValue(input.url),
    language: input.language === undefined
      ? existing.language
      : textValue(input.language, "language", 32),
    region: input.region === undefined
      ? existing.region
      : textValue(input.region, "region", 80),
    contentMode: input.contentMode === undefined
      ? existing.contentMode
      : contentModeValue(input.contentMode),
    pollEveryMinutes: input.pollEveryMinutes === undefined
      ? existing.pollEveryMinutes
      : pollingIntervalValue(input.pollEveryMinutes),
    isActive: input.isActive === undefined
      ? existing.isActive
      : optionalBoolean(input.isActive, existing.isActive, "isActive"),
  };
}

function normalizeTopicSourceInput(
  input: AttachTopicSourceInput,
  existing?: TopicSource,
) {
  return {
    enabled: input.enabled === undefined
      ? existing?.enabled ?? true
      : optionalBoolean(input.enabled, existing?.enabled ?? true, "enabled"),
    tags: input.tags === undefined
      ? existing?.tags ?? []
      : textList(input.tags, "tags", 20, 50),
    priority: input.priority === undefined
      ? existing?.priority ?? 0
      : priorityValue(input.priority),
  };
}

function textValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TopicCatalogValidationError(`${field} is required`);
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function optionalTextValue(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return textValue(value, field, maxLength);
}

function slugValue(value: unknown, field: string): string {
  const normalized = textValue(value, field, 120)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new TopicCatalogValidationError(
      `${field} must contain at least one latin letter or number`,
    );
  }

  return normalized;
}

function rssUrlValue(value: unknown): string {
  const url = textValue(value, "url", 2_000);

  try {
    return parseAllowedRssUrl(url).toString();
  } catch {
    throw new TopicCatalogValidationError(
      "url must be a safe public HTTP or HTTPS URL",
    );
  }
}

function contentModeValue(value: unknown): RssContentMode {
  if (value === "excerpt" || value === "full" || value === "auto") {
    return value;
  }

  throw new TopicCatalogValidationError(
    "contentMode must be excerpt, full, or auto",
  );
}

function pollingIntervalValue(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 5 || (value as number) > 1_440) {
    throw new TopicCatalogValidationError(
      "pollEveryMinutes must be an integer between 5 and 1440",
    );
  }

  return value as number;
}

function priorityValue(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new TopicCatalogValidationError(
      "priority must be an integer between 0 and 100",
    );
  }

  return value as number;
}

function optionalBoolean(
  value: unknown,
  fallback: boolean,
  field: string,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new TopicCatalogValidationError(`${field} must be a boolean`);
  }

  return value;
}

function textList(
  value: readonly string[],
  field: string,
  maxItems: number,
  maxItemLength: number,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TopicCatalogValidationError(`${field} must be a text array`);
  }

  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxItemLength));
}
