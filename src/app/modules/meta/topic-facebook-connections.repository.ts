import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { topicFacebookConnections } from "@/db/schema";

import { deriveFacebookChannelCapabilities } from "./channel-capabilities";
import type { FacebookPageDestination } from "./instagram-publication-candidate";
import type { TopicFacebookConnectionStatus } from "./meta-connection.types";
import {
  getDefaultMetaFacebookAppCredentials,
  requireMetaTokenEncryptionKeyFromEnv,
} from "./meta-integration.config";
import {
  decryptMetaSecret,
  encryptMetaSecret,
  loadMetaTokenEncryptionKey,
} from "./meta-token-crypto";

/**
 * Persistence for a topic's Facebook Page connection (PUB-09), mirroring
 * topic-meta-connections.repository.ts function for function: encrypt on
 * write, decrypt only when a token is about to be used, and guard every
 * write that completes an async operation on connectionVersion so a stale
 * result can never land on a connection that was replaced or cleared.
 */

export class TopicFacebookConnectionError extends Error {}

type FacebookRow = typeof topicFacebookConnections.$inferSelect;

export async function getTopicFacebookConnectionStatus(
  topicId: string,
  now = new Date(),
): Promise<TopicFacebookConnectionStatus> {
  return statusFromRow(await findRow(topicId), now);
}

export function statusFromRow(
  row: FacebookRow | undefined,
  now: Date,
): TopicFacebookConnectionStatus {
  const connected = Boolean(row?.pageId && row.pageAccessTokenEncrypted);
  const tokenExpired = Boolean(
    connected && row?.tokenExpiresAt && row.tokenExpiresAt.getTime() <= now.getTime(),
  );
  const pageTasks = connected ? (row?.pageTasks ?? []) : [];
  return {
    connected,
    needsReconnect: tokenExpired,
    ...(connected && row?.pageId ? { pageId: row.pageId } : {}),
    ...(connected && row?.pageName ? { pageName: row.pageName } : {}),
    pageTasks,
    ...(connected && row?.linkedIgUserId ? { linkedIgUserId: row.linkedIgUserId } : {}),
    ...(connected && row?.linkedIgUsername ? { linkedIgUsername: row.linkedIgUsername } : {}),
    ...(connected && row?.tokenExpiresAt ? { tokenExpiresAt: row.tokenExpiresAt } : {}),
    ...(connected && row?.connectedAt ? { connectedAt: row.connectedAt } : {}),
    hasCustomApp: Boolean(row?.appId && row.appSecretEncrypted),
    grantedPermissions: connected ? (row?.grantedPermissions ?? []) : [],
    ...(connected && row?.lastVerifiedAt ? { lastVerifiedAt: row.lastVerifiedAt } : {}),
    ...(connected && row?.lastVerificationError
      ? { lastVerificationError: row.lastVerificationError }
      : {}),
    capabilities: deriveFacebookChannelCapabilities({ connected, tokenExpired, pageTasks }),
  };
}

export async function getEffectiveMetaFacebookAppCredentials(
  topicId: string,
): Promise<{ appId: string; appSecret: string }> {
  const row = await findRow(topicId);
  if (row?.appId && row.appSecretEncrypted) {
    return {
      appId: row.appId,
      appSecret: decryptMetaSecret(row.appSecretEncrypted, loadEncryptionKey()),
    };
  }
  const fallback = getDefaultMetaFacebookAppCredentials();
  if (!fallback) {
    throw new TopicFacebookConnectionError(
      "No Facebook App is configured for this topic and no default META_FACEBOOK_APP_ID/META_FACEBOOK_APP_SECRET is set",
    );
  }
  return fallback;
}

export async function saveTopicFacebookConnection(
  topicId: string,
  input: {
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    tasks: string[];
    linkedIgUserId?: string;
    linkedIgUsername?: string;
    tokenExpiresAt?: Date;
    connectedBy?: string;
    grantedPermissions?: string[];
  },
): Promise<{ connectionVersion: string }> {
  const now = new Date();
  // Fresh on every (re)connect, even to the same Page, so a verification that
  // started against the connection this replaces can never land on this one.
  const connectionVersion = randomUUID();
  const values = {
    pageId: input.pageId,
    pageName: input.pageName,
    pageAccessTokenEncrypted: encryptMetaSecret(input.pageAccessToken, loadEncryptionKey()),
    pageTasks: input.tasks,
    linkedIgUserId: input.linkedIgUserId ?? null,
    linkedIgUsername: input.linkedIgUsername ?? null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    connectedAt: now,
    connectedBy: input.connectedBy ?? null,
    grantedPermissions: input.grantedPermissions ?? [],
    connectionVersion,
    lastVerifiedAt: null,
    lastVerificationError: null,
    updatedAt: now,
  };
  await db
    .insert(topicFacebookConnections)
    .values({ topicId, ...values })
    .onConflictDoUpdate({ target: topicFacebookConnections.topicId, set: values });
  return { connectionVersion };
}

