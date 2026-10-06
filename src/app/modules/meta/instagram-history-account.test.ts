import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as verification from "./meta-verification";

const requireLocal = createRequire(import.meta.url);
function load<T>(file: string, imports: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Date, Map, Set, JSON, Math, Promise, Error, console: { error: () => {} },
    require: (name: string) => name in imports ? imports[name] : name === "server-only" ? {} : requireLocal(name) });
  return exports as T;
}

type Connections = { direct?: boolean; page?: { linked: boolean; needsReconnect?: boolean } };
function history({ direct, page }: Connections, calls: string[] = []) {
  return load<typeof import("./instagram-history-account")>("./instagram-history-account.ts", {
    "@/db/client": { db: { select: () => ({ from: () => ({ where: async () => [{ at: new Date("2026-10-05T12:00:00Z") }] }) }) } },
    "@/db/schema": { topicInstagramMedia: {} },
    "drizzle-orm": { and: () => ({}), eq: () => ({}), max: () => ({}) },
    "./topic-meta-connections.repository": {
      getConnectedInstagramAccount: async () => direct ? { igUserId: "ig-direct", igUsername: "direct.user" } : undefined,
      getDecryptedTopicMetaAccessToken: async () => direct ? { accessToken: "direct-token", igUserId: "ig-direct", connectionVersion: "v-direct" } : undefined,
      getTopicMetaConnectionStatus: async () => ({ state: "operational", lastMediaSyncAt: new Date("2026-09-25T18:22:00Z") }),
      recordMetaVerificationFailure: async () => { calls.push("direct-failure"); },
    },
    "./topic-facebook-connections.repository": {
      getTopicFacebookConnectionStatus: async () => page
        ? { connected: true, needsReconnect: Boolean(page.needsReconnect), ...(page.linked ? { linkedIgUserId: "ig-page", linkedIgUsername: "page.user" } : {}) }
        : { connected: false, needsReconnect: false },
      getFacebookChannelSendCredentials: async () => page?.linked ? { accessToken: "page-token", accountId: "ig-page", pageId: "page", connectionVersion: "v-page" } : undefined,
      recordFacebookVerificationFailure: async () => { calls.push("page-failure"); },
    },
  });
}

test("a direct Instagram login keeps priority, so its existing history is unchanged", async () => {
  const resolver = history({ direct: true, page: { linked: true } });
  const status = await resolver.getInstagramHistoryStatus("topic");
  assert.deepEqual({ ...status.account }, { source: "instagram-direct", igUserId: "ig-direct", igUsername: "direct.user" });
  assert.equal(status.lastMediaSyncAt?.toISOString(), "2026-09-25T18:22:00.000Z", "the direct connection's own sync bookkeeping");
  const credentials = await resolver.getInstagramHistoryCredentials("topic");
  assert.equal(credentials?.host, "graph.instagram.com");
  assert.equal(credentials?.accessToken, "direct-token");
});

test("a Page-connected topic reads the Page's linked Instagram account on graph.facebook.com", async () => {
  const resolver = history({ page: { linked: true } });
  const status = await resolver.getInstagramHistoryStatus("topic");
  assert.deepEqual({ ...status.account }, { source: "facebook-page", igUserId: "ig-page", igUsername: "page.user" });
  assert.equal(status.state, "operational");
  assert.equal(status.lastMediaSyncAt?.toISOString(), "2026-10-05T12:00:00.000Z", "derived from the imported rows");
  const credentials = await resolver.getInstagramHistoryCredentials("topic");
  assert.equal(credentials?.host, "graph.facebook.com");
  assert.equal(credentials?.igUserId, "ig-page");
  assert.equal(credentials?.connectionVersion, "v-page");
  assert.equal((await history({ page: { linked: true, needsReconnect: true } }).getInstagramHistoryStatus("topic")).state, "needs-reconnect");
});

test("a Page without a linked Instagram account, or no connection at all, has no history account", async () => {
  for (const connections of [{ page: { linked: false } }, {}]) {
    const resolver = history(connections);
    const status = await resolver.getInstagramHistoryStatus("topic");
    assert.equal(status.state, "disconnected");
    assert.equal(status.account, undefined);
    assert.equal(await resolver.getInstagramHistoryCredentials("topic"), undefined);
  }
});

test("a rejected token marks the connection it came from", async () => {
  const calls: string[] = [];
  const resolver = history({ page: { linked: true } }, calls);
  await resolver.recordInstagramHistoryAuthFailure("topic", { source: "facebook-page", connectionVersion: "v-page" }, "rejected");
  await resolver.recordInstagramHistoryAuthFailure("topic", { source: "instagram-direct", connectionVersion: "v-direct" }, "rejected");
  assert.deepEqual(calls, ["page-failure", "direct-failure"]);
});

