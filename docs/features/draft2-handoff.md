# Draft 2 — handoff for the next agent (state on 2026-10-11, evening)

Written for the agent who continues Draft 2 with the editor, starting with
UI details. It gathers what the briefs do not say in one place: where each
step stands, what was decided with the editor and why, what the real runs
measured, the working rules the editor set, what is still open, and how to
inspect a run without touching it. Read it before the step briefs; then read
the brief of the step you touch.

The step briefs, each the authority on its step:
`draft2-focus.md`, `draft2-opening.md`, `draft2-closing.md`, `draft2-deck.md`,
`draft2-visual.md`, `draft2-images.md`, `draft2-caption.md` (also Mentions and
Publish), `draft2-autopilot.md` (autopilot, measurement, knobs, caching, floor
rule). Facts has no brief of its own; `draft2-facts.ts` and `skills/facts.ts`
carry its rules.

## 1. What Draft 2 is

A second creative pipeline beside the untouched v1 studio, hook-first, built
one step at a time since 2026-10-09 (button "Draft 2" on the story page,
canvas at `/topics/{topicId}/stories/{storyId}/draft-2`, `src/app/draft-2-canvas.tsx`
with pure helpers in `draft-2-canvas.core.ts`). Server logic lives in
`src/app/modules/draft2/`, routes under `src/app/api/radar/draft2/`. One row
per session in `draft2_sessions`; every step stores its runs as JSON on that
row (`facts`, `focus`, `inventory`, `mentions`, `opening`, `closing`, `deck`,
`visual`, `images`, `caption`, `publication`) with history (`previousRuns`),
and `trace` records every provider call with model, effort, duration, usage
and `costMicros`.

Steps, in the autopilot's order:

1. **Facts** — Sol extracts (`DRAFT2_EXTRACTOR_MODEL`, default gpt-6.1-sol),
   Claude reviews, up to three rounds. Reads the story's prepared content
   (`getStoryContent`); "Run the facts again" creates a **new session row**,
   which is the only reset there is (the old session stays as history).
2. **People and places** (inventory) — entities from the facts, story photos,
   Google Maps / Wikidata matches for places, characters. Since 2026-10-12 it
   runs before the Focus, which chooses the narrative form with it; the
   autopilot stops here while people wait for confirmation and no focus is
   decided yet. Places still go unconfirmed in autopilot (see §7).
3. **Focus** — Claude decides line, audience, framing, reader consequence,
   structure, goal, voice, direction, the **narrative form** (classic,
   character-guide or traveling-object, reviewed by the judge when Claude
   chooses one; `draft2-focus.md` §12) and `visualDirection` (≤ 600 chars).
   The editor's edits stick (`focus.version`); one corrective retry on a
   malformed answer.
4. **Mentions** — Claude proposes Instagram usernames, Instagram Business
   Discovery verifies them, the editor confirms (PATCH). A confirmed account
   is a decision to tag it in the caption.
5. **Opening** (cover + slide 2), then **Closing** (6), **Deck** (7),
   **Visual script** (8) and, after the images, **Caption** (10) — all on the
   shared funnel engine (`draft2-funnel.ts` pure, `draft2-funnel-run.ts`
   runner): Claude writes, the judge scores and proposes, the program adds
   mechanical findings that block winning, acceptance needs the judge's
   "accept" **and** overall ≥ 95 with every criterion ≥ 85 and no program
   finding (`funnelAcceptedWinner`).
6. **Images** (step 9) — fal.ai GPT Image per slide (low quality, 4:5
   1080×1350), Sol reviews each image, one automatic correction for a flagged
   first image, the editor approves or regenerates.
7. **Publish** (step 11) — the editor approves; the carousel is copied once
   into hidden v1 rows and v1's publication posts to the Topic's Facebook Page
   and/or Instagram. Immutable package; only the app's buttons publish.

Autopilot ("Run to images") runs the pipeline from Facts to Images (steps 1–9) from wherever the session stands,
one step at a time in the browser tab (the session claim is one run per
story), continues on needs-review, **stops on a failed run** (the editor must
run that step again by hand, then the autopilot can go on). Caption and
Publish stay manual.

