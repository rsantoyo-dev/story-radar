# Draft 2 · The autopilot on the server

2026-10-22. The editor: "dejemos lo mismo que tenemos, pero desde el
servidor, cosa que siempre se recupera y lo podemos reactivar… hasta el paso
que le indiquemos". The autopilot that ran in the editor's tab since
2026-10-10 now runs as a job on the server, and only there (the editor the
same day: "el flow debe ser uno solo… es mejor que corra en el servidor"):
the same steps, the same decisions, from where the story stands to the step
the editor names, with the page closed. This is the first milestone toward a scheduled, unattended run
(the plan of 2026-10-21: the hour per brand, blockers reported, and later an
authorized autopost).

## What the editor sees

On every screen's bar, **Run to the caption** and, on a step's screen, **Run
to here**; on the story's overview, the card **Autopilot** with a target step
(the caption by default) and **Run on the server**. The job starts at once;
the card shows the step running, each step as it ends with its score and
time, and why the job stopped. **Stop after this step** asks it to stop;
running it again continues from wherever the story stands (a new job; the
old one stays as history). Every screen follows the session while the job
runs (the canvas reads it every five seconds). The step-by-step buttons of
each screen still run one step in the tab, for a look at a single step.

On Today, a story with a job running is **In progress** ("Autopilot on the
server: opening running, to the caption"); a job that stopped for the editor
is in **Needs you** with its reason.

## How it runs

- `draft2_autopilot_jobs` (migration 0118): one running job per story
  (partial unique index), its target, the step running, the log of steps,
  the outcome, the passes made, a lease (`lease_owner`, `lease_until`) and
  the editor's stop request.
- **The decisions are shared** (`draft2-autopilot.core.ts`): `nextAutopilotStep`
  moved out of the canvas, unchanged, and now goes through the caption (a
  caption written for other images or other confirmed accounts is written
  again); the job cuts it at its target (`autopilotStepRuns`). `runAutopilotPass` is the loop, pure, with the
  runners injected: tested without a database or a provider.
- **A pass** (`driveDraft2AutopilotJob`) claims the job's lease, then runs
  steps until the target is done, a step blocks, fails or does not advance,
  the editor stopped it, the session spent its allowance
  (`DRAFT2_AUTOPILOT_MAX_USD`, 6 by default), or the pass has no time for the
  next step. A pass has 270 s (`AUTOPILOT_PASS_BUDGET_MS`); a step with its
  own budget (the funnel's, the images', the facts') receives the pass's
  deadline and pauses before it as it did before the route's limit
  (`FunnelStepInput.deadline`); a step without one (people and places, focus,
  spine, accounts, review) starts only with its estimate left. A step that
  pauses is continued at once, as the tab did.
- **The next pass** is chained by the pass itself through
  `POST /api/internal/draft2/resume` (the publication worker's credential,
  the request's own origin), which answers 202 and runs the pass after the
  response, in its own 300 s. The worker's cron
  (`.github/workflows/draft2-autopilot-worker.yml`, every five minutes, the
  same URL variable and secret as the publication worker) and a read of the
  story (the session route, the job route) give a pass to a job whose lease
  is free: a pass lost to a deploy or a crash costs at most the cron's
  interval. A lost pass frees its lease after 330 s.
- **The Review never stops the job.** Its necessary patches (truth,
  repetition, detail) are applied as the tab's run did and its score is in
  the log: every one of 33 reviews scored under 90 and the editor went on
  without a change in 24 of them (2026-10-21). The tab's run, and its stop
  under 90, were removed with it.
- **What blocks** is what blocked the tab: unverified facts after three
  extractions, people waiting for confirmation before a focus, a focus or
  spine finding, a failed step, a slide with no image, a step that comes up
  twice in a row. The job records the reason and waits for the editor; "Run
  on the server" again goes on once it is fixed. A step's own failure stops
  the job with the step's message; a pass's own failure (the database, a lost
  lease) leaves the job running for the next pass.
- **Routes**: `POST /api/radar/draft2/autopilot` { storyId, until? } starts
  (202, the job), `GET ?storyId` reads the latest job (and kicks one waiting),
  `PATCH` { storyId, jobId, action: "stop" } stops. The session route returns
  `job` beside the session; the sessions route returns `jobs` for Today.
- **Not in the job**: the publish approval and the publication (the editor's
  click, AGENTS.md §21), the accounts' confirmation (the caption tags those
  confirmed when it runs), the hand edits.

## Running it locally

The same code: the start route runs the first pass, the chain calls
`http://localhost:3000/api/internal/draft2/resume` with the worker secret in
`.env.local`, and a read of the story kicks a waiting job. Without the
secret, a job still advances on every read of its story. There is no cron
locally. Production needs this deployment: an older server never selects a
job.

## Next

The plan of 2026-10-21, in order: the hour per brand (Prepare my day
headless, then this job), a blocker's email, the rules that turn the
remaining stops into decisions (confirmations by exact match, a second image
try), and the authorized autopost with a cancellation window.

## Addendum, 2026-10-23: start over

"Start over from the facts" on the Autopilot card (`fresh` on the job,
migration 0119): the job's first step is the facts, which open a new session
whatever the story's latest one says, and the steps then follow from it. The
earlier session stays as history, with its approval and its runs. The top
bar's buttons keep going on from where the story stands.

## Addendum, 2026-10-23: a script written again reuses its ids

A visual script written again numbers its versions from c1 like the first
one, so the Saint-Jean weekend's new script (written without a false photo)
won as "c1.2" again: the autopilot took the earlier images as current and
ended the job without redrawing them. The images now follow the script
version with their id written before they started (`imagesScript`); the
autopilot, the caption, the publication, a continued images run and the
canvas all read it that way.
