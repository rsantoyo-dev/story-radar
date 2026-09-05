import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { topicMetaConnections } from "@/db/schema";

import {
  getDefaultMetaAppCredentials,
  requireMetaTokenEncryptionKeyFromEnv,
} from "./meta-integration.config";
import type { TopicMetaConnectionStatus } from "./meta-connection.types";
import {
  decryptMetaSecret,
  encryptMetaSecret,
  loadMetaTokenEncryptionKey,
} from "./meta-token-crypto";

export class TopicMetaConnectionError extends Error {}

export async function getTopicMetaConnectionStatus(
  topicId: string,
): Promise<TopicMetaConnectionStatus> {
  const row = await findRow(topicId);
  if (!row) {
    return { connected: false, hasCustomApp: false };
  }

  return {
    connected: Boolean(row.igUserId && row.accessTokenEncrypted),
    ...(row.igUsername ? { igUsername: row.igUsername } : {}),
    ...(row.pageName ? { pageName: row.pageName } : {}),
    ...(row.tokenExpiresAt ? { tokenExpiresAt: row.tokenExpiresAt } : {}),
    ...(row.connectedAt ? { connectedAt: row.connectedAt } : {}),
    ...(row.connectedBy ? { connectedBy: row.connectedBy } : {}),
    hasCustomApp: Boolean(row.appId && row.appSecretEncrypted),
  };
}

/**
 * Resolves the Meta App this topic's OAuth handshake should use: its own
 * override when configured, otherwise the shared app from env vars.
 */
export async function getEffectiveMetaAppCredentials(
  topicId: string,
): Promise<{ appId: string; appSecret: string }> {
  const row = await findRow(topicId);
  if (row?.appId && row.appSecretEncrypted) {
    const key = loadEncryptionKey();
    return {
      appId: row.appId,
      appSecret: decryptMetaSecret(row.appSecretEncrypted, key),
    };
  }

  const fallback = getDefaultMetaAppCredentials();
  if (!fallback) {
    throw new TopicMetaConnectionError(
      "No Meta App is configured for this topic and no default META_APP_ID/META_APP_SECRET is set",
    );
  }
  return fallback;
}

export async function saveTopicMetaAppOverride(
  topicId: string,
  input: { appId: string; appSecret: string },
): Promise<void> {
  const key = loadEncryptionKey();
  const now = new Date();
  await db
    .insert(topicMetaConnections)
    .values({
      topicId,
      appId: input.appId,
      appSecretEncrypted: encryptMetaSecret(input.appSecret, key),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: topicMetaConnections.topicId,
      set: {
        appId: input.appId,
        appSecretEncrypted: encryptMetaSecret(input.appSecret, key),
        updatedAt: now,
      },
    });
}

export async function clearTopicMetaAppOverride(topicId: string): Promise<void> {
  await db
    .update(topicMetaConnections)
    .set({ appId: null, appSecretEncrypted: null, updatedAt: new Date() })
    .where(eq(topicMetaConnections.topicId, topicId));
}

export async function saveTopicMetaConnection(
  topicId: string,
  input: {
    igUserId: string;
    igUsername?: string;
    accessToken: string;
    tokenExpiresAt?: Date;
    connectedBy?: string;
  },
): Promise<void> {
  const key = loadEncryptionKey();
  const now = new Date();
  const accessTokenEncrypted = encryptMetaSecret(input.accessToken, key);

  await db
    .insert(topicMetaConnections)
    .values({
      topicId,
      igUserId: input.igUserId,
      igUsername: input.igUsername ?? null,
      accessTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      connectedAt: now,
      connectedBy: input.connectedBy ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: topicMetaConnections.topicId,
      set: {
        igUserId: input.igUserId,
        igUsername: input.igUsername ?? null,
        accessTokenEncrypted,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        connectedAt: now,
        connectedBy: input.connectedBy ?? null,
        updatedAt: now,
      },
    });
}

/** Clears the connected account, keeping any custom Meta App override. */
export async function disconnectTopicMeta(topicId: string): Promise<void> {
  await db
    .update(topicMetaConnections)
    .set({
      igUserId: null,
      igUsername: null,
      pageId: null,
      pageName: null,
      accessTokenEncrypted: null,
      tokenExpiresAt: null,
      connectedAt: null,
      connectedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(topicMetaConnections.topicId, topicId));
}

/**
 * The plaintext Page access token for publishing. Not used by any route yet
 * (publishing is a later phase) — reserved for the manage-creative-assets
 * publish flow.
 */
export async function getDecryptedTopicMetaAccessToken(
  topicId: string,
): Promise<{ accessToken: string; igUserId: string } | undefined> {
  const row = await findRow(topicId);
  if (!row?.accessTokenEncrypted || !row.igUserId) return undefined;
  const key = loadEncryptionKey();
  return {
    accessToken: decryptMetaSecret(row.accessTokenEncrypted, key),
    igUserId: row.igUserId,
  };
}

async function findRow(topicId: string) {
  const [row] = await db
    .select()
    .from(topicMetaConnections)
    .where(eq(topicMetaConnections.topicId, topicId))
    .limit(1);
  return row;
}

function loadEncryptionKey() {
  return loadMetaTokenEncryptionKey(requireMetaTokenEncryptionKeyFromEnv());
}
