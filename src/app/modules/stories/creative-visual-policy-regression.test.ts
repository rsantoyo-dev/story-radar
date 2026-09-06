import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as orm from "drizzle-orm";
import { integer, jsonb, pgTable, PgDialect, text, uuid } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as fidelity from "./creative-visual-fidelity";

// Execute the real server functions with isolated storage; never load DATABASE_URL.
function load(file: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(resolve("src/app/modules/stories", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(code, {
    exports, Date, Set, console,
    require: (name: string) => dependencies[name] ?? {},
  });
  return exports;
}

const schema = {
  creativeDrafts: pgTable("creative_drafts", {
    id: uuid("id"), topicId: uuid("topic_id"), briefId: uuid("brief_id"),
    version: integer("version"), status: text("status"),
  }),
  creativeAssetBatches: pgTable("creative_asset_batches", {
    id: uuid("id"), draftId: uuid("draft_id"), status: text("status"),
  }),
  storyCreativeBriefs: pgTable("story_creative_briefs", {
    id: uuid("id"), profileSnapshot: jsonb("profile_snapshot"),
  }),
};

class StorageConflict extends Error {}

test("clearing required-photo uses the live policy, even when the brief still requires photos", async () => {
  let writes = 0;
  const service = load("manage-creative-content.ts", {
    "./creative-visual-fidelity": fidelity,
    "./creative-draft-visual-policy.repository": { CreativeVisualPolicyConflictError: StorageConflict },
    "./creative-profile.repository": { getTopicVisualFidelityMode: async () => "illustration-editorial" },
    "./creative-content.repository": {
      findCreativeDraftById: async () => ({ status: "draft", version: 3, visualFidelityOverride: { mode: "photo-required", reason: "Verified photo only" } }),
      findCreativeBriefById: async () => ({ profileSnapshot: { visualFidelityMode: "photo-required" } }),
      setCreativeDraftVisualFidelityOverride: async () => { writes++; },
    },
  });
  await assert.rejects(
    () => service.setSavedCreativeDraftVisualFidelity("topic", "draft", { mode: null }),
    /set an explicit mode with a reason/,
  );
  assert.equal(writes, 0);
});

test("explicit relaxation keeps its reason and actor and submits the observed version", async () => {
  let saved: unknown[] = [];
  const service = load("manage-creative-content.ts", {
    "./creative-visual-fidelity": fidelity,
    "./creative-draft-visual-policy.repository": { CreativeVisualPolicyConflictError: StorageConflict },
    "./creative-profile.repository": { getTopicVisualFidelityMode: async () => "photo-required" },
    "./creative-content.repository": {
      findCreativeDraftById: async () => ({ status: "draft", version: 3 }),
      setCreativeDraftVisualFidelityOverride: async (...args: unknown[]) => { saved = args; },
    },
  });
  await service.setSavedCreativeDraftVisualFidelity("topic", "draft", { mode: "illustration-editorial", reason: "Editorial decision" }, "editor");
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), ["topic", "draft", { mode: "illustration-editorial", reason: "Editorial decision", by: "editor" }, { expectedVersion: 3 }]);
});

test("a failed compare-and-swap is surfaced as a content conflict", async () => {
  const service = load("manage-creative-content.ts", {
    "./creative-visual-fidelity": fidelity,
    "./creative-draft-visual-policy.repository": { CreativeVisualPolicyConflictError: StorageConflict },
    "./creative-profile.repository": { getTopicVisualFidelityMode: async () => "illustration-editorial" },
    "./creative-content.repository": {
      findCreativeDraftById: async () => ({ status: "draft", version: 1 }),
      setCreativeDraftVisualFidelityOverride: async () => { throw new StorageConflict("Concurrent edit"); },
    },
  });
  await assert.rejects(
    () => service.setSavedCreativeDraftVisualFidelity("topic", "draft", { mode: "photo-required", reason: "Real photo" }),
    (error: unknown) => (error as object).constructor === service.CreativeContentConflictError,
  );
});

test("a stale override stops at the failed version check instead of loading a successful result", async () => {
  const repository = load("creative-content.repository.ts", {
    "./creative-draft-visual-policy.repository": {
      CreativeVisualPolicyConflictError: StorageConflict,
      reviseCreativeDraftVisualPolicy: async (input: { expectedVersion: number; expectedStatus: string }) => {
        assert.equal(input.expectedVersion, 1);
        assert.equal(input.expectedStatus, "draft");
        return false;
      },
    },
  });
  await assert.rejects(
    () => repository.setCreativeDraftVisualFidelityOverride("topic", "draft", { mode: "photo-required", reason: "Real photo" }, { expectedVersion: 1 }),
    StorageConflict,
  );
});

test("SQL retirement depends on the successful version/status update and excludes newer batches", async () => {
  const queries: orm.SQL[] = [];
  const repository = load("creative-draft-visual-policy.repository.ts", {
    "drizzle-orm": orm,
    "@/db/schema": schema,
    "@/db/client": { db: { execute: async (query: orm.SQL) => { queries.push(query); return { rows: [] }; } } },
  });
  assert.equal(await repository.reviseCreativeDraftVisualPolicy({
    topicId: "topic", draftId: "draft", expectedVersion: 1, expectedStatus: "draft",
    override: { mode: "photo-required", reason: "Real photo" },
  }), false);
  assert.equal(queries.length, 1);
  const query = new PgDialect().sqlToQuery(queries[0]);
  assert.match(query.sql, /SET version = version \+ 1/);
  assert.match(query.sql, /AND version = \$\d+ AND status = \$\d+/);
  assert.match(query.sql, /draft_id IN \(SELECT id FROM changed_draft\)/);
  assert.match(query.sql, /draft_version <= \$\d+/);
  assert.doesNotMatch(query.sql, /UPDATE "creative_assets"/);
  assert.ok(query.params.includes("Real photo"));
});

test("invalidation does not count or separately retire a concurrent newer version", async () => {
  let selects = 0;
  let revisions = 0;
  const db = {
    select: () => ({
      from() { return this; }, innerJoin() { return this; },
      where: async () => ++selects === 1
        ? [{ id: "draft", status: "approved", version: 1 }]
        : [{ draftId: "draft" }],
    }),
  };
  const repository = load("creative-visual-policy-invalidation.ts", {
    "drizzle-orm": orm, "@/db/schema": schema, "@/db/client": { db },
    "./creative-draft-visual-policy.repository": {
      reviseCreativeDraftVisualPolicy: async (input: { expectedVersion: number }) => {
        assert.equal(input.expectedVersion, 1);
        revisions++;
        return false; // Another editor already advanced the draft.
      },
    },
  });
  const result = await repository.invalidateApprovalsForVisualPolicyChange({ topicId: "topic", currentPolicyVersion: 2 });
  assert.equal((result as { draftsRetired: number }).draftsRetired, 0);
  assert.equal(revisions, 1);
});

test("unsaved text prevents the fidelity handler from sending or reloading anything", async () => {
  const source = readFileSync(resolve("src/app/creative-draft-workspace.tsx"), "utf8");
  const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleSetVisualFidelity") handler = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  const code = ts.transpileModule(handler + "\nexports.run = handleSetVisualFidelity;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { run?: (input: unknown) => Promise<void> } = {};
  runInNewContext(code, {
    exports, activeDraftId: "draft", busy: false, dirty: true, viewingHistoricalDraft: false,
    run: () => assert.fail("Must preserve unsaved edits without a request or reload"),
  });
  await exports.run!({ mode: "photo-required", reason: "Verified photo" });
});
