import "server-only";

import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  aiResearchSources,
  collectionRuns,
  creativeAssetBatches,
  creativeAssetEditRequests,
  creativeAssets,
  creativeDrafts,
  instagramPublicationJobs,
  instagramPublicationPackages,
  stories,
  storyCreativeBriefs,
  storyEditorialEvaluations,
  storySocialPublications,
  storySources,
  topicMetaConnections,
  topicSources,
  topicStories,
} from "@/db/schema";
import type { Topic } from "@/db/schema";

import {
  ageInHours,
  bucketiseSourceHealth,
  describeDeliveryState,
  describeJobIncident,
  metricValue,
  rankAttentionItems,
  resolveOverviewPeriod,
  resolveScoreState,
  type OverviewPeriodDays,
} from "./topic-overview.logic";
import type {
  OverviewActivityEvent,
  OverviewAttention,
  OverviewAttentionItem,
  OverviewCandidate,
  OverviewCapabilities,
  OverviewDelivery,
  OverviewMetrics,
  OverviewProduction,
  OverviewProductionPiece,
  OverviewSection,
  OverviewSourceHealth,
  TopicOverviewDto,
} from "./topic-overview.types";

/**
 * Instagram publication-job states that always warrant editor attention: a
 * safe failure, a suspended send, or a send whose outcome is still uncertain.
 */
const ATTENTION_JOB_STATES = [
  "failed",
  "suspended",
  "pending-confirmation",
] as const;

/** Edit-request states that block a draft from moving forward (IMG-01+). */
const BLOCKED_EDIT_REQUEST_STATES = ["failed"] as const;

const CANDIDATE_LIMIT = 5;
const PUBLICATION_LIMIT = 5;
const ACTIVITY_LIMIT = 8;

const INSIGHTS_SCOPES = [
  "instagram_business_manage_insights",
  "instagram_manage_insights",
];

const PUBLISH_SCOPES = [
  "instagram_business_content_publish",
  "instagram_content_publish",
];

/**
 * Wraps a failed section read. The raw error is logged server-side only — the
 * browser gets a fixed message so a Drizzle/Postgres failure never leaks SQL,
 * bind parameters, or connection detail.
 */
function errorSection<T>(
  data: T,
  error: unknown,
  section: string,
): OverviewSection<T> {
  console.error(`Topic overview section "${section}" failed`, error);

  return {
    status: "error",
    asOf: null,
    reason: "This section could not be read",
    data,
  };
}

/**
 * One authenticated read of everything the Topic Overview shows for a topic in
 * a period. The topic must already be authorized by the caller.
 *
 * Each section is resolved independently so a single failing query degrades to
 * a localized "error" state instead of blanking the page, and an unknown
 * counter stays `null` ("—") rather than collapsing to `0`. Nothing here calls
 * an external provider, AI, or a collector — opening the Overview only reads
 * the app's own tables.
 */
export async function getTopicOverview(
  topic: Topic,
  period: OverviewPeriodDays,
  now: Date = new Date(),
): Promise<TopicOverviewDto> {
  const topicId = topic.id;
  const { days, since, until } = resolveOverviewPeriod(period, now);
  const generatedAt = now.toISOString();

  // Shared by readAttention and readProduction, which both run in the
  // Promise.all below — computed once so each underlying query runs once per
  // Overview load instead of twice.
  const currentBatchInfo = readCurrentBatchInfo(topicId);
  const blockedDraftInfo = readBlockedDraftInfo(topicId, currentBatchInfo);

  const [
    partialMetrics,
    candidates,
    attention,
    production,
    publications,
    health,
    activity,
    capabilities,
  ] = await Promise.all([
    readMetrics(topicId, since, until).catch(
      (error): PartialMetrics => {
        console.error('Topic overview section "metrics" failed', error);
        return {
          newStories: { value: null, scope: "period" },
          inProduction: { value: null, scope: "now" },
          published: { value: null, scope: "period" },
        };
      },
    ),
    readCandidates(topicId, now).catch((error) =>
      errorSection<OverviewCandidate[]>([], error, "candidates"),
    ),
    readAttention(topicId, now, blockedDraftInfo, currentBatchInfo).catch((error) =>
      errorSection<OverviewAttention>({ total: 0, items: [] }, error, "attention"),
    ),
    readProduction(topicId, now, blockedDraftInfo, currentBatchInfo).catch((error) =>
      errorSection<OverviewProduction>(
        {
          selectedStories: 0,
          briefs: 0,
          draftsInReview: 0,
          imagesToReview: 0,
          readyOrPublished: 0,
          continuable: [],
        },
        error,
        "production",
      ),
    ),
    readPublications(topicId).catch((error) =>
      errorSection<{ total: number; recent: OverviewDelivery[] }>(
        { total: 0, recent: [] },
        error,
        "publications",
      ),
    ),
    readHealth(topicId).catch((error) =>
      errorSection<OverviewSourceHealth>(
        {
          configured: 0,
          enabled: 0,
          disabledOrUnknown: 0,
          aiResearchEnabled: false,
          lastCollectionAt: null,
          lastCollectionStatus: null,
          lastSuccessfulSources: null,
          lastFailedSources: null,
        },
        error,
        "health",
      ),
    ),
    readActivity(topicId).catch((error) =>
      errorSection<OverviewActivityEvent[]>([], error, "activity"),
    ),
    readCapabilities(topicId, now).catch(
      (error): OverviewCapabilities => {
        console.error('Topic overview section "capabilities" failed', error);
        return {
          instagram: {
            connected: false,
            canPublish: false,
            canReadInsights: false,
            username: null,
            lastActivityAt: null,
          },
          facebook: {
            available: false,
            reason: "The Facebook connector is not implemented yet",
          },
          scheduling: {
            available: false,
            reason: "Durable scheduling (PUB-05) is not available yet",
          },
        };
      },
    ),
  ]);

  // "Needs attention" is the same set the attention section counts, so it is
  // derived from that section rather than queried twice — and it stays `null`
  // ("—", unknown) when that read failed, never a misleading `0`.
  const metrics: OverviewMetrics = {
    ...partialMetrics,
    needsAttention: {
      value:
        attention.status === "error"
          ? null
          : metricValue(attention.data.total),
      scope: "now",
    },
  };

  return {
    context: {
      topicId,
      name: topic.name,
      description: topic.description ?? null,
      themeKey: topic.themeKey,
      timezone: "UTC",
      generatedAt,
      period: {
        days,
        since: since.toISOString(),
        until: until.toISOString(),
      },
    },
    metrics,
    candidates,
    attention,
    production,
    publications,
    health,
    activity,
    capabilities,
  };
}

