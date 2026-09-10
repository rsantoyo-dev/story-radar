import "server-only";

import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
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
  metricValue,
  resolveOverviewPeriod,
  resolveScoreState,
  type OverviewPeriodDays,
} from "./topic-overview.logic";
import type {
  OverviewActivityEvent,
  OverviewCandidate,
  OverviewCapabilities,
  OverviewMetrics,
  OverviewProductionStages,
  OverviewPublication,
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
    readAttention(topicId, generatedAt).catch((error) =>
      errorSection({ total: 0 }, error, "attention"),
    ),
    readProduction(topicId, generatedAt).catch((error) =>
      errorSection<OverviewProductionStages>(
        {
          selectedStories: 0,
          briefs: 0,
          draftsInReview: 0,
          imagesToReview: 0,
          readyOrPublished: 0,
        },
        error,
        "production",
      ),
    ),
    readPublications(topicId).catch((error) =>
      errorSection<{ total: number; recent: OverviewPublication[] }>(
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
          facebook: { available: false },
          scheduling: { available: false },
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
      // delivered. Checking the specific draft — not "any publication on the
      // story" — keeps a brand-new revision of an already-published story in
      // production.
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
                .where(
                  and(
                    eq(
                      instagramPublicationJobs.draftId,
                      creativeDrafts.id,
                    ),
                    eq(instagramPublicationJobs.status, "published"),
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
 * Distinct stories that need editor attention right now. Covers the publishing
 * signals (a failed / suspended / still-uncertain Instagram send) AND the
 * editorial blockers on a draft (a failed image-edit request or blocked reason,
 * a failed generated asset) so the Overview never says "nothing pending" while
 * a blocked draft exists. Grouped at the story level so several blockers on one
 * piece are one entry, not many.
 *
 * OVW-03 refines this into the full four-tier priority ordering and folds in
 * "revision pending approval"; for now this is the union that drives the
 * counter.
 */
async function readAttentionStoryIds(topicId: string): Promise<Set<string>> {
  const [jobRows, blockedEditRows, failedAssetRows] = await Promise.all([
    db
      .selectDistinct({ storyId: instagramPublicationJobs.storyId })
      .from(instagramPublicationJobs)
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          inArray(instagramPublicationJobs.status, [...ATTENTION_JOB_STATES]),
        ),
      ),
    db
      .selectDistinct({ storyId: creativeDrafts.storyId })
      .from(creativeAssetEditRequests)
      .innerJoin(
        creativeDrafts,
        eq(creativeDrafts.id, creativeAssetEditRequests.draftId),
      )
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
    db
      .selectDistinct({ storyId: creativeDrafts.storyId })
      .from(creativeAssets)
      .innerJoin(
        creativeAssetBatches,
        eq(creativeAssetBatches.id, creativeAssets.batchId),
      )
      .innerJoin(
        creativeDrafts,
        eq(creativeDrafts.id, creativeAssetBatches.draftId),
      )
      .where(
        and(
          eq(creativeDrafts.topicId, topicId),
          eq(creativeAssets.status, "failed"),
        ),
      ),
  ]);

  return new Set(
    [...jobRows, ...blockedEditRows, ...failedAssetRows].map(
      (row) => row.storyId,
    ),
  );
}

async function readAttention(
  topicId: string,
  generatedAt: string,
): Promise<OverviewSection<{ total: number }>> {
  const total = (await readAttentionStoryIds(topicId)).size;

  return {
    status: total > 0 ? "ok" : "empty",
    asOf: generatedAt,
    data: { total },
  };
}

async function readProduction(
  topicId: string,
  generatedAt: string,
): Promise<OverviewSection<OverviewProductionStages>> {
  const [
    [selectedRow],
    [briefsRow],
    [draftsRow],
    [imagesRow],
    deliveredStoryRows,
    frozenPackageStoryRows,
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
    db
      .select({ value: count() })
      .from(creativeAssets)
      .innerJoin(
        creativeAssetBatches,
        eq(creativeAssetBatches.id, creativeAssets.batchId),
      )
      .innerJoin(
        creativeDrafts,
        eq(creativeDrafts.id, creativeAssetBatches.draftId),
      )
      .where(
        and(
          eq(creativeDrafts.topicId, topicId),
          eq(creativeAssets.status, "generated"),
        ),
      ),
    // "Ready or published": distinct stories that either have a confirmed
    // Instagram delivery or a frozen (delivery-ready) package. A frozen package
    // is genuinely "ready"; an approved draft on its own is not, so approval
    // alone is deliberately not counted here.
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
        ),
      ),
  ]);

  const readyOrPublished = new Set(
    [...deliveredStoryRows, ...frozenPackageStoryRows].map(
      (row) => row.storyId,
    ),
  ).size;

  return {
    status: "ok",
    asOf: generatedAt,
    data: {
      selectedStories: Number(selectedRow?.value ?? 0),
      briefs: Number(briefsRow?.value ?? 0),
      draftsInReview: Number(draftsRow?.value ?? 0),
      imagesToReview: Number(imagesRow?.value ?? 0),
      readyOrPublished,
    },
  };
}

async function readPublications(
  topicId: string,
): Promise<OverviewSection<{ total: number; recent: OverviewPublication[] }>> {
  const orderKey = sql`coalesce(${storySocialPublications.publishedAt}, ${storySocialPublications.scheduledAt}, ${storySocialPublications.updatedAt})`;

  const [[totalRow], rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(storySocialPublications)
      .where(eq(storySocialPublications.topicId, topicId)),
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
      })
      .from(storySocialPublications)
      .innerJoin(stories, eq(stories.id, storySocialPublications.storyId))
      .where(eq(storySocialPublications.topicId, topicId))
      .orderBy(desc(orderKey))
      .limit(PUBLICATION_LIMIT),
  ]);

  const recent: OverviewPublication[] = rows.map((row) => {
    const at = row.publishedAt ?? row.scheduledAt ?? null;

    return {
      storyId: row.storyId,
      storyTitle: row.storyTitle,
      platform: row.platform,
      status: row.status,
      at: at ? at.toISOString() : null,
      permalink: row.postUrl ?? null,
    };
  });

  return {
    status: recent.length > 0 ? "ok" : "empty",
    asOf: recent.find((item) => item.at)?.at ?? null,
    data: { total: Number(totalRow?.value ?? 0), recent },
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
      label: `Story linked · ${row.title}`,
      at: row.at.toISOString(),
    })),
    ...draftRows.map((row) => ({
      id: `draft-updated:${row.id}`,
      kind: "draft-updated" as const,
      entityId: row.id,
      label: `Draft updated · ${row.title}`,
      at: row.at.toISOString(),
    })),
    ...publicationRows.map((row) => ({
      id: `publication:${row.id}`,
      kind: "publication" as const,
      entityId: row.id,
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
    facebook: { available: false },
    scheduling: { available: false },
  };
}
