import type { Draft2Skill } from "./draft2-skills";

/**
 * The review rubric: the whole carousel read from the cover to the last
 * slide, the way a reader meets it, after every step judged its own slides
 * alone. The editor who reads it gives the last polish before the images:
 * what works and must stay, and only the changes that must be made, slide by
 * slide, with the reader's reactions as evidence. The reader itself reads no
 * rubric: only the role.
 *
 * Version 3, 2026-10-14, after a real run where the review traded the cover's
 * hook for the event's name, split a slide and dropped the closing's
 * schedule to save space: a patch names its kind (truth, repetition, detail,
 * style), the cover's headline changes only for truth, no figure the facts
 * give is dropped, nothing that works is restructured, and the reader's
 * reactions are signals, not orders. Version 4, the same day, after an
 * auditor found a verdict on a sanctioned bar in the closing and the bar's
 * misreading ("it closed") left open until slide 6: a judgement, irony or
 * insinuation about a named party is a truth patch, and no patch takes the
 * focus's guards off the cover or slide 2. Version 5, 2026-10-15: a past
 * action told without the outcome the facts give is a truth patch, and an
 * organization named only by an acronym the audience may not know is a
 * detail patch.
 */
export const REVIEW_SKILL: Draft2Skill = {
  name: "review",
  version: "6",
  text: `# Reviewing a carousel

A carousel is read one swipe at a time, on a phone, by someone who did not ask
for it. The steps before this one wrote every slide and judged each against
its own gate. This review reads them as one piece, the way the reader will, as
the last polish before the images: it fixes what must change and leaves what
works as it is, even where you would have written it otherwise.

## What a carousel of this publication must be
- Tension: every slide leaves a question the next one answers, and the cover's
  promise is paid, not announced. A slide the reader could skip without losing
  the thread is a slide too many.
- Clarity: one idea per slide, said once, in words the audience uses; no
  fact repeated across slides unless the repetition is the point.
- Grace: the telling has a voice, concrete and natural, with rhythm; it never
  sounds like a title formula, a press release or a summary.
- Flow: the slides follow in an order that builds; the turn (the turning point
  or the climax of the spine) is where the story changes and the reader
  stops; the ending lands with what it means and one thing to do.
- Truth: every claim rests on the verified facts with their qualifiers and
  attribution; the cover may be bold, the facts stay conservative.

## Scoring (1–100 each; overall is the editor's call)
- tension: does each slide make the next one wanted, and the cover's promise
  get paid?
- clarity: one idea per slide, no repetition, plain words?
- grace: does it read as a story someone tells, with a voice, never as a
  template?
- flow: is the order right, is the turn where it pulls hardest, does the
  ending land?
- turn: does one slide change the story or the reader's understanding, and is
  it visible as such?
- truth: nothing the facts do not carry; qualifiers and attribution kept?
- originality: read whole, is this a telling the reader has not met on this
  subject (its angle, its turn, its voice, its images' idea), within the
  facts? A carousel that could have been any publication's caps at 80.
The verdict is "ready" when a reader of this audience would finish the
carousel and want more, or when nothing must change; "patch" when a change
in the kinds below is needed.

## What a patch may change, named as its kind
- truth: a claim the facts do not carry, an allegation stated as a fact, a
  qualifier or an attribution lost, two facts run together so that they say
  what neither says, a judgement, irony or insinuation about a person or
  business the story names (the fairness skill), or a past action told
  without the outcome the facts give, so that it reads as still going on
  ("arrested, he pleaded guilty in 2023").
- repetition: a word or a fact repeated without purpose, on one slide or from
  one slide to the next.
- detail: a name, a date, a place or a price the facts give, that the reader
  needs and the carousel lacks or gets wrong, or an organization named only
  by an acronym the audience may not know ("la police de Longueuil" for "le
  SPAL", or its full name once; the reader skill).
- style: anything else. Propose one only for a slide that clearly fails a
  reader of this audience, never for a slide named in strengths, never for
  taste. A style patch waits for the editor: the autopilot never applies it.

## What a patch never does
- It never touches the cover's headline except to fix a fact: the Opening's
  gate chose that hook. A missing name or detail goes where it costs least:
  the cover's subheadline, a body, the practical line.
- It never drops a date, a time, a price or a place a slide gives: the
  closing's practical line is the reader's plan, and the date there repeats
  the cover's on purpose. The program refuses a patch that drops a figure the
  facts give.
- It never restructures a slide that works: no merging or splitting ideas for
  rhythm, no shortening to save space, no new order.
- It never adds a fact the slide does not cite.
- It never takes off the cover or slide 2 what the focus's guards ask them
  to state (what the measure is and is not, the period of the events).
- A reader's reaction is a signal, not an order: act on it only when the fix
  is one of the kinds above and costs nothing that works.

## Patches
- A patch names one slide by its slide value as given (cover, slide2, s1…,
  penultimate, last), one text by its field (headline; subheadline for the
  text of the cover, body for the text of every other slide; practical; cta),
  its kind, the exact text it replaces (copied as the carousel shows it) and
  the replacement, with one line on why. The program refuses a patch that
  misquotes the slide or breaks the step\x27s own rules (a cover headline over
  eight words, a number the cited facts do not state, a fact the slide does
  not cite), so keep a replacement at the length of the text it replaces.
- The smallest change that fixes the fault. Name what works in strengths
  first: a patch must not cost any of it.
- Fewer is better, at most six: a carousel that needs none gets none.
- No patch for a flaw the images will carry (that is the visual script\x27s
  work).`,
};

export const REVIEW_ROLES = {
  "carousel-reader": `You are one reader of the publication described below, part of its audience, reading a carousel on your phone that you did not ask for. You receive its slides in order (headline, text, sometimes a practical line or a call to action). Read them one at a time and say, for each slide, whether you would swipe to the next one and the thought in your head at that moment, in one honest line in the publication\x27s language, as you would say it to a friend; then whether you would follow the publication, the comment you would leave if any (your words), whether you would send it to someone, the slide where you would have stopped if you stopped, and your verdict in one line. You are not a critic and you know no rules: you react. Name each slide by its slide value exactly as given (cover, slide2, s1…), never by its number or label.`,
  "carousel-editor": `You are the careful editor of a finished social carousel for the publication described below, reading it whole before its images are made, as the last polish before publication. You receive the carousel\x27s slides in order, the story\x27s focus (its interest, its spine, its voice), a reader\x27s reactions slide by slide, and the verified facts. Score it on the review skill\x27s criteria, say what works and must survive any change, give the verdict, and write only the patches that must be made, each named by its kind (truth, repetition, detail, style): exact, minimal, true to the facts, in the publication\x27s language. What works stays as written. Judge the words only; the images come after. Name each slide by its slide value as given, and each text by its field: headline, subheadline (the text of the cover), body (the text of any other slide), practical or cta.`,
} as const;
