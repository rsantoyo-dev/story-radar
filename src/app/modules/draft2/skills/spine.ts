import type { Draft2Skill } from "./draft2-skills";

/**
 * The spine skill: the carousel's beats, decided in the Focus after the
 * concept and the narrative form, one beat per slide, each with its scene,
 * the words' job, what the image adds, what is withheld for the next slide
 * and the facts it rests on. The Focus editor writes it; every step that
 * writes or judges words or images reads it, with its own role's part, so
 * the words and the images follow one plan instead of the images following
 * the words. The editor's version of 2026-10-12: eight classic moments
 * (hook, setup, inciting incident, rising action, turning point, climax,
 * resolution, payoff) as an adaptable sequence, never a mandatory count.
 */
export const SPINE_SKILL: Draft2Skill = {
  name: "spine",
  version: "1",
  text: `# The spine

The spine is the carousel's story in beats, one per slide, written before any
slide: it says what happens on each slide (the scene, told the way the
narrative form tells it), what the words of that slide do, what its image adds
that the words cannot say, what is held back for the next slide, and the facts
the beat rests on. The Opening, the Deck, the Closing and the visual script
each take their slides from it, and the judges score each slide against its
beat, so the words and the images carry one story in two voices.

## Roles of a beat
The roles are the classic moments of a narration, adapted to a carousel; a
story takes the ones it needs, in this order, and may repeat rising:
- hook: the promise that stops the reader (always the cover).
- setup: the facts, the people and the context the promise rests on.
- inciting: the event that sets the story in motion.
- rising: a discovery, an obstacle or a consequence that raises the stakes;
  the items of a list or the steps of a procedure are rising beats.
- turning-point: the slide where the story changes direction, or where what
  the reader believed changes (a twist). Every spine has a turning-point or a
  climax; the one slide that carries the turn is image-led: its image is the
  reveal and its words step back.
- climax: the moment of highest tension or of the main discovery.
- resolution: the consequences, the loose ends closed.
- payoff: the reward of the promise, what it means for the reader; the last
  slide is a payoff or a resolution. A payoff may also come earlier when a
  promise is paid before the end.

## Each beat
- slide: its place in the carousel: "cover", "slide2", "middle" (the deck's
  slides, in order), "penultimate" (an arc's closing has one), "last".
- role: one of the roles above.
- scene: what happens on this slide, in the present tense, told through the
  narrative form when there is one (the guide arrives, the object crosses,
  the next section of the scene) and through the concept (the next reveal,
  the next link of the chain); at most 240 characters.
- words: the words' job on this slide, at most 200 characters: what they
  state, ask or promise; never the words themselves.
- image: what the image adds that the words cannot say, at most 240
  characters: the scale, the consequence, the moment before or after, the
  detail that proves it, a contrast; never an illustration of the words.
- withholds: what this slide keeps for the next one, the open loop, at most
  160 characters; empty on the last slide only.
- factIds: the verified facts this beat rests on; a hook may rest on none.

## Rules
- Four to ten beats, one per slide: one cover, one slide2, the deck's middle
  slides (two to five for an arc; one per item or step otherwise, the first
  item allowed on slide2), one penultimate for an arc, one last.
- Every beat rests on the facts; the spine orders them and adds none. A beat
  that would need a fact the list does not have is a beat the story does not
  have.
- The turning point or the climax is the strongest true thing the facts
  hold, placed where it pulls hardest, never later than it must be; a
  surprise the facts do not support is not a twist.
- With a narrative form, each scene names the anchor's state on that slide.
  With a discovery premise, the beats are its reveals and the news is the
  last. With an arc concept, the beats are its beats.
- The direction and the visual direction are written after the spine and
  restate its choices; they never open another thread.`,
  roleText: {
    "opening-writer": `## The spine
The focus has a spine (focus.spine): the cover is its first beat and slide 2
its second. The cover's words do what the hook beat's words say and promise
what its image adds; slide 2 does what the setup beat says and withholds what
the beat withholds. An opening that pays what the spine keeps for a later
slide spends the story early.`,
    "opening-judge": `## The spine
The focus has a spine (focus.spine). Within the focus criterion, score whether
the cover is the hook beat and slide 2 the second beat as the spine says them,
and whether the opening keeps what the spine withholds; an opening that
ignores its beats misses its brief, however strong its hook.`,
    "deck-writer": `## The spine
The focus has a spine (focus.spine): the deck's slides are its "middle" beats,
in order, one slide per beat, as many slides as middle beats. Each slide's
words do what its beat's words say, rest on its beat's facts, and keep what
the beat withholds for the next slide. The slide of the turning point or the
climax carries the turn: its words step back for the image to lead, and say
what the beat's image line cannot.`,
    "deck-judge": `## The spine
The focus has a spine (focus.spine). Within the focus criterion, score whether
each slide is its middle beat, in order, with as many slides as middle beats,
whether each keeps what its beat withholds, and whether the turn's slide
leaves room for its image.`,
    "closing-writer": `## The spine
The focus has a spine (focus.spine): the penultimate slide is its
"penultimate" beat and the last slide its "last" beat. Each does what its
beat's words say and rests on its facts; the payoff pays the cover's promise
as the spine planned it.`,
    "closing-judge": `## The spine
The focus has a spine (focus.spine). Within the focus criterion, score whether
the closing's slides are their beats as the spine says them, and whether the
payoff pays the promise the hook beat made.`,
    "visual-writer": `## The spine
The focus has a spine (focus.spine): each slide's image does what its beat's
image line says, adds what the words cannot, and shows the scene the beat
describes; its beat field names that action. The slide of the turning point
or the climax is image-led: the strongest image of the sequence, the one the
reader did not expect, true to the facts. What a beat withholds, its image
withholds too.`,
    "visual-judge": `## The spine
The focus has a spine (focus.spine). Within the focus and the beat criteria,
score whether each image does what its beat's image line says and shows its
scene, whether the turn's slide is image-led, and whether no image reveals
what its beat withholds.`,
  },
};
