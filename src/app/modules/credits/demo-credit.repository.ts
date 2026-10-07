import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { DEMO_CREDIT_GRANT_MICROS } from "./demo-credit-policy";

export type DemoCreditEntry = {
  id: string;
  kind: "demo_grant" | "usage_debit" | "demo_reset" | "refund" | "signup_grant";
  amountMicros: number;
  referenceCostMicros: number | null;
  markupBasisPoints: number | null;
  reason: string | null;
  operation: string | null;
  provider: string | null;
  model: string | null;
  /** image | text | search | map | embedding | reader; null for creative text calls and grants. */
  usageKind: string | null;
  createdAt: string;
};

/** Daily spend and pace, to see how long the balance lasts. */
export type DemoCreditHistory = {
  days: { day: string; micros: number }[];
  byKind: { kind: string; micros: number }[];
  last7DaysMicros: number;
  /** Spend recorded without a configured rate (counted, not charged). */
  unpricedCount: number;
};

export type DemoCreditAccount = {
  initialMicros: number;
  balanceMicros: number;
  availableMicros: number;
  overdrawnMicros: number;
  pendingMicros: number;
  /** Credits used since the current period began (the last reset, or the opening grant). */
  spentMicros: number;
  spentAllTimeMicros: number;
  /** When the current period began; null before the opening grant exists. */
  periodStart: string | null;
  scope: "all-metered-spend";
  /** Set by the API: the caller may reset this demo balance (platform operator). */
  canReset?: boolean;
  entries: DemoCreditEntry[];
  history: DemoCreditHistory;
};

/** Reconcile a saved provider receipt after settlement or a process crash. */
export async function syncDemoCredits(): Promise<void> {
  await db.execute(sql`SELECT sync_demo_credit_text_usage()`);
}

