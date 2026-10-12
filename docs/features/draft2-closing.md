# Draft 2 · Step 4: Closing

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then `docs/features/draft2-opening.md` and
`docs/features/draft2-focus.md`, then this document.

## 1. Goal

The pipeline is hook-first: the Opening fixes how the story starts (the
cover's promise and slide 2's first payoff); the Closing fixes how it ends;
the Deck, the next step, will write the middle once, between the two. The
Closing pays the cover's promise in full and leaves the reader with what it
means for them and one thing to do, so the carousel reads as one story from
beginning to end.

```text
Facts → Focus → Opening → Closing → Deck → Review
```

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| What the step writes | an arc ends on two slides judged as one unit: the penultimate pays the cover's promise, the last says what it means for the reader and carries the call to action; a list or steps ends on one slide (the plan for the period, or the result), since the last item or step belongs to the Deck |
| Rounds | two: 8 closings → Sol scores, proposes 2 → Claude revises the 2 best and edits the proposals, which also compete as written (6) → Sol's pick |
| The call to action | the focus's goal decides the action; the Topic's `callToActionStyle` its voice and wording; the profile's emoji allowance applies; a grave story may end without one |
| Roles | as the Opening: Claude writes, Sol judges |

## 3. What the run reads

- **The opening it ends:** the editor's choice, else the judge's winner, once
  the opening's run has finished. It is recorded on the run
  (`closing.opening`: id, cover, slide 2).
- **The focus that opening followed** (`opening.focus`), not the session's
  current one, so both ends follow one brief. The shape comes from its
  structure (`closingShape`: arc → two slides, list or steps → one).
- **The verified facts**, cached, as in every step.
- **The instructions:** the closings skill, the brand brief and a
  `# Calls to action` section (`callToActionBrief`).

Both models read `{ focus, opening, shape, verifiedFacts }` where their
provider caches it (Claude's `context`; the tail of Sol's instructions since
2026-10-10). Round 1 explores at medium effort since the same day, like the
other steps' first rounds (`CLOSING_ROUND_PLAN`).

## 4. The closings skill (`skills/closings.ts`, version "1")

- **The two shapes** and the job of each slide.
- **Limits:**
  - penultimate: headline ≤ 8 words, body ≤ 30;
  - last: headline ≤ 8, body ≤ 25 (40 for a one-slide plan or result);
  - call to action ≤ 14 words, in its own field.
- **The call to action, per goal (carried over from v1):**
  - followers: a recurring benefit;
  - saves: a reason to keep it;
  - shares: one person or situation to send it to;
  - discussion: one question the facts leave genuinely open;
  - a grave story may end without one.
- **Facts and material errors:** as in the hooks skill.
- **Criteria:** resolution, meaning, action, continuity, grounding, voice,
  focus. Accepted at overall ≥ 95 with every criterion ≥ 85.
- **Revisions:** keep what makes the closing land.

## 5. Contracts (`draft2-closing.types.ts`)

```ts
type Draft2ClosingCandidate = FunnelCandidate & {
  penultimate?: { headline: string; body: string; factIds: string[] };   // two-slides only
  last: { headline: string; body: string; cta: string; factIds: string[] };
};
type Draft2Closing = FunnelRun<…> & { writer?; judge?; opening?: Draft2ClosingOpening; focus?: Draft2FocusSnapshot; shape?: Draft2ClosingShape; previousRuns? };
```

The schemas are built per shape, so a one-slide run's writer and judge never
see a penultimate.

**Program findings, any one blocking:**

| Code | When |
| --- | --- |
| `NO_FACTS`, `FACT_UNKNOWN` | a slide cites no fact, or a fact that is not verified |
| `*_TOO_LONG` | a part past its limit |
| `CTA_MISSING` | no call to action on a story that is not grave |
| `RECAP_LABEL` | "In summary", "En bref", "En resumen"… |
| `RESTATES_OPENING` | a closing slide shares half its longer words with the cover or slide 2 |
| `UNSUPPORTED_NUMBER` | as in the Opening, with a list's count as stated |
| `TOO_MANY_EMOJIS` | beyond the profile's allowance |
| `DUPLICATE_CANDIDATE` | as in the Opening |

The judge's issue codes add `UNRESOLVED`, `RECAP`, `WEAK_MEANING`, `OFF_GOAL`
and `BREAKS_CONTINUITY` to `OVERCLAIMS`, `OFF_VOICE` and `OFF_FOCUS`.

## 6. The shared funnel

The Opening's loop and bookkeeping moved, unchanged, into `draft2-funnel.ts`
(pure) and `draft2-funnel-run.ts` (the runner). The Closing is a second
definition of the runner (`draft2-closing.ts`), so it has everything the
Opening has:

- the best version so far, with the grounding tie-break;
- regressions;
- proposals competing as written and as edited, judged blind;
- material errors that block a version;
- pausing when a request's time is spent and continuing in the next;
- the 30 s heartbeat (`aliveSince()` covers `closing`);
- the editor's choice, and earlier runs kept in `previousRuns`.

## 7. Persistence and API

- `draft2_sessions.closing jsonb` (additive migration 0103).
- `POST /api/radar/draft2/closing` `{ storyId, sessionId, continue? }`.
- `PATCH /api/radar/draft2/closing` `{ sessionId, candidateId }`: the
  editor's choice.

## 8. Canvas

- **Step 4 · Closing:** "Write the closing" waits for a finished opening
  with a chosen version and a focus. It shows the rounds, the chosen closing
  as 4:5 cards (penultimate and last, with the call to action), and every
  other version to choose from.
- **Notices:**
  - the opening chosen now is not the one this closing ends;
  - a stopped run, which "Continue from round N" picks up.
- **Shared components:** the Opening and the Closing render with the same
  funnel components (`FunnelRunView`, `FunnelRoundView`, `ChosenVersion`,
  `ScoreRow`), each with its own display: names, criteria and cards.

## 9. Tests

- `draft2-closing.types.test.ts`: shapes and schemas, parsing, every program
  finding, the gate, the requests, the call-to-action brief.
- `draft2-closing.test.ts`: the step in the shared sandbox. It covers:
  - the context and instructions, and the editor's choice;
  - two rounds, the one-slide shape, and grave and ordinary calls to action;
  - prerequisites, pause and continue;
  - choosing, and earlier runs.
- `draft2-skills.test.ts`: the closings rubric matches the constants.

## 10. Out of scope

- The Deck (the middle), and slide counts.
- Images, and the publication caption (which carries what the closing
  leaves out).

## 11. The one-slide headline names what the slide gives (2026-10-12)

Closings skill v2. In the Brossard Halloween run the one-slide closing (a
list's practical last slide: hours, departure, registration, costume, call to
action) carried a headline about the giant puppets, one more attraction. It
passed the Closing at 92 and then cost the visual script every round: the
visual judge flagged the image for not showing a planning slide under a
puppet headline, and no image can repair a headline at odds with its own
slide. The skill now says it: the one-slide closing's headline names what
the slide gives the reader (the plan, the result, the choice), never one
more item or a fact the slides already told. The visuals skill (v5) treats
the words as fixed inputs and reports such a flaw in the summary for the
editor, not as OFF_BEAT against the script.
