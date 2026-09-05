import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signs the OAuth `state` param that round-trips through Meta's login dialog.
 *
 * Meta's redirect hits our callback directly from its own servers, so that
 * request carries no Authorization header we control — `state` is the only
 * place to bind the callback back to the topic that started it and to prove
 * it was not forged. No "server-only" import: the signing/verification logic
 * is pure and unit-tested; only the env-var read lives in server-only code.
 */

const STATE_TTL_MS = 10 * 60 * 1_000;

export type MetaOAuthStatePayload = {
  topicId: string;
  nonce: string;
  issuedAt: number;
};

export class MetaOAuthStateConfigError extends Error {}

export function requireMetaStateSecret(rawSecret: string | undefined): string {
  const trimmed = rawSecret?.trim();
  if (!trimmed) {
    throw new MetaOAuthStateConfigError("META_STATE_SECRET is not configured");
  }
  return trimmed;
}

export function signMetaOAuthState(
  topicId: string,
  secret: string,
  now = Date.now(),
): string {
  const payload: MetaOAuthStatePayload = {
    topicId,
    nonce: randomBytes(9).toString("base64url"),
    issuedAt: now,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signState(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

/**
 * Returns the topicId when `state` carries a valid, unexpired signature for
 * the configured secret; undefined for anything forged, stale, or malformed.
 */
export function verifyMetaOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): string | undefined {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return undefined;

  const expectedSignature = signState(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) return undefined;

  let payload: MetaOAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as MetaOAuthStatePayload;
  } catch {
    return undefined;
  }
  if (
    typeof payload.topicId !== "string" ||
    typeof payload.issuedAt !== "number"
  ) {
    return undefined;
  }
  if (now - payload.issuedAt > STATE_TTL_MS || payload.issuedAt > now) {
    return undefined;
  }
  return payload.topicId;
}

function signState(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
