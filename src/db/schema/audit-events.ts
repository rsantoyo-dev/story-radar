import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only audit trail of significant actions (FEAT-OBS-001, layer 2):
 * who did what, to which record, with which outcome. A database trigger
 * refuses UPDATE, DELETE and TRUNCATE. Workspace and topic are plain ids, not
 * foreign keys, so the history outlives the records it describes.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    workspaceId: text("workspace_id"),
    topicId: text("topic_id"),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    outcome: text("outcome").default("success").notNull(),
    requestId: text("request_id"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [
    index("audit_events_workspace_time_idx").on(table.workspaceId, table.occurredAt),
    index("audit_events_topic_time_idx").on(table.topicId, table.occurredAt),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_action_time_idx").on(table.action, table.occurredAt),
    index("audit_events_actor_time_idx").on(table.actorId, table.occurredAt),
    check("audit_events_actor_type_check", sql`${table.actorType} IN ('user', 'operator', 'worker', 'stripe', 'system')`),
    check("audit_events_outcome_check", sql`${table.outcome} IN ('success', 'failure', 'denied', 'attempted')`),
    check("audit_events_action_format_check", sql`${table.action} ~ '^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$'`),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
