# Draft 2: the editor's hand on a finished step (2026-10-15)

The editor: "in caption, I should be able to edit manually; in fact, every
step after it is finished… a hook I want to introduce, or a hook idea, or
some hand modification on deck, script."

## Edit by hand

Under the Opening, the Closing, the Deck, the Visual script and the Caption,
once the run is finished and a version is chosen, "Edit by hand" shows every
text of the chosen version: the cover's headline and subheadline, slide 2's
headline and text, the penultimate's and the last slide's headline and text
and the call to action, each deck slide's headline, text and practical
line, each script slide's image direction, the caption and its hashtags.

- A change is applied in place, as the review's patches are
  (`funnelWithCandidate`): in the step's run, in the copies the later steps
  keep (the closing's and the deck's opening, the deck's closing), and in the
  review's and the visual script's carousels when they read these versions,
  so a later step and a new image take the words as they now stand.
- The step's own checks run on the edited version and their findings come
  back with the change (a number the facts do not state, a limit, the other
  form of address…). They are shown, never blocking: the editor has the
  last word. A slide whose image is already made says so: the image shows
  the earlier words or follows the earlier direction until it is made again.
- Each change is recorded on the run (`edits`: before, after, findings) and
  can be undone while the text still says what the change wrote; a later
  change to the same text is undone first.
- Nothing is edited while a run of the story goes, or before the step has a
  chosen version. No provider call.

## Your own opening

Under the Opening, "Your own opening" takes a hook or a whole opening:

- **Use it as it is** (all four texts): it joins the run's versions (`e1`,
  `e2`…, "Yours"), with what the program finds on it (it cites no fact), and
  becomes the chosen opening.
- **Develop it with the writer** (the headline is enough): it joins the last
  round's proposals (`p…`, `byEditor`) and the canvas runs one more round:
  the writer keeps its hook and device, writes what it lacks and cites the
  facts, and the judge scores it beside the others, as the editor wrote it
  and as the writer edited it. An idea of the editor's earns its round past
  the cap of extra rounds.

## Files

`draft2-edits.types.ts` (the contract), `draft2-edits.ts` (applying, undoing,
the own opening), `src/app/api/radar/draft2/edit/route.ts` (PATCH),
`draft-2-hand-edits.tsx` (the two panels), `draft-2-canvas.tsx` (wiring),
`draft2-funnel.ts` (`byEditor`, `FunnelEditorEdit`, `funnelWithCandidate`),
`draft2-funnel-run.ts` (the idea's round past the cap), the opening writer's
role (`skills/hooks.ts`).

## Addendum, 2026-10-17: a hand edit cites the facts that state its numbers

A hand edit of the Saint-Jean closing wrote the police line, which no fact
the slide cited gave, and the program's finding ("450, 3599222 is not stated
by the facts") could only be shown: an edit changes words, not citations.
Now `applyEdit` cites, with the edit, the verified facts that state the
numbers the new text brings and the cited facts do not (`factsCitedByHand`,
three at most, never a disputed fact); the edit records them
(`citedFactIds`) and an undo takes them off again; the copies the later
steps keep follow. The editor's other words still cite nothing: a claim
without a figure stays theirs. Hashtags and visual directions are not read
for numbers.

## Addendum, 2026-10-23: a fact by hand

While the facts wait for the editor (the reviewer did not accept them after
three extractions), each fact's claim and attribution can be changed by hand
on the Facts screen ("Edit by hand" under the list; `PATCH
/api/radar/draft2/facts` with `action: "edit"`, `editedFacts`). The evidence
is never edited; the fact records what it said before, and the list shows
"Edited by you". The Houston facts carried the article's typo "RAJC" for
RACJ, and the only ways out were another extraction or taking the typo. A
fact is edited only before a later step runs on the facts: afterwards, start
over from the facts.
