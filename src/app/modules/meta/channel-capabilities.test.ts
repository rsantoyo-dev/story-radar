import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveFacebookChannelCapabilities,
  deriveInstagramChannelCapabilities,
} from "./channel-capabilities";
import type { MetaConnectionState } from "./meta-connection-state";
import type { PublishingAccessState } from "./instagram-publishing-access";

test("disconnected Instagram reports every capability unavailable", () => {
  const result = deriveInstagramChannelCapabilities({
    connectionState: "disconnected",
    publishingState: "disconnected",
  });
  assert.deepEqual(result, {
    connected: false,
    canPublish: "unavailable",
    canSync: "unavailable",
    metricsAvailable: "unavailable",
  });
});

test("connected-without-insights: sync is available, metrics still need attention", () => {
  const result = deriveInstagramChannelCapabilities({
    connectionState: "connected-without-insights",
    publishingState: "unverified",
  });
  assert.equal(result.connected, true);
  assert.equal(result.canSync, "available");
  assert.equal(result.metricsAvailable, "needs-attention");
  assert.equal(result.canPublish, "unknown");
});

test("operational connection with enabled publishing is fully available", () => {
  const result = deriveInstagramChannelCapabilities({
    connectionState: "operational",
    publishingState: "enabled",
  });
  assert.deepEqual(result, {
    connected: true,
    canPublish: "available",
    canSync: "available",
    metricsAvailable: "available",
  });
});

test("needs-reconnect demotes sync and metrics even if publishing was previously enabled", () => {
  const result = deriveInstagramChannelCapabilities({
    connectionState: "needs-reconnect",
    publishingState: "needs-reconnect",
  });
  assert.equal(result.connected, true);
  assert.equal(result.canSync, "needs-attention");
  assert.equal(result.metricsAvailable, "needs-attention");
  assert.equal(result.canPublish, "needs-attention");
});

test("publishing capability covers every PublishingAccessState value", () => {
  const expected: Record<PublishingAccessState, string> = {
    disconnected: "unavailable",
    "needs-reconnect": "needs-attention",
    "missing-permission": "needs-attention",
    unverified: "unknown",
    enabled: "available",
    "quota-exhausted": "needs-attention",
    "rate-limited": "needs-attention",
    unavailable: "unknown",
    "connection-changed": "unknown",
  };
  for (const [publishingState, expectedCapability] of Object.entries(expected)) {
    const result = deriveInstagramChannelCapabilities({
      connectionState: "operational",
      publishingState: publishingState as PublishingAccessState,
    });
    assert.equal(result.canPublish, expectedCapability, `publishingState=${publishingState}`);
  }
});

test("sync and metrics capability cover every MetaConnectionState value", () => {
  const expected: Record<MetaConnectionState, { sync: string; metrics: string }> = {
    disconnected: { sync: "unavailable", metrics: "unavailable" },
    "needs-reconnect": { sync: "needs-attention", metrics: "needs-attention" },
    "connected-without-insights": { sync: "available", metrics: "needs-attention" },
    operational: { sync: "available", metrics: "available" },
  };
  for (const [connectionState, expectedCapability] of Object.entries(expected)) {
    const result = deriveInstagramChannelCapabilities({
      connectionState: connectionState as MetaConnectionState,
      publishingState: "unverified",
    });
    assert.equal(result.canSync, expectedCapability.sync, `connectionState=${connectionState}`);
    assert.equal(result.metricsAvailable, expectedCapability.metrics, `connectionState=${connectionState}`);
  }
});

test("a disconnected Facebook Page reports every capability unavailable", () => {
  const result = deriveFacebookChannelCapabilities({
    connected: false, tokenExpired: false, pageTasks: [],
  });
  assert.deepEqual(result, {
    connected: false, canPublish: "unavailable", canSync: "unavailable", metricsAvailable: "unavailable",
  });
});

test("a connected Facebook Page with publish tasks needs a live verification before it is available", () => {
  const result = deriveFacebookChannelCapabilities({
    connected: true, tokenExpired: false, pageTasks: ["MANAGE", "CREATE_CONTENT"],
  });
  assert.equal(result.canPublish, "needs-attention");
  assert.equal(deriveFacebookChannelCapabilities({
    connected: true, tokenExpired: false, pageTasks: ["MANAGE", "CREATE_CONTENT"], verified: true,
  }).canPublish, "available");
  assert.equal(deriveFacebookChannelCapabilities({
    connected: true, tokenExpired: false, pageTasks: ["ANALYZE"], verified: true,
  }).canPublish, "unavailable", "verification never grants a missing task");
  assert.equal(result.canSync, "unavailable");
  assert.equal(result.metricsAvailable, "unavailable");
});

test("a connected Facebook Page with no publish-relevant task is a real, known gap", () => {
  const result = deriveFacebookChannelCapabilities({
    connected: true, tokenExpired: false, pageTasks: ["ANALYZE"],
  });
  assert.equal(result.canPublish, "unavailable");
});

test("an expired Facebook Page token needs reconnecting regardless of its tasks", () => {
  const result = deriveFacebookChannelCapabilities({
    connected: true, tokenExpired: true, pageTasks: ["MANAGE", "CREATE_CONTENT"],
  });
  assert.equal(result.canPublish, "needs-attention");
});