/** Everything in {@link OverviewMetrics} except `needsAttention`, which is
 * derived from the attention section so its query runs only once. */
type PartialMetrics = Omit<OverviewMetrics, "needsAttention">;

async function readMetrics(
  topicId: string,
  since: Date,
  until: Date,
): Promise<PartialMetrics> {
  const [[newStoriesRow], [inProductionRow], publishedRows] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(topicStories)
        .where(
          and(
            eq(topicStories.topicId, topicId),
            gte(topicStories.firstSeenAt, since),
            lt(topicStories.firstSeenAt, until),
          ),
        ),
      // Distinct stories with a creative revision that has NOT itself been
      // delivered. Checked against the draft's CURRENT version (via the
      // publishing job's batch), not just its id — a revision bumps
      // `creativeDrafts.version` in place rather than creating a new row, so
      // matching by id alone would keep calling a brand-new, undelivered
      // revision "already published" forever.
      db
        .select({ value: countDistinct(creativeDrafts.storyId) })
        .from(creativeDrafts)
        .where(
          and(
            eq(creativeDrafts.topicId, topicId),
            notExists(
              db
                .select({ one: sql`1` })
                .from(instagramPublicationJobs)
                .innerJoin(
                  creativeAssetBatches,
                  eq(
                    creativeAssetBatches.id,
                    instagramPublicationJobs.batchId,
                  ),
                )
                .where(
                  and(
                    eq(
                      instagramPublicationJobs.draftId,
                      creativeDrafts.id,
                    ),
                    eq(instagramPublicationJobs.status, "published"),
                    eq(
                      creativeAssetBatches.draftVersion,
                      creativeDrafts.version,
                    ),
                  ),
                ),
            ),
          ),
        ),
      // Confirmed remote deliveries in the period. Instagram publication jobs
      // are the only durable, provider-confirmed delivery record; the manual
      // `story_social_publications` log is editorial tracking, not proof of a
      // send, so it is deliberately not counted here. Each job row is one
      // delivery, so a story sent twice counts twice.
      db
        .select({ value: count() })
        .from(instagramPublicationJobs)
        .where(
          and(
            eq(instagramPublicationJobs.topicId, topicId),
            eq(instagramPublicationJobs.status, "published"),
            gte(instagramPublicationJobs.finishedAt, since),
            lt(instagramPublicationJobs.finishedAt, until),
          ),
        ),
    ]);

  const publishedTotal = Number(publishedRows[0]?.value ?? 0);

  return {
    newStories: {
      value: metricValue(Number(newStoriesRow?.value ?? 0)),
      scope: "period",
    },
    inProduction: {
      value: metricValue(Number(inProductionRow?.value ?? 0)),
      scope: "now",
    },
    published: {
      value: metricValue(publishedTotal),
      scope: "period",
      ...(publishedTotal > 0
        ? { breakdown: [{ label: "instagram", value: publishedTotal }] }
        : {}),
    },
  };
}

