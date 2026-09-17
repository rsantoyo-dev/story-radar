import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyEditorialPlans } from "@/db/schema";
import type { EditorialProfile } from "./editorial-profile.types";
import { inEditorialEvaluationWindow, type EditorialCollectionContext } from "../editorial-lines/editorial-lines";
import { EXTENDED_LOOKBACK_HOURS, MIN_CANDIDATES_BEFORE_TOPUP, MIN_CLASSIFIED_FOR_TARGETS, RECENT_ANGLE_WINDOW, recentPlannerPublications, type PlannerCandidate, type PlannerContext, type PlannerPublication } from "./daily-editorial-planner.types";
import { getCurrentTopicAcquisitionTaxonomy } from "./topic-acquisition-lenses.repository";

export async function plannerInputs(topicId: string, profile: EditorialProfile, now: Date) {
  // This exclusion set is ALL known publications/commitments, not merely the last ten.
  const [candidateRows, historyRows, commitmentRows] = await Promise.all([
    db.execute(sql`
      SELECT s.id AS "storyId", coalesce(r.title,s.title) AS title,
        left(coalesce(r.content,en.content_text,s.content_text,''),1600) AS "contentPreview",
        s.published_at AS "publishedAt", s.last_seen_at AS "lastSeenAt",
        coalesce(e.editorial_priority,e.editorial_score) AS "editorialPriority",
        e.growth_score AS "growthScore", e.decision, (ts.review_decision = 'approved') AS selected, e.reason, e.risk_flags AS "riskFlags",
        e.evaluated_at AS "evaluatedAt", coalesce(r.revision,0) AS revision,
        EXISTS(SELECT 1 FROM owned_content_entries o WHERE o.topic_id=ts.topic_id AND o.story_id=s.id) AS owned,
        s.tags, s.canonical_url AS "sourceUrl", source.source_name AS "sourceName",
        coalesce(source.tags,ARRAY[]::text[]) AS "sourceTags",
        (coalesce(r.created_at,e.evaluated_at)>e.evaluated_at OR ${profile.updatedAt.toISOString()}::timestamptz>e.evaluated_at) AS "evaluationMayBeStale",
        coalesce((SELECT jsonb_agg(ec.context ORDER BY ec.created_at,ec.run_id) FROM editorial_story_contexts ec WHERE ec.topic_id=ts.topic_id AND ec.story_id=s.id),'[]'::jsonb) AS contexts
      FROM topic_stories ts JOIN stories s ON s.id=ts.story_id
      JOIN LATERAL (SELECT * FROM story_editorial_evaluations e WHERE e.topic_id=ts.topic_id AND e.story_id=s.id ORDER BY e.evaluated_at DESC,e.id DESC LIMIT 1) e ON true
      LEFT JOIN LATERAL (SELECT title,content,revision,created_at FROM story_content_revisions r WHERE r.topic_id=ts.topic_id AND r.story_id=s.id ORDER BY revision DESC LIMIT 1) r ON true
      LEFT JOIN story_content_enrichments en ON en.story_id=s.id AND en.status='completed'
      LEFT JOIN LATERAL (SELECT ss.source_name,coalesce(tso.tags,ARRAY[]::text[]) AS tags FROM story_sources ss
        LEFT JOIN topic_sources tso ON tso.topic_id=ts.topic_id AND tso.rss_source_id::text=ss.source_id
        WHERE ss.story_id=s.id AND (tso.topic_id IS NOT NULL OR ss.source_id LIKE 'ai-research:%' OR ss.source_id LIKE 'owned-content:%')
        ORDER BY ss.fetched_at DESC,ss.source_id LIMIT 1) source ON true
      WHERE ts.topic_id=${topicId}::uuid AND ts.review_decision IS DISTINCT FROM 'rejected'
        AND ts.duplicate_of_story_id IS NULL AND ts.processing_status NOT IN ('rejected','published','failed')
        AND e.decision IN ('shortlist','review')
        AND (s.published_at IS NULL OR s.published_at <= ${now.toISOString()}::timestamptz)
        AND NOT EXISTS(SELECT 1 FROM story_social_publications p WHERE p.topic_id=ts.topic_id AND p.story_id=s.id AND p.status IN ('published','scheduled'))
        AND NOT EXISTS(SELECT 1 FROM instagram_publication_jobs j WHERE j.topic_id=ts.topic_id AND j.story_id=s.id AND j.status NOT IN ('failed','suspended'))
        AND NOT EXISTS(SELECT 1 FROM topic_instagram_media m JOIN topic_meta_connections c ON c.topic_id=m.topic_id AND c.ig_user_id=m.ig_user_id WHERE m.topic_id=ts.topic_id AND m.linked_story_id=s.id)
      ORDER BY coalesce(e.editorial_priority,e.editorial_score) DESC, e.growth_score DESC NULLS LAST,s.id
    `),
    db.execute(sql`
      SELECT * FROM (
        SELECT p.story_id AS "storyId", s.title, coalesce(p.note,'') AS caption,
          coalesce(p.published_at,p.updated_at) AS "publishedAt", p.platform::text AS platform,
          NULL::text AS "mediaId", p.post_url AS url
        FROM story_social_publications p JOIN stories s ON s.id=p.story_id WHERE p.topic_id=${topicId}::uuid AND p.status='published'
        UNION ALL
        SELECT j.story_id,s.title,left(p.caption,1000),coalesce(j.finished_at,j.updated_at),'instagram',j.published_media_id,j.permalink
        FROM instagram_publication_jobs j JOIN stories s ON s.id=j.story_id JOIN instagram_publication_packages p ON p.id=j.package_id
        WHERE j.topic_id=${topicId}::uuid AND j.status='published'
        UNION ALL
        SELECT m.linked_story_id,coalesce(s.title,left(m.caption,150),'Imported Instagram post'),left(coalesce(m.caption,''),1000),m.published_at,'instagram',m.external_id,m.permalink
        FROM topic_instagram_media m JOIN topic_meta_connections c ON c.topic_id=m.topic_id AND c.ig_user_id=m.ig_user_id
        LEFT JOIN stories s ON s.id=m.linked_story_id WHERE m.topic_id=${topicId}::uuid
      ) history ORDER BY "publishedAt" DESC
    `),
    db.execute(sql`
      SELECT p.story_id AS "storyId",s.title,p.status::text AS status,p.scheduled_at AS "scheduledAt"
      FROM story_social_publications p JOIN stories s ON s.id=p.story_id WHERE p.topic_id=${topicId}::uuid AND p.status='scheduled'
      UNION ALL
      SELECT j.story_id,s.title,j.status,NULL::timestamptz FROM instagram_publication_jobs j JOIN stories s ON s.id=j.story_id
      WHERE j.topic_id=${topicId}::uuid AND j.status NOT IN ('published','failed','suspended')
      ORDER BY "storyId",status
    `),
  ]);
  type CandidateRow = PlannerCandidate & { owned: boolean; tags: string[]; sourceTags:string[]; contexts: EditorialCollectionContext[]; lastSeenAt: string };
  const withinWindow = (c: CandidateRow, minHours?: number) => {
    const date = c.publishedAt ? new Date(c.publishedAt) : undefined;
    if (c.contexts.length) return c.contexts.some(context => inEditorialEvaluationWindow(date,context,now,minHours));
    if (c.owned) return true;
    const hours = c.sourceTags.some(tag=>["research","academic","journal"].some(word=>tag.toLowerCase().includes(word))) ? profile.freshness.researchMaxAgeHours : profile.freshness.newsMaxAgeHours;
    const effectiveHours = minHours===undefined?hours:Math.max(hours,minHours);
    return new Date(c.publishedAt ?? c.lastSeenAt).getTime() >= now.getTime()-effectiveHours*3600000;
  };
  const rows = candidateRows.rows as CandidateRow[];
  const strict = rows.filter(c => withinWindow(c));
  // Already-evaluated candidates a narrow window would hide are still real,
  // AI-vetted options — when the strict pool is thin, widen the window
  // instead of leaving the planner with almost nothing to recommend from.
  // The (also widened) planner prompt then judges each on its own merits.
  const filtered = strict.length < MIN_CANDIDATES_BEFORE_TOPUP
    ? rows.filter(c => withinWindow(c,EXTENDED_LOOKBACK_HOURS))
    : strict;
  const candidates = filtered.slice(0,30).map(c => ({
    storyId:c.storyId,title:c.title,decision:c.decision,selected:!!c.selected,contentPreview:c.contentPreview,publishedAt:c.publishedAt ? new Date(c.publishedAt).toISOString() : null,
    editorialPriority:c.editorialPriority,growthScore:c.growthScore,reason:c.reason,riskFlags:c.riskFlags,
    evaluatedAt:new Date(c.evaluatedAt).toISOString(),revision:c.revision,sourceUrl:c.sourceUrl,sourceName:c.sourceName,collectionContexts:c.contexts,evaluationMayBeStale:c.evaluationMayBeStale,
  }));
  const history = (historyRows.rows as PlannerPublication[]).map(p => ({...p,publishedAt:new Date(p.publishedAt).toISOString()}));
  const commitments = (commitmentRows.rows as PlannerContext["commitments"]).map(p => ({...p,scheduledAt:p.scheduledAt ? new Date(p.scheduledAt).toISOString() : null}));
  const recentPublications = recentPlannerPublications(history);
  // The distribution reads a wider window than the repetition history the
  // planner is shown, so a share is not swung ten points by one publication.
  const acquisition = await plannerAcquisitionContext(
    topicId,
    recentPlannerPublications(history, RECENT_ANGLE_WINDOW),
  );
  return { candidates, recentPublications, commitments, ...(acquisition ? { acquisition } : {}) };
}

