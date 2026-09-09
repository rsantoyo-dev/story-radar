import assert from "node:assert/strict";
import { test } from "node:test";

import { MetaGraphApiError } from "./meta-token-response";
import type { PublicationDestination } from "./instagram-publication-candidate";
import {
  PUBLISHING_ACCESS_TTL_MS,
  parsePublishingQuota,
  publishingAccessIsCurrent,
  publishingFailureState,
  publishingIdentity,
  publishingPreflightState,
  samePublishingIdentity,
  verifyPublishingAccess,
  type PublishingAccessContext,
} from "./instagram-publishing-access";

function destination(over: Partial<PublicationDestination> = {}): PublicationDestination {
  return {
    igUserId: "1789",
    igUsername: "topic.account",
    connectionVersion: "c1",
    connected: true,
    expired: false,
    hasPublishingPermission: true,
    hasBasicPermission: true,
    appConfigurationVersion: "app1",
    ...over,
  };
}

test("publishingPreflightState maps connection facts", () => {
  assert.equal(publishingPreflightState(destination({ connected: false, igUserId: null })), "disconnected");
  assert.equal(publishingPreflightState(destination({ expired: true })), "needs-reconnect");
  assert.equal(publishingPreflightState(destination({ hasPublishingPermission: false })), "missing-permission");
  assert.equal(publishingPreflightState(destination({ hasBasicPermission: false })), "missing-permission");
  assert.equal(publishingPreflightState(destination()), "unverified");
});

test("parsePublishingQuota reads the content_publishing_limit shape", () => {
  const quota = parsePublishingQuota({
    data: [{ quota_usage: 12, config: { quota_total: 100, quota_duration: 86400 } }],
  });
  assert.deepEqual(quota, { used: 12, total: 100, durationSeconds: 86400, remaining: 88 });
});

test("parsePublishingQuota rejects malformed payloads", () => {
  for (const payload of [
    {},
    { data: [] },
    { data: [{ quota_usage: -1, config: { quota_total: 5, quota_duration: 10 } }] },
    { data: [{ quota_usage: 1, config: { quota_total: 5, quota_duration: 0 } }] },
    { data: [{ quota_usage: 1, config: { quota_total: "5", quota_duration: 10 } }] },
  ]) {
    assert.throws(() => parsePublishingQuota(payload), MetaGraphApiError);
  }
});

test("publishingFailureState classifies provider errors", () => {
  assert.equal(publishingFailureState(new MetaGraphApiError("x", 401)), "needs-reconnect");
  assert.equal(
    publishingFailureState(new MetaGraphApiError("x", 400, { error: { code: 190 } })),
    "needs-reconnect",
  );
  assert.equal(publishingFailureState(new MetaGraphApiError("x", 429)), "rate-limited");
  assert.equal(
    publishingFailureState(new MetaGraphApiError("x", 400, { error: { code: 4 } })),
    "rate-limited",
  );
  assert.equal(
    publishingFailureState(new MetaGraphApiError("x", 403, { error: { code: 10 } })),
    "missing-permission",
  );
  assert.equal(publishingFailureState(new MetaGraphApiError("x", 500)), "unavailable");
  assert.equal(publishingFailureState(new Error("network down")), "unavailable");
});

const BASE = {
  topicId: "t1",
  apiVersion: "v21.0",
  now: () => Date.parse("2026-09-09T12:00:00Z"),
};

function context(over: Partial<PublicationDestination> = {}, token?: string): PublishingAccessContext {
  return { topicId: "t1", destination: destination(over), ...(token ? { accessToken: token } : {}) };
}

test("verifyPublishingAccess: preflight failures never call the probe", async () => {
  let probed = 0;
  const access = await verifyPublishingAccess({
    ...BASE,
    load: async () => context({ connected: false, igUserId: null }),
    probe: async () => {
      probed += 1;
      return { used: 0, total: 1, durationSeconds: 1, remaining: 1 };
    },
  });
  assert.equal(access.state, "disconnected");
  assert.equal(probed, 0);
  assert.equal(access.quota, undefined);
});

test("verifyPublishingAccess: unverified + healthy probe → enabled with quota", async () => {
  const access = await verifyPublishingAccess({
    ...BASE,
    load: async () => context({}, "tok"),
    probe: async () => ({ used: 3, total: 25, durationSeconds: 86400, remaining: 22 }),
  });
  assert.equal(access.state, "enabled");
  assert.deepEqual(access.quota, { used: 3, total: 25, durationSeconds: 86400, remaining: 22 });
  assert.equal(access.expiresAt, new Date(BASE.now() + PUBLISHING_ACCESS_TTL_MS).toISOString());
});

test("verifyPublishingAccess: no remaining quota → quota-exhausted", async () => {
  const access = await verifyPublishingAccess({
    ...BASE,
    load: async () => context({}, "tok"),
    probe: async () => ({ used: 25, total: 25, durationSeconds: 86400, remaining: 0 }),
  });
  assert.equal(access.state, "quota-exhausted");
});

