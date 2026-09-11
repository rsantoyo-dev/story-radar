import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { PGlite } from "@electric-sql/pglite";
import { eq, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import ts from "typescript";

import * as schema from "../../../db/schema";
import type { Topic } from "../../../db/schema";
import * as overviewLogic from "./topic-overview.logic";
import type { getTopicOverview as GetTopicOverview } from "./topic-overview.repository";

/**
 * Integration coverage for the Topic Overview aggregate (OVW-10), against a
 * real Postgres engine running in memory (PGlite) — no application database,
 * no provider. Exercises exactly the fixtures the story calls for: an empty
 * topic, two isolated topics, a large/busy topic with blocked drafts, several
 * revisions of one story, an uncertain delivery, and two destinations for one
 * piece — then checks every counter against what its own list actually
 * contains.
 */

const requireLocal = createRequire(import.meta.url);

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * The repository under test runs in a separate `vm` realm (see
 * `loadRepository`), so the plain objects/arrays it returns have that realm's
 * `Object`/`Array` prototypes — `assert.deepEqual` flags those as "same
 * structure but not reference-equal" against a host-realm literal. A JSON
 * round-trip normalizes everything to this realm before asserting; the DTO is
 * JSON-safe by contract (every date is already an ISO string).
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const TABLES: PgTable[] = [
  schema.topicStories,
  schema.stories,
  schema.storySources,
  schema.storyEditorialEvaluations,
  schema.storyCreativeBriefs,
  schema.creativeDrafts,
  schema.creativeAssetBatches,
  schema.creativeAssets,
  schema.creativeAssetEditRequests,
  schema.instagramPublicationJobs,
  schema.instagramPublicationPackages,
  schema.storySocialPublications,
  schema.collectionRuns,
  schema.topicSources,
  schema.aiResearchSources,
  schema.topicMetaConnections,
];

/**
 * Creates every table the repository touches using the application's own
 * column types (including enum types), so a query bug against a real column
 * name/type is caught here. Foreign keys and check constraints are
 * deliberately not recreated — this exercises the aggregate's read logic, not
 * the schema's write-time invariants (already covered by the schema itself).
 */
async function createSchema(client: PGlite): Promise<void> {
  const dialect = new PgDialect();
  const enums = new Set<string>();

  for (const table of TABLES) {
    const config = getTableConfig(table);
    const columns: string[] = [];

    for (const column of config.columns) {
      const type = column.getSQLType();

      if (
        column.enumValues?.length &&
        !type.startsWith("varchar") &&
        type !== "text" &&
        !enums.has(type)
      ) {
        await client.exec(
          `CREATE TYPE "${type}" AS ENUM (${column.enumValues
            .map((value) => `'${value}'`)
            .join(",")})`,
        );
        enums.add(type);
      }

      const defaultValue =
        column.default instanceof SQL
          ? dialect.sqlToQuery(column.default).sql
          : column.default === undefined || typeof column.default === "object"
            ? undefined
            : typeof column.default === "string"
              ? `'${column.default}'`
              : String(column.default);

      columns.push(
        `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${
          column.notNull ? " NOT NULL" : ""
        }${defaultValue ? ` DEFAULT ${defaultValue}` : ""}`,
      );
    }

    await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
}

/** Loads the repository under test with `@/db/client` swapped for the local
 * in-memory database — the same technique this codebase already uses for
 * other repository integration tests (see publication-jobs.database.test.ts). */
function loadRepository(db: unknown): { getTopicOverview: typeof GetTopicOverview } {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL("./topic-overview.repository.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  vm.runInNewContext(code, {
    exports,
    Date,
    Map,
    Set,
    Math,
    Number,
    String,
    Boolean,
    Array,
    JSON,
    Promise,
    console: { error: () => undefined },
    require: (specifier: string) => {
      if (specifier === "server-only") return {};
      if (specifier === "@/db/client") return { db };
      if (specifier === "@/db/schema") return schema;
      if (specifier === "./topic-overview.logic") return overviewLogic;
      return requireLocal(specifier);
    },
  });

  return exports as { getTopicOverview: typeof GetTopicOverview };
}

function topic(overrides: Partial<Topic> & { id: string; name: string }): Topic {
  return {
    workspaceId: "ws-1",
    slug: overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: null,
    themeKey: "press-green",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-09-10T12:00:00.000Z");
const IN_PERIOD = new Date("2026-09-01T00:00:00.000Z"); // within the 30-day window ending NOW
const OUT_OF_PERIOD = new Date("2026-07-01T00:00:00.000Z"); // older than 30 days

const BRIEF_BASE = {
  profileId: "profile-1",
  profileSnapshot: {},
  provider: "test",
  model: "test-model",
  promptVersion: "v1",
  inputHash: "hash",
  recommendedFormat: "meme" as const,
  fallbackFormat: "carousel" as const,
  formatScores: {},
  confidence: 80,
  targetAudience: "General audience",
  keyMessage: "Key message",
  angle: "Angle",
  hook: "Hook",
  tonePrimary: "informative" as const,
  toneEnergy: 50,
  toneHumor: 10,
  toneReason: "Because",
  contentSufficiency: "sufficient" as const,
  keyFacts: [],
  suggestedConcepts: [],
};

const BATCH_BASE = {
  provider: "fal",
  model: "gpt-image",
  promptVersion: "v1",
  outputAspectRatio: "4:5" as const,
  width: 1080,
  height: 1350,
  totalAssets: 1,
};

const ASSET_BASE = {
  unitOrder: 1,
  unitRole: "cover" as const,
  provider: "fal",
  model: "gpt-image",
  promptVersion: "v1",
  prompt: "prompt",
  expectedText: "text",
  unitSnapshot: {},
};

test("Topic Overview aggregate: fixtures, isolation, and counters match their own lists", async () => {
  const client = new PGlite();

  try {
    await createSchema(client);
    const db = drizzle(client);
    const { getTopicOverview } = loadRepository(db);

    const topicA = topic({ id: id(1), name: "Topic A" });
    const topicB = topic({ id: id(2), name: "Topic B" });
    const topicEmpty = topic({ id: id(3), name: "Empty Topic" });

    async function insertStory(storyId: string, title: string) {
      await db.insert(schema.stories).values({
        id: storyId,
        canonicalUrl: `https://example.test/${storyId}`,
        originalUrl: `https://example.test/${storyId}`,
        title,
        contentStatus: "full",
        language: "en",
        region: "CA",
      });
    }

    async function insertTopicStory(
      storyId: string,
      topicId: string,
      overrides: Partial<typeof schema.topicStories.$inferInsert> = {},
    ) {
      await db.insert(schema.topicStories).values({
        topicId,
        storyId,
        processingStatus: "ready",
        firstSeenAt: IN_PERIOD,
        lastSeenAt: IN_PERIOD,
        ...overrides,
      });
    }

    async function insertBrief(briefId: string, topicId: string, storyId: string) {
      await db.insert(schema.storyCreativeBriefs).values({
        id: briefId,
        topicId,
        storyId,
        ...BRIEF_BASE,
      });
    }

    async function insertDraft(
      draftId: string,
      topicId: string,
      storyId: string,
      briefId: string,
      overrides: Partial<typeof schema.creativeDrafts.$inferInsert> = {},
    ) {
      await db.insert(schema.creativeDrafts).values({
        id: draftId,
        topicId,
        storyId,
        briefId,
        format: "meme",
        outputAspectRatio: "4:5",
        status: "draft",
        concept: "concept",
        caption: "caption",
        altText: "alt",
        provider: "test",
        model: "test-model",
        promptVersion: "v1",
        inputHash: `hash-${draftId}`,
        aiSnapshot: {},
        updatedAt: IN_PERIOD,
        ...overrides,
      });
    }

    async function insertBatch(
      batchId: string,
      draftId: string,
      overrides: Partial<typeof schema.creativeAssetBatches.$inferInsert> = {},
    ) {
      await db.insert(schema.creativeAssetBatches).values({
        id: batchId,
        draftId,
        draftVersion: 1,
        ...BATCH_BASE,
        ...overrides,
      });
    }

    async function insertAsset(
      assetId: string,
      batchId: string,
      overrides: Partial<typeof schema.creativeAssets.$inferInsert> = {},
    ) {
      await db.insert(schema.creativeAssets).values({
        id: assetId,
        batchId,
        ...ASSET_BASE,
        ...overrides,
      });
    }

    async function insertJob(
      jobId: string,
      topicId: string,
      storyId: string,
      draftId: string,
      batchId: string,
      packageId: string,
      overrides: Partial<typeof schema.instagramPublicationJobs.$inferInsert> = {},
    ) {
      await db.insert(schema.instagramPublicationJobs).values({
        id: jobId,
        topicId,
        storyId,
        draftId,
        batchId,
        packageId,
        idempotencyKey: `idem-${jobId}`,
        connectionVersion: "conn-1",
        apiVersion: "v21.0",
        updatedAt: IN_PERIOD,
        ...overrides,
      });
    }

    async function insertPackage(
      packageId: string,
      topicId: string,
      storyId: string,
      draftId: string,
      batchId: string,
      overrides: Partial<typeof schema.instagramPublicationPackages.$inferInsert> = {},
    ) {
      await db.insert(schema.instagramPublicationPackages).values({
        id: packageId,
        topicId,
        storyId,
        draftId,
        draftVersion: 1,
        batchId,
        candidateSnapshotHash: `snap-${packageId}`,
        packageHash: `pkg-${packageId}`,
        mediaType: "image",
        caption: "caption",
        connectionVersion: "conn-1",
        scriptSnapshot: {},
        transforms: [],
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        ...overrides,
      });
    }

    // --- Topic A: the busy topic --------------------------------------

    // S1: an already-published story with a brand-new, unpublished revision.
    // Regression for "a new revision of a published story must stay in
    // production, and 'ready/published' must not come from approval alone."
    await insertStory(id(101), "Story S1");
    await insertTopicStory(id(101), topicA.id, { processingStatus: "selected" });
    await insertBrief(id(111), topicA.id, id(101));
    await insertDraft(id(121), topicA.id, id(101), id(111), { status: "approved", approvedAt: IN_PERIOD });
    await insertBatch(id(131), id(121));
    await insertPackage(id(141), topicA.id, id(101), id(121), id(131), { status: "consumed" });
    await insertJob(id(151), topicA.id, id(101), id(121), id(131), id(141), {
      status: "published",
      publishedMediaId: "media-1",
      permalink: "https://instagram.com/p/s1",
      finishedAt: new Date("2026-09-05T00:00:00.000Z"),
      updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    await insertDraft(id(122), topicA.id, id(101), id(111), {
      status: "draft",
      version: 2,
      updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    });

    // S2: a draft whose images are all generated but not yet approved.
    await insertStory(id(102), "Story S2");
    await insertTopicStory(id(102), topicA.id);
    await insertBrief(id(112), topicA.id, id(102));
    await insertDraft(id(123), topicA.id, id(102), id(112), {
      status: "approved",
      approvedAt: IN_PERIOD,
      updatedAt: new Date("2026-09-07T00:00:00.000Z"),
    });
    await insertBatch(id(132), id(123), { status: "completed" });
    await insertAsset(id(135), id(132), {
      status: "generated",
      imageUrl: "https://fal.example.test/cover.png",
    });

    // S3: a draft with an editorial blocker (failed/blocked edit request).
    await insertStory(id(103), "Story S3");
    await insertTopicStory(id(103), topicA.id);
    await insertBrief(id(113), topicA.id, id(103));
    await insertDraft(id(124), topicA.id, id(103), id(113), {
      status: "approved",
      approvedAt: IN_PERIOD,
    });
    await db.insert(schema.creativeAssetEditRequests).values({
      id: id(161),
      topicId: topicA.id,
      draftId: id(124),
      unitOrder: 1,
      baseVersion: 1,
      status: "failed",
      blockedReason: "Provider rejected the reference image",
      updatedAt: new Date("2026-09-02T00:00:00.000Z"),
    });

    // S4: an uncertain delivery — Instagram's result is not confirmed yet.
    await insertStory(id(104), "Story S4");
    await insertTopicStory(id(104), topicA.id);
    await insertBrief(id(114), topicA.id, id(104));
    await insertDraft(id(125), topicA.id, id(104), id(114), { status: "approved", approvedAt: IN_PERIOD });
    await insertBatch(id(133), id(125));
    await insertPackage(id(142), topicA.id, id(104), id(125), id(133), { status: "consumed" });
    await insertJob(id(152), topicA.id, id(104), id(125), id(133), id(142), {
      status: "pending-confirmation",
      updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    });

    // S5: two destinations for one piece — a confirmed Instagram job and a
    // manually logged LinkedIn post.
    await insertStory(id(105), "Story S5");
    await insertTopicStory(id(105), topicA.id);
    await insertBrief(id(115), topicA.id, id(105));
    await insertDraft(id(126), topicA.id, id(105), id(115), { status: "approved", approvedAt: IN_PERIOD });
    await insertBatch(id(134), id(126));
    await insertPackage(id(143), topicA.id, id(105), id(126), id(134), { status: "consumed" });
    await insertJob(id(153), topicA.id, id(105), id(126), id(134), id(143), {
      status: "published",
      publishedMediaId: "media-2",
      permalink: "https://instagram.com/p/s5",
      finishedAt: new Date("2026-09-07T00:00:00.000Z"),
      updatedAt: new Date("2026-09-07T00:00:00.000Z"),
    });
    await db.insert(schema.storySocialPublications).values({
      id: id(171),
      topicId: topicA.id,
      storyId: id(105),
      platform: "linkedin",
      status: "published",
      publishedAt: new Date("2026-09-07T01:00:00.000Z"),
      updatedAt: new Date("2026-09-07T01:00:00.000Z"),
    });

    // S6 / S7: the editorial shortlist must rank by editorial score, not by
    // the pre-AI relevance score.
    await insertStory(id(106), "Story S6 (low relevance, high editorial score)");
    await insertTopicStory(id(106), topicA.id, { relevanceScore: 10 });
    await db.insert(schema.storyEditorialEvaluations).values({
      id: id(181),
      runId: id(191),
      topicId: topicA.id,
      storyId: id(106),
      provider: "test",
      model: "test-model",
      promptVersion: "v1",
      inputHash: "hash-6",
      editorialScore: 95,
      canadaRelevance: 50,
      aiRelevance: 50,
      socialPotential: 50,
      novelty: 50,
      decision: "shortlist",
      reason: "Strong angle",
      evaluatedAt: IN_PERIOD,
    });

    await insertStory(id(107), "Story S7 (high relevance, low editorial score)");
    await insertTopicStory(id(107), topicA.id, { relevanceScore: 99 });
    await db.insert(schema.storyEditorialEvaluations).values({
      id: id(182),
      runId: id(191),
      topicId: topicA.id,
      storyId: id(107),
      provider: "test",
      model: "test-model",
      promptVersion: "v1",
      inputHash: "hash-7",
      editorialScore: 40,
      canadaRelevance: 50,
      aiRelevance: 50,
      socialPotential: 50,
      novelty: 50,
      decision: "shortlist",
      reason: "Weaker angle",
      evaluatedAt: IN_PERIOD,
    });

    // S_ready: an approved draft with a frozen, delivery-ready package and no
    // job yet — "ready" on its own, without ever being "published".
    await insertStory(id(108), "Story S_ready");
    await insertTopicStory(id(108), topicA.id, {
      firstSeenAt: OUT_OF_PERIOD,
      lastSeenAt: OUT_OF_PERIOD,
    });
    await insertBrief(id(118), topicA.id, id(108));
    await insertDraft(id(128), topicA.id, id(108), id(118), {
      status: "approved",
      approvedAt: IN_PERIOD,
    });
    await insertBatch(id(138), id(128));
    await insertPackage(id(148), topicA.id, id(108), id(128), id(138));

    // S13: a single draft ROW whose version 1 was published, then bumped to
    // version 2 in place (a revision keeps the same draftId; this is exactly
    // what the schema's optimistic-concurrency `version` column models).
    // Version 2 has no batch yet and is not approved. The "already
    // delivered" checks must key on (draftId, version), not draftId alone,
    // or this brand-new, undelivered revision would look finished forever.
    await insertStory(id(109), "Story S13 (revised after publishing)");
    await insertTopicStory(id(109), topicA.id, {
      firstSeenAt: OUT_OF_PERIOD,
      lastSeenAt: OUT_OF_PERIOD,
    });
    await insertBrief(id(119), topicA.id, id(109));
    await insertDraft(id(129), topicA.id, id(109), id(119), {
      status: "approved",
      approvedAt: OUT_OF_PERIOD,
      version: 1,
    });
    await insertBatch(id(139), id(129), { draftVersion: 1, status: "completed" });
    await insertAsset(id(159), id(139), { status: "approved" });
    await insertPackage(id(149), topicA.id, id(109), id(129), id(139), {
      draftVersion: 1,
      status: "consumed",
    });
    await insertJob(id(169), topicA.id, id(109), id(129), id(139), id(149), {
      status: "published",
      publishedMediaId: "media-13",
      permalink: "https://instagram.com/p/s13",
      finishedAt: OUT_OF_PERIOD,
      updatedAt: OUT_OF_PERIOD,
    });
    // The revision: same row, version bumped, back to unapproved, no batch.
    await db
      .update(schema.creativeDrafts)
      .set({ status: "draft", version: 2, updatedAt: new Date("2026-09-09T00:00:00.000Z") })
      .where(eq(schema.creativeDrafts.id, id(129)));

    // S14: the one slide failed once, then a regeneration succeeded — same
    // batch, same unitOrder, a newer asset version. The old failure must not
    // keep blocking the piece once it has been superseded.
    await insertStory(id(110), "Story S14 (failed slide, then regenerated)");
    await insertTopicStory(id(110), topicA.id, {
      firstSeenAt: OUT_OF_PERIOD,
      lastSeenAt: OUT_OF_PERIOD,
    });
    await insertBrief(id(300), topicA.id, id(110));
    await insertDraft(id(301), topicA.id, id(110), id(300), {
      status: "approved",
      approvedAt: OUT_OF_PERIOD,
      version: 1,
    });
    await insertBatch(id(302), id(301), { draftVersion: 1, status: "completed", totalAssets: 1 });
    await insertAsset(id(303), id(302), { unitOrder: 1, version: 1, status: "failed" });
    await insertAsset(id(304), id(302), { unitOrder: 1, version: 2, status: "approved" });

    // S15: an older, still-valid COMPLETED batch, and a newer STALE one for
    // the same version (e.g. a policy change invalidated a regeneration
    // attempt). The stale batch must not win just for being more recent.
    await insertStory(id(111), "Story S15 (stale newer batch, valid older one)");
    await insertTopicStory(id(111), topicA.id, {
      firstSeenAt: OUT_OF_PERIOD,
      lastSeenAt: OUT_OF_PERIOD,
    });
    await insertBrief(id(310), topicA.id, id(111));
    await insertDraft(id(311), topicA.id, id(111), id(310), {
      status: "approved",
      approvedAt: OUT_OF_PERIOD,
      version: 1,
    });
    await insertBatch(id(312), id(311), {
      draftVersion: 1,
      status: "completed",
      totalAssets: 1,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    await insertAsset(id(313), id(312), { unitOrder: 1, version: 1, status: "approved" });
    await insertBatch(id(314), id(311), {
      draftVersion: 1,
      status: "stale",
      totalAssets: 1,
      createdAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    await insertAsset(id(315), id(314), { unitOrder: 1, version: 1, status: "generated" });

    // S16: a frozen package that has already expired. Publishing rejects an
    // expired package (see publish-publication-package.core.ts), so it is
    // not "ready to publish" here either — it needs to be re-frozen.
    await insertStory(id(112), "Story S16 (expired frozen package)");
    await insertTopicStory(id(112), topicA.id, {
      firstSeenAt: OUT_OF_PERIOD,
      lastSeenAt: OUT_OF_PERIOD,
    });
    await insertBrief(id(320), topicA.id, id(112));
    await insertDraft(id(321), topicA.id, id(112), id(320), {
      status: "approved",
      approvedAt: OUT_OF_PERIOD,
      version: 1,
    });
    await insertBatch(id(322), id(321), { draftVersion: 1, status: "completed", totalAssets: 1 });
    await insertAsset(id(323), id(322), { unitOrder: 1, version: 1, status: "approved" });
    await insertPackage(id(324), topicA.id, id(112), id(321), id(322), {
      draftVersion: 1,
      status: "frozen",
      expiresAt: new Date("2026-09-05T00:00:00.000Z"), // before NOW (2026-09-10)
    });

    // S8..S11: older, failed Instagram sends — enough attention-worthy
    // entities to push the total above the five shown, outside the new-story
    // window so they do not affect `newStories`.
    const oldFailedStoryIds = [108, 109, 110, 111].map((n) => id(n + 1000));
    for (const [index, storyId] of oldFailedStoryIds.entries()) {
      const n = 200 + index * 10; // each iteration claims a disjoint id range
      await insertStory(storyId, `Story S${8 + index}`);
      await insertTopicStory(storyId, topicA.id, {
        firstSeenAt: OUT_OF_PERIOD,
        lastSeenAt: OUT_OF_PERIOD,
      });
      await insertBrief(id(n), topicA.id, storyId);
      const draftId = id(n + 1);
      await insertDraft(draftId, topicA.id, storyId, id(n), { status: "approved", approvedAt: OUT_OF_PERIOD });
      const batchId = id(n + 2);
      await insertBatch(batchId, draftId);
      const packageId = id(n + 3);
      await insertPackage(packageId, topicA.id, storyId, draftId, batchId, { status: "consumed" });
      await insertJob(id(n + 4), topicA.id, storyId, draftId, batchId, packageId, {
        status: "failed",
        failureKind: "permission",
        updatedAt: new Date(`2026-08-0${index + 1}T00:00:00.000Z`),
      });
    }

    // Source health + AI research + collection run.
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.topicSources).values({
        id: id(300 + i),
        workspaceId: topicA.workspaceId,
        topicId: topicA.id,
        rssSourceId: id(400 + i),
        enabled: i < 2,
      });
    }
    await db.insert(schema.aiResearchSources).values({ topicId: topicA.id, enabled: true });
    await db.insert(schema.collectionRuns).values({
      id: id(500),
      topicId: topicA.id,
      status: "partial",
      startedAt: new Date("2026-09-09T00:00:00.000Z"),
      finishedAt: new Date("2026-09-09T00:05:00.000Z"),
      requestedSources: 3,
      successfulSources: 2,
      failedSources: 1,
      fetchedItems: 10,
      includedItems: 10,
      filteredOutItems: 0,
      duplicatesRemoved: 0,
    });

    // Instagram connection capable of publishing and reading insights.
    await db.insert(schema.topicMetaConnections).values({
      topicId: topicA.id,
      igUsername: "pressbot",
      accessTokenEncrypted: "encrypted",
      connectedAt: new Date("2026-01-01T00:00:00.000Z"),
      connectionVersion: "conn-1",
      grantedPermissions: [
        "instagram_business_content_publish",
        "instagram_business_manage_insights",
      ],
      lastMediaSyncAt: new Date("2026-09-09T00:00:00.000Z"),
    });

    // --- Topic B: an independent topic, to prove isolation -------------

    await insertStory(id(901), "Topic B story");
    await insertTopicStory(id(901), topicB.id, { firstSeenAt: IN_PERIOD, lastSeenAt: IN_PERIOD });

    // === Assertions ======================================================

    const overviewA = plain(await getTopicOverview(topicA, 30, NOW));

    // Fixtures: counters match what their own lists contain.
    assert.equal(overviewA.metrics.newStories.value, 7, "S1..S7 linked in period");
    assert.equal(
      overviewA.metrics.inProduction.value,
      13,
      "S1 (via the new draft), S2, S3, S4, S_ready, S13's new revision, S14, S15, S16, and S8..S11 (their sends failed, so they are not delivered either)",
    );
    assert.equal(overviewA.metrics.published.value, 2, "J1 (S1) and J3 (S5) confirmed in period");
    assert.deepEqual(overviewA.metrics.published.breakdown, [
      { label: "instagram", value: 2 },
    ]);

    // Attention: total reflects every actionable entity; only five are shown.
    assert.equal(overviewA.attention.data.total, 7);
    assert.equal(overviewA.attention.data.items.length, 5);
    const attentionStoryIds = overviewA.attention.data.items.map((item) => item.storyId);
    assert.ok(attentionStoryIds.includes(id(104)), "the uncertain delivery (S4) is surfaced");
    assert.ok(
      overviewA.attention.data.items.some((item) => item.severity === "uncertain-delivery"),
    );
    assert.ok(
      overviewA.attention.data.items.some((item) => item.severity === "delivery-failure"),
    );
    // S3's blocker and S2's pending-approval rank below the four failed sends
    // plus the one uncertain delivery, so they are not in the visible five —
    // but they still count toward `total` above.
    assert.ok(!attentionStoryIds.includes(id(103)));
    assert.ok(!attentionStoryIds.includes(id(102)));
    // S14's slide failed once but a regeneration then succeeded (same
    // batch, same unitOrder, a newer asset version) — the superseded failure
    // must not still block it. `total` staying at 7 (not 8) proves it.
    assert.ok(!attentionStoryIds.includes(id(110)));

    // Production: the new revision of S1 is continuable; the blocked draft of
    // S3 is not (it belongs to the attention queue instead).
    assert.equal(
      overviewA.production.data.readyOrPublished,
      4,
      "S1, S5 and S13 have confirmed deliveries (S13's, from before its new revision); " +
        "S_ready has a frozen, non-expired package and no job yet; " +
        "S16's package is frozen but already expired, so it does NOT count (would be 5 if expiry were ignored)",
    );
    const continuableDraftIds = overviewA.production.data.continuable.map((piece) => piece.draftId);
    assert.ok(continuableDraftIds.includes(id(122)), "S1's new revision is continuable");
    assert.ok(continuableDraftIds.includes(id(123)), "S2's approved draft with unreviewed images is continuable");
    assert.ok(!continuableDraftIds.includes(id(124)), "S3's blocked draft is excluded");

    // S13: same draftId as the one that was published at version 1 — now at
    // version 2 with no batch. It must NOT be treated as already delivered.
    const s13Piece = overviewA.production.data.continuable.find(
      (p) => p.draftId === id(129),
    );
    assert.ok(s13Piece, "a new revision of a previously-published draft stays continuable");
    assert.equal(s13Piece?.version, 2);
    assert.equal(s13Piece?.nextStep, "Approve the draft");

    // S2: draft text is approved and its current-version batch finished
    // generating, but the image itself is not yet approved — the next step
    // is reviewing the image, never freezing a package sight-unseen.
    const s2Piece = overviewA.production.data.continuable.find((p) => p.draftId === id(123));
    assert.equal(s2Piece?.nextStep, "Review and approve the images");
    assert.equal(s2Piece?.thumbnailUrl, "https://fal.example.test/cover.png");

    // S1's new revision has draft text that is not yet approved — generating
    // images requires approval first, so the next step is approving the
    // draft, never "generate images" or anything past it.
    const s1NewRevisionPiece = overviewA.production.data.continuable.find(
      (p) => p.draftId === id(122),
    );
    assert.equal(s1NewRevisionPiece?.nextStep, "Approve the draft");
    assert.equal(
      s1NewRevisionPiece?.thumbnailUrl,
      null,
      "a draft with no batch yet falls back to the neutral placeholder, not a fabricated image",
    );
    // Only S2's one unreviewed slide counts. S15's older, valid COMPLETED
    // batch correctly wins over its newer STALE one, whose own (unreviewed)
    // asset must not be added — this would be 2 if the stale batch won
    // instead. S14's regenerated slide is fully approved, so it adds nothing
    // either.
    assert.equal(overviewA.production.data.imagesToReview, 1);

    // Candidates: ranked by editorial score, not by the pre-AI relevance
    // score (S6 has editorialScore 95 but relevanceScore 10; S7 is the
    // opposite) — this is the OVW-01 ranking fix under direct regression test.
    const candidateIds = overviewA.candidates.data.map((c) => c.storyId);
    const s6Index = candidateIds.indexOf(id(106));
    const s7Index = candidateIds.indexOf(id(107));
    assert.ok(s6Index !== -1 && s7Index !== -1);
    assert.ok(s6Index < s7Index, "S6 (editorial score 95) outranks S7 (editorial score 40)");

    // Publications: both destinations for S5 are visible, with the correct,
    // distinct delivery states — and total counts everything, not just what
    // is shown.
    assert.equal(overviewA.publications.data.total, 9, "8 jobs + 1 manual log entry");
    assert.equal(overviewA.publications.data.recent.length, 5);
    const s5Deliveries = overviewA.publications.data.recent.filter(
      (d) => d.storyId === id(105),
    );
    assert.equal(s5Deliveries.length, 2, "S5's Instagram job and LinkedIn log both appear");
    assert.ok(s5Deliveries.some((d) => d.state === "confirmed" && d.platform === "instagram"));
    assert.ok(s5Deliveries.some((d) => d.state === "logged" && d.platform === "linkedin"));
    const s4Delivery = overviewA.publications.data.recent.find((d) => d.storyId === id(104));
    assert.equal(s4Delivery?.state, "uncertain");

    // Health: disjoint counts, including the last run's split.
    assert.equal(overviewA.health.data.configured, 3);
    assert.equal(overviewA.health.data.enabled, 2);
    assert.equal(overviewA.health.data.disabledOrUnknown, 1);
    assert.equal(overviewA.health.data.lastSuccessfulSources, 2);
    assert.equal(overviewA.health.data.lastFailedSources, 1);
    assert.equal(overviewA.health.data.lastCollectionStatus, "partial");
    assert.equal(overviewA.health.data.aiResearchEnabled, true);

    // Capabilities: connection vs. publish vs. insights permission.
    assert.equal(overviewA.capabilities.instagram.connected, true);
    assert.equal(overviewA.capabilities.instagram.canPublish, true);
    assert.equal(overviewA.capabilities.instagram.canReadInsights, true);
    assert.equal(overviewA.capabilities.instagram.username, "pressbot");
    assert.equal(overviewA.capabilities.facebook.available, false);
    assert.equal(overviewA.capabilities.scheduling.available, false);

    // Activity: bounded, with stable identities (no duplicates).
    assert.ok(overviewA.activity.data.length <= 8);
    const activityIds = overviewA.activity.data.map((e) => e.id);
    assert.equal(new Set(activityIds).size, activityIds.length);

    // --- Isolation: topic B never sees topic A's data, and vice versa ----

    const overviewB = plain(await getTopicOverview(topicB, 30, NOW));
    assert.equal(overviewB.metrics.newStories.value, 1);
    assert.equal(overviewB.metrics.inProduction.value, 0);
    assert.equal(overviewB.attention.data.total, 0);
    assert.equal(overviewB.production.data.continuable.length, 0);
    assert.equal(overviewB.publications.data.total, 0);
    assert.equal(overviewB.health.data.configured, 0);
    assert.equal(overviewB.capabilities.instagram.connected, false);

    // --- An empty topic: no rows anywhere, nothing is invented ----------

    const overviewEmpty = plain(await getTopicOverview(topicEmpty, 30, NOW));
    assert.equal(overviewEmpty.metrics.newStories.value, 0);
    assert.equal(overviewEmpty.metrics.inProduction.value, 0);
    assert.equal(overviewEmpty.metrics.published.value, 0);
    assert.equal(overviewEmpty.metrics.published.breakdown, undefined);
    assert.equal(overviewEmpty.candidates.status, "empty");
    assert.deepEqual(overviewEmpty.candidates.data, []);
    assert.equal(overviewEmpty.attention.status, "empty");
    assert.equal(overviewEmpty.attention.data.total, 0);
    assert.deepEqual(overviewEmpty.production.data, {
      selectedStories: 0,
      briefs: 0,
      draftsInReview: 0,
      imagesToReview: 0,
      readyOrPublished: 0,
      continuable: [],
    });
    assert.equal(overviewEmpty.publications.status, "empty");
    assert.equal(overviewEmpty.health.status, "empty");
    assert.equal(overviewEmpty.activity.status, "empty");
    assert.equal(overviewEmpty.capabilities.instagram.connected, false);
  } finally {
    await client.close();
  }
});
