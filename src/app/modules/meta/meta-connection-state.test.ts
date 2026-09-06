import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMetaConnectionState,
  INSTAGRAM_INSIGHTS_SCOPE,
  type MetaConnectionStateInput,
} from "./meta-connection-state";

const NOW = new Date("2026-09-05T12:00:00Z");
const FUTURE = new Date("2026-10-05T12:00:00Z");
const PAST = new Date("2026-09-01T12:00:00Z");

function baseRow(
  overrides: Partial<MetaConnectionStateInput> = {},
): MetaConnectionStateInput {
  return {
    igUserId: "ig-1",
    accessTokenEncrypted: "cipher",
    tokenExpiresAt: FUTURE,
    grantedPermissions: [INSTAGRAM_INSIGHTS_SCOPE],
    lastVerifiedAt: NOW,
    lastVerificationError: null,
    ...overrides,
  };
}

test("no account is disconnected", () => {
  assert.equal(
    deriveMetaConnectionState(
      baseRow({ igUserId: null, accessTokenEncrypted: null }),
      NOW,
    ),
    "disconnected",
  );
});

test("missing token alone is also disconnected", () => {
  assert.equal(
    deriveMetaConnectionState(baseRow({ accessTokenEncrypted: null }), NOW),
    "disconnected",
  );
});

test("connected without the insights scope stays connected-without-insights", () => {
  assert.equal(
    deriveMetaConnectionState(baseRow({ grantedPermissions: [] }), NOW),
    "connected-without-insights",
  );
});

test("scope granted but never verified stays connected-without-insights", () => {
  assert.equal(
    deriveMetaConnectionState(
      baseRow({ lastVerifiedAt: null, lastVerificationError: null }),
      NOW,
    ),
    "connected-without-insights",
  );
});

test("a stale verification error demotes an otherwise-verified account", () => {
  assert.equal(
    deriveMetaConnectionState(
      baseRow({ lastVerifiedAt: NOW, lastVerificationError: "denied" }),
      NOW,
    ),
    "connected-without-insights",
  );
});

test("scope granted and verified with no error is operational", () => {
  assert.equal(deriveMetaConnectionState(baseRow(), NOW), "operational");
});

test("an expired token is needs-reconnect regardless of scope or verification", () => {
  assert.equal(
    deriveMetaConnectionState(baseRow({ tokenExpiresAt: PAST }), NOW),
    "needs-reconnect",
  );
});

test("an expired token outranks a perfectly valid verification", () => {
  assert.equal(
    deriveMetaConnectionState(
      baseRow({
        tokenExpiresAt: PAST,
        lastVerifiedAt: NOW,
        lastVerificationError: null,
      }),
      NOW,
    ),
    "needs-reconnect",
  );
});

test("expiry at exactly now counts as expired", () => {
  assert.equal(
    deriveMetaConnectionState(baseRow({ tokenExpiresAt: NOW }), NOW),
    "needs-reconnect",
  );
});
