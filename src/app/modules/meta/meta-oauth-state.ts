import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signs the OAuth `state` param that round-trips through Meta's login dialog.
 *
 * Meta's redirect hits our callback directly from its own servers, so that
 * request carries no Authorization header we control — `state` is the only
 * place to bind the callback back to the topic that started it and to prove
 * it was not forged. No "server-only" import: the signing/verification logic
 * is pure and unit-tested; only the env-var read lives in server-only code.
 *
 * `mechanism` distinguishes which OAuth product this state belongs to —
 * Instagram Login (topic-meta-connections.ts) or Facebook Login for Business
 * (topic-facebook-connections.ts, PUB-09) — so a state minted for one can
 * never be accepted by the other's callback, even though both are signed with
 * the same secret. The nonce itself only proves the state was not forged or
 * replayed past its TTL; single-use enforcement is the caller's job (see
 * meta-oauth-attempts.repository.ts), since that requires a database.
 */

const STATE_TTL_MS = 10 * 60 * 1_000;

export type MetaOAuthMechanism = "instagram" | "facebook";

export type MetaOAuthStatePayload = {
  topicId: string;
  mechanism: MetaOAuthMechanism;
  nonce: string;
  issuedAt: number;
};

export type SignedMetaOAuthState = {
  state: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
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
  input: { topicId: string; mechanism: MetaOAuthMechanism },
  secret: string,
  now = Date.now(),
): SignedMetaOAuthState {
  const nonce = randomBytes(9).toString("base64url");
  const payload: MetaOAuthStatePayload = {
    topicId: input.topicId,
    mechanism: input.mechanism,
    nonce,
    issuedAt: now,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signState(encodedPayload, secret);
  return {
    state: `${encodedPayload}.${signature}`,
    nonce,
    issuedAt: new Date(now),
    expiresAt: new Date(now + STATE_TTL_MS),
  };
}

/**
 * Returns the full payload when `state` carries a valid, unexpired signature
 * for the configured secret; undefined for anything forged, stale, or
 * malformed. Callers must still check `mechanism` matches the callback they
 * are running, and consume `nonce` via meta-oauth-attempts.repository.ts
 * before trusting this result — this function alone does not enforce either.
 */
export function verifyMetaOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): MetaOAuthStatePayload | undefined {
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
    typeof payload.issuedAt !== "number" ||
    typeof payload.nonce !== "string" ||
    (payload.mechanism !== "instagram" && payload.mechanism !== "facebook")
  ) {
    return undefined;
  }
  if (now - payload.issuedAt > STATE_TTL_MS || payload.issuedAt > now) {
    return undefined;
  }
  return payload;
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
