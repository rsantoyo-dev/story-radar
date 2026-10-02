import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import ts from "typescript";
import {
  demoChargeMicros,
  demoMarkupBasisPoints,
  microsToCredits,
} from "./demo-credit-policy";
import * as policy from "./demo-credit-policy";

const localRequire = createRequire(import.meta.url);

function loadRepository(client: PGlite) {
  const dialect = new PgDialect();
  const db = { execute: (query: SQL) => {
    const built = dialect.sqlToQuery(query);
    return client.query(built.sql, built.params);
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./demo-credit.repository.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Date, Number, console,
    require: (name: string) => {
      if (name === "drizzle-orm") return localRequire(name);
      if (name === "@/db/client") return { db };
      if (name === "./demo-credit-policy") return policy;
      return {};
    },
  });
  return exports as typeof import("./demo-credit.repository");
}

test("demo policy uses integer microdollars and snapshots a valid markup", () => {
  assert.equal(demoMarkupBasisPoints("2500"), 2500);
  assert.equal(demoChargeMicros(80_000, 2_500), 100_000);
  assert.equal(demoChargeMicros(1, 2_500), 2);
  assert.equal(microsToCredits(10_000_000), 1_000);
  assert.throws(() => demoMarkupBasisPoints("25.5"));
});

test("demo ledger charges each new settled text call once and resets without losing history", async () => {
  const client = new PGlite();
  const topicId = randomUUID();
  const storyId = randomUUID();
  try {
    await client.exec(`
      CREATE TABLE workspaces (id text PRIMARY KEY);
      CREATE TABLE topics (id uuid PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id));
      CREATE TABLE stories (id uuid PRIMARY KEY);
      CREATE TABLE creative_text_calls (
        id uuid PRIMARY KEY, topic_id uuid NOT NULL REFERENCES topics(id),
        story_id uuid NOT NULL REFERENCES stories(id), operation text NOT NULL,
        provider text NOT NULL, model text NOT NULL, status text NOT NULL,
        reserved_micros integer NOT NULL, charged_micros integer,
        pricing jsonb NOT NULL, finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query("INSERT INTO workspaces VALUES ('default')");
    await client.query("INSERT INTO topics VALUES ($1, 'default')", [topicId]);
    await client.query("INSERT INTO stories VALUES ($1)", [storyId]);
    await client.exec(readFileSync(new URL("../../../../drizzle/0081_spicy_giant_man.sql", import.meta.url), "utf8"));
    await client.exec(readFileSync(new URL("../../../../drizzle/0086_polite_skrulls.sql", import.meta.url), "utf8"));

    const balance = async () => Number((await client.query<{ balance: string }>(
      "SELECT sum(amount_micros)::text AS balance FROM workspace_credit_entries WHERE workspace_id='default'",
    )).rows[0].balance);
    assert.equal(await balance(), 10_000_000);
    const historicalId = randomUUID();
    const meteredId = randomUUID();
    await client.query(`INSERT INTO creative_text_calls
      (id, topic_id, story_id, operation, provider, model, status, reserved_micros, charged_micros, pricing)
      VALUES ($1, $2, $3, 'draft', 'gemini', 'historical', 'settled', 100000, 80000, '{}')`,
      [historicalId, topicId, storyId]);
    await client.query(`INSERT INTO creative_text_calls
      (id, topic_id, story_id, operation, provider, model, status, reserved_micros, charged_micros, pricing, finished_at)
      VALUES ($1, $2, $3, 'draft', 'gemini', 'current', 'settled', 100000, 80000,
              '{"demoMarkupBasisPoints":2500}', now())`,
      [meteredId, topicId, storyId]);
    await client.query("SELECT sync_demo_credit_text_usage()");
    await client.query("SELECT sync_demo_credit_text_usage()");
    assert.equal(await balance(), 9_900_000);
    const account = await loadRepository(client).getDemoCreditAccount();
    assert.equal(account.availableMicros, 9_900_000);
    assert.equal(account.spentMicros, 100_000);
    assert.equal(account.entries.filter((entry) => entry.kind === "usage_debit").length, 1);
    const debit = await client.query<{ amount_micros: number; source_text_call_id: string }>(
      "SELECT amount_micros, source_text_call_id FROM workspace_credit_entries WHERE kind='usage_debit'",
    );
    assert.equal(debit.rows.length, 1);
    assert.equal(debit.rows[0].amount_micros, -100_000);
    assert.equal(debit.rows[0].source_text_call_id, meteredId);

    // A priced image is charged once with the markup it was recorded with; an unpriced one is counted, not charged.
    await client.query(`INSERT INTO ai_usage_charges (topic_id, story_id, kind, provider, model, operation, cost_micros, pricing, idempotency_key)
      VALUES ($1, $2, 'image', 'fal', 'openai/gpt-image-2.5/sunburst/edit', 'creative_image', 40000, '{"demoMarkupBasisPoints":3000}', 'image:a1'),
             ($1, $2, 'image', 'fal', 'fal-ai/some-new-model', 'creative_image', NULL, '{"unpriced":true,"demoMarkupBasisPoints":3000}', 'image:a2')`,
      [topicId, storyId]);
    await client.query("SELECT sync_demo_credit_text_usage()");
    await client.query("SELECT sync_demo_credit_text_usage()");
    assert.equal(await balance(), 9_848_000);
    const withImages = await loadRepository(client).getDemoCreditAccount();
    const image = withImages.entries.find((entry) => entry.usageKind === "image");
    assert.equal(image?.amountMicros, -52_000);
    assert.equal(image?.markupBasisPoints, 3000);
    assert.deepEqual(Array.from(withImages.history.byKind, (entry) => [entry.kind, entry.micros]), [["text", 100_000], ["image", 52_000]]);
    assert.equal(withImages.history.unpricedCount, 1);
    assert.equal(withImages.history.days.length, 30);
    assert.equal(withImages.history.last7DaysMicros, 152_000);

    const pendingId = randomUUID();
    await client.query(`INSERT INTO creative_text_calls
      (id, topic_id, story_id, operation, provider, model, status, reserved_micros, pricing)
      VALUES ($1, $2, $3, 'repair', 'gemini', 'current', 'reserved', 50000,
              '{"demoMarkupBasisPoints":2500}')`, [pendingId, topicId, storyId]);
    const pendingAccount = await loadRepository(client).getDemoCreditAccount();
    assert.equal(pendingAccount.pendingMicros, 62_500);
    assert.equal(pendingAccount.availableMicros, 9_785_500);
    await assert.rejects(client.query(
      "SELECT reset_demo_credits('demo_reset:first', 'test', 'restore demo balance')",
    ), /pending metered text calls/);
    await client.query("UPDATE creative_text_calls SET status='settled', charged_micros=0 WHERE id=$1", [pendingId]);
    await client.query("SELECT reset_demo_credits('demo_reset:first', 'test', 'restore demo balance')");
    assert.equal(await balance(), 10_000_000);
    await client.query("SELECT reset_demo_credits('demo_reset:first', 'test', 'restore demo balance')");
    assert.equal((await client.query("SELECT id FROM workspace_credit_entries WHERE kind='demo_reset'")).rows.length, 1);
    assert.equal((await client.query("SELECT id FROM workspace_credit_entries WHERE kind='usage_debit'")).rows.length, 2);
  } finally {
    await client.close();
  }
});
