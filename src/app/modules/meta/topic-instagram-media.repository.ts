import "server-only";

import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  stories,
  storySocialPublications,
  topicInstagramMedia,
  topicInstagramMediaChildren,
  topicStories,
} from "@/db/schema";

import type { InstagramMediaNode } from "./instagram-media-response";
import {
  instagramMediaFormat,
  type InstagramMediaFormat,
} from "./instagram-media-format";
import {
  computeMetricRatios,
  mergeInstagramMediaMetricsBlob,
  type MetricRatios,
  type ParsedInstagramMediaMetric,
  type StoredInstagramMediaMetric,
} from "./instagram-media-insights-response";
import { instagramPermalinkShortcode } from "./instagram-permalink";

export type InstagramMediaUpsertCounts = {
  imported: number;
  updated: number;
  carousels: number;
};

/**
 * Upserts one page of imported Instagram media for a topic (IG-02). Keyed on
 * (topicId, externalId), so repeating or overlapping syncs never create
 * duplicates. Existing rows have their mutable fields (caption, permalink, the
 * expiring media/thumbnail URLs, published time, raw snapshot) refreshed and
 * `access_state` reset to 'accessible'. Rows are never deleted here — a media
 * object absent from a page is simply not touched.
 *
 * A carousel stays one row in topic_instagram_media; its elements are replaced
 * deterministically in topic_instagram_media_children.
 */
export async function upsertInstagramMediaPage(
  topicId: string,
  igUserId: string,
  nodes: InstagramMediaNode[],
): Promise<InstagramMediaUpsertCounts> {
  const counts: InstagramMediaUpsertCounts = {
    imported: 0,
    updated: 0,
    carousels: 0,
  };
  if (nodes.length === 0) return counts;

  const externalIds = nodes.map((node) => node.externalId);
  const known = new Set(
    (
      await db
        .select({ externalId: topicInstagramMedia.externalId })
        .from(topicInstagramMedia)
        .where(
          and(
            eq(topicInstagramMedia.topicId, topicId),
            inArray(topicInstagramMedia.externalId, externalIds),
          ),
        )
    ).map((row) => row.externalId),
  );

  const now = new Date();
  for (const node of nodes) {
    const values = {
      topicId,
      igUserId,
      externalId: node.externalId,
      mediaType: node.mediaType,
      mediaProductType: node.mediaProductType,
      permalink: node.permalink,
      caption: node.caption,
      mediaUrl: node.mediaUrl,
      thumbnailUrl: node.thumbnailUrl,
      publishedAt: new Date(node.publishedAt),
      accessState: "accessible",
      raw: node.raw,
      updatedAt: now,
    };

    const [saved] = await db
      .insert(topicInstagramMedia)
      .values(values)
      .onConflictDoUpdate({
        target: [topicInstagramMedia.topicId, topicInstagramMedia.externalId],
        set: {
          igUserId,
          mediaType: values.mediaType,
          mediaProductType: values.mediaProductType,
          permalink: values.permalink,
          caption: values.caption,
          mediaUrl: values.mediaUrl,
          thumbnailUrl: values.thumbnailUrl,
          publishedAt: values.publishedAt,
          accessState: "accessible",
          raw: values.raw,
          updatedAt: now,
        },
      })
      .returning({ id: topicInstagramMedia.id });

    if (known.has(node.externalId)) counts.updated += 1;
    else counts.imported += 1;

    if (node.mediaType === "CAROUSEL_ALBUM" || node.children.length > 0) {
      counts.carousels += 1;
      await replaceCarouselChildren(saved.id, node.children);
    }
  }

  return counts;
}

/**
 * Replaces a carousel's elements in one transaction. The first statement locks
 * the parent row (`FOR UPDATE`), so a second concurrent sync of the same
 * carousel blocks until this one commits and then works from a consistent
 * state — no cross-deletion between differing element lists, and the
 * delete + insert either both land or neither does (no partial update, no
 * unique-violation window).
 */
async function replaceCarouselChildren(
  mediaId: string,
  children: InstagramMediaNode["children"],
): Promise<void> {
  const lockParent = db
    .select({ id: topicInstagramMedia.id })
    .from(topicInstagramMedia)
    .where(eq(topicInstagramMedia.id, mediaId))
    .for("update");
  const deleteChildren = db
    .delete(topicInstagramMediaChildren)
    .where(eq(topicInstagramMediaChildren.mediaId, mediaId));

  if (children.length === 0) {
    await db.batch([lockParent, deleteChildren]);
    return;
  }

  await db.batch([
    lockParent,
    deleteChildren,
    db.insert(topicInstagramMediaChildren).values(
      children.map((child, index) => ({
        mediaId,
        externalId: child.externalId,
        mediaType: child.mediaType,
        mediaUrl: child.mediaUrl,
        thumbnailUrl: child.thumbnailUrl,
        order: index + 1,
      })),
    ),
  ]);
}

