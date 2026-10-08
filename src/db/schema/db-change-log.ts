import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Every INSERT, UPDATE and DELETE on the critical tables (FEAT-OBS-001,
 * layer 3), written by the `capture_row_change` trigger whatever made the
 * change: the app, a script or a manual query. Updates keep only the columns
 * that changed; secret columns are redacted and very large values cut.
 * Append-only, like `audit_events`.
 */
export const dbChangeLog = pgTable(
  "db_change_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).default(sql`clock_timestamp()`).notNull(),
    tableName: text("table_name").notNull(),
    operation: text("operation").notNull(),
    rowKey: text("row_key").notNull(),
    /** Resolved from the row (its workspace, or its topic's) so owners see their workspace's changes. */
    workspaceId: text("workspace_id"),
    topicId: text("topic_id"),
    oldValues: jsonb("old_values").$type<Record<string, unknown>>(),
    newValues: jsonb("new_values").$type<Record<string, unknown>>(),
    changedColumns: text("changed_columns").array(),
    dbUser: text("db_user").default(sql`current_user`).notNull(),
    transactionId: bigint("transaction_id", { mode: "number" }).default(sql`txid_current()`).notNull(),
  },
  (table) => [
    index("db_change_log_row_idx").on(table.tableName, table.rowKey, table.occurredAt),
    index("db_change_log_time_idx").on(table.occurredAt),
    index("db_change_log_workspace_time_idx").on(table.workspaceId, table.occurredAt),
    index("db_change_log_transaction_idx").on(table.transactionId),
    check("db_change_log_operation_check", sql`${table.operation} IN ('INSERT', 'UPDATE', 'DELETE')`),
  ],
);

export type DbChange = typeof dbChangeLog.$inferSelect;