/**
 * The topic's live vocabulary plus how its recent publications actually spread
 * across it. Angles come from each published story's own brief, so a
 * publication whose brief predates the taxonomy counts as unclassified rather
 * than distorting the distribution. Returns undefined — and therefore
 * suppresses provisional angles entirely — when the topic has no taxonomy.
 */
async function plannerAcquisitionContext(
  topicId: string,
  recentPublications: readonly PlannerPublication[],
): Promise<PlannerContext["acquisition"]> {
  const taxonomy = await getCurrentTopicAcquisitionTaxonomy(topicId).catch(() => undefined);
  if (!taxonomy) return undefined;

  const storyIds = [...new Set(recentPublications.map(p => p.storyId).filter((id): id is string => !!id))];
  const angles = storyIds.length
    ? (await db.execute(sql`
        SELECT DISTINCT ON (b.story_id) b.story_id AS "storyId", b.editorial_angle->>'angle' AS angle
        FROM story_creative_briefs b
        WHERE b.topic_id=${topicId}::uuid AND b.story_id = ANY(ARRAY[${sql.join(storyIds.map(id => sql`${id}::uuid`), sql`,`)}])
          AND b.editorial_angle IS NOT NULL
        ORDER BY b.story_id, b.created_at DESC
      `)).rows as { storyId: string; angle: string | null }[]
    : [];

  const byStory = new Map(angles.filter(row => row.angle).map(row => [row.storyId, row.angle!]));
  const counts = new Map(taxonomy.lenses.filter(lens => lens.enabled).map(lens => [lens.key, 0]));
  let classified = 0;
  let unclassified = 0;
  for (const publication of recentPublications) {
    const key = publication.storyId ? byStory.get(publication.storyId) : undefined;
    if (key !== undefined && counts.has(key)) { counts.set(key, counts.get(key)! + 1); classified++; }
    else unclassified++;
  }

  return {
    taxonomyVersion: taxonomy.taxonomyVersion,
    lenses: taxonomy.lenses.filter(lens => lens.enabled).map(lens => ({
      key: lens.key, label: lens.label, definition: lens.definition,
      ...(lens.targetShare !== undefined ? { targetShare: lens.targetShare } : {}),
    })),
    recentDistribution: [...counts].map(([key, published]) => ({ key, published })),
    unclassifiedPublications: unclassified,
    targetsApply: classified >= MIN_CLASSIFIED_FOR_TARGETS,
  };
}
export async function latestDailyPlan(topicId: string) {
  return (await db.select().from(dailyEditorialPlans).where(eq(dailyEditorialPlans.topicId,topicId)).orderBy(desc(dailyEditorialPlans.startedAt),desc(dailyEditorialPlans.id)).limit(1))[0];
}
export async function reserveDailyPlan(topicId: string, inputHash: string, context: PlannerContext, force: boolean, maxRuns: number) {
  // Neon batches execute in a transaction. Lock in a separate statement so the
  // subsequent READ COMMITTED snapshot sees reservations by concurrent callers.
  const results = await db.batch([
    db.execute(sql`SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
    db.execute(sql`INSERT INTO daily_editorial_plans(topic_id,input_hash,context)
      SELECT ${topicId}::uuid,${inputHash},${JSON.stringify(context)}::jsonb
      WHERE NOT EXISTS(SELECT 1 FROM daily_editorial_plans WHERE topic_id=${topicId}::uuid AND status='running' AND started_at > now()-interval '10 minutes')
      AND (${force} OR NOT EXISTS(SELECT 1 FROM daily_editorial_plans WHERE topic_id=${topicId}::uuid AND input_hash=${inputHash} AND status='completed'))
      AND (SELECT count(*) FROM daily_editorial_plans WHERE topic_id=${topicId}::uuid AND started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') < ${maxRuns}
      RETURNING id`),
  ]);
  return results[1].rows[0]?.id as string | undefined;
}
export async function finishDailyPlan(topicId: string, id: string, values: Pick<typeof dailyEditorialPlans.$inferInsert,"status"|"result"|"provider"|"model"|"usage"|"error">) {
  await db.update(dailyEditorialPlans).set({...values,finishedAt:new Date()}).where(and(eq(dailyEditorialPlans.topicId,topicId),eq(dailyEditorialPlans.id,id),eq(dailyEditorialPlans.status,"running")));
}
export async function cachedDailyPlan(topicId: string, inputHash: string) {
  return (await db.select().from(dailyEditorialPlans).where(and(eq(dailyEditorialPlans.topicId,topicId),eq(dailyEditorialPlans.inputHash,inputHash),eq(dailyEditorialPlans.status,"completed"))).orderBy(desc(dailyEditorialPlans.startedAt)).limit(1))[0];
}
