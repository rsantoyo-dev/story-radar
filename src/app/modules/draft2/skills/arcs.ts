import type { Draft2Skill } from "./draft2-skills";

/**
 * The arcs skill: how a carousel moves the reader's curiosity when the
 * focus's concept is one of the beat arcs (progressive-reveal,
 * problem-solution, cause-effect, escalation, comparison). Every step that
 * writes or judges words or images reads it then, with its own role's part;
 * a classic or discovery story's instructions do not change. The judge that
 * reviews Claude's concept reads its own part.
 */
export const ARCS_SKILL: Draft2Skill = {
  name: "arcs",
  version: "1",
  text: `# Story arcs

The focus's concept names the arc: how the carousel moves the reader's
curiosity from the cover to the last slide. Every slide is one beat of it,
in the order focus.concept.beats gives, every beat rests on the facts it
cites, and each one makes the next wanted.

- progressive-reveal: the answer the cover promises arrives piece by piece,
  one part per slide, until the last completes the picture; each slide adds
  what the one before made the reader want, and never repeats it.
- problem-solution: a problem the audience lives with, what it costs them,
  then the solution the facts give. The problem and the solution are both in
  the facts, and no consequence is added.
- cause-effect: one link of a chain per slide, each effect the cause of the
  next. Every link is one the facts state, never one inferred, and a cause
  the facts only suggest keeps their qualifier.
- escalation: each slide bigger, faster, rarer or more surprising than the
  one before, in the facts' own magnitudes; the peak is the last beat, never
  an exaggeration.
- comparison: two alternatives measured on the same criteria, one criterion
  per slide, each side's value as the facts give it; a verdict, if any, is
  the facts', never the writer's.`,
  roleText: {
    "focus-concept-judge": `## Reviewing an arc
The writer chose an arc other than classic. Keep it only if it earns its
place; otherwise the story is told classic. Judge:
- curiosity: does the arc pull the reader through the slides harder than the
  news told straight?
- grounding: does every beat rest on the facts it cites: a chain the facts
  state, a problem and a solution both in them, magnitudes they give, a
  comparison on their own values?
- inference: would the arc force a cause, a ranking or a verdict the facts
  do not make? Then classic.
Return "keep" or "classic" with a reason of at most 300 characters that names
what decides it.`,
    "opening-writer": `## The arc
The focus names an arc (focus.concept). The cover sets it up: the question
whose answer arrives piece by piece, the problem, the first cause, the first
and smallest step, or the two alternatives. Slide 2 is its first beat.`,
    "opening-judge": `## The arc
The focus names an arc (focus.concept). Within the focus criterion, score
whether the cover sets it up and slide 2 is its first beat.`,
    "deck-writer": `## The arc
The focus names an arc (focus.concept). Each slide of the deck is the next
beat, in the order of focus.concept.beats, from the facts it cites; for a
comparison, one criterion per slide with both sides.`,
    "deck-judge": `## The arc
The focus names an arc (focus.concept). Within the focus criterion, score
whether each slide is the next beat, in order, resting on its facts.`,
    "closing-writer": `## The arc
The focus names an arc (focus.concept). The penultimate slide is the arc's
last beat: the last piece of the answer, the solution, the final effect, the
peak, or the last criterion. The last slide says what it means for the
reader, with the call to action.`,
    "closing-judge": `## The arc
The focus names an arc (focus.concept). Within the focus criterion, score
whether the penultimate slide is the arc's last beat and the last slide says
what it means.`,
    "visual-writer": `## The arc
The focus names an arc (focus.concept). Each image shows its slide's beat:
more of one subject each time for a progressive reveal; the problem in the
first images and the solution after; each effect visibly following the image
before in a chain; a scale that grows in an escalation; the two
alternatives side by side, in the same light and framing, in a comparison.`,
    "visual-judge": `## The arc
The focus names an arc (focus.concept). Within the focus criterion, score
whether each image shows its slide's beat of the arc.`,
  },
};
