import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { topics } from "@/db/schema";

import { getInstagramHistoryStatus } from "./instagram-history-account";
import { refreshInstagramMediaMetrics } from "./refresh-instagram-media-metrics";
import { syncInstagramMediaPage } from "./sync-instagram-media";
import { listInstagramMediaDueForSnapshot } from "./topic-instagram-media.repository";

/** Graph calls may take 15 seconds each; keep one serverless pass below 300 seconds. */
const MAX_TOPICS_PER_PASS = 3;
const MAX_CAPTURES_PER_TOPIC = 4;

export type InstagramMetricHistoryTopicResult = {
  topic: string;
  account?: string;
  imported: number;
  captured: number;
  failed: number;
  /** Set when this account needs an action (reconnect, permission) or a provider call failed. */
  error?: string;
};

/**
 * One scheduled IG-07 pass: for every active topic with an Instagram account
 * (direct or through its Facebook Page), imports the newest publications and
 * reads the metrics of those whose next history capture is due. Each read is
 * recorded as a snapshot. Never publishes, links or approves anything.
 */
export async function captureInstagramMetricHistory(now = new Date()): Promise<InstagramMetricHistoryTopicResult[]> {
  const activeTopics = await db.select({ id: topics.id, name: topics.name }).from(topics).where(eq(topics.isActive, true));
  // Rotate the starting topic on each hourly invocation. An earlier slow or
  // timed-out account cannot permanently starve accounts later in the list.
  activeTopics.sort((a, b) => a.id.localeCompare(b.id));
  const start = activeTopics.length ? Math.floor(now.getTime() / 3_600_000) % activeTopics.length : 0;
  const selected = Array.from({ length: Math.min(activeTopics.length, MAX_TOPICS_PER_PASS) },
    (_, offset) => activeTopics[(start + offset) % activeTopics.length]);
  const results: InstagramMetricHistoryTopicResult[] = [];
  for (const topic of selected) {
    const status = await getInstagramHistoryStatus(topic.id);
    if (!status.account) continue;
    const result: InstagramMetricHistoryTopicResult = { topic: topic.name, account: status.account.igUsername ?? undefined, imported: 0, captured: 0, failed: 0 };
    results.push(result);
    // A dead token needs the editor, not retries.
    if (status.state === "needs-reconnect") { result.error = "needs-reconnect"; continue; }
    try {
      const sync = await syncInstagramMediaPage(topic.id);
      result.imported = sync.imported;
      if (sync.error) { result.error = sync.error; continue; }
      const due = await listInstagramMediaDueForSnapshot(topic.id, status.account.igUserId, now, MAX_CAPTURES_PER_TOPIC);
      if (due.length === 0) continue;
      const metrics = await refreshInstagramMediaMetrics(topic.id, { externalIds: due });
      result.captured = metrics.refreshed;
      result.failed = metrics.failed;
      if (metrics.error) result.error = metrics.error;
    } catch (error) {
      result.error = error instanceof Error ? error.message.slice(0, 200) : "The capture failed";
    }
  }
  return results;
}
