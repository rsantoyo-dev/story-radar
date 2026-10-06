import "server-only";

import { and, eq, max } from "drizzle-orm";

import { db } from "@/db/client";
import { topicInstagramMedia } from "@/db/schema";

import type { MetaConnectionState } from "./meta-connection-state";
import type { InstagramGraphHost } from "./meta-graph-client";
import {
  getFacebookChannelSendCredentials,
  getTopicFacebookConnectionStatus,
  recordFacebookVerificationFailure,
} from "./topic-facebook-connections.repository";
import {
  getConnectedInstagramAccount,
  getDecryptedTopicMetaAccessToken,
  getTopicMetaConnectionStatus,
  recordMetaVerificationFailure,
} from "./topic-meta-connections.repository";

/**
 * The Instagram account a topic's publication history reads (IG-02 to IG-06).
 * A direct Instagram login keeps priority, so its existing history is
 * unchanged; otherwise it is the account linked to the topic's Facebook Page,
 * read with the Page token on graph.facebook.com (the PUB-09 connection).
 */
export type InstagramHistorySource = "instagram-direct" | "facebook-page";

export type InstagramHistoryAccount = {
  source: InstagramHistorySource;
  igUserId: string;
  igUsername: string | null;
};

export type InstagramHistoryCredentials = InstagramHistoryAccount & {
  accessToken: string;
  connectionVersion: string;
  host: InstagramGraphHost;
};

export function instagramHistoryHost(source: InstagramHistorySource): InstagramGraphHost {
  return source === "instagram-direct" ? "graph.instagram.com" : "graph.facebook.com";
}

/** The account, its connection state and the last media sync. Never decrypts a token. */
export async function getInstagramHistoryStatus(topicId: string): Promise<{
  account?: InstagramHistoryAccount;
  state: MetaConnectionState;
  lastMediaSyncAt?: Date;
}> {
  const direct = await getConnectedInstagramAccount(topicId);
  if (direct) {
    const status = await getTopicMetaConnectionStatus(topicId);
    return {
      account: { source: "instagram-direct", ...direct },
      state: status.state,
      ...(status.lastMediaSyncAt ? { lastMediaSyncAt: status.lastMediaSyncAt } : {}),
    };
  }
  const page = await getTopicFacebookConnectionStatus(topicId);
  if (!page.connected || !page.linkedIgUserId) return { state: "disconnected" };
  const lastMediaSyncAt = await lastMediaUpdate(topicId, page.linkedIgUserId);
  return {
    account: { source: "facebook-page", igUserId: page.linkedIgUserId, igUsername: page.linkedIgUsername ?? null },
    // The Page connection stores no granted scopes; a missing insights grant
    // surfaces when metrics are read, not as a connection state.
    state: page.needsReconnect ? "needs-reconnect" : "operational",
    ...(lastMediaSyncAt ? { lastMediaSyncAt } : {}),
  };
}

/** Same precedence as getInstagramHistoryStatus, with the token decrypted for one provider call. */
export async function getInstagramHistoryCredentials(
  topicId: string,
): Promise<InstagramHistoryCredentials | undefined> {
  const direct = await getDecryptedTopicMetaAccessToken(topicId);
  if (direct) {
    const account = await getConnectedInstagramAccount(topicId);
    return {
      source: "instagram-direct",
      igUserId: direct.igUserId,
      igUsername: account?.igUsername ?? null,
      accessToken: direct.accessToken,
      connectionVersion: direct.connectionVersion,
      host: instagramHistoryHost("instagram-direct"),
    };
  }
  const page = await getFacebookChannelSendCredentials(topicId, "instagram-page");
  if (!page) return undefined;
  const status = await getTopicFacebookConnectionStatus(topicId);
  return {
    source: "facebook-page",
    igUserId: page.accountId,
    igUsername: status.linkedIgUsername ?? null,
    accessToken: page.accessToken,
    connectionVersion: page.connectionVersion,
    host: instagramHistoryHost("facebook-page"),
  };
}

/** A rejected token marks the connection it came from as needing reconnection. */
export async function recordInstagramHistoryAuthFailure(
  topicId: string,
  credentials: Pick<InstagramHistoryCredentials, "source" | "connectionVersion">,
  message: string,
): Promise<void> {
  const input = { message, forceReconnect: true };
  if (credentials.source === "instagram-direct") {
    await recordMetaVerificationFailure(topicId, credentials.connectionVersion, input);
  } else {
    await recordFacebookVerificationFailure(topicId, credentials.connectionVersion, input);
  }
}

/**
 * The Page connection has no sync bookkeeping columns; a sync rewrites every
 * row it reads, so the latest row update is when history last changed.
 */
async function lastMediaUpdate(topicId: string, igUserId: string): Promise<Date | undefined> {
  const [row] = await db
    .select({ at: max(topicInstagramMedia.updatedAt) })
    .from(topicInstagramMedia)
    .where(and(eq(topicInstagramMedia.topicId, topicId), eq(topicInstagramMedia.igUserId, igUserId)));
  return row?.at ?? undefined;
}