async function readCandidates(
  topicId: string,
  now: Date,
): Promise<OverviewSection<OverviewCandidate[]>> {
  // The shortlist is ranked by the editorial evaluation that is actually
  // shown — `editorialPriority` (falling back to `editorialScore`) — not by
  // the pre-AI `topicStories.relevanceScore`, so a story with a stronger
  // editorial evaluation is never dropped before the limit. The latest
  // evaluation per story wins.
  const latestEvaluation = db
    .selectDistinctOn([storyEditorialEvaluations.storyId], {
      storyId: storyEditorialEvaluations.storyId,
      editorialScore: storyEditorialEvaluations.editorialScore,
      editorialPriority: storyEditorialEvaluations.editorialPriority,
      evaluatedAt: storyEditorialEvaluations.evaluatedAt,
      decision: storyEditorialEvaluations.decision,
    })
    .from(storyEditorialEvaluations)
    .where(eq(storyEditorialEvaluations.topicId, topicId))
    .orderBy(
      storyEditorialEvaluations.storyId,
      desc(storyEditorialEvaluations.evaluatedAt),
    )
    .as("latest_evaluation");

  const rankKey = sql<number>`coalesce(${latestEvaluation.editorialPriority}, ${latestEvaluation.editorialScore})`;

  const rows = await db
    .select({
      storyId: latestEvaluation.storyId,
      title: stories.title,
      linkedAt: topicStories.firstSeenAt,
      lastSeenAt: topicStories.lastSeenAt,
      editorialScore: latestEvaluation.editorialScore,
      editorialPriority: latestEvaluation.editorialPriority,
      evaluatedAt: latestEvaluation.evaluatedAt,
    })
    .from(latestEvaluation)
    .innerJoin(
      topicStories,
      and(
        eq(topicStories.storyId, latestEvaluation.storyId),
        eq(topicStories.topicId, topicId),
      ),
    )
    .innerJoin(stories, eq(stories.id, latestEvaluation.storyId))
    .where(
      and(
        eq(latestEvaluation.decision, "shortlist"),
        notInArray(topicStories.processingStatus, ["rejected", "published"]),
        or(
          isNull(topicStories.duplicateOfStoryId),
          isNotNull(topicStories.duplicateOverriddenAt),
        ),
      ),
    )
    .orderBy(
      desc(rankKey),
      desc(topicStories.firstSeenAt),
      topicStories.storyId,
    )
    .limit(CANDIDATE_LIMIT);

  if (rows.length === 0) {
    // NB: eligible stories that have never been editorially evaluated are not
    // surfaced here yet — OVW-07 decides whether to append an "unevaluated"
    // tail. For now the shortlist is exactly the evaluated shortlist.
    return { status: "empty", asOf: null, data: [] };
  }

  const storyIds = rows.map((row) => row.storyId);

  const sourceRows = await db
    .select({
      storyId: storySources.storyId,
      sourceName: storySources.sourceName,
    })
    .from(storySources)
    .where(inArray(storySources.storyId, storyIds));

  const sourceByStory = new Map<string, string>();
  for (const row of sourceRows) {
    if (!sourceByStory.has(row.storyId)) {
      sourceByStory.set(row.storyId, row.sourceName);
    }
  }

  const data: OverviewCandidate[] = rows.map((row) => ({
    storyId: row.storyId,
    title: row.title,
    source: sourceByStory.get(row.storyId) ?? null,
    linkedAt: row.linkedAt.toISOString(),
    ageHours: ageInHours(row.linkedAt, now),
    score: row.editorialPriority ?? row.editorialScore,
    scoreState: resolveScoreState(row.evaluatedAt, row.lastSeenAt),
  }));

  return {
    status: "ok",
    asOf: data
      .map((candidate) => candidate.linkedAt)
      .sort()
      .at(-1) ?? null,
    data,
  };
}

/**
 * Draft ids with an editorial blocker: a failed / blocked image-edit request,
 * or a failed generated asset. Shared by the attention queue (which surfaces
 * them) and the production pipeline (which must keep them out of the
 * "continue" list).
 */
type BlockedDraft = {
  reason: string;
  causes: number;
  storyId: string;
  title: string;
  updatedAt: Date;
};

async function readBlockedDraftInfo(
  topicId: string,
  currentBatchInfo: Promise<Map<string, CurrentBatchInfo>>,
): Promise<Map<string, BlockedDraft>> {
  const [editRows, batches] = await Promise.all([
    db
      .select({
        draftId: creativeAssetEditRequests.draftId,
        blockedReason: creativeAssetEditRequests.blockedReason,
        storyId: creativeDrafts.storyId,
        title: stories.title,
        updatedAt: creativeDrafts.updatedAt,
      })
      .from(creativeAssetEditRequests)
      .innerJoin(
        creativeDrafts,
        eq(creativeDrafts.id, creativeAssetEditRequests.draftId),
      )
      .innerJoin(stories, eq(stories.id, creativeDrafts.storyId))
      .where(
        and(
          eq(creativeAssetEditRequests.topicId, topicId),
          or(
            inArray(creativeAssetEditRequests.status, [
              ...BLOCKED_EDIT_REQUEST_STATES,
            ]),
            isNotNull(creativeAssetEditRequests.blockedReason),
          ),
        ),
      ),
    currentBatchInfo,
  ]);

  const blocked = new Map<string, BlockedDraft>();
  const bump = (
    row: { draftId: string; storyId: string; title: string; updatedAt: Date },
    reason: string,
  ) => {
    const existing = blocked.get(row.draftId);
    if (existing) {
      existing.causes += 1;
    } else {
      blocked.set(row.draftId, {
        reason,
        causes: 1,
        storyId: row.storyId,
        title: row.title,
        updatedAt: row.updatedAt,
      });
    }
  };

  for (const row of editRows) {
    bump(row, row.blockedReason ?? "An image edit request failed");
  }
  // Only the latest attempt at each slide in the CURRENT version's winning
  // batch counts (see readCurrentBatchInfo) — a failure a successful
  // regeneration already superseded must stop blocking the piece. One bump
  // per failed slide, so "+N more" still reflects how many are actually
  // failing right now.
  for (const [draftId, batch] of batches) {
    for (let i = 0; i < batch.failed; i += 1) {
      bump(
        {
          draftId,
          storyId: batch.storyId,
          title: batch.title,
          updatedAt: batch.updatedAt,
        },
        "A generated image failed and needs another pass",
      );
    }
  }

  return blocked;
}

/**
 * Per-draft state of the image batch generated for its CURRENT version —
 * shared by the attention queue (a completed, unapproved batch is "pending
 * approval"; a failed slide is a blocker) and the production pipeline (the
 * same facts decide the continuable next step and the "images to review"
 * count). Computed once so its query runs once per Overview load.
 *
 * Matched by version, not just draft id: `creativeDrafts.version` bumps on
 * the same row for a new revision rather than creating a new one, so a batch
 * from a superseded version must never be read as if it belonged to the
 * current one. Within that batch, a regenerated slide leaves its older
 * attempts as separate rows at the same `unitOrder` (see the
 * `creative_assets_batch_unit_version_unique` index) — only the latest
 * version of each slide counts, so a since-fixed failure or an
 * already-approved earlier pass never keeps inflating totals or blocking the
 * piece forever.
 */