/**
 * Clears the Page connection, keeping any per-topic Facebook App override.
 * Never touches topic_meta_connections: disconnecting Facebook leaves a
 * directly connected Instagram account exactly as it was. Rotates
 * connectionVersion for the same reason disconnectTopicMeta does.
 */
export async function disconnectTopicFacebook(topicId: string): Promise<void> {
  await db
    .update(topicFacebookConnections)
    .set({
      pageId: null,
      pageName: null,
      pageAccessTokenEncrypted: null,
      pageTasks: [],
      linkedIgUserId: null,
      linkedIgUsername: null,
      tokenExpiresAt: null,
      connectedAt: null,
      connectedBy: null,
      grantedPermissions: [],
      connectionVersion: randomUUID(),
      lastVerifiedAt: null,
      lastVerificationError: null,
      updatedAt: new Date(),
    })
    .where(eq(topicFacebookConnections.topicId, topicId));
}

/**
 * A live verification can also refresh the Page name and its linked
 * Instagram account, which may change after connect. A field left undefined
 * keeps its stored value — e.g. when the Instagram link could not be read —
 * instead of being cleared by an unrelated read failure.
 */
export async function recordFacebookVerificationSuccess(
  topicId: string,
  connectionVersion: string,
  verifiedAt: Date,
  input: { pageName?: string; linkedIgUserId?: string | null; linkedIgUsername?: string } = {},
): Promise<void> {
  await db
    .update(topicFacebookConnections)
    .set({
      ...(input.pageName ? { pageName: input.pageName } : {}),
      ...(input.linkedIgUserId !== undefined
        ? { linkedIgUserId: input.linkedIgUserId, linkedIgUsername: input.linkedIgUsername ?? null }
        : {}),
      lastVerifiedAt: verifiedAt,
      lastVerificationError: null,
      updatedAt: new Date(),
    })
    .where(guard(topicId, connectionVersion));
}

/** forceReconnect marks the token expired now, same convention as recordMetaVerificationFailure. */
export async function recordFacebookVerificationFailure(
  topicId: string,
  connectionVersion: string,
  input: { message: string; forceReconnect: boolean },
): Promise<void> {
  const now = new Date();
  await db
    .update(topicFacebookConnections)
    .set({
      lastVerificationError: input.message,
      updatedAt: now,
      ...(input.forceReconnect ? { tokenExpiresAt: now } : {}),
    })
    .where(guard(topicId, connectionVersion));
}

export async function getDecryptedTopicFacebookAccessToken(
  topicId: string,
): Promise<{ pageAccessToken: string; pageId: string; connectionVersion: string } | undefined> {
  const row = await findRow(topicId);
  if (!row?.pageAccessTokenEncrypted || !row.pageId) return undefined;
  return {
    pageAccessToken: decryptMetaSecret(row.pageAccessTokenEncrypted, loadEncryptionKey()),
    pageId: row.pageId,
    connectionVersion: row.connectionVersion,
  };
}

/**
 * PUB-13 groundwork: the Facebook side of the shared destination contract.
 * Read-only, never decrypts a token. Nothing publishes to it yet (PUB-10).
 */
export async function getFacebookPublicationDestination(
  topicId: string,
  now = new Date(),
): Promise<FacebookPageDestination> {
  const row = await findRow(topicId);
  const status = statusFromRow(row, now);
  return {
    platform: "facebook-page",
    pageId: status.pageId ?? null,
    pageName: status.pageName ?? null,
    linkedIgUserId: status.linkedIgUserId ?? null,
    connectionVersion: row?.connectionVersion ?? "",
    connected: status.connected,
    expired: status.needsReconnect,
    hasPublishingTask: status.pageTasks.some((task) => task === "CREATE_CONTENT" || task === "MANAGE"),
    appConfigurationVersion: createHash("sha256")
      .update(JSON.stringify([row?.appId ?? null, row?.appSecretEncrypted ?? null, getDefaultMetaFacebookAppCredentials()?.appId ?? null]))
      .digest("hex"),
  };
}

function guard(topicId: string, connectionVersion: string) {
  return and(
    eq(topicFacebookConnections.topicId, topicId),
    eq(topicFacebookConnections.connectionVersion, connectionVersion),
  );
}

async function findRow(topicId: string): Promise<FacebookRow | undefined> {
  const [row] = await db
    .select()
    .from(topicFacebookConnections)
    .where(eq(topicFacebookConnections.topicId, topicId))
    .limit(1);
  return row;
}

function loadEncryptionKey() {
  return loadMetaTokenEncryptionKey(requireMetaTokenEncryptionKeyFromEnv());
}
