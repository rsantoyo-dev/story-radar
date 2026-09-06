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
