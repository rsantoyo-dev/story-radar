import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * At-rest encryption for Meta long-lived access tokens and app secrets — the
 * same class of credential as an R2 access key, so it never sits in the
 * database as plaintext. AES-256-GCM with a random IV per value; the stored
 * form is `${iv}.${authTag}.${ciphertext}`, each base64url.
 *
 * This module has no "server-only" import so its pure encrypt/decrypt logic
 * stays unit-testable; callers that read the key from process.env live in
 * server-only repository code.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export class MetaTokenCryptoConfigError extends Error {}

export function loadMetaTokenEncryptionKey(rawKey: string | undefined): Buffer {
  const trimmed = rawKey?.trim();
  if (!trimmed) {
    throw new MetaTokenCryptoConfigError(
      "META_TOKEN_ENCRYPTION_KEY is not configured",
    );
  }
  const key = Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new MetaTokenCryptoConfigError(
      "META_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)",
    );
  }
  return key;
}

export function encryptMetaSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export class MetaSecretDecryptionError extends Error {}

export function decryptMetaSecret(stored: string, key: Buffer): string {
  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new MetaSecretDecryptionError(
      "Stored Meta secret is not in the expected iv.tag.ciphertext form",
    );
  }
  const [ivPart, tagPart, ciphertextPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new MetaSecretDecryptionError(
      "Stored Meta secret could not be decrypted; the encryption key may have changed",
    );
  }
}
