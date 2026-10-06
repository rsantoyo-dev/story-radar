import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "../../../db/schema";
import { snapshotDue, snapshotIntervalHours, snapshotNearestAge, METRIC_HISTORY_CHECKPOINTS } from "./instagram-metric-history";

const requireLocal = createRequire(import.meta.url);
function load<T>(file: string, imports: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Date, Map, Set, JSON, Math, Number, Promise, Error, console: { error: () => {} },
    require: (name: string) => name in imports ? imports[name] : name === "server-only" ? {} : requireLocal(name) });
  return exports as T;
}
const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);

test("young publications are measured more often, and none after 30 days", () => {
  assert.equal(snapshotIntervalHours(0), 6);
  assert.equal(snapshotIntervalHours(71), 6);
  assert.equal(snapshotIntervalHours(72), 24);
  assert.equal(snapshotIntervalHours(167), 24);
  assert.equal(snapshotIntervalHours(168), 72);
  assert.equal(snapshotIntervalHours(720), null);
});

test("a capture is due once its interval has passed, with slack for an hourly scheduler", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  assert.equal(snapshotDue(hoursAgo(now, 10), null, now), true, "never captured");
  assert.equal(snapshotDue(hoursAgo(now, 10), hoursAgo(now, 5.6), now), true, "5.6 h after the last capture of a young post");
  assert.equal(snapshotDue(hoursAgo(now, 10), hoursAgo(now, 4), now), false);
  assert.equal(snapshotDue(hoursAgo(now, 100), hoursAgo(now, 20), now), false, "daily once older than 3 days");
  assert.equal(snapshotDue(hoursAgo(now, 800), null, now), false, "older than 30 days is no longer followed");
});

test("a checkpoint reads the snapshot closest to its age, only within its tolerance", () => {
  const [day, threeDays] = METRIC_HISTORY_CHECKPOINTS;
  const snapshots = [{ ageHours: 2 }, { ageHours: 20 }, { ageHours: 27 }, { ageHours: 50 }];
  assert.equal(snapshotNearestAge(snapshots, day)?.ageHours, 27);
  assert.equal(snapshotNearestAge(snapshots, threeDays), undefined, "50 h is too far from 72 h");
});

async function createTables(client: PGlite) {
  const { getTableConfig, PgDialect } = await import("drizzle-orm/pg-core");
  const { SQL } = await import("drizzle-orm");
  const dialect = new PgDialect();
  for (const table of [schema.topicInstagramMedia, schema.topicInstagramMediaChildren, schema.instagramMediaMetricSnapshots]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const defaultValue = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
        : column.default === undefined || typeof column.default === "object" ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
      // defaultRandom() lives outside column.default; the migration declares it.
      const idDefault = !defaultValue && column.primary && column.getSQLType() === "uuid" ? "gen_random_uuid()" : defaultValue;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${idDefault ? ` DEFAULT ${idDefault}` : ""}`;
    });
    await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  // The list item joins the linked story's title; only those two columns are read.
  await client.exec(`CREATE TABLE "stories" ("id" uuid PRIMARY KEY, "title" text)`);
}

test("every successful metrics read is kept as a snapshot with the publication's real age; failures add none", async () => {
  const client = new PGlite();
  try {
    await createTables(client);
    await client.query(`INSERT INTO topic_instagram_media(id,topic_id,ig_user_id,external_id,media_type,published_at,access_state,raw,imported_at,updated_at)
      VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','ig','post-1','CAROUSEL_ALBUM',$1,'accessible','{}',now(),now())`, [new Date("2026-10-05T12:00:00Z")]);
    const repo = load<typeof import("./topic-instagram-media.repository")>("./topic-instagram-media.repository.ts", { "@/db/client": { db: drizzle(client) }, "@/db/schema": schema });
    const reach = (value: number) => ({ reach: { value, state: "ok", unit: "accounts", period: "lifetime" } });
    await repo.saveInstagramMediaMetrics({ topicId: "00000000-0000-4000-8000-000000000009", igUserId: "ig", externalId: "post-1", result: { ok: reach(40) as never, apiVersion: "v21.0" }, queriedAt: new Date("2026-10-06T12:30:00Z") });
    await repo.saveInstagramMediaMetrics({ topicId: "00000000-0000-4000-8000-000000000009", igUserId: "ig", externalId: "post-1", result: { error: "denied" }, queriedAt: new Date("2026-10-06T18:00:00Z") });
    await repo.saveInstagramMediaMetrics({ topicId: "00000000-0000-4000-8000-000000000009", igUserId: "ig", externalId: "post-1", result: { ok: reach(65) as never, apiVersion: "v21.0" }, queriedAt: new Date("2026-10-08T12:00:00Z") });
    const history = await repo.listInstagramMetricSnapshots("00000000-0000-4000-8000-000000000009", ["post-1"]);
    assert.deepEqual(history.map((point) => [point.ageHours, (point.metrics as { reach: { value: number } }).reach.value]), [[24, 40], [72, 65]]);
    const now = new Date("2026-10-08T15:00:00Z");
    assert.deepEqual(await repo.listInstagramMediaDueForSnapshot("00000000-0000-4000-8000-000000000009", "ig", now, 10), [], "captured 3 hours ago, daily at this age");
    assert.deepEqual(await repo.listInstagramMediaDueForSnapshot("00000000-0000-4000-8000-000000000009", "ig", new Date("2026-10-09T12:00:00Z"), 10), ["post-1"]);
  } finally { await client.close(); }
});

test("a scheduled pass imports new posts and reads only the due ones, and leaves a dead token to the editor", async () => {
  const calls: string[] = [];
  const capture = load<typeof import("./capture-instagram-metric-history")>("./capture-instagram-metric-history.ts", {
    "@/db/client": { db: { select: () => ({ from: () => ({ where: async () => [{ id: "a", name: "Austin" }, { id: "b", name: "Brossard" }, { id: "c", name: "No account" }] }) }) } },
    "@/db/schema": { topics: { id: {}, name: {}, isActive: {} } },
    "drizzle-orm": { eq: () => ({}) },
    "./instagram-history-account": { getInstagramHistoryStatus: async (topic: string) => topic === "a" ? { state: "operational", account: { igUserId: "ig-a", igUsername: "a" } }
      : topic === "b" ? { state: "needs-reconnect", account: { igUserId: "ig-b", igUsername: "b" } } : { state: "disconnected" } },
    "./sync-instagram-media": { syncInstagramMediaPage: async (topic: string) => { calls.push(`sync:${topic}`); return { imported: 1, updated: 2 }; } },
    "./topic-instagram-media.repository": { listInstagramMediaDueForSnapshot: async (topic: string) => { calls.push(`due:${topic}`); return ["p1", "p2"]; } },
    "./refresh-instagram-media-metrics": { refreshInstagramMediaMetrics: async (topic: string, options: { externalIds: string[] }) => { calls.push(`metrics:${topic}:${options.externalIds.join(",")}`); return { refreshed: 2, failed: 0 }; } },
  });
  const results = await capture.captureInstagramMetricHistory(new Date("2026-10-06T12:00:00Z"));
  assert.deepEqual(calls, ["sync:a", "due:a", "metrics:a:p1,p2"]);
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [
    { topic: "Austin", account: "a", imported: 1, captured: 2, failed: 0 },
    { topic: "Brossard", account: "b", imported: 0, captured: 0, failed: 0, error: "needs-reconnect" },
  ]);
});
