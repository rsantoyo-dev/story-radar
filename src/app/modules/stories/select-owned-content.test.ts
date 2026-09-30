import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

import { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";

const localRequire = createRequire(import.meta.url);

function loadService(client: PGlite) {
  const dialect = new PgDialect();
  const db = {
    execute(query: SQL) {
      const built = dialect.sqlToQuery(query);
      return client.query(built.sql, built.params);
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("./select-owned-content.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    {
      exports,
      Date,
      require(name: string) {
        if (name === "drizzle-orm") return localRequire(name);
        if (name === "@/db/client") return { db };
        return {};
      },
    },
  );
  return exports as typeof import("./select-owned-content");
}

test("editor approval selects original content and persistently clears its reviewed duplicate match", async () => {
  const client = new PGlite();
  const topicId = randomUUID();
  const ownStoryId = randomUUID();
  const duplicateStoryId = randomUUID();
  const otherStoryId = randomUUID();
  try {
    await client.exec(`
      CREATE TABLE topic_stories (
        topic_id uuid NOT NULL, story_id uuid NOT NULL,
        review_decision text, reviewed_at timestamptz,
        processing_status text NOT NULL,
        duplicate_of_story_id uuid, duplicate_detected_at timestamptz,
        duplicate_similarity integer, duplicate_overridden_at timestamptz,
        PRIMARY KEY (topic_id, story_id)
      );
      CREATE TABLE owned_content_entries (topic_id uuid NOT NULL, story_id uuid NOT NULL);
    `);
    await client.query(
      `INSERT INTO topic_stories
       (topic_id, story_id, processing_status, duplicate_of_story_id, duplicate_detected_at, duplicate_similarity)
       VALUES ($1, $2, 'ready', $3, now(), 70), ($1, $4, 'ready', $3, now(), 70)`,
      [topicId, ownStoryId, duplicateStoryId, otherStoryId],
    );
    await client.query("INSERT INTO owned_content_entries VALUES ($1, $2)", [topicId, ownStoryId]);

    const service = loadService(client);
    await assert.rejects(
      service.selectOwnedContentStory(topicId, ownStoryId, otherStoryId),
      service.OwnedContentSelectionConflictError,
      "a changed duplicate match must require a fresh review",
    );
    await assert.rejects(
      service.selectOwnedContentStory(topicId, otherStoryId, duplicateStoryId),
      service.OwnedContentSelectionConflictError,
      "only editor-authored content may skip AI evaluation",
    );
    await client.query(
      "UPDATE topic_stories SET processing_status='failed' WHERE topic_id=$1 AND story_id=$2",
      [topicId, ownStoryId],
    );
    await assert.rejects(
      service.selectOwnedContentStory(topicId, ownStoryId, duplicateStoryId),
      service.OwnedContentSelectionConflictError,
      "failed content must be repaired before editorial selection",
    );
    await client.query(
      "UPDATE topic_stories SET processing_status='ready' WHERE topic_id=$1 AND story_id=$2",
      [topicId, ownStoryId],
    );

    const selectedAt = new Date("2026-09-29T12:00:00.000Z");
    await service.selectOwnedContentStory(topicId, ownStoryId, duplicateStoryId, selectedAt);
    const selected = await client.query<{
      review_decision: string; processing_status: string;
      duplicate_of_story_id: string | null; duplicate_detected_at: string | null;
      duplicate_similarity: number | null; duplicate_overridden_at: string;
      reviewed_at: string;
    }>("SELECT * FROM topic_stories WHERE topic_id=$1 AND story_id=$2", [topicId, ownStoryId]);
    assert.equal(selected.rows[0].review_decision, "approved");
    assert.equal(selected.rows[0].processing_status, "selected");
    assert.equal(selected.rows[0].duplicate_of_story_id, null);
    assert.equal(selected.rows[0].duplicate_detected_at, null);
    assert.equal(selected.rows[0].duplicate_similarity, null);
    assert.equal(new Date(selected.rows[0].duplicate_overridden_at).toISOString(), selectedAt.toISOString());
    assert.equal(new Date(selected.rows[0].reviewed_at).toISOString(), selectedAt.toISOString());
    await assert.rejects(
      service.selectOwnedContentStory(topicId, ownStoryId, null),
      service.OwnedContentSelectionConflictError,
      "a second request must not silently redo the editor decision",
    );
  } finally {
    await client.close();
  }
});
