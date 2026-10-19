# Draft 2 — v3, a recipe over the same engine

Built 2026-10-16 from the editor's plan: "v2 is working well; we make a v3 to
keep adjusting, based on v2. Remove the shadow and leave the judge at low
effort. Dropdowns for writers and judges per step, not one for all, so we
can test Sol 6.1 and compare results on the fly step by step. Fewer rounds
and more effort by default; a button for one more round. Spine: three
sketches, one developed, two rounds. Opening: Sonnet at medium, five
candidates each on a different angle, two rounds. Deck and closing together,
Sonnet at medium, two rounds, then a one-round Review that suggests changes.
Visual script: one candidate, one round, from the spine."

v3 is not a second pipeline: it is a **recipe** the same funnel runner
follows. A session says which it runs on (`draft2_sessions.pipeline`,
migration 0113, `v2` for every session stored before), every run records
the pipeline, the plan length and the efforts it started on
(`FunnelRun.pipeline`, `plannedRounds`, `efforts`), and a continued run keeps
them, so a v2 story is never finished by v3 rules and the two compare on the
same stories: cost, time, the Review's score, and whether the reader
simulation follows or shares.

## Phase 1 (this change)

| | v2 (as it was) | v3 |
| --- | --- | --- |
| Judges' effort | round 1 medium, revisions medium | **low on every round** |
| Writer's effort | round 1 medium, revisions high | **medium on every round** |
| Opening | 15 openings, 3 rounds (3 then 1 proposals) | **5 openings, each on its own angle, 2 rounds (2 proposals)** |
| Visual script | script + proposal, then the best revised: 2 rounds | **one script, one round, no proposal** |
| Closing, Deck, Caption | as before | the same rounds at v3's efforts |
| Shadow judgment | `DRAFT2_SHADOW_JUDGE_*` | **removed** (48 rounds measured, below) |
| Models | one writer and one judge for every step | **per step: writer, judge and each one's effort** |

- **The judges at low effort.** 48 shadow rounds (2026-10-15/16, Luna at low
  beside Luna at medium, five stories): the same winner on every visual
  script (8/8) and most captions (8/11), a different one on a third to a
  half of the Opening, Closing and Deck rounds (7/11, 5/10, 4/8); scores 1–2
  points apart (4 lower on the visual); three times faster (20 s against
  60–70 s a round); neither ever accepted at 95. Different is not worse: the
  per-step selects are there to measure it. **Except the visual script
  (2026-10-19):** on the 25 scripts judged at both efforts, low scored 3
  under medium on average and 7–13 under on a first script, and under v3 it
  accepted none of ten runs; `VISUAL_PLAN_V3` judges at medium (a judgment
  costs 0.001–0.005 $ either way; `docs/features/draft2-visual.md`, the
  audit addendum). `draft2RevisionEffort(role, env,
  pipeline)`; a plan round's `judgeEffort` when it names one; the editor's
  choice for the step over both.
- **Five distinct openings.** `OPENING_PLAN_V3`: five at medium, the judge at
  low proposing two; then the best revised against every finding at once
  beside the two proposals, as written and as edited, for the pick (the
  gate still stops the run at 95 with no finding). The v3 explore request
  carries `OPENING_DISTINCT_INSTRUCTION`, and the program refuses a new
  cover whose longer words are mostly another new one's
  (`SIMILAR_CANDIDATE`, overlap ≥ 0.5 of headline + subheadline; a revision
  or a proposal's edit is never checked): the fix pass sends it back once,
  and a cover still alike cannot win. Of the 7 winners measured under v2, 4
  were proposals and 3 round-1 openings; none a later round's new angle.
- **One visual script.** `VISUAL_PLAN_V3`: the spine decides what each image
  shows, so the script executes it and the judge reads it for the editor
  ("One more round" stays). v2's visual cost $0.36 and 6.8 minutes a story.
- **Per step.** `Draft2ModelChoice.steps[step] = { writer?, judge?,
  writerEffort?, judgeEffort? }` over the choice for every step
  (`draft2StepChoice`); `parseDraft2ModelChoice` keeps only the offered
  models and the three efforts. The card "Pipeline and models" (overview and
  Facts screen) has the pipeline select, a row for every step and one per
  step; the badge beside the autopilot names the pipeline. The canvas reads
  a run's rounds from `plannedRounds` (a run stored before: the step's v2
  plan).
- **Rounds.** The planned rounds are fewer; "One more round" on every funnel
  step and "Decide again" on the Focus remain the way to ask for more. The
  Focus decision and the Spine plan already think at high.

Expected per story (from the last eight: text $1.80, 33 minutes of calls):
about $1.20–1.30 and 18–20 minutes, the Opening from $0.41 and 9.7 minutes
to about $0.20 and 4, the visual from $0.36 and 6.8 to about $0.15 and 2.

## Phase 2 (next)

- The Spine writes three sketches; one is developed, in two rounds.
- The Closing and the Deck as one step, "the body", Sonnet at medium, two
  rounds; the Review reads it once and suggests the changes.
- A view that sets a v2 and a v3 run of one story side by side.

## Files

- `draft2-models.ts` (`Draft2Pipeline`, `parseDraft2Pipeline`,
  `DEFAULT_DRAFT2_PIPELINE`, `Draft2StepChoice`, `draft2StepChoice`,
  `draft2ChoiceIsEmpty`, `draft2RevisionEffort` by pipeline; the shadow knobs
  are gone), `draft2-funnel.ts` (`FunnelPlanRound.judgeEffort`,
  `FunnelRun.pipeline`, `plannedRounds`, `efforts`), `draft2-funnel-run.ts`
  (`plan(snapshot, pipeline)`, `setup({ pipeline })`, the per-step roles and
  efforts, no shadow).
- `draft2-opening.types.ts` (`OPENING_PLAN_V3`, `openingPlan`,
  `OPENING_DISTINCT_INSTRUCTION`, `SIMILAR_CANDIDATE`, `openingJudgeRequest`
  from the run's plan), `draft2-closing.types.ts` (`CLOSING_PLAN_V3`,
  `closingPlan`), `draft2-deck.types.ts` (`deckPlan(shape, pipeline)`),
  `draft2-visual.types.ts` (`VISUAL_PLAN_V3`, `visualPlan(carousel,
  pipeline)`), `draft2-caption.types.ts` (`CAPTION_PLAN_V3`, `captionPlan`).
- `db/schema/draft2-sessions.ts`, `drizzle/0113_draft2_pipeline.sql`,
  `draft2-session.repository.ts`, `draft2-facts.ts`, the facts and session
  routes (`pipeline`), `draft-2-canvas.tsx` (the card, `planRounds`).
- `scripts/draft2-inspect/inspect-shadow.mts` still reads the shadow rounds
  stored before.