/**
 * Marks one imported media as confirmed inaccessible without deleting it, so
 * its history is kept with that state (IG-02 / IG-03). Returns whether a row
 * was affected.
 */
export async function markInstagramMediaInaccessible(
  topicId: string,
  externalId: string,
): Promise<boolean> {
  const updated = await db
    .update(topicInstagramMedia)
    .set({ accessState: "inaccessible", updatedAt: new Date() })
    .where(
      and(
        eq(topicInstagramMedia.topicId, topicId),
        eq(topicInstagramMedia.externalId, externalId),
      ),
    )
    .returning({ id: topicInstagramMedia.id });
  return updated.length > 0;
}

/** Count of imported media for a topic's current connected account. */
export async function countTopicInstagramMedia(
  topicId: string,
  igUserId: string,
): Promise<number> {
  const rows = await db
    .select({ id: topicInstagramMedia.id })
    .from(topicInstagramMedia)
    .where(
      and(
        eq(topicInstagramMedia.topicId, topicId),
        eq(topicInstagramMedia.igUserId, igUserId),
      ),
    );
  return rows.length;
}

/** One metric in `InstagramMediaListItem.metrics` (IG-05). */
export type InstagramMediaMetric = StoredInstagramMediaMetric;

export type InstagramMediaListItem = {
  id: string;
  externalId: string;
  format: InstagramMediaFormat;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  accessState: "accessible" | "inaccessible";
  childCount: number;
  linkState: "linked" | "pending";
  linkedStoryId: string | null;
  linkedStoryTitle: string | null;
  linkedDraftId: string | null;
  linkedDraftVersion: number | null;
  linkedBatchId: string | null;
  /** ISO timestamp of the last link change (create, correct or remove). */
  linkedAt: string | null;
  linkedBy: string | null;
  /** IG-05. `null` = never fetched (pending, ≠ a real zero). */
  metrics: Record<string, InstagramMediaMetric> | null;
  metricsQueriedAt: string | null;
  metricsApiVersion: string | null;
  metricsError: string | null;
  metricsErroredAt: string | null;
  /** saves/shares/comments per reach — only when reach is a real value > 0. */
  metricRatios: MetricRatios | null;
};

const CAPTION_EXCERPT_MAX = 280;

const MEDIA_ITEM_COLUMNS = {
  id: topicInstagramMedia.id,
  externalId: topicInstagramMedia.externalId,
  mediaType: topicInstagramMedia.mediaType,
  mediaProductType: topicInstagramMedia.mediaProductType,
  permalink: topicInstagramMedia.permalink,
  caption: topicInstagramMedia.caption,
  mediaUrl: topicInstagramMedia.mediaUrl,
  thumbnailUrl: topicInstagramMedia.thumbnailUrl,
  publishedAt: topicInstagramMedia.publishedAt,
  accessState: topicInstagramMedia.accessState,
  linkedStoryId: topicInstagramMedia.linkedStoryId,
  linkedStoryTitle: stories.title,
  linkedDraftId: topicInstagramMedia.linkedDraftId,
  linkedDraftVersion: topicInstagramMedia.linkedDraftVersion,
  linkedBatchId: topicInstagramMedia.linkedBatchId,
  linkedAt: topicInstagramMedia.linkedAt,
  linkedBy: topicInstagramMedia.linkedBy,
  metrics: topicInstagramMedia.metrics,
  metricsQueriedAt: topicInstagramMedia.metricsQueriedAt,
  metricsApiVersion: topicInstagramMedia.metricsApiVersion,
  metricsError: topicInstagramMedia.metricsError,
  metricsErroredAt: topicInstagramMedia.metricsErroredAt,
};

type MediaItemRow = {
  id: string;
  externalId: string;
  mediaType: string;
  mediaProductType: string | null;
  permalink: string | null;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  accessState: string;
  linkedStoryId: string | null;
  linkedStoryTitle: string | null;
  linkedDraftId: string | null;
  linkedDraftVersion: number | null;
  linkedBatchId: string | null;
  linkedAt: Date | null;
  linkedBy: string | null;
  metrics: unknown;
  metricsQueriedAt: Date | null;
  metricsApiVersion: string | null;
  metricsError: string | null;
  metricsErroredAt: Date | null;
};

