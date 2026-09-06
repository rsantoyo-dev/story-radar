import assert from "node:assert/strict";
import test from "node:test";

import {
  MetaGraphApiError,
  parseInstagramShortLivedTokenResponse,
} from "./meta-token-response";

test("parses the flat response shape this app observes in production", () => {
  const result = parseInstagramShortLivedTokenResponse({
    access_token: "short-lived-token",
    user_id: "12345",
    permissions: "instagram_business_basic,instagram_business_manage_insights",
  });
  assert.equal(result.accessToken, "short-lived-token");
  assert.equal(result.userId, "12345");
  assert.deepEqual(result.grantedPermissions, [
    "instagram_business_basic",
    "instagram_business_manage_insights",
  ]);
});

test("parses Meta's documented data-wrapped response shape", () => {
  const result = parseInstagramShortLivedTokenResponse({
    data: [
      {
        access_token: "short-lived-token",
        user_id: 12345,
        permissions: "instagram_business_basic",
      },
    ],
  });
  assert.equal(result.accessToken, "short-lived-token");
  assert.equal(result.userId, "12345");
  assert.deepEqual(result.grantedPermissions, ["instagram_business_basic"]);
});

test("a missing permissions field yields an empty list rather than throwing", () => {
  const result = parseInstagramShortLivedTokenResponse({
    access_token: "short-lived-token",
    user_id: "12345",
  });
  assert.deepEqual(result.grantedPermissions, []);
});

test("a malformed payload throws MetaGraphApiError", () => {
  assert.throws(
    () => parseInstagramShortLivedTokenResponse({ foo: "bar" }),
    MetaGraphApiError,
  );
});

test("a real access_token is never attached to the thrown error when user_id is missing", () => {
  try {
    parseInstagramShortLivedTokenResponse({
      access_token: "super-secret-real-token",
      permissions: "instagram_business_basic",
    });
    assert.fail("expected parseInstagramShortLivedTokenResponse to throw");
  } catch (error) {
    assert.ok(error instanceof MetaGraphApiError);
    const serialized = JSON.stringify(error.graphError);
    assert.ok(!serialized.includes("super-secret-real-token"));
    assert.ok(serialized.includes("[redacted]"));
  }
});
