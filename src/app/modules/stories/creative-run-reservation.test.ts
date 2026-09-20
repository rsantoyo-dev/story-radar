import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as errors from "./creative-run-errors";

const localRequire = createRequire(import.meta.url);
const topic = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("creative reservations serialize identical inputs, enforce quota under concurrency and count failed attempts", async () => {
  const client = new PGlite();
  try {
    await client.exec(`
      CREATE TABLE topics(id uuid PRIMARY KEY);
      INSERT INTO topics VALUES ('${topic}'),('${other}');
      CREATE TYPE creative_ai_task AS ENUM ('brief','draft');
      CREATE TABLE creative_ai_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic_id uuid REFERENCES topics(id),
        story_id uuid, brief_id uuid, task creative_ai_task, provider text, model text,
        prompt_version text, input_hash text, status text DEFAULT 'running',
        started_at timestamptz DEFAULT now()
      );
    `);
    const dialect = new PgDialect();
    const db = {
      execute: (query: SQL) => query,
      batch: (queries: SQL[]) => client.transaction(async (tx) => {
        const result = [];
        for (const query of queries) {
          const compiled = dialect.sqlToQuery(query);
          result.push(await tx.query(compiled.sql, compiled.params));
        }
        return result;
      }),
    };
    const exports = {} as { createCreativeAiRun: (input: Record<string, unknown>) => Promise<string> };
    const source = readFileSync(new URL("./creative-content.repository.ts", import.meta.url), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, {
      exports, Date, Number, Error, console,
      require: (name: string) => {
        if (name === "drizzle-orm" || name === "node:crypto") return localRequire(name);
        if (name === "@/db/client") return { db };
        if (name === "./creative-content.config") return { getCreativeContentPublicConfig: () => ({ maxRunsPerDay: 2 }) };
        if (name === "./creative-run-errors") return errors;
        return {};
      },
    });
    const input = { topicId: topic, storyId: other, task: "draft", provider: "google", model: "test", promptVersion: "test", inputHash: "same" };
    const identical = await Promise.allSettled([exports.createCreativeAiRun(input), exports.createCreativeAiRun(input)]);
    assert.equal(identical.filter(r => r.status === "fulfilled").length, 1);
    const duplicate = identical.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(duplicate.reason instanceof errors.CreativeContentConflictError);

    await client.exec("UPDATE creative_ai_runs SET status='failed'");
    const competing = await Promise.allSettled([
      exports.createCreativeAiRun({ ...input, inputHash: "second" }),
      exports.createCreativeAiRun({ ...input, inputHash: "third" }),
    ]);
    assert.equal(competing.filter(r => r.status === "fulfilled").length, 1);
    assert.ok((competing.find(r => r.status === "rejected") as PromiseRejectedResult).reason instanceof errors.CreativeContentDailyLimitError);
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM creative_ai_runs")).rows[0].count, 2);
    assert.ok(await exports.createCreativeAiRun({ ...input, topicId: other }));
  } finally {
    await client.close();
  }
});
