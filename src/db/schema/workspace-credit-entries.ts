import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { aiUsageCharges } from "./ai-usage-charges";
import { creativeTextCalls } from "./creative-text-accounting";
import { workspaces } from "./workspaces";

/** Immutable demo-credit postings. This is also the ledger AUTH-08 will extend. */
export const workspaceCreditEntries = pgTable(
  "workspace_credit_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    amountMicros: integer("amount_micros").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason"),
    sourceTextCallId: uuid("source_text_call_id").references(
      () => creativeTextCalls.id,
      { onDelete: "restrict" },
    ),
    /** The non-text spend this debit settles (images, searches, maps…). */
    sourceUsageChargeId: uuid("source_usage_charge_id").references(
      () => aiUsageCharges.id,
      { onDelete: "restrict" },
    ),
    referenceCostMicros: integer("reference_cost_micros"),
    markupBasisPoints: integer("markup_basis_points"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_credit_entries_idempotency_idx").on(
      table.idempotencyKey,
    ),
    uniqueIndex("workspace_credit_entries_text_call_idx").on(
      table.sourceTextCallId,
    ),
    uniqueIndex("workspace_credit_entries_usage_charge_idx").on(
      table.sourceUsageChargeId,
    ),
    index("workspace_credit_entries_workspace_time_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    check(
      "workspace_credit_entries_kind_check",
      sql`${table.kind} IN ('demo_grant', 'signup_grant', 'usage_debit', 'refund', 'demo_reset')`,
    ),
    check(
      "workspace_credit_entries_amount_check",
      sql`(${table.kind} = 'usage_debit' AND ${table.amountMicros} < 0)
        OR (${table.kind} IN ('demo_grant', 'signup_grant', 'refund') AND ${table.amountMicros} > 0)
        OR (${table.kind} = 'demo_reset')`,
    ),
    check(
      "workspace_credit_entries_source_check",
      sql`(${table.kind} = 'usage_debit' AND ((${table.sourceTextCallId} IS NOT NULL) <> (${table.sourceUsageChargeId} IS NOT NULL)) AND ${table.referenceCostMicros} IS NOT NULL AND ${table.referenceCostMicros} > 0 AND ${table.markupBasisPoints} IS NOT NULL AND ${table.markupBasisPoints} >= 0)
        OR (${table.kind} <> 'usage_debit' AND ${table.sourceTextCallId} IS NULL AND ${table.sourceUsageChargeId} IS NULL AND ${table.referenceCostMicros} IS NULL AND ${table.markupBasisPoints} IS NULL)`,
    ),
  ],
);

export type WorkspaceCreditEntry = typeof workspaceCreditEntries.$inferSelect;
