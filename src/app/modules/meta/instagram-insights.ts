import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { draft2Sessions } from "@/db/schema";
import { leverName } from "../draft2/draft2-levers.types";
import { getInstagramHistoryStatus } from "./instagram-history-account";
import { insightValues, type InsightDraft2, type InsightPost, type InstagramInsights } from "./instagram-insights.types";
import { listInstagramMetricSnapshots, listTopicInstagramMedia, type InstagramMediaListItem } from "./topic-instagram-media.repository";

/** The most posts one view reads; past it the oldest are left out. */
const MAX_POSTS = 400;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The Draft 2 sessions that published these v1 drafts: the lever chosen, the narrative form and structure, the cover. */
async function draft2Metadata(topicId: string, draftIds: readonly string[]): Promise<Map<string, InsightDraft2>> {
  const byDraft = new Map<string, InsightDraft2>();
  if (!draftIds.length) return byDraft;
  const draftOf = sql<string>`${draft2Sessions.publication}->>'draftId'`;
  const rows = await db.select({ id: draft2Sessions.id, draftId: draftOf, publication: draft2Sessions.publication, focus: draft2Sessions.focus, visual: draft2Sessions.visual })
    .from(draft2Sessions)
    .where(and(eq(draft2Sessions.topicId, topicId), inArray(draftOf, [...draftIds])));
  for (const row of rows) {
    const values = row.focus?.values;
    const lever = row.publication?.lever;
    byDraft.set(row.draftId, {
      sessionId: row.id,
      ...(lever ? { lever, leverName: leverName(lever) } : {}),
      ...(values ? { narrative: values.narrative?.form ?? "classic", structure: values.structure.kind } : {}),
      ...(row.visual?.carousel?.[0]?.headline ? { cover: row.visual.carousel[0].headline } : {}),
    });
  }
  return byDraft;
}

/**
 * A topic's Instagram posts for the dashboard's view, newest first: those
 * published within twice the period (the period and the one before it, for
 * the comparison), each with its readings and, when Draft 2 made it, what it
 * was made with. Read-only: never calls Graph.
 */
export async function topicInstagramInsights(topicId: string, { days }: { days: number | null }): Promise<InstagramInsights> {
  const now = new Date();
  const status = await getInstagramHistoryStatus(topicId);
  const account = status.account;
  if (!account) return { account: null, posts: [], capturedAt: now.toISOString() };
  const from = days ? isoDay(new Date(now.getTime() - 2 * days * 86_400_000)) : undefined;
  const items: InstagramMediaListItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await listTopicInstagramMedia(topicId, account.igUserId, { limit: 60, ...(cursor ? { cursor } : {}), ...(from ? { from } : {}) });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < MAX_POSTS);
  const visible = items.filter((item) => item.accessState === "accessible").slice(0, MAX_POSTS);
  const [snapshots, drafts] = await Promise.all([
    listInstagramMetricSnapshots(topicId, visible.map((item) => item.externalId)),
    draft2Metadata(topicId, [...new Set(visible.flatMap((item) => item.linkedDraftId ? [item.linkedDraftId] : []))]),
  ]);
  const readings = new Map<string, InsightPost["snapshots"]>();
  for (const snapshot of snapshots) {
    readings.set(snapshot.externalId, [...(readings.get(snapshot.externalId) ?? []), { ageHours: snapshot.ageHours, values: insightValues(snapshot.metrics) }]);
  }
  const posts: InsightPost[] = visible.map((item) => {
    const draft2 = item.linkedDraftId ? drafts.get(item.linkedDraftId) : undefined;
    return {
      id: item.id, externalId: item.externalId, permalink: item.permalink, caption: item.caption, imageUrl: item.thumbnailUrl, publishedAt: item.publishedAt, format: item.format,
      storyId: item.linkedStoryId, storyTitle: item.linkedStoryTitle,
      latest: insightValues(item.metrics),
      snapshots: (readings.get(item.externalId) ?? []).sort((a, b) => a.ageHours - b.ageHours),
      ...(draft2 ? { draft2 } : {}),
    };
  });
  return { account: { igUsername: account.igUsername }, posts, capturedAt: now.toISOString() };
}
