import "server-only";
import { publishingPreflightState, PUBLISHING_ACCESS_MESSAGES } from "./instagram-publishing-access";

import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { topicMetaConnections } from "@/db/schema";

import {
  MetaGraphApiError,
  refreshLongLivedInstagramToken,
} from "./meta-graph-client";
import {
  getDefaultMetaAppCredentials,
  requireMetaTokenEncryptionKeyFromEnv,
} from "./meta-integration.config";
import { deriveMetaConnectionState } from "./meta-connection-state";
import type {
  MediaSyncSummary,
  TopicMetaConnectionStatus,
} from "./meta-connection.types";
import { isMetaTokenRefreshEligible } from "./meta-token-refresh-policy";
import { classifyMetaGraphError } from "./meta-verification";
import {
  decryptMetaSecret,
  encryptMetaSecret,
  loadMetaTokenEncryptionKey,
} from "./meta-token-crypto";

export class TopicMetaConnectionError extends Error {}

export async function getTopicMetaConnectionStatus(
  topicId: string,
): Promise<TopicMetaConnectionStatus> {
  const storedRow = await findRow(topicId);
  if (!storedRow) {
    return { connected: false, state: "disconnected", hasCustomApp: false, publishing: { state: "disconnected", message: PUBLISHING_ACCESS_MESSAGES.disconnected } };
  }

  const row = await maybeRefreshTopicMetaToken(topicId, storedRow);
  const now = new Date();
  const publishingState = publishingPreflightState(publicationDestinationFromRow(row));

  return {
    publishing: { state: publishingState, message: PUBLISHING_ACCESS_MESSAGES[publishingState] },
    connected: Boolean(row.igUserId && row.accessTokenEncrypted),
    state: deriveMetaConnectionState(row, now),
    ...(row.igUsername ? { igUsername: row.igUsername } : {}),
    ...(row.pageName ? { pageName: row.pageName } : {}),
    ...(row.tokenExpiresAt ? { tokenExpiresAt: row.tokenExpiresAt } : {}),
    ...(row.connectedAt ? { connectedAt: row.connectedAt } : {}),
    ...(row.connectedBy ? { connectedBy: row.connectedBy } : {}),
    ...(row.grantedPermissions.length
      ? { grantedPermissions: row.grantedPermissions }
      : {}),
    ...(row.lastVerifiedAt ? { lastVerifiedAt: row.lastVerifiedAt } : {}),
    ...(row.lastVerificationError
      ? { lastVerificationError: row.lastVerificationError }
      : {}),
    ...(row.lastMediaSyncAt ? { lastMediaSyncAt: row.lastMediaSyncAt } : {}),
    ...(row.lastMediaSyncCursor
      ? { lastMediaSyncCursor: row.lastMediaSyncCursor }
      : {}),
    ...(row.lastMediaSyncSummary
      ? { lastMediaSyncSummary: row.lastMediaSyncSummary as MediaSyncSummary }
      : {}),
    hasCustomApp: Boolean(row.appId && row.appSecretEncrypted),
  };
}

/**
 * Records the outcome of one IG-02 media sync page.
 * - `cursor`: the Graph `paging.cursors.after` for the next page, or null once
 *   fully paged. Omit it entirely (e.g. on a failed sync) to leave the stored
 *   cursor untouched — a malformed response must not wipe it.
 * - Guarded on `connectionVersion` (like recordMetaVerificationSuccess): a
 *   sync that started against the previous connection cannot write its cursor
 *   onto a freshly (re)connected account.
 */
export async function recordInstagramMediaSync(
  topicId: string,
  input: {
    connectionVersion: string;
    summary: MediaSyncSummary;
    cursor?: string | null;
    syncedAt?: Date;
  },
): Promise<void> {
  const at = input.syncedAt ?? new Date();
  await db
    .update(topicMetaConnections)
    .set({
      lastMediaSyncAt: at,
      ...(input.cursor !== undefined
        ? { lastMediaSyncCursor: input.cursor }
        : {}),
      lastMediaSyncSummary: input.summary,
      updatedAt: at,
    })
    .where(
      and(
        eq(topicMetaConnections.topicId, topicId),
        eq(topicMetaConnections.connectionVersion, input.connectionVersion),
      ),
    );
}

