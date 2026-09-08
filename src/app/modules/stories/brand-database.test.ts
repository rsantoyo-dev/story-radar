import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";
import * as generation from "./creative-brand-generation";
const requireLocal = createRequire(import.meta.url);

function loadRepo(file: string, db: unknown) {
  const exports: Record<string, (...args: never[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Map, Set, JSON, require: (id: string) => {
    if (id === "server-only") return {};
    if (id === "@/db/client") return { db };
    if (id === "@/db/schema") return schema;
    if (id === "./creative-brand-generation") return generation;
    if (id === "./brand-analyzer.config") return { brandAnalysisCacheHash: () => "hash", BRAND_ANALYZER_PROMPT_VERSION: "test" };
    if (id === "./creative-brand-references.repository") return { CreativeBrandReferenceConflictError: class extends Error {} };
    return requireLocal(id);
  }});
  return exports;
}

// Real PostgreSQL engine in memory: no application DB or external provider.
test("brand quota reserves attempts atomically, including attempts whose provider later fails", async () => {
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE creative_brand_analysis_quota (id text PRIMARY KEY,topic_id uuid NOT NULL,attempts integer NOT NULL)`);
    const db = drizzle(client);
    const repo = loadRepo("./creative-brand-references.repository.ts", db);
    const reserve = repo.reserveBrandAnalysisAttempt as unknown as (topic: string, limit: number) => Promise<boolean>;
    const results = await Promise.all(Array.from({ length: 12 }, () => reserve("00000000-0000-4000-8000-000000000001", 3)));
    assert.equal(results.filter(Boolean).length, 3);
    assert.equal((await client.query<{attempts: number}>("SELECT attempts FROM creative_brand_analysis_quota")).rows[0].attempts, 3);
  } finally { await client.close(); }
});

test("approval checks revoked references and rejects an older image after a newer version exists", async () => {
  const client = new PGlite();
  try {
    await client.exec(`
      CREATE TYPE creative_asset_status AS ENUM ('generated','approved','queued');
      CREATE TABLE creative_drafts (id uuid PRIMARY KEY,topic_id uuid,version int,status text);
      CREATE TABLE creative_asset_batches (id uuid PRIMARY KEY,draft_id uuid,draft_version int,status text);
      CREATE TABLE creative_assets (id uuid PRIMARY KEY,batch_id uuid,unit_order int,version int,status creative_asset_status,reference_snapshot jsonb,approved_at timestamptz,updated_at timestamptz);
      CREATE TABLE creative_brand_references (id uuid PRIMARY KEY,topic_id uuid,is_active boolean,provider_transmission_allowed boolean,version int,sha256 text,usage_note text);
      INSERT INTO creative_drafts VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009',1,'approved');
      INSERT INTO creative_asset_batches VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,'generated');
      INSERT INTO creative_brand_references VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',true,false,1,'hash',null);
      INSERT INTO creative_assets VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',1,1,'generated',
        '{"schema":1,"characters":[],"brand":[{"id":"00000000-0000-4000-8000-000000000004","version":1,"sha256":"hash"}]}',null,null);
    `);
    const db = drizzle(client);
    // Neon batch runs its lazy statements in one transaction. Reproduce that
    // transaction behavior with the local PostgreSQL driver.
    const batchDb = Object.assign(db, { batch: async (queries: PromiseLike<unknown>[]) => {
      await client.exec("BEGIN");
      try { const results = []; for (const query of queries) results.push(await query); await client.exec("COMMIT"); return results; }
      catch (error) { await client.exec("ROLLBACK"); throw error; }
    } });
    const repo = loadRepo("./creative-assets.repository.ts", batchDb);
    const approve = repo.setCreativeAssetApproval as unknown as (id: string, approved: boolean) => Promise<void>;
    const id = "00000000-0000-4000-8000-000000000003";
    await assert.rejects(approve(id, true), /changed/);
    await client.exec("UPDATE creative_brand_references SET provider_transmission_allowed=true");
    await approve(id, true);
    assert.equal((await client.query<{status: string}>("SELECT status FROM creative_assets")).rows[0].status, "approved");
    await approve(id, false);
    await client.exec(`INSERT INTO creative_assets SELECT '00000000-0000-4000-8000-000000000005',batch_id,unit_order,2,'queued',reference_snapshot,null,null FROM creative_assets`);
    await assert.rejects(approve(id, true), /changed/);
    await client.exec("UPDATE creative_drafts SET version=2");
    await assert.rejects(approve(id, true), /changed/);
  } finally { await client.close(); }
});

// Use the application's column types so edits are checked against the real
// storage contract, without bringing application data into this database.
async function createAssetTables(client: PGlite) {
  const { getTableConfig, PgDialect } = await import("drizzle-orm/pg-core");
  const { SQL } = await import("drizzle-orm");
  const dialect = new PgDialect();
  const enums = new Set<string>();
  for (const table of [schema.creativeDrafts, schema.creativeAssetBatches, schema.creativeAssets]) {
    const config = getTableConfig(table);
    const columns = [];
    for (const column of config.columns) {
      const type = column.getSQLType();
      if (column.enumValues?.length && !type.startsWith("varchar") && type !== "text" && !enums.has(type)) {
        await client.exec(`CREATE TYPE "${type}" AS ENUM (${column.enumValues.map(value => `'${value}'`).join(",")})`);
        enums.add(type);
      }
      const defaultValue = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
        : column.default === undefined || typeof column.default === "object" ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
      columns.push(`"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${defaultValue ? ` DEFAULT ${defaultValue}` : ""}`);
    }
    await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await client.exec("CREATE UNIQUE INDEX image_versions ON creative_assets(batch_id,unit_order,version)");
}

