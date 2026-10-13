# Draft 2 — Review (step between the Deck and the visual script)

Built 2026-10-12 from the editor's ask: the stories must be a symbol of very
high quality, a reader who enters must want to see more, follow and comment.
Every step before this one wrote and judged its own slides alone (the
opening, the closing, the deck). Nobody read the carousel whole, the way a
reader meets it. The Review does, before the images are planned, and gives
the words their last boost.

## 1. What it does

Two provider calls, then the program:

1. **The reader** (role `carousel-reader`, no rubric, the cheap judge by
   default: `DRAFT2_MODEL_REVIEW_READER`, else `DRAFT2_MODEL_JUDGE`, else
   gpt-6-luna, effort low). A member of the publication's audience reads the
   slides in order on a phone and says, for each one, whether they would
   swipe and the thought in their head; then whether they would follow,
   the comment they would leave, whether they would share, where they
   stopped, and a one-line verdict.
2. **The editor** (role `carousel-editor`, the review skill v1, the
   independent gate by default: `DRAFT2_MODEL_REVIEW_JUDGE`, else Sol,
   effort medium). It reads the slides, the focus (interest, spine, voice),
   the reader's reactions and the verified facts; scores tension, clarity,
   grace, flow, turn and truth (1–100, plus an overall); gives a verdict,
   `ready` or `patch`; names what works and must survive any change; and
   writes up to six patches: one slide, one text (headline, subheadline,
   body, practical, cta), the exact text replaced, the replacement, why.
3. **The program** checks every patch before anyone sees it as a choice: the
   quoted text must be the slide's (else `refused`, with both texts), the
   replacement must differ, and the patched candidate must pass the owning
   step's own mechanical checks (`mechanicalOpeningIssues`,
   `mechanicalClosingIssues`, `mechanicalDeckIssues`, with the context each
   run recorded); a finding refuses the patch with the rule.

The review is kept on `draft2_sessions.review` (migration 0108): the
versions it read (`openingId`, `closingId`, `deckId`, `focusVersion`), the
carousel's words as read, the reader, the editor, both models, the trace
entries (`draft2_review_read`, `draft2_review`), and earlier reviews in
`previousRuns`.

## 2. Applying a patch

`PATCH /api/radar/draft2/review` with `action` `apply`, `decline`, `undo`
(and `patchId`), or `apply-all`. An apply checks the slide still says what
the review quoted and that the review read the versions chosen now, then
edits the chosen candidate **in place** in the owning step (its rounds and
its last candidates) and in every later step that keeps a copy of it: the
closing and the deck record the opening they follow, the deck the closing it
leads to; the review's own carousel follows too. The patch keeps `before`,
so `undo` restores the text. The review's version moves on every decision.

In the autopilot, the review runs after the deck and its proposed patches
are applied as the editor wrote them (`appliedBy: "autopilot"`); the Review
screen shows each with its before and after, and undoes any. A new opening,
closing or deck chosen since makes the review "Changed since": read again.

A patch applied after the visual script exists changes words the script
pictured and the images letter, so the visual script shows "Changed since"
(`sameCarouselWords` compares the words the script recorded with the carousel
as it stands, `deckCarousel`), the images wait for a new script, and the
autopilot writes the visual script again before the images. Undoing every
patch makes the script current again.

## 3. Why words only, and before the images

The images follow the words (the visual script pictures the carousel as it
stands), so the words are fixed first and the visual script then reads the
patched carousel. A flaw the images will carry is the visual script's work;
the review skill says so. A later review of the finished images is a
possible second pass, not built.

## 4. Cost

Reader ≈ $0.01 (Luna, low); editor ≈ $0.10–0.25 (Sol, medium, the carousel
plus facts and focus in, up to 8k tokens out). About a minute. Set
`DRAFT2_MODEL_REVIEW_JUDGE=gpt-6-luna` to run both on the cheap judge.

## 5. Files

- `draft2-review.types.ts`: contracts, the two schemas (no enum inside an
  array), `parseReaderAnswer`, `parseReviewAnswer`, `reviewPatches`
  (owners, numbering, refusals for a misquoted or unchanged text),
  `patchedOpening` / `patchedClosing` / `patchedDeck`, `reviewCurrent`,
  `proposedPatches`.
- `draft2-review.ts`: `reviewDraft2Carousel`, `decideDraft2ReviewPatch`,
  `reviewModels`.
- `skills/review.ts`: the rubric and the two roles.
- `api/radar/draft2/review/route.ts`: POST (read), PATCH (decide).
- Canvas: the Review screen (`ReviewView`), the rail's Words group, the
  autopilot order and the automatic apply.
- Tests: `draft2-review.types.test.ts`, `draft2-review.test.ts` (the run in
  a sandbox with both answers mocked, the program's refusals, apply, undo,
  decline, apply-all, a stale review, failures).