/**
 * Lazily reconciles the stored token on a normal read, the same "sync on
 * request" idiom manage-creative-assets.ts uses for fal.ai batches — there is
 * no scheduled-job infrastructure in this app.
 *
 * Both writes below are guarded by matching on the exact connectionVersion
 * read at the top of this call, not just topicId or igUserId: this refresh
 * spans a real network round trip, and an admin could reconnect — even the
 * *same* Instagram account, which keeps the same igUserId — while it's in
 * flight. connectionVersion changes on every (re)connect specifically to
 * catch that case. If the row changed underneath us the update matches zero
 * rows; re-reading rather than trusting the locally-computed guess is what
 * keeps this request's own response accurate in that case (the update itself
 * was already a safe no-op either way).
 */
async function maybeRefreshTopicMetaToken(
  topicId: string,
  row: NonNullable<Awaited<ReturnType<typeof findRow>>>,
): Promise<NonNullable<Awaited<ReturnType<typeof findRow>>>> {
  if (!isMetaTokenRefreshEligible(row, new Date())) return row;

  const sameConnection = and(
    eq(topicMetaConnections.topicId, topicId),
    eq(topicMetaConnections.connectionVersion, row.connectionVersion),
  );

  try {
    const key = loadEncryptionKey();
    const accessToken = decryptMetaSecret(row.accessTokenEncrypted!, key);
    const refreshed = await refreshLongLivedInstagramToken(accessToken);
    const accessTokenEncrypted = encryptMetaSecret(refreshed.accessToken, key);
    const tokenExpiresAt = new Date(
      Date.now() + refreshed.expiresIn * 1_000,
    );

    const updated = await db
      .update(topicMetaConnections)
      .set({ accessTokenEncrypted, tokenExpiresAt, updatedAt: new Date() })
      .where(sameConnection)
      .returning();

    return updated[0] ?? (await findRow(topicId)) ?? row;
  } catch (error) {
    console.error(
      `Failed to refresh the Instagram token for topic ${topicId}`,
      error,
    );
    // A refresh that fails because the token is already dead (revoked,
    // password changed) must not leave the stored tokenExpiresAt looking
    // healthy — deriveMetaConnectionState would keep reporting "operational"
    // for up to the refresh window (10 days) instead of needs-reconnect.
    const graphError =
      error instanceof MetaGraphApiError ? error.graphError : undefined;
    if (classifyMetaGraphError(graphError) !== "auth") return row;

    const tokenExpiresAt = new Date();
    const updated = await db
      .update(topicMetaConnections)
      .set({ tokenExpiresAt, updatedAt: tokenExpiresAt })
      .where(sameConnection)
      .returning();

    return updated[0] ?? (await findRow(topicId)) ?? row;
  }
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
    grantedPermissions?: string[];
  },
): Promise<{ connectionVersion: string }> {
  const key = loadEncryptionKey();
  const now = new Date();
  const accessTokenEncrypted = encryptMetaSecret(input.accessToken, key);
  const grantedPermissions = input.grantedPermissions ?? [];
  // Fresh on every (re)connect, even reauthorizing the same Instagram
  // account — this is what lets a stale refresh/verification for the
  // connection this replaced be told apart from this one. See
  // recordMetaVerificationSuccess/Failure and maybeRefreshTopicMetaToken.
  const connectionVersion = randomUUID();

  // A reauthorization invalidates any prior live verification — it must not
  // survive a reconnect. The admin re-runs "Verify access" (or the callback's
  // own auto-verify) against the freshly granted scopes.
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
      grantedPermissions,
      connectionVersion,
      lastVerifiedAt: null,
      lastVerificationError: null,
      lastMediaSyncAt: null,
      lastMediaSyncCursor: null,
      lastMediaSyncSummary: null,
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
        grantedPermissions,
        connectionVersion,
        lastVerifiedAt: null,
        lastVerificationError: null,
        lastMediaSyncAt: null,
        lastMediaSyncCursor: null,
        lastMediaSyncSummary: null,
        updatedAt: now,
      },
    });

  return { connectionVersion };
}

/**
 * Clears the connected account, keeping any custom Meta App override.
 * Also rotates connectionVersion: a refresh or verification started before
 * this call captured the old version and can still complete afterward. Since
 * this update itself doesn't filter on connectionVersion (disconnect always
 * applies, regardless of who else is mid-flight), the *new* random value is
 * one nothing in flight could have captured, so their guarded writes are
 * guaranteed to find zero matching rows and no-op instead of reviving a
 * cleared connection with a stale token or a bogus "verified" mark.
 */
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
      grantedPermissions: [],
      connectionVersion: randomUUID(),
      lastVerifiedAt: null,
      lastVerificationError: null,
      lastMediaSyncAt: null,
      lastMediaSyncCursor: null,
      lastMediaSyncSummary: null,
      updatedAt: new Date(),
    })
    .where(eq(topicMetaConnections.topicId, topicId));
}

