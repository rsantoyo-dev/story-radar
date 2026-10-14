# Draft 2 · Step 5: Deck

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then the Opening, Focus and Closing briefs
(`docs/features/draft2-*.md`), then this document.

## 1. Goal

The pipeline fixed the two ends first: the Opening (the promise and its first
payoff) and the Closing (the promise paid in full, what it means, one call to
action). The Deck writes the middle, so the carousel reads as one story from
the cover to the call to action:

```text
Facts → Focus → Opening → Closing → Deck → Review
```

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| Rounds | two, on the shared funnel |
| The judge's proposals | Sol proposes one complete deck; it competes as written and as Claude edited it |
| An arc's length | Claude decides, 2 to 5 middle slides (6 to 9 in all); Sol scores the pacing |
| Swipe cues (v1's `continuationCue`) | none: they add text to every slide, and the next headline pulls the reader on |

## 3. Shape and plan

The focus's structure and the chosen opening set the shape (`deckShape`). The
plan is chosen per run (`FunnelStep.plan` may be a function of the snapshot):

| Shape | The deck | Round 1 (medium effort) | Round 2 (high) |
| --- | --- | --- | --- |
| arc | 2–5 slides, the development from slide 2's payoff to the penultimate's resolution | 4 decks; Sol scores and proposes 1 | 2 revised + Sol's deck as written + as edited → Sol's pick |
| list, steps | one slide per item or step slide 2 did not cite, in order (at most 17) | 2 decks; Sol proposes 1 | 1 revised + Sol's as written + as edited → Sol's pick |

A list's items are set by the facts and only their wording varies, and a long
list's deck is long, so it explores less.

## 4. What the run reads

- **The closing as the editor chose it**, else the judge's winner, once its
  run has finished.
- **The opening that closing ends**, which must still be the opening chosen
  now; otherwise the deck asks for the closing to be written again.
- **The focus both followed.**
- **The verified facts**, cached.

All of it is recorded on the run (`deck.opening`, `deck.closing`,
`deck.focus`, `deck.shape`). Both models read
`{ focus, opening, closing, deck, emojis, verifiedFacts }` where their
provider caches it (Claude's `context`; the tail of Sol's instructions since
2026-10-10).

## 5. The decks skill (`skills/decks.ts`, version "1")

- **The three shapes:**
  - arc: one idea per slide, setting up the resolution without spending it;
  - list: one slide per item, with a headline, one sentence and the practical
    line day · time · ages · price exactly as the facts state it;
  - steps: in order, with quantities and conditions.
- **Limits:**
  - headline ≤ 8 words;
  - body ≤ 30 words, or 12 for a list item, whose practical line has ≤ 14 of
    its own.
- **Never:** fine print, a repeated slide, a recap.
- **Facts and material errors:** as in the other skills.
- **Criteria:** flow, coverage, pacing, clarity, grounding, voice, focus.
  Accepted at overall ≥ 95 with every criterion ≥ 85.

## 6. Contracts (`draft2-deck.types.ts`)

```ts
type Draft2DeckSlide = { headline: string; body: string; practical: string; factIds: string[] };
type Draft2DeckCandidate = FunnelCandidate & { slides: Draft2DeckSlide[] };
type Draft2Deck = FunnelRun<…> & { writer?; judge?; opening?; closing?; focus?; shape?: Draft2DeckShape; previousRuns? };
```

Issues name a slide as `s1`, `s2`… (the first deck slide is `s1`).

**Program findings, any one blocking:**

| Code | When |
| --- | --- |
| `SLIDE_COUNT` | outside the arc's 2–5, or not one slide per item |
| `ITEM_OUT_OF_PLACE` | a list's or steps' slide does not carry its item's first fact, in order |
| `NO_FACTS`, `FACT_UNKNOWN` | a slide cites no fact, or one that is not verified |
| `HEADLINE_TOO_LONG`, `BODY_TOO_LONG`, `PRACTICAL_TOO_LONG` | a part past its limit |
| `PRACTICAL_OUTSIDE_LIST` | a practical line on a slide that is not a list's item |
| `RESTATES_SLIDE` | half the longer words of the cover, slide 2, the penultimate, the last slide or an earlier deck slide |
| `RECAP_LABEL` | a summary label |
| `UNSUPPORTED_NUMBER` | as elsewhere, with a list's count as stated |
| `TOO_MANY_EMOJIS` | beyond the profile's allowance |
| `DUPLICATE_CANDIDATE` | as elsewhere |

The judge's issue codes are `BREAKS_FLOW`, `GAP`, `OVERLOADED`, `REPEATS`,
`WRONG_LENGTH`, `UNCLEAR`, `OVERCLAIMS`, `OFF_VOICE` and `OFF_FOCUS`.

## 7. Persistence, API, canvas

- `draft2_sessions.deck jsonb` (additive migration 0104); `aliveSince()`
  covers `deck`.
- `POST /api/radar/draft2/deck` `{ storyId, sessionId, continue? }`;
  `PATCH /api/radar/draft2/deck` `{ sessionId, candidateId }`.
- **Canvas, step 5 · Deck:**
  - "Write the deck" waits for a finished closing that ends the opening
    chosen now.
  - The chosen deck shows as the whole carousel, cover to call to action;
    the slides other steps wrote are quieter.
  - A notice appears when the opening or closing chosen since is not the one
    the deck connects.

## 8. Tests

- `draft2-deck.types.test.ts`: the shapes and plans, parsing, every program
  finding, duplicates, the requests.
- `draft2-deck.test.ts`: the step in the shared sandbox. It covers:
  - the context, effort and trace;
  - the arc's and the list's rounds;
  - prerequisites, and choosing a deck.
- `draft2-skills.test.ts`: the decks rubric matches the constants.

## 9. Out of scope

- Review (the next step: the whole carousel judged together before approval).
- Images, captions and publication.

## The spine fixes an arc's length (2026-10-12)

When the focus has a spine, an arc's deck has exactly as many slides as the
spine's middle beats (`deckShape(structure, slide2FactIds, spine)`, clamped
to the deck's 2–5 range), and the deck writer and judge read the spine skill:
each slide is its middle beat, in order, and the turn's slide leaves room for
its image. A list or a procedure keeps its items as before.

## Decks v2: headlines that state their facts (2026-10-14)

A headline states its slide's fact, never a comment on the facts or a
comparison without its terms; the fairness skill joins the writer and the
judge. See draft2-news-integrity.md.
