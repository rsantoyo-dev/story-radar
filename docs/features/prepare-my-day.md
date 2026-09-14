# Prepare my day — FEAT-DAY-001

## User flow

In **Overview**, choose an **Editorial line** and click a destination in
**Collect → Evaluate → Recommend → Content → Brief → Draft**.
The run executes through that step and stops. Clicking a later step continues
the same run from its saved checkpoint: Recommend → Brief only prepares content
and creates the brief. Completed content/creative steps open their results;
recommendations appear below the sequence. **New run** resets the destination
selection so the next click starts a fresh collection, preserving the prior run.
Changing the selected editorial line also starts a new run on the next click.
The UI displays the active stage, completed stages, collected/evaluated counts,
partial-result notices and actionable failures, in English:

1. **Collecting stories…** — uses the selected line's source selection, collection
   period and AI research settings. Existing collection quotas remain enforced.
2. **Evaluating stories with AI…** — uses the existing evaluation service and
   configured provider fallbacks, skips cached inputs, and processes successive
   batches until no pending candidates remain or the daily quota is reached.
3. **Preparing today’s recommendation…** — invokes the existing daily planner
   with the browser's timezone, the topic profile and publication history.
4. **Your daily selection is ready** — shows the planner in Overview, including
   alternatives, uncertainty, **View content**, **Prepare content** and **Approve**.
   If no strong candidate exists, the planner states that explicitly.

Evaluation and recommendation consider eligible stories across the topic, not
only items found in this collection. The selected line controls collection.
A partial collection is labelled. An exhausted evaluation budget advances to the
planner with **Evaluation incomplete — daily limit reached**; evaluated counts
never include cached or failed stories. A provider error stops at its stage.
Clicking a failed step retries it; clicking a later destination retries the
failed step and continues through the chosen destination. Completed stages are retained.
Nothing is automatically approved, scheduled or published.

## Execution and persistence

`daily_preparation_runs` stores topic, line identity, timezone, stage, progress,
errors and a worker lease. Starting while a topic already has a running job
returns that job instead of launching another. Stage writes are fenced by the
lease owner, preventing an expired worker overwriting a newer worker's result.

Authenticated endpoints:

- `GET /api/radar/daily-preparation?topicId=…` returns current status and available
  lines; it may resume an existing authorized job, never create one.
- `POST` on the same URL accepts `{action:"start",lineId,timezone,targetStep}`
  or `{action:"continue",runId,targetStep}`. The optional legacy `mode` and
  `{action:"retry",runId}` remain supported. Topic and line ownership are checked server-side.
- `POST /api/radar/daily-preparation/resume` kicks pending jobs for the worker.

Next.js `after()` starts server work after responding, so closing the browser
normally does not cancel it. The durable worker below supplies recovery after
server restarts or hosting execution limits. Each kick has a bounded loop;
subsequent kicks resume persisted stages. An abandoned lease expires after
15 minutes. Failed jobs require explicit retry; they are not retried forever.

Completed collection results have a persisted collection request ID and can be
reused after an interrupted checkpoint. Explicit retry of failed collection
creates a new bounded collection attempt. Evaluation and recommendation reuse
existing caches. External calls are not claimed to be exactly-once: a server loss
before a provider result is persisted can require a new call on retry.

## Setup

Apply migration `0071_woozy_captain_universe.sql` with `npm run db:migrate`.
Start the app normally. For reliable unattended recovery, run another process:

```sh
npm run worker:daily
```

The worker loads `.env.local` and uses `RADAR_COLLECTOR_SECRET` plus
`DAILY_PREPARATION_WORKER_URL` (fallback: `RADAR_APP_URL`). For local use:

```dotenv
DAILY_PREPARATION_WORKER_URL=http://localhost:3000
```

HTTPS is required for non-loopback destinations. The worker refuses redirects
and never logs credentials. In production, keep this worker running or invoke
its authenticated resume endpoint on a regular schedule. The app must be online;
the browser is not the scheduler.

## Stories and validation

- **DAY-01:** durable job, stage checkpoints, topic-level reservation and leases.
- **DAY-02:** collection → cached batch evaluation → current recommendation,
  preserving each existing service's limits and human approvals.
- **DAY-03:** Overview line selector, English progress, counters, partial results,
  retry action and embedded planner actions using UXDSL tokens.
- **DAY-04:** worker for unattended resumption and documented local setup.
- **DAY-05:** mocked full workflow tests for ordering, multi-batch evaluation,
  failed-stage retry, quota handling and cached collection recovery; PGlite tests
  for reservations, claims, topic isolation and fencing stale workers.

All five stories are implemented. Live AI output quality still requires an
editor-triggered run; automated validation uses mocked providers.

## Prepare my draft — extended mode

Choosing Content, Brief or Draft uses `progress.mode = "draft"` and stores the
destination in `progress.targetStep`; `progress.completedStep` records the last
finished stage. Existing jobs without a target retain their day/draft destination
and can be extended after completion. No schema
migration is required; the versioned progress JSON holds the new checkpoints.

After recommendation, draft mode selects only the primary recommended story:

- **Preparing and checking article content…** reuses a `full` or `likely-full`
  editorial copy and invokes article preparation only for missing or summary-only
  text. This avoids rejecting a substantial RSS copy merely because a publisher
  blocks a redundant extraction. Incomplete content stops with **Needs your
  review** and **Review content**.
- **Creating creative brief…** uses the existing generator, profile, cache and
  creative budget. Ambiguous collection context or limited/insufficient evidence
  stops for review instead of silently choosing an editorial interpretation.
- **Generating draft…** uses the brief's recommended format and existing draft
  generation and review pipeline. Current cached drafts can be reused. Unresolved
  quality issues retain the saved draft with **Needs your review**.
- **Your draft is ready** provides **Open draft**, targeting the saved draft ID
  and carrying the exact preparation-run authorization into Creative Studio.

A topic/story-specific authorization tied to the draft-preparation job permits
brief/draft generation and workspace reading before human story approval. The
same content access supports reviewing and approving the saved draft, refreshing
its character references, and composing or regenerating its images. Image
generation still requires draft approval, and content freshness and evidence
checks still apply. The job never writes human approvals. Standalone documentary
creation and publication keep their existing approval requirements.

Retries preserve previous stages. If article/profile inputs change after the
brief checkpoint, the job stops for review in the creative workspace. A failed
extraction/provider call is retryable; it never fabricates article evidence.
