import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import { identityMissing, topicSetupStatus, type TopicSetupSignals, type TopicSetupStatus } from "./topic-setup.core";

export class TopicSetupError extends Error {
  constructor(message: string, readonly status: 404 | 409 = 409) {
    super(message);
  }
}

/** The brand's setup signals, read without creating or changing anything. */
export async function getTopicSetupSignals(topicId: string): Promise<TopicSetupSignals> {
  const result = await db.execute(sql`SELECT
      t.setup_identity_confirmed_at AS identity_confirmed_at, t.setup_completed_at AS completed_at,
      p.brand_asset_id IS NOT NULL AS has_logo, coalesce(p.audience, '') AS audience, coalesce(p.language, '') AS language,
      coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p.brand_palette) = 'array' THEN p.brand_palette END), 0)::int AS palette_colors,
      (SELECT count(*)::int FROM topic_sources s WHERE s.topic_id = t.id AND s.enabled) AS rss_sources,
      coalesce((SELECT bool_or(a.enabled) FROM ai_research_sources a WHERE a.topic_id = t.id), false) AS ai_research_enabled,
      (SELECT count(*)::int FROM topic_knowledge_documents d WHERE d.topic_id = t.id AND d.enabled) AS documents,
      EXISTS (SELECT 1 FROM topic_facebook_connections f WHERE f.topic_id = t.id) AS facebook_page,
      EXISTS (SELECT 1 FROM topic_meta_connections m WHERE m.topic_id = t.id) AS instagram_direct
    FROM topics t LEFT JOIN creative_profiles p ON p.topic_id = t.id
    WHERE t.id = ${topicId}::uuid`);
  const row = result.rows[0];
  if (!row) throw new TopicSetupError("Topic was not found", 404);
  const date = (value: unknown) => value ? new Date(String(value)).toISOString() : null;
  return {
    identityConfirmedAt: date(row.identity_confirmed_at),
    completedAt: date(row.completed_at),
    hasLogo: row.has_logo === true,
    audience: String(row.audience ?? ""),
    language: String(row.language ?? ""),
    paletteColors: Number(row.palette_colors ?? 0),
    rssSources: Number(row.rss_sources ?? 0),
    aiResearchEnabled: row.ai_research_enabled === true,
    documents: Number(row.documents ?? 0),
    facebookPage: row.facebook_page === true,
    instagramDirect: row.instagram_direct === true,
  };
}

export async function getTopicSetupStatus(topicId: string): Promise<TopicSetupStatus> {
  return topicSetupStatus(await getTopicSetupSignals(topicId));
}

/** The editor reviewed the brand's identity; it must have what publishing needs. */
export async function confirmTopicIdentity(topicId: string): Promise<TopicSetupStatus> {
  const missing = identityMissing(await getTopicSetupSignals(topicId));
  if (missing.length) throw new TopicSetupError(`The identity is not complete yet: ${missing.join(" ")}`);
  await db.execute(sql`UPDATE topics SET setup_identity_confirmed_at = coalesce(setup_identity_confirmed_at, now()), updated_at = now() WHERE id = ${topicId}::uuid`);
  return getTopicSetupStatus(topicId);
}

/** Opens the dashboard for this brand once identity, sources and channels are in place. */
export async function completeTopicSetup(topicId: string): Promise<TopicSetupStatus> {
  const status = await getTopicSetupStatus(topicId);
  if (!status.readyToComplete) throw new TopicSetupError("Finish identity, sources and channels first.");
  await db.execute(sql`UPDATE topics SET setup_completed_at = coalesce(setup_completed_at, now()), updated_at = now() WHERE id = ${topicId}::uuid`);
  return getTopicSetupStatus(topicId);
}