const pageCredentials = { source: "facebook-page", igUserId: "ig-page", igUsername: "page.user", accessToken: "page-token", connectionVersion: "v-page", host: "graph.facebook.com" };

test("a Page sync lists media on the Page host and keeps no direct-connection bookkeeping", async () => {
  const calls: string[] = [];
  const sync = load<typeof import("./sync-instagram-media")>("./sync-instagram-media.ts", {
    "./meta-graph-client": {
      MetaGraphApiError: class extends Error {},
      listInstagramMedia: async (igUserId: string, token: string, options: unknown, host: string) => { calls.push(`list:${igUserId}:${token}:${host}`); return { media: [{ id: "m1" }], nextCursor: "older" }; },
    },
    "./meta-verification": verification,
    "./instagram-history-account": {
      getInstagramHistoryCredentials: async () => pageCredentials,
      getInstagramHistoryStatus: async () => ({ state: "operational" }),
      recordInstagramHistoryAuthFailure: async () => { calls.push("auth-failure"); },
    },
    "./topic-meta-connections.repository": { recordInstagramMediaSync: async () => { calls.push("direct-bookkeeping"); } },
    "./topic-instagram-media.repository": {
      upsertInstagramMediaPage: async (_topic: string, igUserId: string) => { calls.push(`upsert:${igUserId}`); return { imported: 1, updated: 0, carousels: 0 }; },
      reconcileTopicInstagramMediaLinks: async () => { calls.push("reconcile"); },
      countTopicInstagramMedia: async () => 8,
    },
  });
  const result = await sync.syncInstagramMediaPage("topic");
  assert.deepEqual(calls, ["list:ig-page:page-token:graph.facebook.com", "upsert:ig-page", "reconcile"]);
  assert.equal(result.totalImported, 8);
  assert.equal(result.nextCursor, "older");
});

function metrics(insights: (host: string) => Promise<unknown>, saved: string[]) {
  return load<typeof import("./refresh-instagram-media-metrics")>("./refresh-instagram-media-metrics.ts", {
    "./meta-graph-client": {
      GRAPH_API_VERSION: "v21.0",
      MetaGraphApiError: verificationError,
      fetchInstagramMediaInsights: (_media: string, _token: string, _metrics: string[], host: string) => insights(host),
    },
    "./meta-verification": verification,
    "./instagram-history-account": {
      getInstagramHistoryCredentials: async () => pageCredentials,
      getInstagramHistoryStatus: async () => ({ state: "operational" }),
      recordInstagramHistoryAuthFailure: async () => { saved.push("auth-failure"); },
    },
    "./topic-instagram-media.repository": {
      listInstagramMediaForMetricsRefresh: async () => [{ externalId: "m1" }, { externalId: "m2" }],
      saveInstagramMediaMetrics: async (input: { externalId: string; result: { error?: string } }) => { saved.push(`${input.externalId}:${input.result.error ? "error" : "ok"}`); return { externalId: input.externalId }; },
    },
  });
}
class verificationError extends Error {
  constructor(message: string, public status: number, public graphError: unknown) { super(message); }
}

test("without the insights grant, a metrics refresh stops once and keeps every publication's last values", async () => {
  const saved: string[] = [];
  const refresh = metrics(async () => { throw new verificationError("denied", 400, { error: { code: 10, message: "(#10) Application does not have permission for this action" } }); }, saved);
  const result = await refresh.refreshInstagramMediaMetrics("topic");
  assert.deepEqual(saved, [], "no publication is marked failed and the connection is not marked for reconnect");
  assert.equal(result.refreshed, 0);
  assert.match(result.error ?? "", /instagram_manage_insights/);
});

test("a publication Meta will not report on, after others succeeded, is skipped without stopping the run", async () => {
  const saved: string[] = [];
  let call = 0;
  const refresh = metrics(async () => {
    call += 1;
    if (call === 1) return { data: [{ name: "reach", total_value: { value: 3 } }] };
    throw new verificationError("denied", 400, { error: { code: 10, message: "(#10) Application does not have permission for this action" } });
  }, saved);
  const result = await refresh.refreshInstagramMediaMetrics("topic");
  assert.equal(result.refreshed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.error, undefined, "not an account-wide permission problem");
  assert.deepEqual(saved, ["m1:ok"], "the refused publication keeps its last values");
});

test("with the grant, metrics are read on the Page host", async () => {
  const saved: string[] = [];
  const hosts: string[] = [];
  const refresh = metrics(async (host) => { hosts.push(host); return { data: [{ name: "reach", total_value: { value: 12 } }] }; }, saved);
  const result = await refresh.refreshInstagramMediaMetrics("topic");
  assert.deepEqual(hosts, ["graph.facebook.com", "graph.facebook.com"]);
  assert.equal(result.refreshed, 2);
});