type CurrentBatchInfo = {
  storyId: string;
  title: string;
  status: string;
  version: number;
  updatedAt: Date;
  batchStatus: string;
  total: number;
  approved: number;
  pendingGenerated: number;
  failed: number;
};

async function readCurrentBatchInfo(
  topicId: string,
): Promise<Map<string, CurrentBatchInfo>> {
  const rows = await db
    .select({
      draftId: creativeDrafts.id,
      storyId: creativeDrafts.storyId,
      title: stories.title,
      status: creativeDrafts.status,
      version: creativeDrafts.version,
      updatedAt: creativeDrafts.updatedAt,
      batchId: creativeAssetBatches.id,
      batchStatus: creativeAssetBatches.status,
      batchCreatedAt: creativeAssetBatches.createdAt,
      unitOrder: creativeAssets.unitOrder,
      assetVersion: creativeAssets.version,
      assetStatus: creativeAssets.status,
    })
    .from(creativeDrafts)
    .innerJoin(stories, eq(stories.id, creativeDrafts.storyId))
    .innerJoin(
      creativeAssetBatches,
      and(
        eq(creativeAssetBatches.draftId, creativeDrafts.id),
        eq(creativeAssetBatches.draftVersion, creativeDrafts.version),
      ),
    )
    .innerJoin(
      creativeAssets,
      eq(creativeAssets.batchId, creativeAssetBatches.id),
    )
    .where(eq(creativeDrafts.topicId, topicId));

  // Regeneration can leave more than one batch at the same version; only the
  // most recently created NON-STALE one counts — a stale batch never
  // supersedes a still-valid earlier one just for being newer.
  const winningBatch = new Map<
    string,
    { batchId: string; batchStatus: string; createdAt: Date }
  >();
  for (const row of rows) {
    if (row.batchStatus === "stale") continue;
    const existing = winningBatch.get(row.draftId);
    if (!existing || row.batchCreatedAt > existing.createdAt) {
      winningBatch.set(row.draftId, {
        batchId: row.batchId,
        batchStatus: row.batchStatus,
        createdAt: row.batchCreatedAt,
      });
    }
  }

  // Within the winning batch, keep only the latest version of each slide —
  // an older attempt at the same unitOrder (failed, or superseded by an
  // approved regeneration) must not still count.
  const latestAssetByUnit = new Map<
    string,
    Map<number, { version: number; status: string }>
  >();
  for (const row of rows) {
    const winner = winningBatch.get(row.draftId);
    if (!winner || winner.batchId !== row.batchId) continue; // superseded batch
    const units = latestAssetByUnit.get(row.draftId) ?? new Map();
    const existing = units.get(row.unitOrder);
    if (!existing || row.assetVersion > existing.version) {
      units.set(row.unitOrder, { version: row.assetVersion, status: row.assetStatus });
    }
    latestAssetByUnit.set(row.draftId, units);
  }

  const info = new Map<string, CurrentBatchInfo>();
  for (const row of rows) {
    const winner = winningBatch.get(row.draftId);
    if (!winner || winner.batchId !== row.batchId) continue;
    if (info.has(row.draftId)) continue; // draft-level fields set once below
    info.set(row.draftId, {
      storyId: row.storyId,
      title: row.title,
      status: row.status,
      version: row.version,
      updatedAt: row.updatedAt,
      batchStatus: winner.batchStatus,
      total: 0,
      approved: 0,
      pendingGenerated: 0,
      failed: 0,
    });
  }
  for (const [draftId, units] of latestAssetByUnit) {
    const entry = info.get(draftId);
    if (!entry) continue;
    for (const unit of units.values()) {
      entry.total += 1;
      if (unit.status === "approved") entry.approved += 1;
      if (unit.status === "generated") entry.pendingGenerated += 1;
      if (unit.status === "failed") entry.failed += 1;
    }
  }

  return info;
}

/**
 * The attention queue (OVW-03): at most five ranked items plus the real total.
 * Publishing incidents (a failed / suspended / uncertain Instagram send),
 * editorial blockers on a draft, and revisions whose assets are all generated
 * but not yet approved. One entry per piece — several blockers on one draft
 * collapse into a single row with a "+N more" count. Ranking (severity, then
 * oldest, then id) is done by the pure {@link rankAttentionItems}.
 */
