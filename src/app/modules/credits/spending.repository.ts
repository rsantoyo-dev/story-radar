import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import { syncDemoCredits } from "./demo-credit.repository";
import { demoMarkupBasisPoints } from "./demo-credit-policy";
import { spendingProduct, type SpendingGroup } from "./spending-products";

export class DemoCreditResetBlockedError extends Error {}

/**
 * Restores the demo balance to exactly 1,000 credits with an adjustment entry;
 * history is kept and "spent" restarts from this moment. The key makes a
 * retried request return the same reset instead of posting a second one.
 */
export async function resetDemoCredits(key: string, reason: string, workspaceId = "default"): Promise<number> {
  try {
    const result = await db.execute(sql`SELECT reset_demo_credits(${key}, 'dashboard', ${reason}, ${workspaceId}) AS balance`);
    return Number(result.rows[0]?.balance ?? 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const running = /demo_reset_running: (.+)/.exec(message);
    if (running) throw new DemoCreditResetBlockedError(running[1]);
    throw error;
  }
}

/** When the current demo period began: the latest reset, or the opening grant. */
export async function currentSpendingPeriodStart(workspaceId = "default"): Promise<Date | null> {
  const result = await db.execute(sql`SELECT max(created_at) AS start FROM workspace_credit_entries
    WHERE workspace_id = ${workspaceId} AND kind IN ('demo_reset', 'demo_grant', 'signup_grant')`);
  const start = result.rows[0]?.start;
  return start ? new Date(String(start)) : null;
}

export type SpendingPeriod = "reset" | "7d" | "30d" | "all";

/** One sold product line: how often, what it cost us and what it was charged. */
export type SpendingLine = {
  count: number;
  /** Provider cost of the charged items, before markup. */
  chargedCostMicros: number;
  /** What the workspace paid in credits (micros); revenue in a paid plan. */
  chargedMicros: number;
  /** Provider cost that was not charged: no price snapshot, or pre-ledger work. */
  unbilledCostMicros: number;
  /** Upper-bound reservations of calls whose result is unknown. */
  uncertainCostMicros: number;
  unpricedCount: number;
};

export type SpendingProductLine = SpendingLine & { key: string; label: string; group: SpendingGroup };
export type SpendingStoryLine = SpendingLine & { storyId: string; topicId: string; title: string; topicName: string; lastAt: string };
export type SpendingTopicLine = SpendingLine & { topicId: string; name: string; stories: number };

export type SpendingEntry = {
  id: string;
  at: string;
  product: string;
  group: SpendingGroup;
  kind: string;
  provider: string;
  model: string;
  topicId: string;
  topicName: string;
  storyId: string | null;
  storyTitle: string | null;
  costMicros: number | null;
  chargedMicros: number | null;
  status: "charged" | "uncertain" | "unpriced" | "unbilled";
};

export type SpendingReport = {
  period: SpendingPeriod;
  from: string | null;
  periodStart: string | null;
  markupBasisPoints: number;
  totals: SpendingLine & { stories: number };
  products: SpendingProductLine[];
  stories: SpendingStoryLine[];
  topics: SpendingTopicLine[];
  entries: SpendingEntry[];
  hasMoreEntries: boolean;
  topicOptions: { id: string; name: string }[];
};

const PAGE_SIZE = 50;

function periodFrom(period: SpendingPeriod, periodStart: Date | null, now = Date.now()): Date | null {
  if (period === "reset") return periodStart;
  if (period === "7d") return new Date(now - 7 * 86_400_000);
  if (period === "30d") return new Date(now - 30 * 86_400_000);
  return null;
}

/**
 * Every metered provider call in one shape: Creative Studio text receipts and
 * generic usage charges, each joined to its ledger debit when it was charged.
 * Zero-cost rejected calls are left out; unpriced calls stay visible.
 */
function spendingItems(workspaceId: string, from: Date | null, topicId: string | null) {
  return sql`WITH items AS (
      SELECT c.id, 'text'::text AS kind, c.operation, c.provider, c.model, c.topic_id, c.story_id,
        coalesce(c.finished_at, c.created_at) AS at,
        CASE WHEN c.status = 'settled' THEN c.charged_micros ELSE c.reserved_micros END AS cost,
        (c.status <> 'settled') AS uncertain, e.amount_micros AS ledger
      FROM creative_text_calls c
      LEFT JOIN workspace_credit_entries e ON e.source_text_call_id = c.id
      UNION ALL
      SELECT u.id, u.kind, u.operation, u.provider, u.model, u.topic_id, u.story_id, u.created_at,
        u.cost_micros, false, e.amount_micros
      FROM ai_usage_charges u
      LEFT JOIN workspace_credit_entries e ON e.source_usage_charge_id = u.id
    ), scoped AS (
      SELECT i.*, t.name AS topic_name FROM items i JOIN topics t ON t.id = i.topic_id
      WHERE t.workspace_id = ${workspaceId}
        AND (${from ? from.toISOString() : null}::timestamptz IS NULL OR i.at >= ${from ? from.toISOString() : null}::timestamptz)
        AND (${topicId}::uuid IS NULL OR i.topic_id = ${topicId}::uuid)
        AND NOT (i.cost IS NOT NULL AND i.cost = 0 AND i.ledger IS NULL)
    )`;
}

const LINE_COLUMNS = sql`count(*)::int AS count,
  coalesce(sum(cost) FILTER (WHERE ledger IS NOT NULL), 0)::float8 AS charged_cost,
  coalesce(-sum(ledger), 0)::float8 AS charged,
  coalesce(sum(cost) FILTER (WHERE ledger IS NULL AND NOT uncertain), 0)::float8 AS unbilled_cost,
  coalesce(sum(cost) FILTER (WHERE ledger IS NULL AND uncertain), 0)::float8 AS uncertain_cost,
  count(*) FILTER (WHERE cost IS NULL)::int AS unpriced`;

function line(row: Record<string, unknown>): SpendingLine {
  return {
    count: Number(row.count ?? 0),
    chargedCostMicros: Number(row.charged_cost ?? 0),
    chargedMicros: Number(row.charged ?? 0),
    unbilledCostMicros: Number(row.unbilled_cost ?? 0),
    uncertainCostMicros: Number(row.uncertain_cost ?? 0),
    unpricedCount: Number(row.unpriced ?? 0),
  };
}

function addLines(target: SpendingLine, source: SpendingLine): void {
  target.count += source.count;
  target.chargedCostMicros += source.chargedCostMicros;
  target.chargedMicros += source.chargedMicros;
  target.unbilledCostMicros += source.unbilledCostMicros;
  target.uncertainCostMicros += source.uncertainCostMicros;
  target.unpricedCount += source.unpricedCount;
}

export async function getSpendingReport(input: { workspaceId?: string; period?: SpendingPeriod; topicId?: string | null; offset?: number } = {}): Promise<SpendingReport> {
  const workspaceId = input.workspaceId ?? "default";
  await syncDemoCredits();
  const period = input.period ?? "reset";
  const topicId = input.topicId ?? null;
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const periodStart = await currentSpendingPeriodStart(workspaceId);
  const from = periodFrom(period, periodStart);
  const items = spendingItems(workspaceId, from, topicId);

  const [totals, products, stories, topics, entries, topicOptions] = await Promise.all([
    db.execute(sql`${items} SELECT ${LINE_COLUMNS}, count(DISTINCT story_id)::int AS stories FROM scoped`),
    db.execute(sql`${items} SELECT operation, kind, ${LINE_COLUMNS} FROM scoped GROUP BY operation, kind`),
    db.execute(sql`${items} SELECT i.story_id, i.topic_id, max(i.topic_name) AS topic_name, max(s.title) AS title,
        max(i.at) AS last_at, ${LINE_COLUMNS}
      FROM scoped i LEFT JOIN stories s ON s.id = i.story_id
      WHERE i.story_id IS NOT NULL GROUP BY i.story_id, i.topic_id
      ORDER BY coalesce(-sum(i.ledger), 0) + coalesce(sum(i.cost) FILTER (WHERE i.ledger IS NULL), 0) DESC LIMIT 50`),
    db.execute(sql`${items} SELECT topic_id, max(topic_name) AS name, count(DISTINCT story_id)::int AS stories, ${LINE_COLUMNS}
      FROM scoped GROUP BY topic_id ORDER BY coalesce(-sum(ledger), 0) DESC`),
    db.execute(sql`${items} SELECT i.id, i.at, i.operation, i.kind, i.provider, i.model, i.topic_id, i.topic_name,
        i.story_id, s.title AS story_title, i.cost, i.ledger, i.uncertain
      FROM scoped i LEFT JOIN stories s ON s.id = i.story_id
      ORDER BY i.at DESC, i.id DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`),
    db.execute(sql`SELECT id, name FROM topics WHERE workspace_id = ${workspaceId} AND is_active ORDER BY name`),
  ]);

  // Several operations can be one product (e.g. two repair passes); merge them.
  const byProduct = new Map<string, SpendingProductLine>();
  for (const row of products.rows) {
    const product = spendingProduct(String(row.operation), String(row.kind));
    const current = byProduct.get(product.label) ?? { key: product.key, label: product.label, group: product.group, count: 0, chargedCostMicros: 0, chargedMicros: 0, unbilledCostMicros: 0, uncertainCostMicros: 0, unpricedCount: 0 };
    addLines(current, line(row));
    byProduct.set(product.label, current);
  }

  const entryRows = entries.rows.slice(0, PAGE_SIZE);
  return {
    period,
    from: from?.toISOString() ?? null,
    periodStart: periodStart?.toISOString() ?? null,
    markupBasisPoints: demoMarkupBasisPoints(),
    totals: { ...line(totals.rows[0] ?? {}), stories: Number(totals.rows[0]?.stories ?? 0) },
    products: [...byProduct.values()].sort((a, b) => (b.chargedMicros + b.unbilledCostMicros) - (a.chargedMicros + a.unbilledCostMicros)),
    stories: stories.rows.map((row) => ({
      ...line(row),
      storyId: String(row.story_id),
      topicId: String(row.topic_id),
      title: row.title ? String(row.title) : "Untitled story",
      topicName: String(row.topic_name ?? ""),
      lastAt: new Date(String(row.last_at)).toISOString(),
    })),
    topics: topics.rows.map((row) => ({ ...line(row), topicId: String(row.topic_id), name: String(row.name ?? ""), stories: Number(row.stories ?? 0) })),
    entries: entryRows.map((row) => {
      const product = spendingProduct(String(row.operation), String(row.kind));
      const cost = row.cost === null || row.cost === undefined ? null : Number(row.cost);
      const charged = row.ledger === null || row.ledger === undefined ? null : -Number(row.ledger);
      return {
        id: String(row.id),
        at: new Date(String(row.at)).toISOString(),
        product: product.label,
        group: product.group,
        kind: String(row.kind),
        provider: String(row.provider),
        model: String(row.model),
        topicId: String(row.topic_id),
        topicName: String(row.topic_name ?? ""),
        storyId: row.story_id ? String(row.story_id) : null,
        storyTitle: row.story_title ? String(row.story_title) : null,
        costMicros: cost,
        chargedMicros: charged,
        status: charged !== null ? "charged" : row.uncertain === true ? "uncertain" : cost === null ? "unpriced" : "unbilled",
      };
    }),
    hasMoreEntries: entries.rows.length > PAGE_SIZE,
    topicOptions: topicOptions.rows.map((row) => ({ id: String(row.id), name: String(row.name) })),
  };
}