## 2. Funnel rules as they stand

- Plans (`*_ROUND_PLAN` in each `*.types.ts`): Opening 15 fresh + 3 judge
  proposals (medium) → revise 3 + proposals as written and edited, judge
  proposes 1 → revise 2 + last proposal. Closing 8 + 2 proposals (medium) →
  revise 2. Deck: arc 4 → 2 revised + proposal; list/steps 2 → 1 revised +
  proposal. Visual 2 scripts + 1 proposal (medium) → revise 2 → revise 1.
  Caption 3 + 1 proposal (medium) → revise 1. Round 1 at medium, revisions at
  writer `high` / judge `medium` (`draft2RevisionEffort`).
- Gate: accept 95, criterion floor 85. **Floor rule** (commit 58a8b20):
  `FUNNEL_ACCEPTABLE_SCORE = 90`; an unaccepted run whose best is ≥ 90 ends
  as "Acceptable · N"; under 90 the run takes extra rounds on its own
  (`FUNNEL_EXTRA_ROUND` revise 1), automatic and manual ("One more round")
  together capped by `FUNNEL_MAX_EXTRA_ROUNDS = 2`. The editor insisted on
  the cap ("si no podría quedarse en loop").
- Time: `TIME_BUDGET_MS` 230 s, `ROUND_DEADLINE_MS` 280 s, `ROUTE_LIMIT_MS`
  300 s; a round starts only if the last same-effort writer and judge
  durations fit; a provider timeout **pauses** the run at its round (the
  autopilot continues it). A provider refusal (HTTP 429, 5xx) still **fails**
  the run (see §7).
- Judge proposals compete in the next round as written and as edited by
  Claude, judged blind. A judge that scores its own proposal or names it the
  winner no longer ends the run (commit 7f6f6ce): the score is dropped, the
  best scored candidate stands with verdict "revise".
- Mechanical findings worth knowing: length limits (COVER_TOO_LONG,
  SUBHEADLINE_TOO_LONG, BODY_TOO_LONG, LAST_BODY_TOO_LONG with a plan-dependent
  limit), UNSUPPORTED_NUMBER (`statedNumbers`: cited facts' numbers, list
  numbering 1..N, a season "2026-2027" written as two years), FORBIDDEN_ELEMENT
  (Unicode-aware word boundaries, with `ALLOWED` exceptions for reserved logo
  space and negations), UNVERIFIED_PLACE (a visual script depicting a place
  nobody confirmed), UNVERIFIED_MENTION and MENTION_MISSING (captions),
  SAME_SHOT (two consecutive wide shots).

## 3. Working agreements with the editor (standing)

- **Never run real providers in tests; never spend the editor's credits.**
  Tests use `loadInSandbox` mocks; vm-realm objects are compared via JSON.
- **The database is shared between dev and production.** Additive changes
  only; inspect it read-only (scripts in `scripts/draft2-inspect/`). R2 was
  **not** shared until 2026-10-11 evening: local used
  `CLOUDFLARE_R2_OBJECT_PREFIX=press-craftor`, production `story-radar-images`;
  the editor then set local to `story-radar-images` too (see §7 item 3).
- **Build in a separate git worktree** (share `node_modules` by symlink; load
  env inside node with `require('@next/env').loadEnvConfig('<repo>', true)`,
  never copy `.env.local`), run `npm test`, `npm run lint`, `npm run build`
  there, commit on a branch, then **fast-forward main only when no Draft 2 run
  is live or just paused** (`check-any-running.mts`; the session `06a50eec`
  always shows "visual running" with an age of a day — a stale row, not a run).
  The dev server runs from the main checkout and hot-reloads what lands.