async function readAttention(
  topicId: string,
  now: Date,
  blockedDraftInfo: Promise<Map<string, BlockedDraft>>,
  currentBatchInfo: Promise<Map<string, CurrentBatchInfo>>,
): Promise<OverviewSection<OverviewAttention>> {
  const [jobRows, blocked, batches] = await Promise.all([
    db
      .select({
        id: instagramPublicationJobs.id,
        storyId: instagramPublicationJobs.storyId,
        title: stories.title,
        status: instagramPublicationJobs.status,
        failureKind: instagramPublicationJobs.failureKind,
        updatedAt: instagramPublicationJobs.updatedAt,
      })
      .from(instagramPublicationJobs)
      .innerJoin(stories, eq(stories.id, instagramPublicationJobs.storyId))
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          inArray(instagramPublicationJobs.status, [...ATTENTION_JOB_STATES]),
        ),
      ),
    blockedDraftInfo,
    currentBatchInfo,
  ]);

  // "Pending approval": the draft's text is approved and its current-version
  // batch finished generating, but not every image in it is individually
  // approved yet (generation itself requires an approved draft, so a
  // not-yet-approved draft can never reach this state).
  const approvalRows = [...batches.entries()]
    .filter(
      ([, info]) =>
        info.status === "approved" &&
        info.batchStatus === "completed" &&
        info.approved < info.total,
    )
    .map(([draftId, info]) => ({ draftId, ...info }));

  const items: OverviewAttentionItem[] = [];

  for (const row of jobRows) {
    const incident = describeJobIncident(row.status, row.failureKind);
    items.push({
      id: `job:${row.id}`,
      entity: "publication-job",
      entityId: row.id,
      storyId: row.storyId,
      title: row.title,
      pieceType: "Instagram job",
      severity: incident.severity,
      reason: incident.reason,
      extraReasons: 0,
      ageHours: ageInHours(row.updatedAt, now),
      action: { label: "Review", href: "#editorial-instagram" },
    });
  }

  for (const [draftId, info] of blocked) {
    items.push({
      id: `draft-blocker:${draftId}`,
      entity: "draft",
      entityId: draftId,
      storyId: info.storyId,
      title: info.title,
      pieceType: "Draft",
      severity: "draft-blocker",
      reason: info.reason,
      extraReasons: Math.max(0, info.causes - 1),
      ageHours: ageInHours(info.updatedAt, now),
      action: { label: "Review draft", href: "#stories" },
    });
  }

  for (const row of approvalRows) {
    if (blocked.has(row.draftId)) continue; // a blocker outranks "needs approval"
    items.push({
      id: `pending-approval:${row.draftId}`,
      entity: "draft",
      entityId: row.draftId,
      storyId: row.storyId,
      title: row.title,
      pieceType: `Draft v${row.version}`,
      severity: "pending-approval",
      reason: "All images are generated — the draft is waiting for approval",
      extraReasons: 0,
      ageHours: ageInHours(row.updatedAt, now),
      action: { label: "Review draft", href: "#stories" },
    });
  }

  const ranked = rankAttentionItems(items);

  return {
    status: ranked.length > 0 ? "ok" : "empty",
    asOf: ranked[0] ? now.toISOString() : null,
    data: { total: ranked.length, items: ranked.slice(0, 5) },
  };
}

async function readProduction(
  topicId: string,
  now: Date,
  blockedDraftInfo: Promise<Map<string, BlockedDraft>>,
  currentBatchInfo: Promise<Map<string, CurrentBatchInfo>>,
): Promise<OverviewSection<OverviewProduction>> {
  const [
    [selectedRow],
    [briefsRow],
    [draftsRow],
    deliveredStoryRows,
    frozenPackageStoryRows,
    recentDraftRows,
    blocked,
    frozenCurrentVersionRows,
    publishedCurrentVersionRows,
    currentBatchByDraft,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(topicStories)
      .where(
        and(
          eq(topicStories.topicId, topicId),
          eq(topicStories.processingStatus, "selected"),
        ),
      ),
    db
      .select({ value: countDistinct(storyCreativeBriefs.storyId) })
      .from(storyCreativeBriefs)
      .where(eq(storyCreativeBriefs.topicId, topicId)),
    db
      .select({ value: count() })
      .from(creativeDrafts)
      .where(
        and(
          eq(creativeDrafts.topicId, topicId),
          eq(creativeDrafts.status, "draft"),
        ),
      ),
    // "Ready or published": distinct stories that either have a confirmed
    // Instagram delivery or a frozen (delivery-ready) package, at any
    // revision. A story keeps this even after a newer, undelivered revision
    // starts — the feature explicitly allows both to be true at once.
    db
      .selectDistinct({ storyId: instagramPublicationJobs.storyId })
      .from(instagramPublicationJobs)
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          eq(instagramPublicationJobs.status, "published"),
        ),
      ),
    db
      .selectDistinct({ storyId: instagramPublicationPackages.storyId })
      .from(instagramPublicationPackages)
      .where(
        and(
          eq(instagramPublicationPackages.topicId, topicId),
          eq(instagramPublicationPackages.status, "frozen"),
          gt(instagramPublicationPackages.expiresAt, now),
        ),
      ),
    // Candidates for "continue this piece": the most recently touched drafts.
    // Blocked ones are filtered out below (they belong in the attention queue).
    db
      .select({
        draftId: creativeDrafts.id,
        storyId: creativeDrafts.storyId,
        title: stories.title,
        format: creativeDrafts.format,
        version: creativeDrafts.version,
        status: creativeDrafts.status,
        updatedAt: creativeDrafts.updatedAt,
      })
      .from(creativeDrafts)
      .innerJoin(stories, eq(stories.id, creativeDrafts.storyId))
      .where(eq(creativeDrafts.topicId, topicId))
      .orderBy(desc(creativeDrafts.updatedAt))
      .limit(12),
    blockedDraftInfo,
    // A revision keeps in-place: `creativeDrafts.version` bumps on the same
    // row rather than creating a new one. So "frozen"/"published" must be
    // matched against the draft's CURRENT version, not just its id — otherwise
    // a brand-new, undelivered revision looks identical to the one that was
    // already delivered.
    // A frozen package that has expired is rejected at publish time (see
    // publish-publication-package.core.ts), so it is not "ready to publish"
    // here either — it must be re-frozen first.
    db
      .select({ draftId: instagramPublicationPackages.draftId })
      .from(instagramPublicationPackages)
      .innerJoin(
        creativeDrafts,
        eq(creativeDrafts.id, instagramPublicationPackages.draftId),
      )
      .where(
        and(
          eq(instagramPublicationPackages.topicId, topicId),
          eq(instagramPublicationPackages.status, "frozen"),
          eq(
            instagramPublicationPackages.draftVersion,
            creativeDrafts.version,
          ),
          gt(instagramPublicationPackages.expiresAt, now),
        ),
      ),
    db
      .select({ draftId: instagramPublicationJobs.draftId })
      .from(instagramPublicationJobs)
      .innerJoin(
        creativeAssetBatches,
        eq(creativeAssetBatches.id, instagramPublicationJobs.batchId),
      )
      .innerJoin(
        creativeDrafts,
        eq(creativeDrafts.id, instagramPublicationJobs.draftId),
      )
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          eq(instagramPublicationJobs.status, "published"),
          eq(creativeAssetBatches.draftVersion, creativeDrafts.version),
        ),
      ),
    currentBatchInfo,
  ]);

  const readyOrPublished = new Set(
    [...deliveredStoryRows, ...frozenPackageStoryRows].map(
      (row) => row.storyId,
    ),
  ).size;

  const frozenCurrentVersionDraftIds = new Set(
    frozenCurrentVersionRows.map((row) => row.draftId),
  );
  const publishedCurrentVersionDraftIds = new Set(
    publishedCurrentVersionRows.map((row) => row.draftId),
  );

  const imagesToReview = [...currentBatchByDraft.values()].reduce(
    (sum, info) => sum + info.pendingGenerated,
    0,
  );

  // Stored-state readiness ladder (no provider call). Generating images
  // requires an approved draft (see requireApprovedDraft), so an unapproved
  // draft's next step is approval, never "generate images"; and an approved
  // draft is not freezable until every image of its current batch is
  // individually approved, not merely generated.
  const nextStepFor = (draftId: string, status: string): string | null => {
    if (publishedCurrentVersionDraftIds.has(draftId)) return null; // this revision is delivered
    if (status !== "approved") return "Approve the draft";
    const images = currentBatchByDraft.get(draftId);
    if (!images || images.batchStatus !== "completed") {
      return "Generate the slide images";
    }
    if (images.approved < images.total) return "Review and approve the images";
    return frozenCurrentVersionDraftIds.has(draftId)
      ? "Publish the frozen package"
      : "Freeze the Instagram package";
  };

  const continuableDrafts = recentDraftRows
    .filter((row) => !blocked.has(row.draftId))
    .map((row) => ({ row, nextStep: nextStepFor(row.draftId, row.status) }))
    .filter(
      (entry): entry is { row: (typeof recentDraftRows)[number]; nextStep: string } =>
        entry.nextStep !== null,
    )
    .slice(0, 3);

  const thumbnails = await readCoverThumbnails(
    continuableDrafts.map((entry) => entry.row.draftId),
  );

  const continuable: OverviewProductionPiece[] = continuableDrafts.map(
    ({ row, nextStep }) => ({
      draftId: row.draftId,
      storyId: row.storyId,
      title: row.title,
      format: row.format,
      version: row.version,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      thumbnailUrl: thumbnails.get(row.draftId) ?? null,
      nextStep,
    }),
  );

  return {
    status: "ok",
    asOf: now.toISOString(),
    data: {
      selectedStories: Number(selectedRow?.value ?? 0),
      briefs: Number(briefsRow?.value ?? 0),
      draftsInReview: Number(draftsRow?.value ?? 0),
      imagesToReview,
      readyOrPublished,
      continuable,
    },
  };
}

