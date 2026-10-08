import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Every API request and its response (FEAT-OBS-001): who, which route, status,
 * duration and redacted, size-limited bodies. Operational data, unlike the
 * audit trail: owners may purge it and maintenance deletes it after
 * API_REQUEST_LOG_RETENTION_DAYS (30 by default).
 */
export const apiRequestLog = pgTable(
  "api_request_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    requestId: text("request_id"),
    workspaceId: text("workspace_id"),
    topicId: text("topic_id"),
    actorType: text("actor_type"),
    actorId: text("actor_id"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    query: text("query"),
    status: integer("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    requestBody: text("request_body"),
    responseBody: text("response_body"),
    responseBytes: integer("response_bytes"),
    error: text("error"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("api_request_log_workspace_time_idx").on(table.workspaceId, table.occurredAt),
    index("api_request_log_time_idx").on(table.occurredAt),
    index("api_request_log_request_idx").on(table.requestId),
    index("api_request_log_actor_time_idx").on(table.actorId, table.occurredAt),
    index("api_request_log_status_time_idx").on(table.status, table.occurredAt),
  ],
);

export type ApiRequestLogEntry = typeof apiRequestLog.$inferSelect;
