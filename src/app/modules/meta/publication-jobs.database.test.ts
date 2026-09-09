import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { SQL, eq } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../../db/schema";
import * as core from "./publish-publication-package.core";
import * as access from "./instagram-publishing-access";
import { MetaGraphApiError } from "./meta-token-response";
import type * as service from "./publish-publication-package";
import type * as mediaRepo from "./topic-instagram-media.repository";

const requireLocal = createRequire(import.meta.url);
const ids = { topic: "00000000-0000-4000-8000-000000000001", draft: "00000000-0000-4000-8000-000000000002",
  batch: "00000000-0000-4000-8000-000000000003", story: "00000000-0000-4000-8000-000000000004", pkg: "00000000-0000-4000-8000-000000000005" };

async function setup() {
  const client = new PGlite();
  const db = drizzle(client);
  const dialect = new PgDialect();
  for (const table of [schema.instagramPublicationJobs, schema.instagramPublicationPackages, schema.instagramDeliveryFiles, schema.topicInstagramMedia]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      const value = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
        : column.default === undefined ? undefined : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
      return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${value ? ` DEFAULT ${value}` : ""}`;
    });
    await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
    for (const check of config.checks) {
      await client.exec(`ALTER TABLE "${config.name}" ADD CONSTRAINT "${check.name}" CHECK (${dialect.sqlToQuery(check.value).sql})`);
    }
  }
  await client.exec(`CREATE UNIQUE INDEX job_key ON instagram_publication_jobs(idempotency_key);
    CREATE UNIQUE INDEX media_key ON topic_instagram_media(topic_id, external_id);`);
  await db.insert(schema.instagramPublicationPackages).values({ id: ids.pkg, topicId: ids.topic, draftId: ids.draft,
    batchId: ids.batch, storyId: ids.story, draftVersion: 1, candidateSnapshotHash: "snapshot", packageHash: "package",
    mediaType: "image", caption: "Approved caption", igUserId: "1789", connectionVersion: "conn-1",
    scriptSnapshot: {}, transforms: [], expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(schema.instagramDeliveryFiles).values({ packageId: ids.pkg, unitOrder: 1, assetVersion: 1,
    token: "opaque-token", objectKey: "private-key", contentType: "image/jpeg", byteSize: 123,
    sha256: "hash", sourceSha256: "source-hash", width: 1080, height: 1350, expiresAt: new Date(Date.now() + 86_400_000) });
  const calls = { publish: 0, create: 0, after: 0 };
  const control = { rejectPublish: false, connection: "conn-1", containerStatus: "FINISHED" };
  const destination = () => ({ connected: true, expired: false, igUserId: "1789", connectionVersion: control.connection, appConfigurationVersion: "app-1" });
  const deps: Record<string, unknown> = {
    "server-only": {}, "@/db/client": { db }, "@/db/schema": schema,
    "next/server": { after: () => { calls.after++; } }, // Deliberately never runs: only the worker advances jobs.
    "../stories/manage-creative-content": { CreativeContentConflictError: class extends Error {}, CreativeContentNotFoundError: class extends Error {} },
    "./publish-publication-package.core": core,
    "./instagram-publishing-access": access,
    "./get-publication-candidate": { getPublicationCandidate: async () => ({ state: "ready", snapshotHash: "snapshot" }) },
    "./check-instagram-publishing-access": { checkInstagramPublishingAccess: async () => ({ state: "enabled", message: "ok",
      identity: access.publishingIdentity(ids.topic, destination() as never), apiVersion: "v21.0",
      checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 240_000).toISOString(), quota: { remaining: 100 } }) },
    "./topic-meta-connections.repository": { getPublicationDestination: async () => destination(),
      getDecryptedTopicMetaAccessToken: async () => ({ accessToken: "private-token", igUserId: "1789", connectionVersion: control.connection }) },
    "./meta-graph-client": { GRAPH_API_VERSION: "v21.0",
      createInstagramMediaContainer: async () => { calls.create++; return String(1000 + calls.create); },
      createInstagramCarouselContainer: async () => "9001",
      getInstagramContainerStatus: async () => control.containerStatus,
      publishInstagramContainer: async () => { calls.publish++; if (control.rejectPublish) throw new MetaGraphApiError("rejected", 400); return "5001"; },
      fetchInstagramMediaPermalink: async () => ({ permalink: "https://www.instagram.com/p/ABCDEF/" }) },
  };
  function load<T>(file: string): T {
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, Date, Map, Set, JSON, Buffer,
      console: { error: () => {} }, process: { env: { RADAR_APP_URL: "https://app.example" } },
      require: (id: string) => id in deps ? deps[id] : requireLocal(id) });
    return exports as T;
  }
  const repo = load<typeof service>("./publish-publication-package.ts");
  const media = load<typeof mediaRepo>("./topic-instagram-media.repository.ts");
  async function step() {
    // Advance the scheduler clock without real sleeps; still claim through the production SQL.
    await client.exec("UPDATE instagram_publication_jobs SET lease_until=NULL WHERE lease_owner IS NULL");
    await repo.resumePublicationJobs();
  }
  async function row() { return (await db.select().from(schema.instagramPublicationJobs))[0]; }
  async function finish() { for (let i = 0; i < 15; i++) { await step(); if (core.isTerminalPublicationJobStatus((await row()).status as core.PublicationJobStatus)) return; } throw new Error("unfinished"); }
  return { client, db, repo, media, calls, control, step, row, finish };
}

test("concurrent publish requests and independent workers converge on one order and one post without browser reads", async () => {
  const h = await setup();
  try {
    const jobs = await Promise.all([h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg), h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg)]);
    assert.equal(jobs[0].id, jobs[1].id);
    await Promise.all([h.repo.resumePublicationJobs(), h.repo.resumePublicationJobs()]);
    await h.finish();
    assert.equal((await h.row()).status, "published");
    assert.equal(h.calls.publish, 1);
    assert.equal(h.calls.create, 1);
    const replay = await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    assert.equal(replay.id, jobs[0].id);
    assert.equal(replay.status, "published");
    const [media] = await h.db.select().from(schema.topicInstagramMedia);
    assert.equal(media.linkedStoryId, ids.story);
    assert.equal(media.publishedPackageId, ids.pkg);
  } finally { await h.client.close(); }
});

test("only an explicit failed-job retry requeues the same row, with a bounded attempt count", async () => {
  const h = await setup();
  try {
    h.control.rejectPublish = true;
    const job = await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    await h.finish();
    assert.equal((await h.row()).status, "failed");
    await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    assert.equal((await h.row()).status, "failed");
    h.control.rejectPublish = false;
    await Promise.all([h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg, job.id), h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg, job.id)]);
    await h.finish();
    const row = await h.row();
    assert.equal(row.id, job.id);
    assert.equal(row.attempts, 2);
    assert.equal(row.status, "published");
    assert.equal(h.calls.publish, 2);
    assert.ok((row.childContainers as core.ChildContainer[]).some(child => child.status === "retired"));
  } finally { await h.client.close(); }
});

test("a DB failure after remote success is repaired after reconnection without another publish", async () => {
  const h = await setup();
  try {
    await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    await h.client.exec(`CREATE FUNCTION reject_media() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'temporary write failure'; END $$;
      CREATE TRIGGER reject_media BEFORE INSERT ON topic_instagram_media FOR EACH ROW EXECUTE FUNCTION reject_media();`);
    for (let i = 0; i < 8; i++) await h.step();
    assert.equal((await h.row()).status, "pending-confirmation");
    assert.equal((await h.row()).publishedMediaId, "5001");
    assert.equal(h.calls.publish, 1);
    h.control.connection = "conn-reconnected";
    await h.client.exec("DROP TRIGGER reject_media ON topic_instagram_media");
    await h.step();
    assert.equal((await h.row()).status, "published");
    const [media] = await h.db.select().from(schema.topicInstagramMedia);
    assert.equal(media.igUserId, "1789");
    assert.equal(media.externalId, "5001");
    assert.equal(h.calls.publish, 1);
  } finally { await h.client.close(); }
});

test("sync, local repair and a manual unlink preserve the exact publication package and do not duplicate posts", async () => {
  const h = await setup();
  try {
    await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    await h.finish();
    await h.db.update(schema.topicInstagramMedia).set({ linkedStoryId: null, linkedDraftId: null, linkedBatchId: null,
      linkedDraftVersion: null, linkedBy: "editor", linkedAt: new Date() });
    await h.media.upsertInstagramMediaPage(ids.topic, "1789", [{ externalId: "5001", mediaType: "IMAGE",
      mediaProductType: "FEED", permalink: "https://www.instagram.com/p/ABCDEF/", caption: "Synced caption",
      mediaUrl: "https://example.com/image.jpg", thumbnailUrl: null, publishedAt: new Date().toISOString(), raw: {}, children: [] }]);
    // Force a legacy bookkeeping repair after the editor has deliberately unlinked the story.
    await h.db.update(schema.instagramPublicationPackages).set({ status: "frozen" }).where(eq(schema.instagramPublicationPackages.id, ids.pkg));
    await h.step();
    const rows = await h.db.select().from(schema.topicInstagramMedia);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].linkedStoryId, null);
    assert.equal(rows[0].linkedBy, "editor");
    assert.equal(rows[0].publishedPackageId, ids.pkg);
    assert.equal(h.calls.publish, 1);
  } finally { await h.client.close(); }
});

test("a live lease is skipped and an expired publishing lease is reconciled without resending", async () => {
  const h = await setup();
  try {
    await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    await h.db.update(schema.instagramPublicationJobs).set({ status: "publishing", parentContainerId: "1001", startedAt: new Date(),
      leaseOwner: "old-worker", leaseUntil: new Date(Date.now() + 60_000) });
    assert.equal((await h.repo.resumePublicationJobs()).selected, 0);
    await h.db.update(schema.instagramPublicationJobs).set({ leaseUntil: new Date(0) });
    await h.repo.resumePublicationJobs();
    assert.equal((await h.row()).status, "pending-confirmation");
    assert.equal(h.calls.publish, 0);
  } finally { await h.client.close(); }
});

test("a legacy preflight suspension remains inert until an explicit retry passes current validation", async () => {
  const h = await setup();
  try {
    const job = await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    await h.db.update(schema.instagramPublicationJobs).set({ status: "suspended", failureKind: "invalidated", attempts: 0,
      lastError: "The publishing authorization no longer matches this account or has expired. Validate again.", finishedAt: new Date() });
    const replay = await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg);
    assert.equal(replay.status, "suspended");
    assert.equal(replay.canRetry, true);
    await h.step();
    assert.equal(h.calls.publish, 0);
    await h.repo.requestPublishNow(ids.topic, ids.draft, ids.pkg, job.id);
    await h.finish();
    assert.equal((await h.row()).id, job.id);
    assert.equal((await h.row()).status, "published");
    assert.equal(h.calls.publish, 1);
  } finally { await h.client.close(); }
});