/**
 * Cover-slide provider image URL for each of the given drafts, from the most
 * recent batch. These are the provider's own hosted URLs the creative
 * workspace already exposes — never R2 keys or delivery tokens.
 */
async function readCoverThumbnails(
  draftIds: string[],
): Promise<Map<string, string>> {
  if (draftIds.length === 0) return new Map();

  const rows = await db
    .select({
      draftId: creativeAssetBatches.draftId,
      unitOrder: creativeAssets.unitOrder,
      version: creativeAssets.version,
      batchCreatedAt: creativeAssetBatches.createdAt,
      imageUrl: creativeAssets.imageUrl,
    })
    .from(creativeAssets)
    .innerJoin(
      creativeAssetBatches,
      eq(creativeAssetBatches.id, creativeAssets.batchId),
    )
    .where(
      and(
        inArray(creativeAssetBatches.draftId, draftIds),
        inArray(creativeAssets.status, ["generated", "approved"]),
        isNotNull(creativeAssets.imageUrl),
      ),
    )
    .orderBy(
      desc(creativeAssetBatches.createdAt),
      creativeAssets.unitOrder,
      desc(creativeAssets.version),
    );

  const byDraft = new Map<string, string>();
  for (const row of rows) {
    if (row.imageUrl && !byDraft.has(row.draftId)) {
      byDraft.set(row.draftId, row.imageUrl);
    }
  }
  return byDraft;
}

/** Job states worth showing as a recent delivery attempt. */
const DELIVERY_JOB_STATES = [
  "published",
  "publishing",
  "pending-confirmation",
  "containers-ready",
  "suspended",
  "failed",
] as const;

