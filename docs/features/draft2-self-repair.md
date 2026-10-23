# Draft 2 · Self-repair: one call from the findings, then the program decides

2026-10-23. The editor: "lo que quiero es que no falle nunca… si vemos que
necesita review, ya sabemos el punto específico, debería ser una llamada
simple para arreglarse". When a step ends for a human with findings the
program or a judge named precisely, the pipeline makes one targeted call
that fixes exactly those points, then decides on its own rules whether the
result stands. Never a second agent, never an open loop: one call, bounded,
and a deterministic check (`docs/features/pipeline-nets-over-agents`).

## Built

- **Facts** (`repairDraft2Facts` inside `runDraft2Facts`, facts skill v5).
  After the third extraction the reviewer still says "revise" on a few facts
  (a typo the article carried, a duplicate, an inferred attribution). When
  every issue names a fact or asks for a missing one and the score is 70 or
  more (`factsRepairable`), the extractor receives only those facts with the
  issues and suggestions (`repairRequest`, task "repair") and returns them
  corrected. The program applies them (`applyFactsRepair`): a named fact
  returned replaces its own, a named fact omitted is removed only when an
  issue called it a duplicate, a new fact is added only when a key fact was
  asked for, anything else is ignored. The list is accepted by the program
  when every named fact was addressed and every evidence is found verbatim in
  the article (`mechanicalFactIssues`); the evaluation records `accepted: {
  by: "program", repaired }` and the Facts screen says what was rewritten,
  removed or added, under the reviewer's verdict. Otherwise the list waits for
  the editor with what the repair left. About one call of the extractor
  (~5–10 cents) against a fourth rewrite of the whole list or a human stop.
- **Spine** (the server's autopilot, `runAutopilotPass`). A plan the program
  refuses ("Fix the spine first": `SPINE_CAVEATS`, `SPINE_GUARD_ITEMS`,
  `SPINE_SHAPE`, `SPINE_FACT_UNUSED`) is written again once with the findings
  as the planner's notes, the way the editor's notes rewrite it; the log
  shows the step with the reason "the program's findings on it". Refused
  again, the job stops with the findings.

## Next, in the same shape

- A funnel step (Opening, Closing, Deck, Visual script, Caption) whose last
  round ends with no clean version because the judge marked a material issue
  on every finalist: one fix call on the best version with those issues,
  then the program's mechanical checks, then the floor (90) decides.
- A slide without an image after its correction: one new image from scratch,
  then the review.
- People and places waiting for a confirmation: the policy, not a call
  (confirmed only by an exact verified match; otherwise no photo, no name).
- A focus finding (`NO_READER_CONSEQUENCE`, `TOO_FEW_ITEMS`): the decision
  made again once with the finding as a note.
