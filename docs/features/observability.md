# Observability: logs and audit trail

**ID:** FEAT-OBS-001
**Status:** Layer 1 (structured logger) implemented; layers 2–3 (audit events, change capture) next
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

## Layer 2 — audit events (next)

An append-only `audit_events` table: when, workspace, actor (user, operator, worker, Stripe, system), action (`billing.purchase.paid`, `member.role.changed`, `draft.approved`, `publication.sent`…), entity type and id, outcome, request id and redacted details. Written by the domain services at each significant action; never updated or deleted; readable per workspace by owners and admins, and across workspaces by platform staff.

## Layer 3 — database change capture (next)

A generic PostgreSQL trigger on critical tables (credit ledger, purchases, members and invitations, publication packages and jobs, approvals) records every INSERT, UPDATE and DELETE with the before and after row and the database user, whatever wrote it — application, script or a manual query. High-volume tables (stories, sources, metrics) keep their own run records instead.
