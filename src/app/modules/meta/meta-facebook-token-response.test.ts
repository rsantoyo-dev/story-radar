import assert from "node:assert/strict";
import test from "node:test";

import {
  MetaGraphApiError,
  parseFacebookAccountsListResponse,
  parseFacebookLongLivedTokenResponse,
  parseFacebookPageInstagramLink,
  parseFacebookPermissionsResponse,
  parseFacebookTokenResponse,
} from "./meta-facebook-token-response";

test("parses a token exchange response", () => {
  const result = parseFacebookTokenResponse({
    access_token: "user-access-token",
    token_type: "bearer",
    expires_in: 5184000,
  });
  assert.equal(result.accessToken, "user-access-token");
  assert.equal(result.expiresIn, 5184000);
});

test("a token exchange response without expires_in still parses (short-lived exchange)", () => {
  const result = parseFacebookTokenResponse({ access_token: "user-access-token" });
  assert.equal(result.accessToken, "user-access-token");
  assert.equal(result.expiresIn, undefined);
});

test("the long-lived parser accepts a non-expiring token (no expires_in)", () => {
  assert.equal(parseFacebookLongLivedTokenResponse({ access_token: "token" }).expiresIn, undefined);
  const result = parseFacebookLongLivedTokenResponse({ access_token: "token", expires_in: 5184000 });
  assert.equal(result.expiresIn, 5184000);
});

test("a malformed token response throws MetaGraphApiError", () => {
  assert.throws(() => parseFacebookTokenResponse({ foo: "bar" }), MetaGraphApiError);
  assert.throws(() => parseFacebookTokenResponse(null), MetaGraphApiError);
});

test("a real access_token is never attached to the thrown error", () => {
  try {
    parseFacebookAccountsListResponse({
      data: [{ id: "1", access_token: "super-secret-page-token" }],
    });
    assert.fail("expected parseFacebookAccountsListResponse to throw");
  } catch (error) {
    assert.ok(error instanceof MetaGraphApiError);
    const serialized = JSON.stringify(error.graphError);
    assert.ok(!serialized.includes("super-secret-page-token"));
    assert.ok(serialized.includes("[redacted]"));
  }
});

test("parses a page of /me/accounts with pagination", () => {
  const result = parseFacebookAccountsListResponse({
    data: [
      { id: "1001", name: "First Page", access_token: "page-token-1", tasks: ["MANAGE", "CREATE_CONTENT"] },
      { id: "1002", name: "Second Page", access_token: "page-token-2", tasks: ["ANALYZE"] },
    ],
    paging: { cursors: { after: "cursor-2" } },
  });
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries[0], {
    pageId: "1001", pageName: "First Page", pageAccessToken: "page-token-1", tasks: ["MANAGE", "CREATE_CONTENT"],
  });
  assert.equal(result.nextCursor, "cursor-2");
});

test("the last page of /me/accounts has no nextCursor", () => {
  const result = parseFacebookAccountsListResponse({
    data: [{ id: "1001", name: "Only Page", access_token: "page-token-1" }],
    paging: { cursors: {} },
  });
  assert.equal(result.nextCursor, undefined);
  assert.deepEqual(result.entries[0].tasks, []);
});

test("an empty /me/accounts page (no managed Pages) parses to zero entries, not an error", () => {
  const result = parseFacebookAccountsListResponse({ data: [] });
  assert.deepEqual(result.entries, []);
});

test("a malformed accounts list response throws MetaGraphApiError", () => {
  assert.throws(() => parseFacebookAccountsListResponse({ foo: "bar" }), MetaGraphApiError);
  assert.throws(
    () => parseFacebookAccountsListResponse({ data: [{ id: "1" }] }),
    MetaGraphApiError,
  );
});

test("parses a linked Instagram Business Account off a Page", () => {
  assert.deepEqual(
    parseFacebookPageInstagramLink({ id: "1001", instagram_business_account: { id: "179" } }),
    { igUserId: "179" },
  );
});

test("a Page with no linked Instagram account parses to an empty result, not an error", () => {
  assert.deepEqual(parseFacebookPageInstagramLink({ id: "1001" }), {});
  assert.deepEqual(parseFacebookPageInstagramLink(null), {});
});

test("parses /me/permissions grants and ignores malformed entries", () => {
  assert.deepEqual(
    parseFacebookPermissionsResponse({
      data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "pages_manage_posts", status: "declined" },
        { permission: 5 },
      ],
    }),
    [
      { permission: "pages_show_list", status: "granted" },
      { permission: "pages_manage_posts", status: "declined" },
    ],
  );
  assert.deepEqual(parseFacebookPermissionsResponse(null), []);
});
