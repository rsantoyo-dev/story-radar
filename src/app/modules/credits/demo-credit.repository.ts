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
  createdAt: string;
};

export type DemoCreditAccount = {
  initialMicros: number;
  balanceMicros: number;
  availableMicros: number;
  overdrawnMicros: number;
  pendingMicros: number;
  spentMicros: number;
  scope: "creative-studio-text";
  entries: DemoCreditEntry[];
};

/** Reconcile a saved provider receipt after settlement or a process crash. */
export async function syncDemoCredits(): Promise<void> {
  await db.execute(sql`SELECT sync_demo_credit_text_usage()`);
}

export async function getDemoCreditAccount(): Promise<DemoCreditAccount> {
  await syncDemoCredits();
  const [summary, activity] = await Promise.all([
    db.execute(sql`SELECT
      coalesce(sum(e.amount_micros), 0)::int AS balance,
      coalesce(-sum(e.amount_micros) FILTER (WHERE e.kind = 'usage_debit'), 0)::int AS spent,
      coalesce((SELECT sum(ceil(coalesce(c.charged_micros, c.reserved_micros)::numeric *
        (10000 + (c.pricing->>'demoMarkupBasisPoints')::integer) / 10000))::int
        FROM creative_text_calls c JOIN topics t ON t.id = c.topic_id
        WHERE t.workspace_id = 'default' AND
          ((c.status = 'reserved' AND c.charged_micros IS NULL) OR c.status = 'uncertain')
          AND c.pricing ? 'demoMarkupBasisPoints'
          AND (c.pricing->>'demoMarkupBasisPoints') ~ '^[0-9]+$'
          AND (c.pricing->>'demoMarkupBasisPoints')::integer BETWEEN 0 AND 50000), 0)::int AS pending
      FROM workspace_credit_entries e WHERE e.workspace_id = 'default'`),
    db.execute(sql`SELECT e.id, e.kind, e.amount_micros, e.reference_cost_micros, e.reason,
      e.markup_basis_points, e.created_at, c.operation, c.provider, c.model
      FROM workspace_credit_entries e
      LEFT JOIN creative_text_calls c ON c.id = e.source_text_call_id
      WHERE e.workspace_id = 'default'
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
    spentMicros: Number(summary.rows[0]?.spent ?? 0),
    scope: "creative-studio-text",
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
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
  };
}
