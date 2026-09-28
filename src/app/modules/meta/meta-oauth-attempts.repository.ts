import "server-only";

import { and, eq, isNull, gt } from "drizzle-orm";

import { db } from "@/db/client";
import { metaOauthAttempts } from "@/db/schema";

import type { MetaOAuthMechanism } from "./meta-oauth-state";

/** Persists a freshly signed OAuth state so its nonce can be consumed exactly once. */
export async function recordMetaOAuthAttempt(input: {
  nonce: string;
  topicId: string;
  workspaceId: string;
  mechanism: MetaOAuthMechanism;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(metaOauthAttempts).values({
    nonce: input.nonce,
    topicId: input.topicId,
    workspaceId: input.workspaceId,
    mechanism: input.mechanism,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

/**
 * Atomically consumes a recorded attempt: succeeds at most once, only for the
 * exact topic and mechanism it was issued for, and only before it expires.
 * Concurrent or repeated callbacks (double-click, browser back-button replay)
 * all race this same guarded UPDATE — Postgres row locking means exactly one
 * of them sees `true`.
 */
export async function consumeMetaOAuthAttempt(input: {
  nonce: string;
  topicId: string;
  mechanism: MetaOAuthMechanism;
  now: Date;
}): Promise<boolean> {
  const [consumed] = await db
    .update(metaOauthAttempts)
    .set({ consumedAt: input.now })
    .where(
      and(
        eq(metaOauthAttempts.nonce, input.nonce),
        eq(metaOauthAttempts.topicId, input.topicId),
        eq(metaOauthAttempts.mechanism, input.mechanism),
        isNull(metaOauthAttempts.consumedAt),
        gt(metaOauthAttempts.expiresAt, input.now),
      ),
    )
    .returning({ nonce: metaOauthAttempts.nonce });
  return Boolean(consumed);
}
