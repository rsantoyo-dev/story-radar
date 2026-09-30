import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../../db/schema";
import * as policy from "./auto-collection.policy";
import type * as worker from "./auto-collection";

const requireLocal = createRequire(import.meta.url);
const topicId = "00000000-0000-4000-8000-000000000001";
const lineId = "00000000-0000-4000-8000-000000000002";
const hotStory = "00000000-0000-4000-8000-00000000000a";
const oldStory = "00000000-0000-4000-8000-00000000000b";
const weakStory = "00000000-0000-4000-8000-00000000000c";
const now = new Date("2026-09-30T14:00:00Z"); // 10:00 in Toronto

async function createTable(client: PGlite, dialect: PgDialect, table: PgTable) {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => {
    const value = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
      : column.default === undefined ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
    const type = column.getSQLType().includes("enum") || column.columnType === "PgEnumColumn" ? "text" : column.getSQLType();
    return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${value ? ` DEFAULT ${value}` : ""}`;
  });
  await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
}

async function setup() {
  const client = new PGlite();
  const db = drizzle(client);
  const dialect = new PgDialect();
  for (const table of [schema.topicAutoCollectionSettings, schema.topicScoops, schema.stories, schema.topicStories, schema.storyEditorialEvaluations, schema.dailyPreparationRuns]) {
    await createTable(client, dialect, table);
  }
  await client.exec(`CREATE UNIQUE INDEX scoop_key ON topic_scoops(topic_id, story_id)`);
  await client.exec(`INSERT INTO topic_auto_collection_settings(topic_id, enabled, line_id) VALUES ('${topicId}', true, '${lineId}')`);
  for (const [id, published, growth, editorial] of [
    [hotStory, "2026-09-30T12:00:00Z", 92, 86],   // fresh, strong → scoop
    [oldStory, "2026-09-28T12:00:00Z", 95, 90],   // strong but two days old
    [weakStory, "2026-09-30T12:30:00Z", 60, 90],  // fresh but weak growth
  ] as const) {
    await client.exec(`INSERT INTO stories(id, title, published_at) VALUES ('${id}', 'Story ${id.slice(-1)}', '${published}')`);
    await client.exec(`INSERT INTO topic_stories(topic_id, story_id, first_seen_at) VALUES ('${topicId}', '${id}', '${published}')`);
    await client.exec(`INSERT INTO story_editorial_evaluations(story_id, topic_id, editorial_score, growth_score, evaluated_at) VALUES ('${id}', '${topicId}', ${editorial}, ${growth}, '2026-09-30T13:00:00Z')`);
  }
  const calls = { autoRuns: 0, scoopRuns: [] as string[] };
  let running = false;
  const deps: Record<string, unknown> = {
    "server-only": {}, "@/db/client": { db }, "@/db/schema": schema,
    "./auto-collection.policy": policy,
    "../editorial-lines/editorial-lines.repository": {
      getEditorialLine: async () => ({ id: lineId, name: "Actualité locale" }),
      storyCollectionContexts: async () => [{ runId: "collection-run" }],
    },
    "./daily-preparation": { drivePreparation: async () => {} },
    "./daily-preparation.repository": {
      pendingPreparations: async () => [],
      startPreparation: async () => { if (running) return { created: false }; running = true; calls.autoRuns++; return { created: true }; },
      startScoopPreparation: async (input: { storyId: string; scoopId: string }) => {
        if (running) return undefined;
        running = true;
        calls.scoopRuns.push(input.storyId);
        const [run] = await db.insert(schema.dailyPreparationRuns).values({ topicId, lineId, timezone: "America/Toronto", status: "running", step: "approve",
          progress: { lineName: "x", evaluated: 0, evaluationBatches: 0, trigger: "scoop", scoopId: input.scoopId, storyId: input.storyId } }).returning();
        return run;
      },
    },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("./auto-collection.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Map, Set, JSON, console: { error: () => {} }, require: (id: string) => id in deps ? deps[id] : requireLocal(id) });
  return { client, db, calls, worker: exports as typeof worker, release: () => { running = false; } };
}

test("a pass flags only fresh, strong stories as scoops and prepares the scoop before the regular reader", async () => {
  const h = await setup();
  try {
    const result = await h.worker.tickAutoCollection(now);
    assert.deepEqual([...result.detected], [hotStory]);
    assert.deepEqual(h.calls.scoopRuns, [hotStory], "the scoop is prepared first");
    assert.equal(h.calls.autoRuns, 0, "the regular reader waits while the scoop is prepared");
    const [scoop] = await h.db.select().from(schema.topicScoops);
    assert.equal(scoop.status, "preparing");
    assert.deepEqual([...scoop.reasons], ["Growth 92 ≥ 85", "Editorial 86 ≥ 80", "Published 2 h ago (≤ 6 h)"]);

    // Same story on the next pass: never a second scoop or a second preparation.
    const again = await h.worker.tickAutoCollection(now);
    assert.equal(again.detected.length, 0);
    assert.equal(h.calls.scoopRuns.length, 1);
  } finally { await h.client.close(); }
});

test("the scoop mirrors where its preparation stopped, and the regular reader then runs", async () => {
  const h = await setup();
  try {
    await h.worker.tickAutoCollection(now);
    await h.client.exec(`UPDATE daily_preparation_runs SET status='needs-review', step='brief', error='The creative brief needs more evidence.'`);
    h.release();
    await h.worker.tickAutoCollection(now);
    const [scoop] = await h.db.select().from(schema.topicScoops);
    assert.equal(scoop.status, "blocked");
    assert.equal(scoop.blockedStep, "brief");
    assert.match(scoop.message ?? "", /more evidence/);
    assert.equal(h.calls.autoRuns, 1, "with no scoop waiting, the due regular reader starts");
    const [settings] = await h.db.select().from(schema.topicAutoCollectionSettings);
    assert.equal(settings.nextRunAt?.toISOString(), "2026-09-30T18:00:00.000Z");
  } finally { await h.client.close(); }
});
