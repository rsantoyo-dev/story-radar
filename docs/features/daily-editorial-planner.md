# Daily editorial planner — FEAT-DEP-001

## Purpose

Help the editor choose what to publish today for the selected topic. A strong
Growth Score is an acquisition estimate; the best choice today also depends on
current applicability, audience fit, recent coverage and planned publications.
This feature supports news, recipes, guides and other topic types.

## Editor flow

1. Collect or create stories and use **Evaluate with AI** as usual.
2. In Stories, open **What should we publish today?**. The timezone defaults to
   the browser's IANA timezone and can be changed explicitly.
3. Click **Recommend for today**. This is a separate AI request, not publication.
4. Review one recommendation, up to two alternatives, reasons to defer other
   candidates, and the model's uncertainty. It may recommend publishing nothing.
5. **View content** opens the existing editor. **Prepare content** extracts the
   article directly from the card. **Approve** records the existing human
   approval for that individual story, using the existing promotion endpoint
   for AI-review candidates while preserving the AI decision. Approved stories show **Approved**.
   Creative approval and publishing continue through their existing flows.
6. **Refresh recommendation** requests another comparison. Reads and polling do
   not call AI. Refresh is subject to the independent planner attempt budget.

## Architecture

- Authenticated `GET/POST /api/radar/daily-planner?topicId=…&timezone=…`.
- GET reads current context and saved output. POST accepts `{ "force": false }`
  to reuse an exact completed input, or `{ "force": true }` to refresh.
- Separate planner service and repository; append-only `daily_editorial_plans`
  stores input hash, safe context snapshot, result, provider/model, usage and
  attempt status. No writes to story evaluation scores or editorial workflow.
- Reuses the configured evaluation transport: Gemini (`GEMINI_MODEL`), secondary
  Gemini credentials, then configured Groq and Cloudflare fallbacks. Invalid
  planner responses also trigger fallback. No new provider credentials required.
- At most 30 eligible evaluated candidates, ranked by existing editorial priority
  with Growth Score as a tie-breaker. Latest topic-private article edits override
  the extracted source text. The model receives bounded previews, source identity,
  collection contexts, original scores, reasons and risks. Evaluations predating
  a profile/content edit are explicitly marked potentially stale.
- Inputs include the topic editorial profile, keyword preferences, local date,
  timezone, weekday, last ten unique confirmed publications and commitments.
- Confirmed history comes from published social records, confirmed Instagram jobs
  and imported Instagram media from the current account. Story IDs, media IDs and
  canonicalized post URLs deduplicate cross-platform/imported records. A carousel
  remains one publication. Social notes/source titles are only available context;
  they do not necessarily represent the actual published angle.
- All known published, scheduled and in-flight story IDs are excluded, including
  those older than the last ten. Also excludes human rejection, rejected/failed
  processing states, duplicate flags, AI rejection and future publication dates.
  Freshness follows editorial collection windows, profile news/research windows
  and the existing evergreen treatment of owned content.
- Schema and server validation restrict results to supplied story IDs, enforce
  uniqueness and list limits, and support an explicit no-strong-candidate outcome.
- Cache invalidates with local day/timezone, profile/preferences, candidate content
  or evaluations, recent publishing context, provider configuration and prompt
  version. Context is re-read after generation; obsolete results remain visible
  as stale. Recommendation freshness does not block explicit human approval:
  currently eligible stories can still be viewed, prepared or approved. Approval
  uses the existing server eligibility checks and shows progress/errors on the card.
- Planner runs use a per-topic reservation under a database row lock, separate
  from evaluation quotas. `AI_MAX_RUNS_PER_DAY` supplies the numeric cap for both
  independent budgets. Attempts, including failed/empty runs, count against the
  planner's UTC-day cap. A ten-minute running lease allows recovery after an
  interrupted request. Historical runs remain stored.

## Deliberate limits

The last ten posts inform repetition and variety, not a measured growth model.
Weekday does not establish audience habits or an optimal posting time. This
version does not browse to verify current applicability, fetch fresh Instagram
insights or sync the account automatically. Unknown applicability must be stated;
recent imports reflect the most recent existing Instagram sync. Growth predictions
remain estimates until calibrated against actual channel performance.

## Acceptance stories

- **DEP-01 — Context and eligibility:** selected-topic data, browser/explicit
  timezone, last ten deduplicated confirmed posts, separate commitments and
  all-history exclusions. Implemented.
- **DEP-02 — AI comparison:** configured provider chain, independent response
  schema, valid IDs, recommendation/alternatives/deferred/no-candidate result,
  no score or workflow mutations. Implemented.
- **DEP-03 — Durable attempts:** context snapshots, usage, exact-input reuse,
  concurrency reservation, daily budget, stale and interrupted states. Implemented.
- **DEP-04 — Dashboard:** dedicated action, current publishing context, uncertainty,
  original scores and safe access to the existing content editor. UXDSL palette,
  densities, typography and responsive layout. Implemented.
- **DEP-05 — Validation:** pure contract/date/history tests, PGlite query/migration
  tests, mocked Gemini-to-Groq fallback and post-generation invalidation tests.
  Live recommendation quality remains to be checked with a user-triggered run.

## Setup

Apply migration `0070_woozy_norman_osborn.sql` with `npm run db:migrate`, then
restart the app. Use the existing collector authentication and AI configuration.
No publication is scheduled or sent by this feature.
