# Observability: logs and audit trail

**ID:** FEAT-OBS-001
**Status:** Layers 1 (structured logger) and 2 (audit events) implemented; layer 3 (change capture) next
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

`GET /api/radar/audit` (owners and admins) lists the workspace's events newest first, filtered by `action` prefix, `entityType`/`entityId`, `topicId`, and paged with `before`.

Add an event wherever a new significant action is introduced; prefer the route or service that knows the outcome.

## Layer 3 — database change capture (next)

A generic PostgreSQL trigger on critical tables (credit ledger, purchases, members and invitations, publication packages and jobs, approvals) records every INSERT, UPDATE and DELETE with the before and after row and the database user, whatever wrote it — application, script or a manual query. High-volume tables (stories, sources, metrics) keep their own run records instead.