const METRIC_STATES = new Set(["ok", "unavailable", "error"]);

/** Defensively shapes the stored `metrics` jsonb into the item contract. */
function normalizeMetricsBlob(
  raw: unknown,
): Record<string, InstagramMediaMetric> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, InstagramMediaMetric> = {};
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const state =
      typeof e.state === "string" && METRIC_STATES.has(e.state)
        ? (e.state as InstagramMediaMetric["state"])
        : "error";
    out[name] = {
      value: typeof e.value === "number" && Number.isFinite(e.value)
        ? e.value
        : null,
      state,
      period: typeof e.period === "string" ? e.period : null,
      unit: typeof e.unit === "string" ? e.unit : null,
      ...(typeof e.error === "string" ? { error: e.error } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function toInstagramMediaListItem(
  row: MediaItemRow,
  childCount: number,
): InstagramMediaListItem {
  const metrics = normalizeMetricsBlob(row.metrics);
  return {
    id: row.id,
    externalId: row.externalId,
    format: instagramMediaFormat(row),
    permalink: row.permalink,
    caption: row.caption ? row.caption.slice(0, CAPTION_EXCERPT_MAX) : null,
    thumbnailUrl: row.thumbnailUrl ?? row.mediaUrl,
    publishedAt: row.publishedAt.toISOString(),
    accessState:
      row.accessState === "inaccessible" ? "inaccessible" : "accessible",
    childCount,
    linkState: row.linkedStoryId ? "linked" : "pending",
    linkedStoryId: row.linkedStoryId,
    linkedStoryTitle: row.linkedStoryTitle,
    linkedDraftId: row.linkedDraftId,
    linkedDraftVersion: row.linkedDraftVersion,
    linkedBatchId: row.linkedBatchId,
    linkedAt: row.linkedAt ? row.linkedAt.toISOString() : null,
    linkedBy: row.linkedBy,
    metrics,
    metricsQueriedAt: row.metricsQueriedAt
      ? row.metricsQueriedAt.toISOString()
      : null,
    metricsApiVersion: row.metricsApiVersion,
    metricsError: row.metricsError,
    metricsErroredAt: row.metricsErroredAt
      ? row.metricsErroredAt.toISOString()
      : null,
    metricRatios: computeMetricRatios(metrics),
  };
}

export type InstagramMediaListFilters = {
  limit?: number;
  cursor?: string;
  format?: InstagramMediaFormat;
  linked?: "linked" | "pending";
  /** Inclusive YYYY-MM-DD lower bound on published time. */
  from?: string;
  /** Inclusive YYYY-MM-DD upper bound (the whole day is included). */
  to?: string;
};

/**
 * Reads one keyset page of a topic's imported Instagram media for its current
 * connected account, newest first. Stable across syncs (ordered by
 * published_at, id — no offset drift). `nextCursor` is present only while more
 * rows remain; pass it back as `cursor` to continue.
 */
export async function listTopicInstagramMedia(
  topicId: string,
  igUserId: string,
  filters: InstagramMediaListFilters = {},
): Promise<{ items: InstagramMediaListItem[]; nextCursor?: string }> {
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 60);

  const conditions = [
    eq(topicInstagramMedia.topicId, topicId),
    eq(topicInstagramMedia.igUserId, igUserId),
  ];

  const cursor = decodeCursor(filters.cursor);
  if (cursor) {
    conditions.push(
      or(
        lt(topicInstagramMedia.publishedAt, cursor.publishedAt),
        and(
          eq(topicInstagramMedia.publishedAt, cursor.publishedAt),
          lt(topicInstagramMedia.id, cursor.id),
        ),
      )!,
    );
  }

  if (filters.format) conditions.push(formatCondition(filters.format));
  if (filters.linked === "linked") {
    conditions.push(isNotNull(topicInstagramMedia.linkedStoryId));
  } else if (filters.linked === "pending") {
    conditions.push(isNull(topicInstagramMedia.linkedStoryId));
  }
  if (filters.from) {
    conditions.push(
      gte(topicInstagramMedia.publishedAt, new Date(`${filters.from}T00:00:00Z`)),
    );
  }
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    conditions.push(lt(topicInstagramMedia.publishedAt, end));
  }

  const rows = await db
    .select(MEDIA_ITEM_COLUMNS)
    .from(topicInstagramMedia)
    .leftJoin(stories, eq(stories.id, topicInstagramMedia.linkedStoryId))
    .where(and(...conditions))
    .orderBy(
      sql`${topicInstagramMedia.publishedAt} desc`,
      sql`${topicInstagramMedia.id} desc`,
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const childCounts = await countChildrenByMedia(page.map((row) => row.id));

  const items: InstagramMediaListItem[] = page.map((row) =>
    toInstagramMediaListItem(row, childCounts.get(row.id) ?? 0),
  );

  const last = page.at(-1);
  return hasMore && last
    ? { items, nextCursor: encodeCursor(last.publishedAt, last.id) }
    : { items };
}

/**
 * Reads one imported media as a list item (same shape and mapping as
 * `listTopicInstagramMedia`), scoped to the topic's current account. Used to
 * return the fresh row after a link mutation so the gallery can patch it in
 * place. Returns undefined when the media is not found for that account.
 */
export async function getTopicInstagramMediaListItem(
  topicId: string,
  igUserId: string,
  externalId: string,
): Promise<InstagramMediaListItem | undefined> {
  const [row] = await db
    .select(MEDIA_ITEM_COLUMNS)
    .from(topicInstagramMedia)
    .leftJoin(stories, eq(stories.id, topicInstagramMedia.linkedStoryId))
    .where(
      and(
        eq(topicInstagramMedia.topicId, topicId),
        eq(topicInstagramMedia.igUserId, igUserId),
        eq(topicInstagramMedia.externalId, externalId),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  const childCounts = await countChildrenByMedia([row.id]);
  return toInstagramMediaListItem(row, childCounts.get(row.id) ?? 0);
}

/**
 * Every imported publication linked to one editorial story (IG-06), newest
 * first. Unlike the gallery reads this is **not** scoped to the connected
 * account's `igUserId`: the link is the editorial fact, so a post stays on the
 * story's record even if the topic's Instagram account was later swapped.
 * A story has few linked posts — no cursor.
 */
export async function listStoryInstagramPosts(
  topicId: string,
  storyId: string,
): Promise<InstagramMediaListItem[]> {
  const rows = await db
    .select(MEDIA_ITEM_COLUMNS)
    .from(topicInstagramMedia)
    .leftJoin(stories, eq(stories.id, topicInstagramMedia.linkedStoryId))
    .where(
      and(
        eq(topicInstagramMedia.topicId, topicId),
        eq(topicInstagramMedia.linkedStoryId, storyId),
      ),
    )
    .orderBy(
      sql`${topicInstagramMedia.publishedAt} desc`,
      sql`${topicInstagramMedia.id} desc`,
    )
    .limit(100);

  const childCounts = await countChildrenByMedia(rows.map((row) => row.id));
  return rows.map((row) =>
    toInstagramMediaListItem(row, childCounts.get(row.id) ?? 0),
  );
}

export type InstagramMediaMetricsTarget = {
  externalId: string;
  mediaType: string;
  mediaProductType: string | null;
};

/**
 * The topic's most-recent accessible publications for its current account, for
 * a batch metrics refresh (IG-05). Only the fields needed to pick the metric
 * set per format. Newest first, capped by `limit`.
 */
export async function listInstagramMediaForMetricsRefresh(
  topicId: string,
  igUserId: string,
  limit: number,
): Promise<InstagramMediaMetricsTarget[]> {
  const rows = await db
    .select({
      externalId: topicInstagramMedia.externalId,
      mediaType: topicInstagramMedia.mediaType,
      mediaProductType: topicInstagramMedia.mediaProductType,
    })
    .from(topicInstagramMedia)
    .where(
      and(
        eq(topicInstagramMedia.topicId, topicId),
        eq(topicInstagramMedia.igUserId, igUserId),
        eq(topicInstagramMedia.accessState, "accessible"),
      ),
    )
    .orderBy(sql`${topicInstagramMedia.publishedAt} desc`)
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows;
}

export type InstagramMediaMetricsWrite =
  | { ok: Record<string, ParsedInstagramMediaMetric>; apiVersion: string }
  | { error: string };

/**
 * Persists one publication's metrics refresh (IG-05), scoped to the topic's
 * current account. On success the blob is **merged** per metric — a metric that
 * came back keeps its fresh value/state, one that was present before but is
 * absent now is kept with `state: "error"` (its last good value survives). On a
 * whole-request failure only `metricsError` / `metricsErroredAt` are written and
 * the blob is left untouched. Returns the fresh list item, or undefined when no
 * row matched.
 */
export async function saveInstagramMediaMetrics(input: {
  topicId: string;
  igUserId: string;
  externalId: string;
  result: InstagramMediaMetricsWrite;
  queriedAt?: Date;
}): Promise<InstagramMediaListItem | undefined> {
  const at = input.queriedAt ?? new Date();
  const where = and(
    eq(topicInstagramMedia.topicId, input.topicId),
    eq(topicInstagramMedia.igUserId, input.igUserId),
    eq(topicInstagramMedia.externalId, input.externalId),
  );

  let updated: { id: string }[];
  if ("error" in input.result) {
    updated = await db
      .update(topicInstagramMedia)
      .set({
        metricsError: input.result.error.slice(0, 500),
        metricsErroredAt: at,
        updatedAt: at,
      })
      .where(where)
      .returning({ id: topicInstagramMedia.id });
  } else {
    const [existing] = await db
      .select({ metrics: topicInstagramMedia.metrics })
      .from(topicInstagramMedia)
      .where(where)
      .limit(1);
    const prior = normalizeMetricsBlob(existing?.metrics) ?? {};
    const merged = mergeInstagramMediaMetricsBlob(prior, input.result.ok);
    updated = await db
      .update(topicInstagramMedia)
      .set({
        metrics: merged,
        metricsQueriedAt: at,
        metricsApiVersion: input.result.apiVersion,
        metricsError: null,
        metricsErroredAt: null,
        updatedAt: at,
      })
      .where(where)
      .returning({ id: topicInstagramMedia.id });
  }

  if (updated.length === 0) return undefined;
  return getTopicInstagramMediaListItem(
    input.topicId,
    input.igUserId,
    input.externalId,
  );
}

export type SetInstagramMediaLink =
  | { storyId: null; by?: string | null }
  | {
      storyId: string;
      draftId?: string | null;
      /** The published draft revision, snapshotted by the caller. */
      draftVersion?: number | null;
      batchId?: string | null;
      by?: string | null;
    };

/**
 * Writes the story link (IG-04) on one imported media, scoped to the topic's
 * current account. `storyId: null` clears the link; the story/draft/batch
 * columns go null but `linked_at` / `linked_by` still record who removed it and
 * when. Belonging checks (draft ∈ story, batch ∈ draft, story approved) are the
 * caller's job — see `linkInstagramMediaToStory`. Returns the fresh list item,
 * or undefined when no row matched.
 */
export async function setInstagramMediaStoryLink(input: {
  topicId: string;
  igUserId: string;
  externalId: string;
  link: SetInstagramMediaLink;
}): Promise<InstagramMediaListItem | undefined> {
  const now = new Date();
  const set =
    input.link.storyId === null
      ? {
          linkedStoryId: null,
          linkedDraftId: null,
          linkedDraftVersion: null,
          linkedBatchId: null,
          linkedAt: now,
          linkedBy: input.link.by ?? null,
          updatedAt: now,
        }
      : {
          linkedStoryId: input.link.storyId,
          linkedDraftId: input.link.draftId ?? null,
          linkedDraftVersion: input.link.draftId
            ? input.link.draftVersion ?? null
            : null,
          linkedBatchId: input.link.batchId ?? null,
          linkedAt: now,
          linkedBy: input.link.by ?? null,
          updatedAt: now,
        };

  const updated = await db
    .update(topicInstagramMedia)
    .set(set)
    .where(
      and(
        eq(topicInstagramMedia.topicId, input.topicId),
        eq(topicInstagramMedia.igUserId, input.igUserId),
        eq(topicInstagramMedia.externalId, input.externalId),
      ),
    )
    .returning({ id: topicInstagramMedia.id });

  if (updated.length === 0) return undefined;
  return getTopicInstagramMediaListItem(
    input.topicId,
    input.igUserId,
    input.externalId,
  );
}

/**
 * Finds the single approved story in this topic whose `instagram` publication
 * URL resolves to the same shortcode as `permalink`. Returns null when there is
 * no match or more than one distinct story (ambiguous — never auto-confirmed).
 * Text/date similarity is deliberately not considered.
 */
export async function findApprovedStoryMatchForPermalink(
  topicId: string,
  permalink: string | null | undefined,
): Promise<{ storyId: string; storyTitle: string } | null> {
  const shortcode = instagramPermalinkShortcode(permalink);
  if (!shortcode) return null;

  const rows = await db
    .select({
      storyId: storySocialPublications.storyId,
      storyTitle: stories.title,
      postUrl: storySocialPublications.postUrl,
    })
    .from(storySocialPublications)
    .innerJoin(
      topicStories,
      and(
        eq(topicStories.topicId, storySocialPublications.topicId),
        eq(topicStories.storyId, storySocialPublications.storyId),
      ),
    )
    .innerJoin(stories, eq(stories.id, storySocialPublications.storyId))
    .where(
      and(
        eq(storySocialPublications.topicId, topicId),
        eq(storySocialPublications.platform, "instagram"),
        isNotNull(storySocialPublications.postUrl),
        eq(topicStories.reviewDecision, "approved"),
      ),
    );

  const matches = new Map<string, string>();
  for (const row of rows) {
    if (instagramPermalinkShortcode(row.postUrl) === shortcode) {
      matches.set(row.storyId, row.storyTitle);
    }
  }
  if (matches.size !== 1) return null;
  const [[storyId, storyTitle]] = matches;
  return { storyId, storyTitle };
}

/**
 * URL auto-link (IG-04). For every imported media that has never had a link
 * (`linked_story_id IS NULL AND linked_at IS NULL`) and has a permalink, links
 * it to the unique approved story that already registered the same Instagram
 * URL (`findApprovedStoryMatchForPermalink`), stamping `linked_by = 'auto'`.
 *
 * `linked_at` is what separates a never-linked post from one a person
 * deliberately unlinked (or a prior auto-link): an explicit "Remove link"
 * leaves `linked_at` set, so a later sync must not silently re-link it.
 * Idempotent — each update still re-checks the row is untouched.
 * A failure here must not break the sync that calls it.
 */
export async function reconcileTopicInstagramMediaLinks(
  topicId: string,
  igUserId: string,
): Promise<{ linked: number }> {
  const candidates = await db
    .select({
      id: topicInstagramMedia.id,
      permalink: topicInstagramMedia.permalink,
    })
    .from(topicInstagramMedia)
    .where(
      and(
        eq(topicInstagramMedia.topicId, topicId),
        eq(topicInstagramMedia.igUserId, igUserId),
        isNull(topicInstagramMedia.linkedStoryId),
        isNull(topicInstagramMedia.linkedAt),
        isNotNull(topicInstagramMedia.permalink),
      ),
    );
  if (candidates.length === 0) return { linked: 0 };

  const now = new Date();
  let linked = 0;
  for (const candidate of candidates) {
    const match = await findApprovedStoryMatchForPermalink(
      topicId,
      candidate.permalink,
    );
    if (!match) continue;
    const updated = await db
      .update(topicInstagramMedia)
      .set({
        linkedStoryId: match.storyId,
        linkedBy: "auto",
        linkedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(topicInstagramMedia.id, candidate.id),
          isNull(topicInstagramMedia.linkedStoryId),
          isNull(topicInstagramMedia.linkedAt),
        ),
      )
      .returning({ id: topicInstagramMedia.id });
    linked += updated.length;
  }
  return { linked };
}

async function countChildrenByMedia(
  mediaIds: string[],
): Promise<Map<string, number>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await db
    .select({
      mediaId: topicInstagramMediaChildren.mediaId,
      n: count(),
    })
    .from(topicInstagramMediaChildren)
    .where(inArray(topicInstagramMediaChildren.mediaId, mediaIds))
    .groupBy(topicInstagramMediaChildren.mediaId);
  return new Map(rows.map((row) => [row.mediaId, Number(row.n)]));
}

function formatCondition(format: InstagramMediaFormat) {
  const type = sql`upper(${topicInstagramMedia.mediaType})`;
  const product = sql`upper(coalesce(${topicInstagramMedia.mediaProductType}, ''))`;
  switch (format) {
    case "carousel":
      return sql`${type} = 'CAROUSEL_ALBUM'`;
    case "reel":
      return sql`${type} = 'VIDEO' and ${product} = 'REELS'`;
    case "video":
      return sql`${type} = 'VIDEO' and ${product} <> 'REELS'`;
    case "image":
    default:
      return sql`${type} not in ('CAROUSEL_ALBUM', 'VIDEO')`;
  }
}

function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ p: publishedAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  value: string | undefined,
): { publishedAt: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { p?: unknown; id?: unknown };
    if (typeof parsed.p !== "string" || typeof parsed.id !== "string") {
      return undefined;
    }
    const publishedAt = new Date(parsed.p);
    return Number.isNaN(publishedAt.getTime())
      ? undefined
      : { publishedAt, id: parsed.id };
  } catch {
    return undefined;
  }
}
