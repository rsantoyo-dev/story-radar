# Observability: logs and audit trail

**ID:** FEAT-OBS-001
**Status:** All three layers implemented: structured logger, audit events, database change capture
**Date:** October 7, 2026
**Product:** Press Craftor

## Outcome

When something goes wrong, or someone asks "who did this and when?", the answer is in one place: technical events are structured, searchable and free of secrets; business actions and every change to critical records are kept in the database, append-only.

## Layer 1 — structured logger (implemented)

- `createLogger(module)` in `src/app/modules/observability/logger.ts` writes **one JSON line per event**: `time`, `level`, `module`, `msg`, the request context and the event's fields.
- **Request context.** `authorizeRadarCollector`, the worker credential check and the Stripe webhook start a context for the request: `requestId` (Vercel's `x-vercel-id`, or a new UUID), `method`, `path`, and once authorized `actor`, `userId`, `workspaceId`, `role`. Every entry written while handling that request carries them, including entries from deep modules. `withLogContext()` does the same for jobs and scripts.
- **Redaction** (`log.core.ts`): Stripe, Resend, Google and Meta keys, bearer tokens, JWTs, connection strings, secret query parameters (`token`, `code`, `state`…) and secret-named fields are replaced; emails are masked (`r***@example.com`); errors keep name, message, code, status, cause and a short stack; long or deep values are cut.
- **Console bridge.** In production every existing `console.*` call goes through the same formatter (module `console`), so older code is structured and redacted without a rewrite. Migrate call sites to named loggers as they are touched.
- **Unhandled errors.** `onRequestError` in `instrumentation.ts` logs every error Next.js catches, with route and request id.
- **Refusals.** Refused API and worker requests are logged as warnings with the reason.
- `LOG_LEVEL` (default `info`) and `LOG_FORMAT` (`json` in production, `pretty` locally).

Vercel keeps runtime logs only for a short time. For longer retention and alerting, add a log drain (for example Axiom or Better Stack) or Sentry for errors; the JSON format works with all of them unchanged.

## Layer 2 — audit events (implemented)

`audit_events` (migration `0097`) is **append-only**: a trigger refuses UPDATE, DELETE and TRUNCATE for everyone. Each row: `occurred_at`, `workspace_id`, `topic_id`, `actor_type` (`user`, `operator`, `worker`, `stripe`, `system`), `actor_id`, `action` (`area.object.verb`), `entity_type` / `entity_id`, `outcome` (`success`, `failure`, `denied`, `attempted`), `request_id` (joins the logs) and redacted `details`. Workspace and topic are plain ids, so history outlives deleted records.

`recordAuditEvent()` / `recordAuditEventLater()` (`src/app/modules/observability/audit.ts`) fill actor, workspace, topic and request id from the request context; the "later" form writes after the response is sent. An audit write that fails is logged as an error and never fails the action.

| Action | When |
|---|---|
| `api.request` · attempted | Every authorized POST/PUT/PATCH/DELETE on the radar API: who asked for which route |
| `api.request` · denied | A signed-in caller refused for role or topic (anonymous 401s stay in the logs) |
| `auth.user.created`, `auth.session.created` | New account; every sign-in (IP and user agent) |
| `workspace.created`, `workspace.member.added`, `platform.staff.granted` | Personal workspace on first sign-in; bootstrap owner |
| `topic.created`, `topic.updated`, `topic.deleted` | Brand lifecycle |
| `meta.instagram.connected` / `disconnected`, `meta.facebook.connected` / `disconnected` | Publishing connections |
| `publication.package.frozen` / `discarded`, `publication.publish.requested`, `publication.job.confirmed_not_published` | Publishing decisions |
| `billing.checkout.started`, `billing.purchase.paid`, `billing.purchase.refunded`, `billing.checkout.expired` | Credit purchases (Stripe) |
| `credits.demo.reset`, `admin.topic_data.cleared` | Operator actions |

`GET /api/radar/audit` (owners and admins) lists the workspace's events newest first, filtered by `action` prefix, `excludeAction` prefix, `outcome`, `entityType`/`entityId`, `topicId`, and paged with `before`; `actors` names the members who acted. Platform staff may pass `scope=all` for every workspace, including events recorded without one (sign-ins).

Add an event wherever a new significant action is introduced; prefer the route or service that knows the outcome.

## Layer 3 — database change capture (implemented)

Migration `0098` adds `db_change_log` and the trigger `capture_row_change`, attached to the critical tables. The database itself records every change, whatever made it — the app, a script, a migration or a manual query:

- `table_name`, `operation` (`INSERT`, `UPDATE`, `DELETE`), `row_key` (primary key, `:`-joined), `old_values` / `new_values`, `changed_columns`, `db_user`, `transaction_id`, `occurred_at` (`clock_timestamp()`).
- **Updates keep only the columns that changed.** `updated_at` and busy bookkeeping columns (worker leases, sync cursors, run timestamps) and bulky snapshots are left out per table; an update that changes nothing else is not recorded.
- **Secrets never copied**: columns named like `*secret*`, `*password*`, `token_hash`, `*token_encrypted`, `access_token`… are stored as `[redacted]` (still listed in `changed_columns`). Text over 2,000 characters and documents over 8,000 are cut.
- **Append-only**, with the same trigger as `audit_events`.
- `transaction_id` groups the rows one statement or function changed; with `occurred_at` it lines up with `audit_events` and the logs (`request_id`).

| Captured tables | Operations |
|---|---|
| `workspaces`, `workspace_members`, `workspace_invitations`, `platform_staff`, `users` | all |
| `billing_purchases`, `billing_customers` | all |
| `workspace_credit_entries` | UPDATE, DELETE only (the ledger is itself append-only; inserts are already the record) |
| `topics`, `topic_meta_connections`, `topic_facebook_connections`, `editorial_lines`, `topic_editorial_profiles`, `creative_profiles`, `rss_sources`, `topic_sources`, `topic_auto_collection_settings` | all |
| `creative_drafts`, `creative_assets` (approvals and status), `instagram_publication_packages`, `instagram_publication_jobs`, `story_social_publications` | all |

High-volume tables (stories, story sources, metrics snapshots, AI usage) keep their own run and receipt records instead. A cascade (deleting a topic, clearing its data) records every row it removes.

`GET /api/radar/admin/changes` (owners and admins) lists the workspace's changes newest first, filtered by `table`, `operation`, `rowKey`, `transactionId`, `topicId`, paged with `before`. Platform staff may pass `scope=all` for every workspace, including rows that belong to none (users, staff, workspaces themselves) and rows captured before migration `0099` resolved a workspace.

### Useful queries

```sql
-- Who changed this member's role, and when?
SELECT occurred_at, operation, old_values, new_values FROM db_change_log
WHERE table_name = 'workspace_members' AND row_key = '<workspace>:<user>' ORDER BY occurred_at;

-- Everything one request did: its audit event, then the rows its transaction changed.
SELECT * FROM audit_events WHERE request_id = '<x-vercel-id>';

-- A workspace's day.
SELECT occurred_at, actor_type, actor_id, action, entity_type, entity_id, outcome
FROM audit_events WHERE workspace_id = '<workspace>' AND occurred_at > now() - interval '1 day' ORDER BY occurred_at;
```

## Where to look

- **Administration › Activity** in the dashboard reads both histories: *Actions* (the audit trail, API requests hidden by default) and *Record changes* (before and after values per field), filtered by area or record, outcome or operation, and brand, grouped by day with older pages on demand. Platform staff also get an *All workspaces* switch.
- **Technical logs** stay in Vercel: the project's Logs tab, or `npx vercel logs https://story-radar.vercel.app`.
- **SQL** in the Neon console for anything the views do not filter (queries above).

## Retention

`audit_events` and `db_change_log` are kept indefinitely for now. Watch their size in Neon; when needed, archive by month to R2 with an explicit, audited maintenance function rather than deleting rows.