test("editing one image persists its new references and base without replacing siblings; stale edit is rejected", async () => {
  const client = new PGlite();
  try {
    await createAssetTables(client);
    await client.exec(`
      INSERT INTO creative_drafts(id,topic_id,version,status) VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009',1,'approved');
      INSERT INTO creative_asset_batches(id,draft_id,draft_version,status,total_assets) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,'completed',2);
      INSERT INTO creative_assets(id,batch_id,unit_order,unit_role,version,status,prompt,expected_text,unit_snapshot,approved_at) VALUES
       ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',1,'cover',1,'approved','prompt','text','{}',now()),
       ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002',2,'content',1,'approved','prompt','text','{}',now());
    `);
    const db = Object.assign(drizzle(client), { batch: async (queries: PromiseLike<unknown>[]) => {
      await client.exec("BEGIN");
      try { const results = []; for (const query of queries) results.push(await query); await client.exec("COMMIT"); return results; }
      catch (error) { await client.exec("ROLLBACK"); throw error; }
    } });
    const repo = loadRepo("./creative-assets.repository.ts", db);
    const find = repo.findCreativeAssetById as unknown as (id: string) => Promise<{asset: {id: string;batchId: string}}>;
    const previous = (await find("00000000-0000-4000-8000-000000000003")).asset;
    const complete = repo.completeCreativeAsset as unknown as (id: string, image: unknown) => Promise<void>;
    const progress = repo.setCreativeAssetProgress as unknown as (id: string, status: string) => Promise<void>;
    const fail = repo.failCreativeAsset as unknown as (id: string, message: string) => Promise<void>;
    await complete(previous.id, { url: "https://example.invalid/late.png" });
    await progress(previous.id, "generating");
    await fail(previous.id, "late failure");
    assert.equal((await client.query<{status: string}>("SELECT status FROM creative_assets WHERE unit_order=1")).rows[0].status, "approved");
    const references = { schema: 1, characters: [], brand: [], selectionOverride: true,
      base: { assetId: previous.id, version: 1, objectKey: "private/base", sha256: "hash", contentType: "image/png", fileName: "base.png" }, editInstruction: "lighter" };
    const edit = repo.insertRegeneratedCreativeAsset as unknown as (input: unknown) => Promise<{id: string;version: number;status: string;editSource: {assetId: string}}>;
    const next = await edit({ previous, prompt: "lighter", references, unitSnapshot: { order: 1, headline: "New text", brandReferenceSelection: { selected: [], excluded: [], note: null } } });
    assert.equal(next.version, 2);
    assert.equal(next.status, "queued");
    assert.equal(next.editSource.assetId, previous.id);
    await assert.rejects(edit({ previous, prompt: "stale", references }), /changed/);
    const rows = (await client.query<{unit_order: number;version: number;status: string;approved_at: unknown}>("SELECT unit_order,version,status,approved_at FROM creative_assets ORDER BY unit_order,version")).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows[0].status, "approved");
    assert.equal(rows[1].approved_at, null);
    assert.equal(rows[2].status, "approved");
    await client.exec("UPDATE creative_drafts SET version=2");
    const latest = (await find(next.id)).asset;
    await assert.rejects(edit({ previous: latest, prompt: "old draft", references }), /changed/);
  } finally { await client.close(); }
});


