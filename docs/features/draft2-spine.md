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
