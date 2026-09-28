import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { metaFacebookOauthSelections } from "@/db/schema";

import type { FacebookPageChoice } from "./meta-connection.types";
import { requireMetaTokenEncryptionKeyFromEnv } from "./meta-integration.config";
import {
  decryptMetaSecret,
  encryptMetaSecret,
  loadMetaTokenEncryptionKey,
} from "./meta-token-crypto";

/**
 * The Pages offered after the Facebook Login for Business dialog, held
 * server-side just long enough for the editor to choose one (PUB-09). The
 * browser only ever sees the selection id and public page fields; each
 * Page's token stays encrypted here until the chosen one is confirmed.
 * Confirming is single-use and only accepts a pageId from this exact stored
 * list — never an arbitrary id supplied by the browser.
 */

export const FACEBOOK_SELECTION_TTL_MS = 15 * 60 * 1_000;

export type StoredFacebookPage = FacebookPageChoice & { pageAccessToken: string };

export async function createPendingFacebookSelection(
  topicId: string,
  pages: StoredFacebookPage[],
  now = new Date(),
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + FACEBOOK_SELECTION_TTL_MS);
  const [row] = await db
    .insert(metaFacebookOauthSelections)
    .values({
      topicId,
      pagesEncrypted: encryptMetaSecret(JSON.stringify(pages), loadEncryptionKey()),
      createdAt: now,
      expiresAt,
    })
    .returning({ id: metaFacebookOauthSelections.id });
  return { id: row.id, expiresAt };
}

/** Public page fields for a still-open selection; undefined once consumed, expired, or for another topic. */
export async function getPendingFacebookSelection(
  id: string,
  topicId: string,
  now = new Date(),
): Promise<{ pages: FacebookPageChoice[]; expiresAt: Date } | undefined> {
  const row = await findOpenRow(id, topicId, now);
  if (!row) return undefined;
  return {
    pages: decryptPages(row.pagesEncrypted).map(toPublicChoice),
    expiresAt: row.expiresAt,
  };
}

/**
 * Atomically consumes the selection for one of its own Pages. Returns
 * undefined when the pageId is not in the stored list, or the selection is
 * expired, already consumed, or belongs to another topic. Concurrent confirms
 * race the same guarded UPDATE, so at most one succeeds.
 */
export async function consumePendingFacebookSelection(
  id: string,
  topicId: string,
  pageId: string,
  now = new Date(),
): Promise<StoredFacebookPage | undefined> {
  const row = await findOpenRow(id, topicId, now);
  if (!row) return undefined;
  const page = decryptPages(row.pagesEncrypted).find((candidate) => candidate.pageId === pageId);
  if (!page) return undefined;
  const [consumed] = await db
    .update(metaFacebookOauthSelections)
    .set({ consumedAt: now })
    .where(openGuard(id, topicId, now))
    .returning({ id: metaFacebookOauthSelections.id });
  return consumed ? page : undefined;
}

function openGuard(id: string, topicId: string, now: Date) {
  return and(
    eq(metaFacebookOauthSelections.id, id),
    eq(metaFacebookOauthSelections.topicId, topicId),
    isNull(metaFacebookOauthSelections.consumedAt),
    gt(metaFacebookOauthSelections.expiresAt, now),
  );
}

async function findOpenRow(id: string, topicId: string, now: Date) {
  const [row] = await db
    .select()
    .from(metaFacebookOauthSelections)
    .where(openGuard(id, topicId, now))
    .limit(1);
  return row;
}

function decryptPages(pagesEncrypted: string): StoredFacebookPage[] {
  return JSON.parse(decryptMetaSecret(pagesEncrypted, loadEncryptionKey())) as StoredFacebookPage[];
}

function toPublicChoice(page: StoredFacebookPage): FacebookPageChoice {
  return {
    pageId: page.pageId,
    pageName: page.pageName,
    tasks: page.tasks,
    ...(page.linkedIgUserId ? { linkedIgUserId: page.linkedIgUserId } : {}),
    ...(page.linkedIgUsername ? { linkedIgUsername: page.linkedIgUsername } : {}),
  };
}

function loadEncryptionKey() {
  return loadMetaTokenEncryptionKey(requireMetaTokenEncryptionKeyFromEnv());
}
