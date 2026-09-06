import "server-only";

import {
  listInstagramMedia,
  MetaGraphApiError,
} from "./meta-graph-client";
import type { MediaSyncSummary } from "./meta-connection.types";
import { classifyMetaGraphError, describeMetaVerificationError } from "./meta-verification";
import {
  getDecryptedTopicMetaAccessToken,
  getTopicMetaConnectionStatus,
  recordInstagramMediaSync,
  recordMetaVerificationFailure,
} from "./topic-meta-connections.repository";
import {
  countTopicInstagramMedia,
  upsertInstagramMediaPage,
} from "./topic-instagram-media.repository";

export class InstagramMediaSyncError extends Error {}

export type InstagramMediaSyncResult = MediaSyncSummary & {
  connected: boolean;
  /** Total imported media for this topic's current account, after this page. */
  totalImported: number;
  /** Cursor for the next (older) page; absent once fully paged. */
  nextCursor?: string;
  syncedAt: string;
};

/**
 * Imports one page of the connected account's published media (IG-02), newest
 * first, or older pages when `after` is given. Idempotent — repeating or
 * overlapping calls never duplicate (unique on topic + external id).
 *
 * A sync failure is a legitimate result, not a route error: this resolves with
 * `error` set rather than throwing for a Graph failure. An auth failure also
 * marks the connection needs-reconnect so the panel prompts for it.
 */
export async function syncInstagramMediaPage(
  topicId: string,
  options: { after?: string } = {},
): Promise<InstagramMediaSyncResult> {
  const account = await getDecryptedTopicMetaAccessToken(topicId);
  if (!account) {
    throw new InstagramMediaSyncError(
      "This topic has no connected Instagram account",
    );
  }

  const empty = { imported: 0, updated: 0, carousels: 0 };
  const status = await getTopicMetaConnectionStatus(topicId);
  if (status.state === "needs-reconnect") {
    return finalize(topicId, account, { ...empty, error: "needs-reconnect" });
  }

  let page;
  try {
    page = await listInstagramMedia(account.igUserId, account.accessToken, {
      after: options.after,
    });
  } catch (error) {
    const graphError =
      error instanceof MetaGraphApiError ? error.graphError : undefined;
    const kind = classifyMetaGraphError(graphError);
    console.error(`Instagram media sync failed for topic ${topicId}`, error);
    if (kind === "auth") {
      await recordMetaVerificationFailure(topicId, account.connectionVersion, {
        message: describeMetaVerificationError(
          graphError,
          "The Instagram token was rejected during media sync",
        ),
        forceReconnect: true,
      });
    }
    return finalize(topicId, account, {
      ...empty,
      error:
        kind === "auth"
          ? "needs-reconnect"
          : describeMetaVerificationError(
              graphError,
              error instanceof Error
                ? error.message
                : "Instagram media sync failed",
            ),
    });
  }

  // Persist first so a later failure never discards what was already imported.
  const counts = await upsertInstagramMediaPage(
    topicId,
    account.igUserId,
    page.media,
  );

  return finalize(topicId, account, {
    ...counts,
    // Advance the stored cursor only on a clean page (null once fully paged).
    cursor: page.nextCursor ?? null,
  });
}

async function finalize(
  topicId: string,
  account: { igUserId: string; connectionVersion: string },
  input: MediaSyncSummary & { cursor?: string | null },
): Promise<InstagramMediaSyncResult> {
  const syncedAt = new Date();
  const { cursor, ...summary } = input;
  await recordInstagramMediaSync(topicId, {
    connectionVersion: account.connectionVersion,
    summary,
    // Omit `cursor` on a failed sync so the stored one is left untouched.
    ...(cursor !== undefined ? { cursor } : {}),
    syncedAt,
  });
  const totalImported = await countTopicInstagramMedia(
    topicId,
    account.igUserId,
  );
  return {
    ...summary,
    connected: true,
    totalImported,
    ...(cursor ? { nextCursor: cursor } : {}),
    syncedAt: syncedAt.toISOString(),
  };
}