- Commit messages explain behaviour, in English, and end with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (replace with the
  current agent's attribution).
- Filter any command output for credentials (`grep -v -i 'postgres\|@\|password\|url'`),
  never print contact values, never expose R2 keys or tokens to the browser.
- Reply to the editor in Spanish; docs and code in English.
- **Observation mode** (editor's decision, 2026-10-11): keep the current
  setup for 3–5 stories, collect notes, then one batch of rubric and
  mechanical fixes. Bug fixes go in as found. Funnel widening was evaluated
  and declined for now ("dejémoslo así por ahora").

## 4. Environment knobs and current local values

The knob table is in `draft2-autopilot.md` §4 (`draft2-models.ts`). Names and
non-secret values as of this handoff:

| Variable | Local value | Meaning |
| --- | --- | --- |
| `CREATIVE_ANTHROPIC_MODEL` | claude-sonnet-5-5 | the writer everywhere (default too) |
| `DRAFT2_MODEL_JUDGE` | gpt-6-luna | the judge of every funnel step (Luna, $0.10/$0.50 per M); per-step `DRAFT2_MODEL_<STEP>_JUDGE` wins |
| `DRAFT2_MODEL_WRITER`, `DRAFT2_MODEL_<STEP>_WRITER` | unset | writer overrides (the provider must fit the model: a `claude-…` or a `gpt-…` name) |
| `DRAFT2_REVISION_EFFORT_JUDGE` / `_WRITER` | unset (medium / high) | effort of revision rounds |
| `DRAFT2_SHADOW_JUDGE_EFFORT`, `DRAFT2_SHADOW_JUDGE_MODEL` | unset | a parallel judgment recorded on `round.shadow`, deciding nothing |
| `DRAFT2_EXTRACTOR_MODEL` | unset (gpt-6.1-sol) | Facts extractor and image reviews stay on Sol |
| `CLOUDFLARE_R2_OBJECT_PREFIX` | story-radar-images (was press-craftor until 2026-10-11 evening) | the same as production now, so both environments read each other's images; the dev server must be restarted to pick the change up |

Pricing used by the meter (`creative-text-cost.ts`): Sonnet 5.5 $2/$10,
Opus 5.5 $4/$20, Fable 5.1 $10/$50 per M; cache reads 5% (Fable 2.5%), cache
writes +25%; gpt-6.1-sol $2/$10, gpt-6-luna $0.10/$0.50, gpt-6-astra $10/$50.
There is no "gpt-6.1-luna".

## 5. What landed in the last two days (main, oldest first)

| Commit | Behaviour |
| --- | --- |
| d94242b | Caption and Publish steps: caption with kept line breaks, emojis within the Topic allowance, verified mentions, 5–8 hashtags; publication through v1's immutable package |
| 832799b | Lean pass: autopilot "Run to images", `effort` and `costMicros` on every trace entry, per-step time/cost in the canvas, env knobs, Sol's context moved into its instructions for prefix caching, Facts reviewer on cached context, adaptive call timeout, Focus `visualDirection`, two visual scripts |
| e3b57f0 | Focus retries once with a correction when Claude's answer breaks a length limit (focus skill v3 states the limits) |
| 4aa42fd | Judge revision rounds default to `medium`; shadow judgment by model (Luna beside Sol) |
| 8cebabb | A timed-out call pauses the run instead of failing it; rounds start only when writer + judge fit; list numbering 1..N counts as stated; reserved logo space is not a forbidden logo |
| ba010a8 | Forbidden-element check uses Unicode-aware boundaries ("diálogo" no longer matches "logo") |
| 0541eeb | `DRAFT2_MODEL_JUDGE` / `DRAFT2_MODEL_WRITER` name the model of every funnel step's role |
| 58a8b20 | The floor rule: 95 stays the goal, ≥ 90 unaccepted is "Acceptable", < 90 takes capped extra rounds on its own |
| 38c7077 | A season "2026-2027" written as two years states both years (was UNSUPPORTED_NUMBER, wasted St-Jean's extra rounds) |
| 0eb14a1 | Captions skill v2: every confirmed account is tagged once, `MENTION_MISSING` blocks a caption without it (in the first two real sessions the writer tagged none under a rule that only allowed it) |
| 7f6f6ce | A judge that scores its own proposal, or names it the winner, no longer ends the run; judge roles say never to score it |

## 6. Measurements and lessons (real runs)

**Cost per story (text models, autopilot runs):** $1.66 (Sol judge, high
revisions) → $1.18 (judge at medium) → $1.03 → $0.75 (Luna judge, 8 slides).
v1 costs about $0.50 with 3–4 calls. Images add ≈ $0.03 per slide (fal.ai,
low quality) plus Sol's review ≈ $0.01 per image.

**Spend on the text ledger (`creative_text_calls`, operations `draft2%`),
Oct 9–11:** $20.86 over 10 stories / 15 sessions — Sonnet $12.24 (202
calls), Sol $8.49 (221), Luna $0.13 (41). By day: $3.04 (2 stories), $15.46
(7, the heavy test day), $2.37 (3, Luna judging). Images are not on that
ledger; they are on `images.slides[].attempts[].costMicros`.

**Where time goes:** the judge took 63–75% of model time with Sol at high;
output tokens are 77–80% of cost; input is cheap, so caching saves ≤ $0.10 a
story. Claude writing 15 openings at high spent 15–24k output tokens, almost
all thinking, hence round 1 at medium.

**Luna vs Sol (11 shadow rounds on one story):** same winner 6/11; Luna
scores 1–9 points lower and never accepted where Sol accepted three times
(not lenient: stricter, differently scaled); it misreads conditional rules
(applied the 25-word LAST_BODY limit where the plan allows 40) and reports
unverified UNSUPPORTED_NUMBER; sharp on attribution and extra lettering;
judging costs ≈ $0.03 a story vs ≈ $0.33 with Sol; no speed gain (it reasons
2.5–6k tokens at medium). As the real judge it also scored its own proposal
once (fixed). The editor chose Luna as the real judge to measure, gate kept
at 95; decide after the observation stories whether Luna's scale needs a
recalibrated gate or Sol returns for some steps.

**Where Opening winners come from (7 runs since r7):** 4 were the judge's
proposals (3 as written then revised, 1 edited then revised), 3 were round-1
candidates (ranks 1, 2 and 6 in round 1), **none** was a new angle written in
a later round; in the r5 era (3 informed new angles per round, 6 runs) none
won either. Each revision round adds 3–16 points (72 → 88 → 91, 89 → 94 → 95,
85 → 94 → 97), so a late new angle competes raw against revised versions.
Hence the recommendation against adding new angles in round 2; the editor
decided to leave the plan as it is.

**Round-1 yield:** 57 of 105 round-1 openings (7 runs) died to program
findings before the judge saw them: COVER_TOO_LONG 22, UNSUPPORTED_NUMBER 22
(21 of those from two bugs since fixed), SUBHEADLINE_TOO_LONG 11,
SLIDE2_NO_NEW_FACT 10, ATTRIBUTION_ON_COVER 3, SLIDE2_HEADLINE_TOO_LONG 3. A
cheap pre-judge fix pass by Claude on flagged candidates (format only) would
roughly double the clean pool for ≈ $0.02 (not built).

**Judge-vs-program contradictions waste extra rounds.** Two seen: the season
artifact (fixed) and, on the Brossard Halloween story, UNVERIFIED_PLACE
(program: do not depict unconfirmed places) against OFF_BEAT (judge: show
where the departure point is). Extra rounds cannot resolve these; the fix is
upstream (confirm the places) or in the rubric ("a program finding outranks
the brief's wish").

**Story breakdown (Brossard Halloween, session aede977b, 7 slides):** $1.59
= text $1.24 + images $0.35. Visual script $0.58 (5 rounds, 2 extra), Opening
$0.15 (4 rounds), Caption $0.11 (4 rounds), Closing $0.09, image reviews
$0.08, Deck $0.07, Facts $0.07, Focus $0.06, inventory + mentions $0.04; all
Luna judgments together $0.05. Images were paid 1.5× because a local run and
a production run overlapped. A clean pass would be ≈ $1.10.

**Other lessons:** a permissive rule ("tag only from mentions") is not an
instruction — anything the editor decided must be required by the skill and
checked by the program; a cheap judge deviates on answer format more than Sol,
so parsers should tolerate unambiguous deviations and stay strict otherwise;
a per-round parser cap must fit the largest round; Sonnet 5.5 kept cache hits
across an effort change; OpenAI prepaid credits and the fal.ai balance both
ran out mid-run on 2026-10-11 (HTTP 429 "no credits remaining", HTTP 403 "User
is locked. Exhausted balance") — both fail the run today.

## 7. Open items, prioritized (UI first, as the editor asked)

1. ~~**Judge and writer names in the UI and messages.**~~ Done: a model is
   named by `draft2ModelName` (gpt-6-luna is Luna, gpt-6.1-sol Sol, any
   claude-* Claude). A stored run, facts round, trace entry or image review
   is named by the model it recorded; a run not started yet by today's cast
   (`draft2Cast`), which the session route returns beside the session since
   the browser cannot read the environment. The run notes ("Luna did not
   accept…", "Paused before Luna judges…") name the run's own judge.
2. **Autopilot should stop at People and places when places await the
   editor's confirmation** (Google match, no decision) on photo-first Topics:
   the Brossard run depicted unconfirmed places, lost two rounds to
   UNVERIFIED_PLACE, and ended at 82 after five rounds. Alternatively show
   the pending confirmations prominently before Visual.
3. **An image made under another R2 prefix.** Dev and production share the
   database, and until 2026-10-11 evening not the R2 prefix, so a run made
   from production showed a broken image on localhost. The editor unified the
   local prefix to `story-radar-images` that evening; as a consequence every
   Draft 2 image generated from localhost **before** that (prefix
   `press-craftor`, e.g. run e87ee058 of session aede977b and the images of
   the earlier observation sessions) is now the one that shows broken
   locally. Options: a server-side record of the prefix per images run with a
   "made under another prefix" notice instead of a broken image, or a
   one-time copy of the `press-craftor/retention/180d/draft2-images/` objects
   under the new prefix (lifecycle rules exist per prefix, see
   `scripts/r2-lifecycle-rules.mjs`). Never put object keys in the session
   view.
4. **Provider refusals should pause, not fail.** HTTP 429 (credits, rate
   limit) and 5xx from OpenAI/Anthropic/fal.ai currently fail the run; a
   failed funnel run is not resumable, so the written round is paid again.
   Mirror the timeout path in `draft2-funnel-run.ts` (`TIMED_OUT` → paused
   at `currentRound`). Offered to the editor, not yet asked for.
5. **Pre-judge fix pass** for format findings (see §6), quality-neutral.
6. **Rubric batch after observation** (collect first): deck consecutive
   quotes and twist placement (≤ slide 3), LABEL_NOT_HOOK on slide 2, caption
   REPEATS_SLIDES as a program check, generic hashtag deny-list, recurring
   motif ≤ half the slides, explicit conditional limits in the request (the
   Luna LAST_BODY misread), "program finding outranks the brief" for judges
   and writers, Luna's lower scale vs the 95 gate.
7. **Images:** `correctionFor` gives an automatic correction only to a
   `generate` attempt; a `regenerate` attempt flagged by the review (Brossard
   slide 2 v2: a generated human in the foreground) gets none and waits for
   the editor. Confirm whether that is intended. fal.ai 403 "User is locked"
   should read as a balance problem in the UI.
8. **Mentions in captions:** captions v2 landed after the two sessions that
   tagged none; verify on the next real caption that confirmed accounts are
   tagged, and that the mentions step's wording says "confirmed = will be
   tagged".
9. **Facts reset UX:** "Run the facts again" silently starts a new session;
   the editor asked how to "reset from there" after stopping a run on an
   incomplete article. Consider naming it as a reset and pointing to the
   studio when the article text is incomplete.
10. **Funnel ideas evaluated, parked:** 4 proposals / revise 4 / revise 3
    (+$0.05), a synthesis "unbeatable" candidate in round 2 (not 3) with its
    own instruction, 5 informed new angles in round 2 (data says no).

## 8. Inspecting without touching: `scripts/draft2-inspect/`

Read-only scripts, run from the repo root with the local env loaded in
process (`npx tsx scripts/draft2-inspect/<name>.mts …`). They print ids,
statuses, scores and costs; never credentials. Pipe through
`grep -v -i 'postgres\|@\|password\|url'` when in doubt.

| Script | What it shows |
| --- | --- |
| `check-any-running.mts` | sessions running or just paused (merge only when empty, ignoring stale `06a50eec`) |
| `wait-idle-all.mts` | polls until no step is alive, up to 45 min; prints IDLE with the latest session |
| `inspect-autopilot-run.mts <storyId>` | every step's outcome, each round's judgment (and shadow), per-step time and cost |
| `inspect-opening-yield.mts` | last 8 sessions: where the Opening winner came from, round-1 program findings, per-round cost |
| `inspect-story-cost.mts <storyId>` | what one story cost: text by operation and model, images by run |
| `inspect-draft2-spend.mts` | Draft 2 spend on the ledger by day, model and operation, with the v1 comparison |
| `inspect-mentions-caption.mts` | last 4 captions: confirmed accounts vs what the caption followed and wrote |
| `inspect-judge-errors.mts` | sessions that ended on a malformed model answer, and failed calls on traces |
| `inspect-image-history.mts <sessionId>` | current and previous images runs with each attempt's status |
| `inspect-places.mts <sessionId>` | the people-and-places inventory and each place's match |
| `inspect-r2-run-keys.mts <topicId> <sessionId> <runId>` | which R2 objects exist for a session beside the key the app computes (environment prefix check) |

## 9. Reference ids of the observation stories

| Story / session | Topic | What it shows |
| --- | --- | --- |
| story ddcf15f0, session aede977b | Salut Brossard (eb926bbe) | Halloween walk: visual cascade, unconfirmed places, production/local image mismatch, $1.59 |
| story 23c1c99a, session 4aa981a0 | Salut Brossard | failed on OpenAI 429 at the Opening judgment |
| story f742f111, session 7eddf94d | Salut Saint-Jean (9d59c7ff) | season "2026-2027" artifact; Opening 87 after 5 rounds; caption without the confirmed tag |
| session 342431b3 | Tech topic | Luna as judge; winner from round-1 rank 6; caption tagged none of 3 confirmed accounts |
| sessions 55a012d3, 763d6938 | Perinatal topic | Luna shadow run ($1.03) and the timeout that cut a visual revision ($1.18) |
| session 245e2e01 | canada en breve | first autopilot run, $1.66 |
| session 53fbc807 | Hello Austin | ACL / Great Lawn, Opening 97 |
| session cca409a2 | — | the r7 first run: an Opening accepted in round 1 (96) |

## 10. Quality review of the narrative forms (2026-10-12)

The editor asked for a second look at quality after the narrative forms,
arcs and discovery landed: writing and image must go hand in hand, the
structures must be visual, images must tell the story as much as the words,
and Luna "has been scoring low, maybe the reviewer lacks context".

**What the day's runs showed** (`inspect-today`, `inspect-step-issues`):
every visual run ended between 79 and 86 after five rounds (two extra by
the floor rule), whatever the form; openings and closings mostly passed 90.
The low visual scores had four causes, only one of them "context":

1. **Contradictory contracts.** The narratives skill put the anchor on every
   slide while the visuals skill and the program limited a recurring element
   to two slides, never adjacent, one return (`RECURRING_DOMINANT`,
   `CALLBACK_MISPLACED`, judge `MOTIF_DEPENDENCY`): the writer oscillated
   between `ANCHOR_MISSING` and those. Fixed: with a form, the anchor is
   exempt; what must change is its state and its scene.
2. **A bad anchor the rules allowed.** The editor picked one of the list's
   own attractions (the giant puppet) as the traveling object; placing it in
   every scene asserted co-location the facts never gave (Luna's
   `CONTRADICTS_FACTS` was right). Fixed in the rules: the anchor is a
   carrier, never one of the story's own items; a real object travels only
   when the facts say it moves. The editor's own choice is still not
   reviewed (Opus's decision); the rule now lives where Claude proposes.
3. **Missing context, for real.** The editor's form edit left `progression`
   empty, so writers and judges had no steps to measure; and the
   `visualDirection`, written before the form, made the park trail recur
   instead of the puppet. Fixed in `narrativeForModels`: a default
   progression from the structure, and a precedence note over
   visualDirection.
4. **Judge calibration and false positives.** Luna read "beat" as "show
   every fact the slide's words carry" (OFF_BEAT ×12 a run) and penalized
   the image for a headline at odds with its own slide (a Closing flaw).
   Fixed in the visuals skill (one beat per image; the words are fixed
   inputs) and the closings skill (the one-slide headline names what the
   slide gives). `FORBIDDEN_ELEMENT` fired fourteen times in one run on
   French phrasings ("logo … dégagé", "aucun logo ni interface"): fixed.

**The creative principle now in the rubric:** one story in two voices. The
image adds what the words cannot say (scale, consequence, the moment before
or after, the proving detail, a contrast), one slide carries the turn
(image-led, words stepping back, something true the reader did not expect),
and the progression criterion asks for it.

**Proposed, not built (the editor decides):** a *spine* decided in the Focus,
one entry per beat with the words' job, the image's job, what is withheld
for the next slide, the anchor's state, and which slide is the turn. Deck
and Visual would follow the same spine (today the Visual follows the Deck's
words), and both judges would score adherence to it. It is the structural
way to get writing and image "always hand in hand" and a planned wow moment
grounded in a fact, rather than hoping the Visual finds one. Contract change
in `draft2-focus.types.ts` (beats become objects), skills focus/decks/visuals,
canvas editing of the spine (UI).

### Addendum, 2026-10-12 evening: the first run under the new rules

Saint-Jean, story 3e90af2f (session 588b1d19), `panorama` chosen by the
editor, visuals v5 / narratives v3 confirmed on the trace: the visual still
ended at 75 after five rounds and 6 of 8 images were flagged. Three causes:

1. **The master scene never existed.** `masterPlate.status = failed`, "The
   Draft 2 image file name is invalid": the prompt file names of both plates
   carried a second dot. Fixed (`draft2-images.md` §11). The same failure hid
   Brossard's anchor plate. No narrative form had ever reached the images.
2. **Panorama against this brand and this story.** Saint-Jean's identity is
   cut-outs over flat planes with layout variation per slide; a panorama is
   one continuous photo strip. And the story's beats (ambition, roster,
   tournament, selection, development) are not places along a course, so the
   writer encoded them in tees, balls and bags (TOO_ABSTRACT). Rules added
   (focus v9, narratives v4); the editor's own choice is still not reviewed,
   an advisory review is the open proposal.
3. **A visual form judged on the words.** The Deck lost four rounds to
   OFF_FOCUS "the deck does not manifest the continuous panorama". Narratives
   v4: for a scene or a line the words follow the sections' order only.

Also seen: the new "turn" rule works (the judge asks for the designated turn
to be legible), Luna judged the words' flaws in the summary as asked, and a
revision round of four 8-slide scripts cost $0.25 at high effort (146 s): the
visual step's revision rounds are now the most expensive calls of a story.

### Addendum, 2026-10-12 night: the spine is built

The editor confirmed the order (concept and form before the directions, a
turning point and a climax, images that tell the story as much as the words)
and asked for a telling other than classic by default. Landed:

- `focus.spine` (focus skill v10, spine skill v1): one beat per slide with
  slide, role, scene, words' job, image's contribution, what it withholds and
  facts; program rules on the shape; `SPINE_SHAPE` finding; the models read
  it between the telling and the directions; every funnel step's writer and
  judge read the spine skill when it exists. `draft2-focus.md` §16.
- The Deck's arc length comes from the spine's middle beats.
- `staleDirections` + "Rewrite the directions" (one Claude call,
  `rewriteDraft2FocusDirections`, `PATCH rewrite: "directions"`).
- The focus skill prefers a concept or a form other than classic; classic
  needs a reason.

For the UI (Opus): a beat editor (reorder, reword, pick the turn), the
Direction field below the spine, and the autopilot could call the rewrite
when `staleDirections` is set before the Opening runs. For the rules batch:
the Opening's hook may now be judged against the hook beat, and the visual
judge's "beat" criterion against the beat's image line, so the OFF_BEAT
reading has an anchor at last; watch the first runs for it.