/**
 * Records a successful live insights-access verification. Guarded on
 * connectionVersion, not igUserId or just topicId: verifying spans a real
 * network call to Meta, and an admin could reconnect — even the *same*
 * Instagram account, which keeps the same igUserId — while it's in flight.
 * Without this guard, a stale success (or failure, below) for the connection
 * that was replaced could land on the new one after the fact, marking a
 * never-actually-verified token as verified or vice versa.
 */
export async function recordMetaVerificationSuccess(
  topicId: string,
  connectionVersion: string,
  verifiedAt: Date,
): Promise<void> {
  await db
    .update(topicMetaConnections)
    .set({
      lastVerifiedAt: verifiedAt,
      lastVerificationError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(topicMetaConnections.topicId, topicId),
        eq(topicMetaConnections.connectionVersion, connectionVersion),
      ),
    );
}

/**
 * Records a failed live verification, guarded the same way as
 * recordMetaVerificationSuccess above. forceReconnect (an auth-classified
 * failure — the token itself is dead) also sets tokenExpiresAt to now: at
 * this instant Meta's own error response confirmed the token no longer
 * works, so "now" is the most accurate expiry there is, and it lets
 * deriveMetaConnectionState's single expiry check cover both a lapsed 60-day
 * window and an early revocation without a fourth status column.
 */
export async function recordMetaVerificationFailure(
  topicId: string,
  connectionVersion: string,
  input: { message: string; forceReconnect: boolean },
): Promise<void> {
  const now = new Date();
  await db
    .update(topicMetaConnections)
    .set({
      lastVerificationError: input.message,
      updatedAt: now,
      ...(input.forceReconnect ? { tokenExpiresAt: now } : {}),
    })
    .where(
      and(
        eq(topicMetaConnections.topicId, topicId),
        eq(topicMetaConnections.connectionVersion, connectionVersion),
      ),
    );
}

/**
 * The plaintext Page access token for publishing. Not used by any route yet
 * (publishing is a later phase) — reserved for the manage-creative-assets
 * publish flow.
 */
export async function getDecryptedTopicMetaAccessToken(
  topicId: string,
): Promise<
  { accessToken: string; igUserId: string; connectionVersion: string }
  | undefined
> {
  const row = await findRow(topicId);
  if (!row?.accessTokenEncrypted || !row.igUserId) return undefined;
  const key = loadEncryptionKey();
  return {
    accessToken: decryptMetaSecret(row.accessTokenEncrypted, key),
    igUserId: row.igUserId,
    connectionVersion: row.connectionVersion,
  };
}

/**
 * The connected account's identity (no token material) — for read-only
 * features like the IG-03 gallery that only need to scope rows by igUserId.
 */
export async function getConnectedInstagramAccount(
  topicId: string,
): Promise<{ igUserId: string; igUsername: string | null } | undefined> {
  const row = await findRow(topicId);
  if (!row?.igUserId || !row.accessTokenEncrypted) return undefined;
  return { igUserId: row.igUserId, igUsername: row.igUsername ?? null };
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

/** Read-only destination snapshot. Never refreshes or decrypts tokens. */
export async function getPublicationDestination(topicId: string) {
  return publicationDestinationFromRow(await findRow(topicId));
}

function publicationDestinationFromRow(row: Awaited<ReturnType<typeof findRow>>) {
  return {
    igUserId: row?.igUserId ?? null,
    igUsername: row?.igUsername ?? null,
    connectionVersion: row?.connectionVersion ?? "",
    connected: Boolean(row?.igUserId && row.accessTokenEncrypted),
    expired: Boolean(row?.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()),
    grantedPermissionsKnown: Boolean(row?.grantedPermissions.length),
    hasPublishingPermission: Boolean(row?.grantedPermissions.includes("instagram_business_content_publish")),
    hasBasicPermission: Boolean(row?.grantedPermissions.includes("instagram_business_basic")),
    appConfigurationVersion: createHash("sha256").update(JSON.stringify([
      row?.appId, row?.appSecretEncrypted, row?.appId ? null : getDefaultMetaAppCredentials(),
    ])).digest("hex"),
  };
}

/** Account identity, grants and token come from the same row read. No refresh or writes. */
export async function getPublicationAccessContext(topicId: string) {
  const row = await findRow(topicId);
  const destination = publicationDestinationFromRow(row);
  const canCheck = publishingPreflightState(destination) === "unverified";
  return {
    topicId, destination,
    ...(canCheck && row?.accessTokenEncrypted ? { accessToken: decryptMetaSecret(row.accessTokenEncrypted, loadEncryptionKey()) } : {}),
  };
}
