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
  topicInstagramMedia,
  topicInstagramMediaChildren,
} from "@/db/schema";

import type { InstagramMediaNode } from "./instagram-media-response";
import {
  instagramMediaFormat,
  type InstagramMediaFormat,
} from "./instagram-media-format";

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
};

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

const CAPTION_EXCERPT_MAX = 280;

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
    .select({
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
    })
    .from(topicInstagramMedia)
    .where(and(...conditions))
    .orderBy(
      sql`${topicInstagramMedia.publishedAt} desc`,
      sql`${topicInstagramMedia.id} desc`,
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const childCounts = await countChildrenByMedia(page.map((row) => row.id));

  const items: InstagramMediaListItem[] = page.map((row) => ({
    id: row.id,
    externalId: row.externalId,
    format: instagramMediaFormat(row),
    permalink: row.permalink,
    caption: row.caption ? row.caption.slice(0, CAPTION_EXCERPT_MAX) : null,
    thumbnailUrl: row.thumbnailUrl ?? row.mediaUrl,
    publishedAt: row.publishedAt.toISOString(),
    accessState: row.accessState === "inaccessible" ? "inaccessible" : "accessible",
    childCount: childCounts.get(row.id) ?? 0,
    linkState: row.linkedStoryId ? "linked" : "pending",
    linkedStoryId: row.linkedStoryId,
  }));

  const last = page.at(-1);
  return hasMore && last
    ? { items, nextCursor: encodeCursor(last.publishedAt, last.id) }
    : { items };
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