/** A workspace's credit account; `default` is the seeded demo workspace. */
export async function getDemoCreditAccount(workspaceId = "default"): Promise<DemoCreditAccount> {
  await syncDemoCredits();
  const [summary, activity] = await Promise.all([
    db.execute(sql`SELECT
      coalesce(sum(e.amount_micros), 0)::int AS balance,
      coalesce(-sum(e.amount_micros) FILTER (WHERE e.kind = 'usage_debit'), 0)::int AS spent,
      max(e.created_at) FILTER (WHERE e.kind IN ('demo_reset', 'demo_grant', 'signup_grant')) AS period_start,
      coalesce(-sum(e.amount_micros) FILTER (WHERE e.kind = 'usage_debit' AND e.created_at >= (
        SELECT max(p.created_at) FROM workspace_credit_entries p
        WHERE p.workspace_id = ${workspaceId} AND p.kind IN ('demo_reset', 'demo_grant', 'signup_grant'))), 0)::int AS spent_period,
      coalesce((SELECT sum(ceil(coalesce(c.charged_micros, c.reserved_micros)::numeric *
        (10000 + (c.pricing->>'demoMarkupBasisPoints')::integer) / 10000))::int
        FROM creative_text_calls c JOIN topics t ON t.id = c.topic_id
        WHERE t.workspace_id = ${workspaceId} AND
          ((c.status = 'reserved' AND c.charged_micros IS NULL) OR c.status = 'uncertain')
          -- An unresolved call holds credits for a day at most, so a lost response never hides the balance.
          AND c.created_at > now() - interval '24 hours'
          AND c.pricing ? 'demoMarkupBasisPoints'
          AND (c.pricing->>'demoMarkupBasisPoints') ~ '^[0-9]+$'
          AND (c.pricing->>'demoMarkupBasisPoints')::integer BETWEEN 0 AND 50000), 0)::int AS pending
      FROM workspace_credit_entries e WHERE e.workspace_id = ${workspaceId}`),
    db.execute(sql`SELECT e.id, e.kind, e.amount_micros, e.reference_cost_micros, e.reason,
      e.markup_basis_points, e.created_at, coalesce(c.operation, u.operation) AS operation,
      coalesce(c.provider, u.provider) AS provider, coalesce(c.model, u.model) AS model, u.kind AS usage_kind
      FROM workspace_credit_entries e
      LEFT JOIN creative_text_calls c ON c.id = e.source_text_call_id
      LEFT JOIN ai_usage_charges u ON u.id = e.source_usage_charge_id
      WHERE e.workspace_id = ${workspaceId}
      ORDER BY e.created_at DESC, e.id DESC LIMIT 25`),
  ]);
  const balanceMicros = Number(summary.rows[0]?.balance ?? 0);
  const pendingMicros = Number(summary.rows[0]?.pending ?? 0);
  return {
    initialMicros: DEMO_CREDIT_GRANT_MICROS,
    balanceMicros,
    availableMicros: Math.max(0, balanceMicros - pendingMicros),
    overdrawnMicros: Math.max(0, pendingMicros - balanceMicros),
    pendingMicros,
    spentMicros: Number(summary.rows[0]?.spent_period ?? 0),
    spentAllTimeMicros: Number(summary.rows[0]?.spent ?? 0),
    periodStart: summary.rows[0]?.period_start ? new Date(String(summary.rows[0].period_start)).toISOString() : null,
    scope: "all-metered-spend",
    history: await getDemoCreditHistory(workspaceId),
    entries: activity.rows.map((row) => ({
      id: String(row.id),
      kind: row.kind as DemoCreditEntry["kind"],
      amountMicros: Number(row.amount_micros),
      referenceCostMicros: row.reference_cost_micros === null ? null : Number(row.reference_cost_micros),
      markupBasisPoints: row.markup_basis_points === null ? null : Number(row.markup_basis_points),
      reason: row.reason === null ? null : String(row.reason),
      operation: row.operation === null ? null : String(row.operation),
      provider: row.provider === null ? null : String(row.provider),
      model: row.model === null ? null : String(row.model),
      usageKind: row.usage_kind === null || row.usage_kind === undefined ? null : String(row.usage_kind),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
  };
}

/** The last 30 days of debits by UTC day and by kind (creative text counts as "text"). */
export async function getDemoCreditHistory(workspaceId = "default"): Promise<DemoCreditHistory> {
  const [daily, kinds, unpriced] = await Promise.all([
    db.execute(sql`SELECT to_char(date_trunc('day', e.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        -sum(e.amount_micros)::float8 AS micros
      FROM workspace_credit_entries e
      WHERE e.workspace_id = ${workspaceId} AND e.kind = 'usage_debit' AND e.created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`),
    db.execute(sql`SELECT coalesce(u.kind, 'text') AS kind, -sum(e.amount_micros)::float8 AS micros
      FROM workspace_credit_entries e LEFT JOIN ai_usage_charges u ON u.id = e.source_usage_charge_id
      WHERE e.workspace_id = ${workspaceId} AND e.kind = 'usage_debit' AND e.created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 2 DESC`),
    db.execute(sql`SELECT count(*)::int AS n FROM ai_usage_charges u JOIN topics t ON t.id = u.topic_id
      WHERE t.workspace_id = ${workspaceId} AND u.cost_micros IS NULL AND u.created_at > now() - interval '30 days'`),
  ]);
  const byDay = new Map(daily.rows.map((row) => [String(row.day), Number(row.micros)]));
  const days: DemoCreditHistory["days"] = [];
  for (let offset = 29; offset >= 0; offset--) {
    const day = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    days.push({ day, micros: byDay.get(day) ?? 0 });
  }
  return {
    days,
    byKind: kinds.rows.map((row) => ({ kind: String(row.kind), micros: Number(row.micros) })),
    last7DaysMicros: days.slice(-7).reduce((sum, entry) => sum + entry.micros, 0),
    unpricedCount: Number(unpriced.rows[0]?.n ?? 0),
  };
}
