import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMetaGraphError,
  describeMetaVerificationError,
} from "./meta-verification";

test("a nested code 190 is classified as an auth error", () => {
  const error = { error: { code: 190, message: "Error validating access token" } };
  assert.equal(classifyMetaGraphError(error), "auth");
});

test("a nested revoked-token subcode is classified as an auth error", () => {
  const error = { error: { code: 200, error_subcode: 463, message: "Session expired" } };
  assert.equal(classifyMetaGraphError(error), "auth");
});

test("a nested code 10 is classified as a permission error", () => {
  const error = {
    error: { code: 10, message: "Application does not have permission for this action" },
  };
  assert.equal(classifyMetaGraphError(error), "permission");
});

test("a flat error shape is also recognized", () => {
  const error = { code: 10, error_message: "This action requires permission" };
  assert.equal(classifyMetaGraphError(error), "permission");
});

test("a message mentioning permission with no recognized code still classifies as permission", () => {
  const error = { error: { message: "Missing required permission for this call" } };
  assert.equal(classifyMetaGraphError(error), "permission");
});

test("an unrecognized code falls back to unknown", () => {
  const error = { error: { code: 4, message: "Application request limit reached" } };
  assert.equal(classifyMetaGraphError(error), "unknown");
});

test("undefined or non-object input falls back to unknown", () => {
  assert.equal(classifyMetaGraphError(undefined), "unknown");
  assert.equal(classifyMetaGraphError("boom"), "unknown");
});

test("describeMetaVerificationError prefers Meta's own message", () => {
  const error = { error: { code: 190, message: "Error validating access token" } };
  assert.equal(
    describeMetaVerificationError(error, "fallback"),
    "Error validating access token",
  );
});

test("describeMetaVerificationError falls back when no message is present", () => {
  assert.equal(describeMetaVerificationError(undefined, "fallback"), "fallback");
});

test("Meta's own words on a rejected request: its title and text for people, its message, its code and subcode; no address or token", async () => {
  const { metaErrorDetail } = await import("./meta-verification");
  assert.equal(
    metaErrorDetail({ error: { message: "(#10) Application does not have permission for this action", type: "OAuthException", code: 10, error_subcode: 2207051, error_user_title: "Action blocked", error_user_msg: "This account is restricted from publishing." } }),
    "Meta: “Action blocked — This account is restricted from publishing. — (#10) Application does not have permission for this action” (code 10, subcode 2207051).",
  );
  assert.equal(metaErrorDetail({ error: { message: "Bad request, see https://developers.facebook.com/docs/x token=EAAGm0PX4ZCpsBAKZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZCZ", code: 100 } }), "Meta: “Bad request, see token=…” (code 100).");
  assert.equal(metaErrorDetail({ error: { code: 9 } }), "Meta: no message (code 9).");
  assert.equal(metaErrorDetail({}), undefined);
  assert.equal(metaErrorDetail(undefined), undefined);
});
