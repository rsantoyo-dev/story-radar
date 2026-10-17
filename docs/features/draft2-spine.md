# Draft 2 — The spine as the contract: step, fix pass, fewer rounds, originality

Built 2026-10-15 from the editor's plan after the Fogón Lab avocado story
($1.87, 23.5 minutes, the visual script unaccepted after five rounds): "the
biggest saving is in the visual script; save time too; keep Claude writing;
add the spine as a step; let Claude check itself before Luna; the visual
from the spine, faster and more precise; and reward originality in the
evaluators." Five changes, each measured against the 23 stories Luna judged
since 2026-10-11 (`scripts/draft2-inspect/inspect-proposals.mts`).

## 1. The Spine step

The rail is now Facts, People and places, Focus, **Spine**, Opening, Closing,
Deck, Review, Visual script, Images, Caption, Publish.

- The **Focus** decides the story and its telling: line, audience, framing,
  reader consequence, structure, goal, voice, concept, narrative form, with
  the deliberation (interest, tellings compared). One Claude call, asked
  again once when the answer breaks a rule, then the judge's reviews of a
  form or a premise Claude chose. It writes no plan any more.
- The **Spine** writes the plan from the focus as it stands
  (`planDraft2Spine`, `POST /api/radar/draft2/spine`): the hook's lever and
  where its promise is paid, the misreadings the cover must prevent, one beat
  per slide (slide, role, scene, the words' job, what the image adds, what it
  withholds, its facts) and the two directions. One Claude call at high
  effort (`draft2_focus_plan`), about 30 s and $0.10–0.15. The session is
  claimed as the step `spine` while it runs; a failure keeps the focus as it
  was and marks the session failed; the focus version moves when the plan
  lands, so every later step follows it through that version.
- The Spine screen edits every part in place: the lever (`FocusLevers`), the
  beats (`SpineBeats`: role, scene, words, image, withholds, facts; the
  program checks the shape against the structure), the two directions. Each
  part shows Claude's reason, or the editor's choice beside Claude's value
  with "Use Claude's". A part the editor edits stays theirs when Claude
  writes the spine again. A change to the telling (concept, form, spine)
  marks the plan "Changed since"; "Rewrite the spine" writes it again.
- The autopilot runs the Spine after the Focus, and again when the plan is
  missing or stale; the Opening waits for a spine that is current and has
  no shape finding. The focus route's `PATCH rewrite: "plan"` keeps working
  (`rewriteDraft2FocusPlan` is the same function).

No migration: the plan lives where it did (`focus.values.levers`, `spine`,
`guards`, `direction`, `visualDirection`); the step column is text.

## 2. The visual script executes the spine (visuals v10)

Twenty-two visual runs: none accepted, 4.6 rounds on average, $14.3 of
writing against $0.96 of judging. The writer invented a progression and the
judge scored narrative, progression and focus, decisions the spine had made.

- `spineImageLines(spine, carousel)` maps the beats to the slides (cover,
  slide 2, the middle beats in order for s1…, penultimate, last) and
  `bindSpineBeats` sets each slide's `beat` to that line on every parse, the
  writer's scripts and the judge's proposals alike; the models receive the
  same map as `spineBeats`. A slide the spine does not cover keeps the
  writer's beat.
- Criteria: fidelity (to the beat), continuity (identity), brand, truth,
  craft, originality. Judge codes gain `PREDICTABLE`; `OFF_BEAT` means the
  direction does not realize its beat.
