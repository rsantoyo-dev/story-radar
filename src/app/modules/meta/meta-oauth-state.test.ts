import assert from "node:assert/strict";
import test from "node:test";

import {
  requireMetaStateSecret,
  signMetaOAuthState,
  verifyMetaOAuthState,
} from "./meta-oauth-state";

const secret = "test-state-secret";
const topicId = "682d9c37-a433-498b-8c02-22729b601a09";

test("round-trips a signed state back to its topicId", () => {
  const state = signMetaOAuthState(topicId, secret);
  assert.equal(verifyMetaOAuthState(state, secret), topicId);
});

test("rejects a state signed with a different secret", () => {
  const state = signMetaOAuthState(topicId, secret);
  assert.equal(verifyMetaOAuthState(state, "a-different-secret"), undefined);
});

test("rejects a tampered payload even with a valid-looking signature shape", () => {
  const state = signMetaOAuthState(topicId, secret);
  const [, signature] = state.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({ topicId: "00000000-0000-0000-0000-000000000000", nonce: "x", issuedAt: Date.now() }),
    "utf8",
  ).toString("base64url");
  assert.equal(
    verifyMetaOAuthState(`${forgedPayload}.${signature}`, secret),
    undefined,
  );
});

test("rejects an expired state", () => {
  const issuedAt = Date.now() - 11 * 60 * 1_000;
  const state = signMetaOAuthState(topicId, secret, issuedAt);
  assert.equal(verifyMetaOAuthState(state, secret), undefined);
});

test("rejects malformed state strings", () => {
  assert.equal(verifyMetaOAuthState("garbage", secret), undefined);
  assert.equal(verifyMetaOAuthState("", secret), undefined);
  assert.equal(verifyMetaOAuthState("a.b.c", secret), undefined);
});

test("requireMetaStateSecret enforces configuration", () => {
  assert.throws(() => requireMetaStateSecret(undefined));
  assert.throws(() => requireMetaStateSecret("  "));
  assert.equal(requireMetaStateSecret(" configured "), "configured");
});