test("verifyPublishingAccess: probe throws → mapped failure state", async () => {
  const access = await verifyPublishingAccess({
    ...BASE,
    load: async () => context({}, "tok"),
    probe: async () => {
      throw new MetaGraphApiError("limited", 429);
    },
  });
  assert.equal(access.state, "rate-limited");
});

test("verifyPublishingAccess: identity or topic mismatch → connection-changed, no probe result kept", async () => {
  const mismatchTopic = await verifyPublishingAccess({
    ...BASE,
    load: async () => ({ ...context({}, "tok"), topicId: "other" }),
    probe: async () => ({ used: 0, total: 1, durationSeconds: 1, remaining: 1 }),
  });
  assert.equal(mismatchTopic.state, "connection-changed");

  const mismatchIdentity = await verifyPublishingAccess({
    ...BASE,
    expectedIdentity: publishingIdentity("t1", destination({ connectionVersion: "OLD" })),
    load: async () => context({}, "tok"),
    probe: async () => ({ used: 0, total: 1, durationSeconds: 1, remaining: 1 }),
  });
  assert.equal(mismatchIdentity.state, "connection-changed");
});

test("verifyPublishingAccess: connection changes mid-check → connection-changed, quota dropped", async () => {
  let call = 0;
  const access = await verifyPublishingAccess({
    ...BASE,
    load: async () => {
      call += 1;
      return call === 1 ? context({}, "tok") : context({ expired: true }, "tok");
    },
    probe: async () => ({ used: 1, total: 10, durationSeconds: 10, remaining: 9 }),
  });
  assert.equal(access.state, "connection-changed");
  assert.equal(access.quota, undefined);
});

test("verifyPublishingAccess: second load throws → unavailable", async () => {
  let call = 0;
  const access = await verifyPublishingAccess({
    ...BASE,
    load: async () => {
      call += 1;
      if (call === 1) return context({}, "tok");
      throw new Error("db gone");
    },
    probe: async () => ({ used: 1, total: 10, durationSeconds: 10, remaining: 9 }),
  });
  assert.equal(access.state, "unavailable");
});

test("publishingAccessIsCurrent only trusts a fresh, enabled, matching check", () => {
  const identity = publishingIdentity("t1", destination());
  const now = Date.parse("2026-09-09T12:00:00Z");
  const fresh = {
    state: "enabled" as const,
    message: "",
    identity,
    apiVersion: "v21.0",
    checkedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now - 60_000 + PUBLISHING_ACCESS_TTL_MS).toISOString(),
    quota: { used: 1, total: 10, durationSeconds: 10, remaining: 9 },
  };
  assert.equal(publishingAccessIsCurrent(fresh, identity, "v21.0", now), true);
  assert.equal(publishingAccessIsCurrent({ ...fresh, state: "rate-limited" }, identity, "v21.0", now), false);
  assert.equal(publishingAccessIsCurrent(fresh, publishingIdentity("t1", destination({ connectionVersion: "c2" })), "v21.0", now), false);
  assert.equal(publishingAccessIsCurrent(fresh, identity, "v22.0", now), false);
  assert.equal(
    publishingAccessIsCurrent(
      { ...fresh, checkedAt: new Date(now - PUBLISHING_ACCESS_TTL_MS - 1_000).toISOString() },
      identity,
      "v21.0",
      now,
    ),
    false,
  );
  assert.equal(samePublishingIdentity(identity, { ...identity }), true);
});


test("missing OAuth scope metadata triggers a live check instead of a false permission denial", async () => {
  const dest = destination({ grantedPermissionsKnown: false, hasPublishingPermission: false, hasBasicPermission: false });
  assert.equal(publishingPreflightState(dest), "unverified");
  let probes = 0;
  const result = await verifyPublishingAccess({
    topicId: "topic", apiVersion: "v21.0",
    load: async () => ({ topicId: "topic", destination: dest, accessToken: "private-token" }),
    probe: async () => { probes++; return { used: 0, total: 100, durationSeconds: 86400, remaining: 100 }; },
  });
  assert.equal(probes, 1);
  assert.equal(result.state, "enabled");
  assert.doesNotMatch(result.message, /permission is recorded/i);
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
});

test("unknown scope metadata never bypasses a live permission denial", async () => {
  const result = await verifyPublishingAccess({
    topicId: "topic", apiVersion: "v21.0",
    load: async () => ({ topicId: "topic", destination: destination({ grantedPermissionsKnown: false, hasPublishingPermission: false, hasBasicPermission: false }), accessToken: "private-token" }),
    probe: async () => { throw new MetaGraphApiError("private provider detail", 403, { error: { code: 200 } }); },
  });
  assert.equal(result.state, "missing-permission");
  assert.doesNotMatch(JSON.stringify(result), /private provider detail|private-token/);
});
