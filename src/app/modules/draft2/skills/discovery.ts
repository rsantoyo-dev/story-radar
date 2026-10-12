import type { Draft2Skill } from "./draft2-skills";

/**
 * The discovery skill: how a carousel is told when the focus's concept is
 * discovery, the reader discovering the news through a premise that is the
 * story's own world. Every step that writes or judges words or images reads
 * it then, with its own role's part; a classic story's instructions stay as
 * they were. The judge that reviews Claude's premise reads its own part.
 */
export const DISCOVERY_SKILL: Draft2Skill = {
  name: "discovery",
  version: "1",
  text: `# Discovery

The focus's concept is discovery: the reader does not receive the news, they
discover it. The premise is the story's own world, invented for it (an SOS
the park's animals sent, a message found on a trail, a mission order, an
invitation from someone unexpected); the chain of reveals is the order in
which the carousel answers its questions.

Curiosity is a gap between what the reader knows and what they now want to
know, and a specific gap pulls harder than a vague one. Every slide closes
the gap the slide before it opened and opens the next, so the reader always
has a reason to swipe. The cover opens the first gap with something the
reader finds or overhears inside the premise's world, never with the date,
the time or the price. The news itself (what happens, when, where, for whom,
at what price, with which rules) is the last reveal, stated plainly and
completely.

The premise invents the world, never the news:
- what the reader is asked to do inside the premise is what the facts say
  they will do (bring « bonbons » to the animals, walk the trail); never a
  contest, a theft, a danger, a prize or a riddle the facts do not have;
- animals, objects and places may speak or write in the premise; real people
  and organizations never do: nothing is said, signed or sent by a person,
  the organizer, the city or a company;
- every fact keeps its qualifier, and every practical value (date, time,
  price, ages, place, rules) appears as the facts give it;
- by the last slide, a reader who swiped through knows exactly what the news
  is, and one who reads only the caption knows it too.`,
  roleText: {
    "focus-concept-judge": `## Reviewing a premise
The writer chose discovery. Keep it only if it earns its place; otherwise the
story is told classic. Judge:
- curiosity: does the premise open a specific question on the cover that
  pulls harder than the news told straight? Does each reveal open the next?
- truth: following the premise literally, does the reader end up doing what
  the facts say? Does it invent the news (a theft, a contest, a danger, a
  prize, a riddle), or make a real person or organization speak? Either
  sends it back to classic.
- tone: does it fit the story's gravity, its audience and the brand?
- clarity: will a reader understand it is play, and know the real news by
  the last slide?
Return "keep" or "classic" with a reason of at most 300 characters that names
what decides it.`,
    "opening-writer": `## Discovery
The focus's concept is discovery (focus.concept). The cover opens the
premise's first question with something found or overheard in its world (a
message, a sign, a call for help), in the premise's voice; it does not state
the date, the time or the price. Slide 2 answers that question and opens the
next, in the order focus.concept.reveals gives. Both stay true to the facts
the premise dramatizes.`,
    "opening-judge": `## Discovery
The focus's concept is discovery (focus.concept). Within the focus criterion,
score whether the cover opens a specific question inside the premise and
slide 2 answers it and opens the next. A cover that states the news outright,
or a premise that invents the news, misses the brief.`,
    "deck-writer": `## Discovery
The focus's concept is discovery (focus.concept). Each slide answers the
question the slide before it opened and opens the next, in the premise's
world and voice, in the order focus.concept.reveals gives. Keep each
practical fact for the reveal the chain gives it, stated plainly.`,
    "deck-judge": `## Discovery
The focus's concept is discovery (focus.concept). Within the focus criterion,
score whether every slide answers the question before it and opens the next,
in the premise's world, without inventing the news.`,
    "closing-writer": `## Discovery
The focus's concept is discovery (focus.concept). The penultimate slide is
the last step before the reveal. The last slide is the reveal: the news
itself, plainly and completely (what, when, where, for whom, at what price,
with which rules), then one line in the premise's world and the call to
action.`,
    "closing-judge": `## Discovery
The focus's concept is discovery (focus.concept). Within the focus criterion,
score whether the last slide reveals the news plainly and completely, every
practical value as the facts give it, and closes the premise's world.`,
    "visual-writer": `## Discovery
The focus's concept is discovery (focus.concept). Each image is a moment of
the premise's world: what the reader finds or sees at that step (a letter on
a tree, a map, a stamped mission order, the animals where they wait). An
in-world object carries no words beyond the slide's own, and is never an
official document, logo, seal or sign of a real organization.`,
    "visual-judge": `## Discovery
The focus's concept is discovery (focus.concept). Within the focus criterion,
score whether each image is a moment of the premise's world that serves its
slide's reveal, with no lettering beyond the slide's words and nothing
official of a real organization.`,
    "caption-writer": `## Discovery
The focus's concept is discovery (focus.concept). The caption's first line
keeps the premise's question; the news follows plainly (what, when, where, at
what price, with which rules), so a reader who never swipes still knows it.`,
    "caption-judge": `## Discovery
The focus's concept is discovery (focus.concept). Score whether the caption
keeps the premise's question in its first line and still states the news
plainly.`,
  },
};

export const DISCOVERY_ROLES = {
  "focus-concept-judge": `You review the concept chosen for a social carousel of the publication described below, against the story's verified facts, its focus (focus.concept: a discovery premise with its chain of reveals, or a story arc with its beats) and the material People and places found. Follow the skill you receive and its review part.`,
} as const;