async function readPublications(
  topicId: string,
): Promise<OverviewSection<{ total: number; recent: OverviewDelivery[] }>> {
  const manualOrderKey = sql`coalesce(${storySocialPublications.publishedAt}, ${storySocialPublications.scheduledAt}, ${storySocialPublications.updatedAt})`;

  const [
    [jobTotalRow],
    [manualTotalRow],
    [connection],
    jobRows,
    manualRows,
  ] = await Promise.all([
    // Mirrors the exclusion `recent` applies below: a job in a delivery
    // state, plus manual log rows the durable pipeline does not already
    // cover — otherwise "View all N" would promise more than the list ever
    // shows.
    db
      .select({ value: count() })
      .from(instagramPublicationJobs)
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          inArray(instagramPublicationJobs.status, [...DELIVERY_JOB_STATES]),
        ),
      ),
    db
      .select({ value: count() })
      .from(storySocialPublications)
      .where(
        and(
          eq(storySocialPublications.topicId, topicId),
          or(
            ne(storySocialPublications.platform, "instagram"),
            notExists(
              db
                .select({ one: sql`1` })
                .from(instagramPublicationJobs)
                .where(
                  and(
                    eq(instagramPublicationJobs.topicId, topicId),
                    eq(
                      instagramPublicationJobs.storyId,
                      storySocialPublications.storyId,
                    ),
                    inArray(instagramPublicationJobs.status, [
                      ...DELIVERY_JOB_STATES,
                    ]),
                  ),
                ),
            ),
          ),
        ),
      ),
    db
      .select({ igUsername: topicMetaConnections.igUsername })
      .from(topicMetaConnections)
      .where(eq(topicMetaConnections.topicId, topicId))
      .limit(1),
    db
      .select({
        id: instagramPublicationJobs.id,
        storyId: instagramPublicationJobs.storyId,
        storyTitle: stories.title,
        status: instagramPublicationJobs.status,
        failureKind: instagramPublicationJobs.failureKind,
        publishedMediaId: instagramPublicationJobs.publishedMediaId,
        permalink: instagramPublicationJobs.permalink,
        igUserId: instagramPublicationJobs.igUserId,
        finishedAt: instagramPublicationJobs.finishedAt,
        updatedAt: instagramPublicationJobs.updatedAt,
      })
      .from(instagramPublicationJobs)
      .innerJoin(stories, eq(stories.id, instagramPublicationJobs.storyId))
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          inArray(instagramPublicationJobs.status, [...DELIVERY_JOB_STATES]),
        ),
      )
      .orderBy(desc(instagramPublicationJobs.updatedAt))
      .limit(PUBLICATION_LIMIT * 2),
    db
      .select({
        id: storySocialPublications.id,
        storyId: storySocialPublications.storyId,
        storyTitle: stories.title,
        platform: storySocialPublications.platform,
        status: storySocialPublications.status,
        publishedAt: storySocialPublications.publishedAt,
        scheduledAt: storySocialPublications.scheduledAt,
        postUrl: storySocialPublications.postUrl,
        updatedAt: storySocialPublications.updatedAt,
      })
      .from(storySocialPublications)
      .innerJoin(stories, eq(stories.id, storySocialPublications.storyId))
      .where(eq(storySocialPublications.topicId, topicId))
      .orderBy(desc(manualOrderKey))
      .limit(PUBLICATION_LIMIT * 2),
  ]);

  const username = connection?.igUsername ?? null;
  const timeOf = (value: Date | null) => (value ? value.getTime() : 0);

  const jobDeliveries = jobRows.map((row) => {
    const at = row.finishedAt ?? row.updatedAt;
    const delivery: OverviewDelivery = {
      id: `job:${row.id}`,
      storyId: row.storyId,
      storyTitle: row.storyTitle,
      platform: "instagram",
      account: username ?? row.igUserId ?? null,
      state: describeDeliveryState(
        row.status,
        row.failureKind,
        Boolean(row.publishedMediaId),
      ),
      at: at ? at.toISOString() : null,
      permalink: row.permalink ?? null,
    };
    return { delivery, sortAt: timeOf(at) };
  });

  // A story/platform that already has a job is covered by that job; only keep
  // manual log rows for destinations the durable pipeline does not track.
  const jobKeys = new Set(jobRows.map((row) => `${row.storyId}:instagram`));

  const manualDeliveries = manualRows
    .filter((row) => !jobKeys.has(`${row.storyId}:${row.platform}`))
    .map((row) => {
      const at = row.publishedAt ?? row.scheduledAt ?? row.updatedAt;
      const delivery: OverviewDelivery = {
        id: `manual:${row.id}`,
        storyId: row.storyId,
        storyTitle: row.storyTitle,
        platform: row.platform,
        account: row.platform === "instagram" ? username : null,
        state: "logged",
        at: at ? at.toISOString() : null,
        permalink: row.postUrl ?? null,
      };
      return { delivery, sortAt: timeOf(at) };
    });

  const recent = [...jobDeliveries, ...manualDeliveries]
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, PUBLICATION_LIMIT)
    .map((entry) => entry.delivery);

  return {
    status: recent.length > 0 ? "ok" : "empty",
    asOf: recent.find((item) => item.at)?.at ?? null,
    data: {
      total:
        Number(jobTotalRow?.value ?? 0) + Number(manualTotalRow?.value ?? 0),
      recent,
    },
  };
}

