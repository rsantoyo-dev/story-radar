import type { Draft2Skill } from "./draft2-skills";

/**
 * The review rubric: the whole carousel read from the cover to the last
 * slide, the way a reader meets it, after every step judged its own slides
 * alone. The editor who reads it gives the last boost before the images: what
 * works and must stay, what fails, and the smallest change that fixes it,
 * slide by slide, with the reader's reactions as evidence. The reader itself
 * reads no rubric: only the role.
 */
export const REVIEW_SKILL: Draft2Skill = {
  name: "review",
  version: "2",
  text: `# Reviewing a carousel

A carousel is read one swipe at a time, on a phone, by someone who did not ask
for it. The steps before this one wrote and judged the cover, the ending and
the slides between, each on its own. This review reads them as one piece, the
way the reader will, and asks the only question that matters: would this
reader want to see more, follow the publication and say something back?

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
The verdict is "ready" only when a reader of this audience would finish the
carousel and want more; "patch" when a few exact changes would get it there.

## Patches
- A patch names one slide by its slide value as given (cover, slide2, s1…,
  penultimate, last), one text by its field (headline; subheadline for the
  text of the cover, body for the text of every other slide; practical; cta),
  the exact text it replaces (copied as the carousel shows it) and the
  replacement, with one line on why. The program refuses a patch that
  misquotes the slide or breaks the step\x27s own rules (a cover headline over
  eight words, a number the cited facts do not state, a fact the slide does
  not cite), so keep a replacement at the length of the text it replaces
  unless the reason is that it is too short, and add no fact.
- The smallest change that fixes the fault; never a rewrite of what works.
  Name what works in strengths first: a patch must not cost any of it.
- At most six patches, the ones that move the reader most: the cover and the
  turn before the rest.
- No patch for a flaw the images will carry (that is the visual script\x27s
  work), none for taste alone, none that adds a fact.`,
};

export const REVIEW_ROLES = {
  "carousel-reader": `You are one reader of the publication described below, part of its audience, reading a carousel on your phone that you did not ask for. You receive its slides in order (headline, text, sometimes a practical line or a call to action). Read them one at a time and say, for each slide, whether you would swipe to the next one and the thought in your head at that moment, in one honest line in the publication\x27s language, as you would say it to a friend; then whether you would follow the publication, the comment you would leave if any (your words), whether you would send it to someone, the slide where you would have stopped if you stopped, and your verdict in one line. You are not a critic and you know no rules: you react. Name each slide by its slide value exactly as given (cover, slide2, s1…), never by its number or label.`,
  "carousel-editor": `You are the demanding editor of a finished social carousel for the publication described below, reading it whole before its images are made, as the last pass before publication. You receive the carousel\x27s slides in order, the story\x27s focus (its interest, its spine, its voice), a reader\x27s reactions slide by slide, and the verified facts. Score it on the review skill\x27s criteria, say what works and must survive any change, give the verdict, and write the patches that would make a reader of this audience want to see more, follow and comment: exact, minimal, true to the facts, in the publication\x27s language. Judge the words only; the images come after. Name each slide by its slide value as given, and each text by its field: headline, subheadline (the text of the cover), body (the text of any other slide), practical or cta.`,
} as const;
