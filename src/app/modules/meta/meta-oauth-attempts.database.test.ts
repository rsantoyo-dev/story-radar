import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../../db/schema";
import type * as repo from "./meta-oauth-attempts.repository";

const requireLocal = createRequire(import.meta.url);
const topicId = "00000000-0000-4000-8000-000000000001";
const otherTopicId = "00000000-0000-4000-8000-000000000002";

async function setup() {
  const client = new PGlite();
  const db = drizzle(client);
  const dialect = new PgDialect();
  const config = getTableConfig(schema.metaOauthAttempts);
  const columns = config.columns.map((column) => {
    const value = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
      : column.default === undefined ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
    return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${value ? ` DEFAULT ${value}` : ""}`;
  });
  await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  for (const check of config.checks) {
    await client.exec(`ALTER TABLE "${config.name}" ADD CONSTRAINT "${check.name}" CHECK (${dialect.sqlToQuery(check.value).sql})`);
  }
  function load<T>(file: string): T {
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const deps: Record<string, unknown> = {
      "server-only": {},
      "@/db/client": { db },
      "@/db/schema": schema,
    };
    vm.runInNewContext(code, {
      exports, Date, Map, Set, JSON, Buffer,
      require: (id: string) => (id in deps ? deps[id] : requireLocal(id)),
    });
    return exports as T;
  }
  const attempts = load<typeof repo>("./meta-oauth-attempts.repository.ts");
  return { client, db, attempts };
}

test("a recorded attempt is consumed exactly once", async () => {
  const h = await setup();
  try {
    const now = new Date();
    await h.attempts.recordMetaOAuthAttempt({
      nonce: "nonce-1", topicId, workspaceId: "default",
      mechanism: "instagram", issuedAt: now, expiresAt: new Date(now.getTime() + 600_000),
    });
    const first = await h.attempts.consumeMetaOAuthAttempt({
      nonce: "nonce-1", topicId, mechanism: "instagram", now,
    });
    assert.equal(first, true);
    const replay = await h.attempts.consumeMetaOAuthAttempt({
      nonce: "nonce-1", topicId, mechanism: "instagram", now,
    });
    assert.equal(replay, false);
  } finally { await h.client.close(); }
});

test("concurrent callbacks racing the same nonce: exactly one wins", async () => {
  const h = await setup();
  try {
    const now = new Date();
    await h.attempts.recordMetaOAuthAttempt({
      nonce: "nonce-race", topicId, workspaceId: "default",
      mechanism: "instagram", issuedAt: now, expiresAt: new Date(now.getTime() + 600_000),
    });
    const results = await Promise.all([
      h.attempts.consumeMetaOAuthAttempt({ nonce: "nonce-race", topicId, mechanism: "instagram", now }),
      h.attempts.consumeMetaOAuthAttempt({ nonce: "nonce-race", topicId, mechanism: "instagram", now }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  } finally { await h.client.close(); }
});

test("rejects consumption for the wrong topic, the wrong mechanism, or an expired attempt", async () => {
  const h = await setup();
  try {
    const now = new Date();
    await h.attempts.recordMetaOAuthAttempt({
      nonce: "nonce-2", topicId, workspaceId: "default",
      mechanism: "instagram", issuedAt: now, expiresAt: new Date(now.getTime() + 600_000),
    });
    assert.equal(
      await h.attempts.consumeMetaOAuthAttempt({ nonce: "nonce-2", topicId: otherTopicId, mechanism: "instagram", now }),
      false,
    );
    assert.equal(
      await h.attempts.consumeMetaOAuthAttempt({ nonce: "nonce-2", topicId, mechanism: "facebook", now }),
      false,
    );

    await h.attempts.recordMetaOAuthAttempt({
      nonce: "nonce-3", topicId, workspaceId: "default",
      mechanism: "facebook", issuedAt: now, expiresAt: new Date(now.getTime() - 1),
    });
    assert.equal(
      await h.attempts.consumeMetaOAuthAttempt({ nonce: "nonce-3", topicId, mechanism: "facebook", now }),
      false,
    );

    // The still-valid nonce-2 attempt remains consumable after the rejected attempts above.
    assert.equal(
      await h.attempts.consumeMetaOAuthAttempt({ nonce: "nonce-2", topicId, mechanism: "instagram", now }),
      true,
    );
  } finally { await h.client.close(); }
});
