import assert from "node:assert/strict";
import test from "node:test";

import { isMetaTokenRefreshEligible } from "./meta-token-refresh-policy";

const NOW = new Date("2026-09-05T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1_000;

test("no token is never eligible", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      { accessTokenEncrypted: null, tokenExpiresAt: new Date(NOW.getTime() + DAY_MS) },
      NOW,
    ),
    false,
  );
});

test("no expiry recorded is never eligible", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      { accessTokenEncrypted: "cipher", tokenExpiresAt: null },
      NOW,
    ),
    false,
  );
});

test("an already-expired token is not eligible for refresh", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      {
        accessTokenEncrypted: "cipher",
        tokenExpiresAt: new Date(NOW.getTime() - DAY_MS),
      },
      NOW,
    ),
    false,
  );
});

test("a token far from expiry is not yet eligible", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      {
        accessTokenEncrypted: "cipher",
        tokenExpiresAt: new Date(NOW.getTime() + 70 * DAY_MS),
      },
      NOW,
    ),
    false,
  );
});

test("just inside the 10-day window is eligible", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      {
        accessTokenEncrypted: "cipher",
        tokenExpiresAt: new Date(NOW.getTime() + 10 * DAY_MS - 1),
      },
      NOW,
    ),
    true,
  );
});

test("exactly the 10-day boundary is eligible", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      {
        accessTokenEncrypted: "cipher",
        tokenExpiresAt: new Date(NOW.getTime() + 10 * DAY_MS),
      },
      NOW,
    ),
    true,
  );
});

test("just outside the 10-day window is not yet eligible", () => {
  assert.equal(
    isMetaTokenRefreshEligible(
      {
        accessTokenEncrypted: "cipher",
        tokenExpiresAt: new Date(NOW.getTime() + 10 * DAY_MS + 1),
      },
      NOW,
    ),
    false,
  );
});