- Plan: one script plus the judge's proposal, then the best revised beside
  the proposal as written and as edited; both rounds at medium;
  `autoExtraRounds: false` (the editor's "One more round" stays). A long
  carousel runs the same plan. `VISUAL_BEAT_MAX_CHARACTERS` is the spine's
  240.

## 3. The fix pass (every funnel step)

After the writer's round, the candidates the program flagged go back to the
writer once, at medium effort, with their findings (`funnelFixRequest`:
task `fix`, the flagged candidates each with its findings, an instruction to
fix only what they name). The judge then reads the fixed versions
(`funnelFixedCandidates` keeps ids and bookkeeping). A flagged candidate can
never win, so the pass saves the round its findings would cost: the avocado
story's round one lost nine of fifteen openings to findings. Never fatal: a
malformed answer, a provider error or no time left leaves the candidates as
they were; the round records `fix` (candidate ids, findings before and after,
duration, or why it was skipped). Trace operation `<writer>_fix`.

## 4. Extra rounds only while a round improves

Under the floor (90), a run took two extra rounds whatever the trend. Now
`funnelRoundImproved` must hold (the round's best clean score beats the best
before it), the step must allow it (`autoExtraRounds`), and the cap stays.
The needs-review note says why none was taken.

## 5. The standards and originality

- Every writer reads `WRITER_STANDARD` after its role: check every candidate
  against the hard rules before answering (word counts, cited facts with
  qualifiers, guards, no fact ids or image words), hand in only what it
  would defend at 95/100, prefer the angle the reader has not met.
- The judges of the opening (hooks v10), the closing (closings v4), the deck
  (decks v3), the visual script (visuals v10) and the Review's editor (review
  v6) score **originality** under the gate's floor, and read
  `JUDGE_STANDARD`: against the predictable telling of this subject (95+ for
  a telling the reader has not seen, 70–84 competent but predictable, under
  70 a formula), never as a licence to leave the facts; loudness is not
  originality. Scores stored before have none; the canvas skips it.

## 6. Expected per story

From $1.87 and 23.5 minutes (text $1.43) to about $1.35–1.45 and 14–16
minutes, the visual from $0.67 and 11 minutes to about $0.20 and 3. Measure on
three to five stories: acceptance per step, rounds, the visual's best score,
how many patches the fix pass clears, and whether originality lowers
acceptance (the first stories under the new criterion may end needs-review
more often; the floor for it can be revisited with data).

## 7. Files

- `draft2-funnel.ts` (`FunnelFixPass`, `funnelFixRequest`,
  `funnelFixedCandidates`, `funnelRoundImproved`), `draft2-funnel-run.ts`
  (`fixPass`, `autoExtraRounds`), each step's `xFixRequest`.
- `skills/draft2-skills.ts` (`WRITER_STANDARD`, `JUDGE_STANDARD`,
  `roleStandard`), `skills/visuals.ts` v10, hooks v10, closings v4, decks v3,
  review v6.
- `draft2-visual.types.ts` (`spineImageLines`, `bindSpineBeats`, criteria,
  plan), `draft2-visual.ts`.
- `draft2-focus.ts` (`decideDraft2Focus` without the plan, `planDraft2Spine`),
  `api/radar/draft2/spine/route.ts`, `draft-2-canvas.core.ts`,
  `draft-2-canvas.tsx` (`SpineView`, `SpineBeats`, the autopilot order).
- Tests: the funnel's, each step's harness (the fix pass echoed), the visual
  types' binding test, the focus tests on the two steps, the canvas core.

## 8. Addendum, 2026-10-16: after the first story under the spine

The corn story (Fogón Lab, session a1debb9a, 40 facts, 7 slides): $1.38 of
text and $0.31 of images, 24 minutes of model time. The visual script went
from 11 minutes and $0.67 to 2.5 minutes and $0.14, at 88 instead of 82; the
writer's self-check cut the Opening's first-round findings from 20 to 1.
Nothing was accepted (92, 92, 88, 88), and Luna's judgments were 53 % of the
time. Six changes, approved by the editor:

1. **The spine's image lines are checked** (`draft2-spine-checks.ts`, spine
   skill v2). Each beat names its image's dominant `subject`; the program
   flags a term the brand's identity avoids, words or numbers asked of the
   image ("numbered cards", "with labels": the image model letters only the
   slide's words) and the same subject on two consecutive beats (a plural's
   "s" ignored: "un grano" and "dos granos" are one subject). Claude's first
   plan with a problem is asked again with it; what is left after the second,
   and what a hand edit introduces, shows on the Spine screen as "What the
   images would pay for", never blocking (`focus.spineProblems`). Three of
   the corn story's five visual issues and both failed images came from such
   lines. The image rules both places read live in `draft2-image-rules.ts`
   (the visual script's `forbiddenElement` and `avoidTerms` moved there).
2. **Planned rounds stop when the best is acceptable and stopped rising**: a
   round after the first that does not raise the best clean score, with that
   score at 90 or more, ends the run "needs-review"; the editor can continue
   with the rounds left. Today only the Opening has a third planned round; in
   23 Opening runs no third-round proposal ever won.
3. **A criterion's own floor** (`FunnelGate.floors`, `criterionFloor`): the
   deck's originality passes at 75 (decks v4); every other criterion keeps 85.
4. **The Review finds what it quoted** (`locateQuote`): a sentence of a body
   is that part of the body (the patch becomes the whole text with that part
   replaced), a text on another slide moves the patch there, and the note says
   so. Two of the corn story's three patches were refused for quoting one
   sentence.
5. **The autopilot says why it writes a step again**: "its last run ended with
   no clean version" or "what it follows changed since" in its log; a step
   that ends twice in a row with no clean version stops the run with what to
   do. (The corn story's closing ran twice: its first run ended with every
   version flagged, and the next autopilot start wrote it again without
   saying so.)
6. **Luna at low effort, measured before anything changes**:
   `DRAFT2_SHADOW_JUDGE_EFFORT=low` records a second judgment of every round
   beside the real one, deciding nothing; `npx tsx
   scripts/draft2-inspect/inspect-shadow.mts [since]` reads them (same
   winner, best-score difference, accepts, judge time). Decide after three to
   five stories whether round 1, or every round, can run at low.

Observed, not changed: the fix pass did not clear word-count findings (the
closing's 31-word body stayed at 31; the cover at 9 words stayed at 9): Claude
at medium miscounts. Options when it matters: a second fix attempt for
length findings only, or the text split into numbered words in the request.

## 9. Addendum, 2026-10-16: a word of margin

The writer's self-check (§5) cut the Opening's first-round findings from 20–23
to 1–15 a story, but what survived was almost always length: Claude miscounts,
and a fix pass asked to "fix the length" returned the same count (31 words for
a limit of 30). Three changes:

- The writer's standard asks for every text at least one word under its limit.
- Every writer request carries the step's limits as numbers (\`wordLimits\`:
  \`OPENING_WORD_LIMITS\`, \`closingWordLimits(shape)\`, \`deckWordLimits(shape)\`),
  beside the task, in new candidates, revisions and fixes.
- A length finding in the fix pass says how many words to remove at least,
  one more than the excess (\`lengthHint\`: "Remove at least 2 words.").

Baseline before the change (\`scripts/draft2-inspect/inspect-findings.mts\`):
a1debb9a 12 findings before the fix pass, 4 after, all 4 on length; 432cf4a8
18 before, 3 after, 1 on length. Read the next stories the same way.

## 10. Addendum, 2026-10-16: variety between posts, and writing for the reader

Fogón Lab's last five covers were all terracotta with Chispa, because its own
guide said so ("Apertura: fondo terracota… ingrediente más Chispa"), and each
carousel was planned alone. Now:

- **The last covers are read** (`draft2-cover-variety.ts`): one per story, the
  newest five, each with its background (the palette color its direction
  names after "fondo", from the palette's usage), the brand's characters on
  it and its subject (`recentDraft2CoverRows`, `recentCovers`). The Spine's
  plan (its visual direction and cover beat) and the visual script read them
  (`recentCovers`), and a visual run keeps the ones it read.
- **The program checks the cover**: `COVER_CHARACTER_STREAK` when the last
  cover had the brand's character and this one casts it too (not when the
  narrative form's guide is that character), `COVER_BACKGROUND_REPEAT` when
  the cover is on the last cover's background and the palette offers another
  (only when both backgrounds are clear).
- **Fogón Lab's profile** (saved through the app's route, a backup kept): the
  palette's usage, the visual guide and the identity now rotate the cover's
  background among terracotta, cream and teal (never the last cover's) and
  put Chispa on the cover at most every other post (on the closing or the
  turn otherwise); its writing rules ban commercial brands ("una bebida dulce
  sin gas"). Text edits like these do not change the visual policy: no
  approval was retired.
- **Writing for the reader** (the writer's standard, spine v3, focus v16):
  name a source once and then tell the facts; a researcher's name never in
  the cover or a headline, at most once in the carousel; headlines say what
  the reader learns or can do, never the procedure; no beat or slide whose
  job is the method; no aside the reader would not assume; the Focus looks
  for the strongest true surprise before naming the interest.
- **Physical truth in the images** (visuals v11, images v6): a cold drink
  never steams; a substance is shown by its source or its effect, never as
  specks that read as microbes; the image review flags both.
- The topbar shows a model other than the default chosen in Models ("Writer
  GPT-6.1 Sol"), since the browser remembers the last choice.

## 11. Addendum, 2026-10-16: the spine pays, moves and varies (spine v4)

The spaghetti story (Fogón Lab, "Lo que dice el estudio") had a good causal
chain but four faults the later steps could not fix, since every judge after
the Spine scores fidelity to its beats. The editor: "the spine is the most
important now". The editor's copy of that spine was fixed by hand (six
beats, both directions); these rules keep the next one from needing it.

- **The last beat pays the promise** in the reader's hands, as the focus's
  goal asks: for saves, the steps, the rule or the plan the reader keeps;
  for shares, the one thing they would send; for discussion, the question
  the facts leave to them; for followers, what it changes for them. What
  the finding does not cover is a clause inside it, never its job; what the
  result might explain elsewhere someday is not a reward. The spaghetti
  spine ended on the model's limits ("round rods, linguini differs, other
  rods"), the same fault as the Brossard closing.
- **One step per middle beat**: two beats in a row that explain links of one
  mechanism are one beat; the arc's two to five middle beats are a range,
  not a target. The spaghetti spine had three mechanism beats in a row and
  its own risk note said "sounds like a lesson".
- **The guard on slide 2**, the first thing a reader who swipes meets; on
  the cover only when the cover's headline itself makes the claim the guard
  prevents (a suspension read as a closure). The opening's program check
  (`GUARD_LATE`, cover or slide 2) is unchanged. The spaghetti cover spent
  its subheadline on "with dry spaghetti and a machine".
- **A sequence, not a series** (`SPINE_SERIES`, `spineSeries` in
  `draft2-spine-checks.ts`): one subject word (plural "s" dropped, function
  words ignored) on more than two thirds of the beats that name a subject,
  four or more, is a problem; a narrative form's anchor is not counted
  (`spineRecurring`). Like the other image checks, the first plan answer
  that breaks it is asked again once with the rule (one more call, only
  then); the second answer's problems and the editor's edits are shown as
  notes, never blocking. The spaghetti spine had "espagueti" on seven of
  seven beats; the edited one has it on four of six.
- **No figure asked of an image**: `wordsAskedOfImage` now catches "una
  cifra", a big number, "números grandes", a percentage, statistics and
  "chiffres" (the climax asked for "una cifra grande en ocre"); "un gran
  número de granos" is a quantity and passes, and a negation ("sin cifra")
  asks for nothing.

No judge or fixed call was added. Spine v4 changes the plan's instructions
only; spines already written keep their beats.

## 12. Addendum, 2026-10-16: notes for Claude (spine v5)

The editor's ask, after hand-applying a list of notes to the popcorn story's
spine: "we should have a field to give suggestions and recreate". Editing
every beat by hand fits exact wording; notes fit intent ("attribute once, on
slide 2", "never say critical temperature", "pay the jump on the cover").

- **The Spine screen** has a "Notes for Claude" field above the plan and a
  "Rewrite with these notes" button (only once a spine exists). The typed
  notes stay in the field until a rewrite succeeds; the last notes are shown
  under it with the focus version they were written on.
- **The request**: POST /api/radar/draft2/spine takes `notes` (at most 2,000
  characters, `parsePlanNotes`). `planDraft2Spine` sends them to the planner
  as `notes` beside the focus, which already carries the plan as it stands
  (levers, guards, spine, directions), the editor's hand changes in it.
  Nothing is held back as the editor's (`editorChoices` is empty), so the
  planner returns the whole plan revised.
- **The rule** (spine skill v5, the planner's part): follow every note within
  the verified facts and the spine's rules; keep what no note touches, word
  for word where it still fits; a name, date, number or claim the facts do
  not give stays out (the popcorn notes asked for "2015", which no fact
  holds); `reasons.spine` says what was done with each note and what could
  not be followed. The reason shows under Beats.
- **After it**: the plan's fields are Claude's again (`edited` loses levers,
  spine and the directions), the focus version moves (the opening and every
  step after it see the change), and the notes are kept on the focus
  (`planNotes`, the last ten, with time and version). A later rewrite without
  notes works as before: it keeps hand edits and adds no notes.
- **Cost**: one plan call, plus one more only when the first answer breaks a
  rule the program checks (the image checks, the shape).

## 13. Addendum, 2026-10-17: the spine covers the story, and each slide carries its beat

The Saint-Jean fraud story went through every step and the review and still
left out what it was about: the spine gave no beat to the arrests (the
second most important fact, 98) nor to the date, and slide 2, whose beat
rested on six facts (the call, the fake policeman, the 4,000 $ demand, the
victim's age, the guards), cited three and left the mechanism to no slide.
Two program checks, no new model call:

- **The spine covers the facts the story depends on** (`spineUnusedFacts`):
  a fact of importance 85 or more (`SPINE_COVERAGE_IMPORTANCE`), not
  disputed, that no beat and no guard cites. On the planner's first attempt a
  gap is a response error ("The spine leaves out facts the story depends on:
  f2 (…). Give each a beat, or fold it into one"), asked again with the rule
  like the image checks (`parseFocusPlan`'s `coverage`); the second answer's
  gaps become a `spine` finding (`SPINE_FACT_UNUSED`, `focusFindings` with
  the facts) that blocks the Opening ("Fix the spine first") until the editor
  adds the fact to a beat by hand or rewrites the plan with a note. A spine
  the editor owns is not asked again.
- **Each slide carries its beat's facts** (`BEAT_FACTS_MISSING`, a
  mechanical finding of the Opening, the Deck and the Closing): a slide
  cites at least half of its beat's facts, three at most
  (`beatFactsRequired`); the finding names the facts left out with their
  claims. The cover and slide 2 read the cover and slide2 beats, deck slide N
  the Nth middle beat (`spineBeatFactIds`, `spineMiddleFactIds`), the
  penultimate and the last their own. As every mechanical finding it keeps
  the version from winning and sends it back once in the fix pass. Hand edits
  and review patches are not checked for it: they change words, not
  citations (a hand edit cites the facts that state its numbers, see
  draft2-hand-edits.md).

## 14. Addendum, 2026-10-17: as many slides as the story needs (spine v6)

The editor: "some carousels come out longer than they need; it should be
just right for the news." The Milan boulevard notice (Salut Brossard: two-way
traffic from 16 October, about two weeks, may change) showed the cause. The
planner's first answer had one middle beat and the shape rule refused it
("an arc's deck has 2 to 5 middle beats"); the second answer padded to six
slides, giving the start hour and the project name a slide each and calling
"the schedule may be adjusted" the turning point.

- **Shape**: an arc has 1 to 5 middle beats (`FOCUS_SPINE_ARC_MIDDLE_MIN`
  = 1), so a short story runs five slides: cover, slide 2, one middle,
  penultimate, last. The Deck's arc range follows (`DECK_ARC_MIN_SLIDES` = 1;
  a test keeps the two equal). Lists and procedures are unchanged: one
  middle beat per item. No arc runs with no middle beat: the Deck step has
  no "nothing to write" path.
- **Rule** (spine v6, focus v17, decks v5): count what the reader must
  learn, one step per slide, and stop. A fact too small for its own slide is
  a clause in the beat that needs it, cited there, so the coverage check
  (§13) still finds it. A slide added to reach a count, to give an image room
  or to restate is padding.
- **No invented turn**: a story with no change of direction (a notice, a
  schedule) has a climax, what changes for the reader, not a turning point;
  a qualifier is a clause, never the turn.
- The later steps already handled short carousels: a two-item list runs four
  slides.
