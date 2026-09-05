import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  MetaSecretDecryptionError,
  MetaTokenCryptoConfigError,
  decryptMetaSecret,
  encryptMetaSecret,
  loadMetaTokenEncryptionKey,
} from "./meta-token-crypto";

const testKey = randomBytes(32);

test("round-trips a secret through encrypt and decrypt", () => {
  const ciphertext = encryptMetaSecret("EAAG...long-lived-page-token", testKey);
  assert.notEqual(ciphertext, "EAAG...long-lived-page-token");
  assert.equal(
    decryptMetaSecret(ciphertext, testKey),
    "EAAG...long-lived-page-token",
  );
});

test("produces a different ciphertext each time (random IV)", () => {
  const a = encryptMetaSecret("same-token", testKey);
  const b = encryptMetaSecret("same-token", testKey);
  assert.notEqual(a, b);
  assert.equal(decryptMetaSecret(a, testKey), "same-token");
  assert.equal(decryptMetaSecret(b, testKey), "same-token");
});

test("rejects decryption with the wrong key", () => {
  const ciphertext = encryptMetaSecret("secret-value", testKey);
  assert.throws(
    () => decryptMetaSecret(ciphertext, randomBytes(32)),
    MetaSecretDecryptionError,
  );
});

test("rejects a malformed stored value", () => {
  assert.throws(
    () => decryptMetaSecret("not-the-right-shape", testKey),
    MetaSecretDecryptionError,
  );
});

test("loadMetaTokenEncryptionKey validates length and presence", () => {
  assert.throws(
    () => loadMetaTokenEncryptionKey(undefined),
    MetaTokenCryptoConfigError,
  );
  assert.throws(
    () => loadMetaTokenEncryptionKey(Buffer.from("too-short").toString("base64")),
    MetaTokenCryptoConfigError,
  );
  const key = loadMetaTokenEncryptionKey(randomBytes(32).toString("base64"));
  assert.equal(key.length, 32);
});
