# Draft 2 · Autopilot, measurement and the knobs an experiment turns

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then the other Draft 2 briefs
(`docs/features/draft2-*.md`), then this document.

## 1. Why (2026-10-10)

Four real sessions were measured from their traces (`draft2_sessions.trace`).
A clean run from Facts to Caption took ~25 min of model time and US$1.54
(Brossard); with the editor's re-runs, US$2.78 (St-Jean) and US$3.13 (Tech).

- The wall clock was hours, not minutes: every step waited for a click
  (St-Jean's Opening: 15 min of calls spread over 6.8 hours).
- Sol, the judge, took 63–71% of the model time. The revision rounds ran at
  `high` effort by default: 120–210 s per judgment with 4.7–8.3k reasoning
  tokens; round 1 at `medium` judged 15 candidates in 58–121 s. Claude's
  revisions at `high` thought 3–13k tokens for answers of 0.4–1k.
- Output was 77–80% of the cost; all the input of a story cost US$0.34, so a
  perfect cache could save at most ~US$0.10.
- Caching: Claude's cached context hit in 100% of the revision rounds of
  Opening, Closing, Deck and Caption. Sol cached only its instructions:
  the step's context and the facts travelled in its string input and never
  matched; a change of effort between rounds (medium → high) lost even the
  instructions. The Facts reviewer resent a growing conversation (9k → 16k →
  23k tokens) and cached it only from the third round.
- One Sol judgment was lost to its 240 s timeout and repeated; two Claude
  calls died at the 24k output ceiling (an earlier configuration).

The editor chose to do everything below and to measure before changing any
effort for real.

## 2. Autopilot ("Run to images", the canvas)

One button runs every step to the images without stopping, from where the
session stands: Facts when they are not verified, Focus, People and places,
accounts to tag, Opening, Closing, Deck, Visual script, Images. The caption
stays manual: it tags the accounts the editor confirms, and the editor
approves the carousel for publishing (AGENTS.md §21 keeps that approval).

- `nextAutopilotStep(session, now)` (`draft-2-canvas.tsx`) picks the first
  step not finished, stopped (paused, or marked running with its heartbeat
  gone), or finished for something that changed since (the same rules each
  step shows: the focus version, the chosen opening, closing, deck, visual
  script, the people and places version). A step that needs the editor
  blocks the run: unverified facts after three extractions, a focus with a
  program finding, a failed step, a slide with no image.
- Each step keeps the judge's winner; a step that ends under the gate
  (`needs-review`) is marked in the log and the run goes on. A failure stops
  it. "Stop after this step" lets the current request finish.
- The loop drives the same `runStep` the buttons use (its pauses, its
  continuation requests, its lost-request follow); `runStep` now returns the
  session it ended on and reads the session it was given, so a loop that
  outlives the render that started it never reads a stale one.
- The log shows each step's outcome, time and cost; every step's own panel
  shows its progress meanwhile, as before.
- Steps run one at a time: the session's claim allows one run per story,
  so People and places does not run beside the text steps (it takes
  4–12 s plus the lookups).

The autopilot runs in the editor's tab, like every run today. A server queue
is the next step when runs should outlive the tab.

## 3. Measurement

- Every trace entry records its `effort` and its `costMicros`
  (`draft2-trace-cost.ts`: the meter's arithmetic, `textRate` and
  `textCostMicros`, kept beside the call; absent when the model has no
  verified rate). The meter still charges the call; this is for comparison.
- The canvas shows, per step, time inside calls and cost (`stepMetrics`,
  `draft-2-canvas.core.ts`; the accounts to tag count with the caption; the
  images add fal's charges), and for the session the total, the cost and the
  judge's share of the time (`sessionMetrics`).
- The meter's Anthropic rates follow the pricing page of 2026-10-10: cache
  reads at 5% on Sonnet 5.5 and Opus 5.5, 2.5% on Fable 5.1; cache writes
  billed at +25% over the input rate (`textCostMicros(rate, usage, cached,
  written)`; the adapters report `cacheWriteTokens`).

## 4. The knobs (environment; `draft2-models.ts`)

| Variable | Effect |
| --- | --- |
| `DRAFT2_REVISION_EFFORT_JUDGE`, `DRAFT2_REVISION_EFFORT_WRITER` | The effort of a funnel round whose plan names none (the revision rounds): `low`, `medium` or `high` (default). Round 1 keeps the plan's `medium`. |
| `DRAFT2_SHADOW_JUDGE_EFFORT` | A second judgment of every round at this effort, run in parallel with the real one (`Promise.all`), recorded on the round (`round.shadow`: verdict, winner, scores, whether it agrees, duration) and never deciding. The trace keeps it as `<operation>_shadow` with its cost. Unset, or equal to the round's effort, means no shadow. |
| `DRAFT2_MODEL_<STEP>_WRITER`, `DRAFT2_MODEL_<STEP>_JUDGE` | The model a step's role runs on (`DRAFT2_MODEL_OPENING_WRITER=claude-opus-5-5`), when it is one of the role's provider; the run records it (`writer.model`), so a stored run keeps its models whatever the environment says later. |

The experiment the editor asked for: `DRAFT2_SHADOW_JUDGE_EFFORT=medium` on
a few stories and compare, round by round, the shadow's winner and scores
with the real judgment at `high`; if they agree, set
`DRAFT2_REVISION_EFFORT_JUDGE=medium` (and try the writer's) for real; if
the shadow is lenient (scores systematically higher), keep `high` at least
on the Opening's last round. For Opus on the hooks:
`DRAFT2_MODEL_OPENING_WRITER=claude-opus-5-5` and compare Sol's round-1 best
and the final result with the Sonnet history. Both cost cents per story.

The Closing's first round now names `effort: "medium"` like every other
step's (its plan predated the effort field and ran at `high`: 131–207 s per
judgment in real runs).

## 5. Caching and time (`draft2-funnel-run.ts`)

- Sol's stable prefix: the step's context and the verified facts travel at
  the tail of its instructions (`solInstructions`), the same on every call
  of the run; its input holds the round's request alone. OpenAI's cache
  (GPT-6.1 Sol: 30 min after the last use, reads at 5%) can then match them.
  The effort still changes the hidden reasoning instructions, so round 2
  misses once when it steps up from `medium`.
- Facts: the reviewer reads the article as Claude's cached context on every
  round and, on a revised list, its earlier verdict beside it
  (`earlierReview`), instead of a conversation that grows each round
  (facts skill v2; `threads.anthropic` is no longer written).
- A call never gets more than what is left of the route's 300 s
  (`callTimeoutMs`), and a judgment that would not fit waits for a new
  request: expected length = this step's last judgment at that effort on
  the trace, else its last at another effort × 1.5, else 60/120/200 s for
  low/medium/high.

## 6. One more round (`more`)

A run that ended unaccepted with its plan's rounds spent may take an extra
round (`FUNNEL_EXTRA_ROUND`: the best version revised once more against its
remaining issues), at most `FUNNEL_MAX_EXTRA_ROUNDS` (2) per run; the run
records `extraRounds`. `POST /api/radar/draft2/<step>` takes `more: true`
(with `continue`); the canvas offers "One more round" on Opening, Closing,
Deck, Visual script and Caption. It replaces a fresh run (0.2–0.4 $) with
one write and one judgment.

## 7. The visual direction (Focus) and two scripts (Visual)

- The Focus gains `visualDirection` (≤ 600 characters; focus skill v2):
  how the images tell this story within the brand's visual identity: the
  world they live in, who or what leads them, what recurs. Claude decides it
  reading the identity in full (as the visual step does); the editor edits
  it like any field. A focus decided before the field has none; the canvas
  says so.
- The visual script follows it (visuals skill v4) and round 1 writes two
  scripts instead of three (`VISUAL_CANDIDATES`); the schema's and the
  parser's ceiling is the largest round (`VISUAL_ROUND_MAX_CANDIDATES`: two
  revisions and the proposal as edited).

## 8. Tests

- `draft2-opening.test.ts`: Sol's context at the tail of its instructions;
  the extra round (and its cap); the shadow judgment; the environment's
  models and efforts on the trace.
- `draft2-models.test.ts`: the knobs. `creative-text-cost.test.ts`: cache
  writes and the new read rates. `draft-2-canvas.core.test.ts`: the metrics.
- `draft2-facts.test.ts`: the article as context, the earlier review beside
  a revised list. `draft2-focus*.test.ts`, `draft2-visual*.test.ts`,
  `draft2-skills.test.ts`: the field, the two scripts, the skill versions.

## 9. Not yet

- A server queue for the autopilot (today it runs in the tab).
- Calibrating the judge with the editor's choices (`editorChoiceId`).
- Steps in parallel (one claim per story).
