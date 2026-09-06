import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  topicInstagramMedia,
  topicInstagramMediaChildren,
} from "@/db/schema";

import type { InstagramMediaNode } from "./instagram-media-response";

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
      await db
        .delete(topicInstagramMediaChildren)
        .where(eq(topicInstagramMediaChildren.mediaId, saved.id));
      if (node.children.length > 0) {
        await db.insert(topicInstagramMediaChildren).values(
          node.children.map((child, index) => ({
            mediaId: saved.id,
            externalId: child.externalId,
            mediaType: child.mediaType,
            mediaUrl: child.mediaUrl,
            thumbnailUrl: child.thumbnailUrl,
            order: index + 1,
          })),
        );
      }
    }
  }

  return counts;
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