async function readHealth(
  topicId: string,
): Promise<OverviewSection<OverviewSourceHealth>> {
  const [
    [configuredRow],
    [enabledRow],
    [aiResearchRow],
    [lastRun],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(topicSources)
      .where(eq(topicSources.topicId, topicId)),
    db
      .select({ value: count() })
      .from(topicSources)
      .where(
        and(eq(topicSources.topicId, topicId), eq(topicSources.enabled, true)),
      ),
    db
      .select({ enabled: aiResearchSources.enabled })
      .from(aiResearchSources)
      .where(eq(aiResearchSources.topicId, topicId))
      .limit(1),
    db
      .select({
        finishedAt: collectionRuns.finishedAt,
        status: collectionRuns.status,
        successfulSources: collectionRuns.successfulSources,
        failedSources: collectionRuns.failedSources,
      })
      .from(collectionRuns)
      .where(eq(collectionRuns.topicId, topicId))
      .orderBy(desc(collectionRuns.startedAt))
      .limit(1),
  ]);

  const buckets = bucketiseSourceHealth(
    {
      configured: Number(configuredRow?.value ?? 0),
      enabled: Number(enabledRow?.value ?? 0),
    },
    lastRun ? Number(lastRun.failedSources) : null,
  );

  const data: OverviewSourceHealth = {
    configured: Number(configuredRow?.value ?? 0),
    enabled: buckets.enabled,
    disabledOrUnknown: buckets.disabledOrUnknown,
    aiResearchEnabled: aiResearchRow?.enabled ?? false,
    lastCollectionAt: lastRun ? lastRun.finishedAt.toISOString() : null,
    lastCollectionStatus: lastRun ? lastRun.status : null,
    lastSuccessfulSources: lastRun ? Number(lastRun.successfulSources) : null,
    lastFailedSources: buckets.lastFailedSources,
  };

  return {
    status:
      data.configured === 0 && !data.aiResearchEnabled ? "empty" : "ok",
    asOf: data.lastCollectionAt,
    data,
  };
}

async function readActivity(
  topicId: string,
): Promise<OverviewSection<OverviewActivityEvent[]>> {
  const [linkedRows, draftRows, publicationRows] = await Promise.all([
    db
      .select({
        storyId: topicStories.storyId,
        title: stories.title,
        at: topicStories.firstSeenAt,
      })
      .from(topicStories)
      .innerJoin(stories, eq(stories.id, topicStories.storyId))
      .where(eq(topicStories.topicId, topicId))
      .orderBy(desc(topicStories.firstSeenAt))
      .limit(ACTIVITY_LIMIT),
    db
      .select({
        id: creativeDrafts.id,
        storyId: creativeDrafts.storyId,
        title: stories.title,
        at: creativeDrafts.updatedAt,
      })
      .from(creativeDrafts)
      .innerJoin(stories, eq(stories.id, creativeDrafts.storyId))
      .where(eq(creativeDrafts.topicId, topicId))
      .orderBy(desc(creativeDrafts.updatedAt))
      .limit(ACTIVITY_LIMIT),
    db
      .select({
        id: storySocialPublications.id,
        storyId: storySocialPublications.storyId,
        title: stories.title,
        platform: storySocialPublications.platform,
        publishedAt: storySocialPublications.publishedAt,
        updatedAt: storySocialPublications.updatedAt,
      })
      .from(storySocialPublications)
      .innerJoin(stories, eq(stories.id, storySocialPublications.storyId))
      .where(
        and(
          eq(storySocialPublications.topicId, topicId),
          eq(storySocialPublications.status, "published"),
        ),
      )
      .orderBy(desc(storySocialPublications.updatedAt))
      .limit(ACTIVITY_LIMIT),
  ]);

  const events: OverviewActivityEvent[] = [
    ...linkedRows.map((row) => ({
      id: `story-linked:${row.storyId}`,
      kind: "story-linked" as const,
      entityId: row.storyId,
      storyId: row.storyId,
      title: row.title,
      label: `Story linked · ${row.title}`,
      at: row.at.toISOString(),
    })),
    ...draftRows.map((row) => ({
      id: `draft-updated:${row.id}`,
      kind: "draft-updated" as const,
      entityId: row.id,
      storyId: row.storyId,
      title: row.title,
      label: `Draft updated · ${row.title}`,
      at: row.at.toISOString(),
    })),
    ...publicationRows.map((row) => ({
      id: `publication:${row.id}`,
      kind: "publication" as const,
      entityId: row.id,
      storyId: row.storyId,
      title: row.title,
      label: `Published to ${row.platform} · ${row.title}`,
      at: (row.publishedAt ?? row.updatedAt).toISOString(),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, ACTIVITY_LIMIT);

  return {
    status: events.length > 0 ? "ok" : "empty",
    asOf: events[0]?.at ?? null,
    data: events,
  };
}

async function readCapabilities(
  topicId: string,
  now: Date,
): Promise<OverviewCapabilities> {
  const [connection] = await db
    .select({
      igUsername: topicMetaConnections.igUsername,
      accessTokenEncrypted: topicMetaConnections.accessTokenEncrypted,
      tokenExpiresAt: topicMetaConnections.tokenExpiresAt,
      connectedAt: topicMetaConnections.connectedAt,
      grantedPermissions: topicMetaConnections.grantedPermissions,
      lastMediaSyncAt: topicMetaConnections.lastMediaSyncAt,
      lastVerifiedAt: topicMetaConnections.lastVerifiedAt,
    })
    .from(topicMetaConnections)
    .where(eq(topicMetaConnections.topicId, topicId))
    .limit(1);

  const connected = Boolean(
    connection?.connectedAt && connection?.accessTokenEncrypted,
  );
  const tokenLive =
    connected &&
    (!connection?.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() > now.getTime());
  const granted = connection?.grantedPermissions ?? [];

  return {
    instagram: {
      connected,
      canPublish:
        tokenLive && granted.some((scope) => PUBLISH_SCOPES.includes(scope)),
      canReadInsights:
        tokenLive && granted.some((scope) => INSIGHTS_SCOPES.includes(scope)),
      username: connection?.igUsername ?? null,
      lastActivityAt:
        connection?.lastMediaSyncAt?.toISOString() ??
        connection?.lastVerifiedAt?.toISOString() ??
        connection?.connectedAt?.toISOString() ??
        null,
    },
    facebook: {
      available: false,
      reason: "The Facebook connector is not implemented yet",
    },
    scheduling: {
      available: false,
      reason: "Durable scheduling (PUB-05) is not available yet",
    },
  };
}