test("a text revision reuses files and versions in a new unapproved batch, preserving historical approvals", async () => {
  const client = new PGlite();
  try {
    await createAssetTables(client);
    await client.exec(`
      INSERT INTO creative_drafts(id,topic_id,version,status) VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009',2,'draft');
      INSERT INTO creative_asset_batches(id,draft_id,draft_version,status,total_assets) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,'completed',3);
      INSERT INTO creative_assets(id,batch_id,unit_order,unit_role,version,status,prompt,expected_text,unit_snapshot,image_url,approved_at,reference_snapshot)
      SELECT ('00000000-0000-4000-8000-00000000000' || n)::uuid,'00000000-0000-4000-8000-000000000002',n-2,'content',1,'approved','prompt','old title','{"headline":"old title"}', 'https://fal.media/' || n || '.png',now(),'[]'::jsonb FROM generate_series(3,5) n;
    `);
    const db = drizzle(client);
    const repo = loadRepo("./creative-image-carry.repository.ts", db);
    const statements = (repo.carryImageBatchStatements as unknown as (id: string, version: number, now: Date) => PromiseLike<unknown>[])("00000000-0000-4000-8000-000000000001",1,new Date());
    for (const query of statements) await query;
    const rows = (await client.query<{draft_version: number;status: string;image_url: string;version: number;reference_snapshot: {carriedFromAssetId: string}}>(`SELECT b.draft_version,a.status,a.image_url,a.version,a.reference_snapshot FROM creative_assets a JOIN creative_asset_batches b ON b.id=a.batch_id ORDER BY b.draft_version,a.unit_order`)).rows;
    assert.equal(rows.length,6);
    for (let i=0;i<3;i++) {
      assert.equal(rows[i].status,"approved");
      assert.equal(rows[i+3].status,"generated");
      assert.equal(rows[i+3].image_url,rows[i].image_url);
      assert.equal(rows[i+3].version,rows[i].version);
      assert.ok(rows[i+3].reference_snapshot.carriedFromAssetId);
    }
    const transactionDb = Object.assign(drizzle(client), { batch: async (queries: PromiseLike<unknown>[]) => {
      await client.exec("BEGIN");
      try { const result = []; for (const query of queries) result.push(await query); await client.exec("COMMIT"); return result; }
      catch (error) { await client.exec("ROLLBACK"); throw error; }
    } });
    const assetsRepo = loadRepo("./creative-assets.repository.ts", transactionDb);
    const selected = (await client.query<{id:string}>("SELECT a.id FROM creative_assets a JOIN creative_asset_batches b ON a.batch_id=b.id WHERE b.draft_version=2 AND a.unit_order=2")).rows[0];
    const find = assetsRepo.findCreativeAssetById as unknown as (id: string) => Promise<{asset: unknown}>;
    const previous = (await find(selected.id)).asset;
    const edit = assetsRepo.insertRegeneratedCreativeAsset as unknown as (input: unknown) => Promise<{id:string;expectedText:string}>;
    await assert.rejects(edit({ previous, prompt: "unapproved free generation", references: {schema:1,characters:[],brand:[]} }), /changed/);
    const next = await edit({ previous, prompt: "replace the title", unitSnapshot: {headline:"Better title",order:2},
      references: {schema:1,characters:[],brand:[],textSync:{draftVersion:2,unitId:"slide-2",previousText:"old title",newText:"Better title"}} });
    assert.equal(next.expectedText,"Better title");
    assert.equal((await client.query("SELECT id FROM creative_assets WHERE version=2")).rows.length,1);
    await assert.rejects(edit({ previous, prompt: "duplicate", references:{schema:1,characters:[],brand:[],textSync:{draftVersion:2}} }), /changed/);
    // The source is a complete set only: a running image prevents carrying it.
    await client.exec("UPDATE creative_assets SET status='generating' WHERE unit_order=2 AND batch_id='00000000-0000-4000-8000-000000000002'");
    for (const query of (repo.carryImageBatchStatements as unknown as (id: string, version: number, now: Date) => PromiseLike<unknown>[])("00000000-0000-4000-8000-000000000001",1,new Date())) await query;
    assert.equal((await client.query("SELECT id FROM creative_asset_batches")).rows.length,2);
  } finally { await client.close(); }
});
