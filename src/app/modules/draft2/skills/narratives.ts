import type { Draft2Skill } from "./draft2-skills";

/**
 * The narratives skill: how a carousel is told across its slides when the
 * focus names a narrative form other than classic. Every step that writes or
 * judges words or images reads it then, with its own role's part; a classic
 * story's instructions stay exactly as they were before narrative forms.
 * The focus editor reads the shared text to choose a form, and the judge
 * that reviews Claude's choice reads its own part.
 */
export const NARRATIVES_SKILL: Draft2Skill = {
  name: "narratives",
  version: "1",
  text: `# Narrative forms

A carousel is read one swipe at a time. A narrative form gives every swipe a
reason to happen, in the words and the images together: the reader follows
something from the first slide to the last and wants to see where it goes
next. The story's focus names the form; every step follows it.

- classic: one story told slide by slide, each image its own. The right form
  whenever no anchor makes the next slide more wanted.
- character-guide: a guide leads the reader through the story's places or
  moments: the same figure on every slide, looking, pointing, finding,
  reacting. It is one of the brand's characters, a figure the facts give (an
  animal, a mascot) or an anonymous figure the story calls for (a child seen
  from behind, a volunteer); never a real person of the story.
- traveling-object: one object from the facts crosses the story's scenes,
  places or times while the world around it changes; it carries the thread
  without a narrator.

The anchor is what stays: the guide or the object, the same on every slide,
described the same way every time. The progression is what changes from
slide to slide: each slide is one step of it, in an order that makes the next
step wanted. The ending either resolves the story or returns: the last slide
comes back to the cover's frame, now read with what the reader knows.

What a form never changes is the facts. The anchor never says, sees or vouches
for anything the facts do not: a guide is neither a witness nor a source, and
its words on a slide are the slide's words, held to the same facts. An object
or a figure never suggests what the facts do not say (no ticket for a free
event, no dog where the facts never say dogs are welcome). Aggressive
curiosity, conservative facts.`,
  roleText: {
    "focus-narrative-judge": `## Reviewing a narrative form
The writer chose a form other than classic. Keep it only if it earns its
place; otherwise the story is told classic. Judge:
- curiosity: does the anchor make the reader want the next slide more than a
  classic telling would? A guide or an object that only decorates does not.
- fit: does it serve these facts, this audience and this goal? A schedule of
  unrelated items rarely needs a guide; a walk, a visit, a search, a change
  over time often does.
- truth: does the anchor suggest anything the facts do not say? Is it a real
  person of the story (material.people)? Either sends it back to classic.
- feasibility: can every image keep the anchor the same? A brand character
  with a reference image can; a figure or an object must be one thing,
  described the same way every time.
Return "keep" or "classic" with a reason of at most 300 characters that names
what decides it.`,
    "opening-writer": `## The narrative form
The focus names a narrative form (focus.narrative). The cover introduces the
anchor in its first state and makes the reader want to follow it: the guide
about to set out, the object at its start, with the story's promise. Slide 2
takes the first step of the progression and pays the cover's first promise.
Call the guide or the object only what the focus calls it.`,
    "opening-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether the cover introduces the anchor and slide 2 takes the
first step of its progression; an opening that ignores the form misses its
brief, however strong its hook.`,
    "closing-writer": `## The narrative form
The focus names a narrative form (focus.narrative). The penultimate slide is
the progression's last step, with the anchor in it. The last slide resolves
the story with the anchor present, or, when the ending returns, comes back to
the cover's frame and lets the reader see it again with what they now know.`,
    "closing-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether the ending completes the progression with the anchor
present and, when the ending returns, echoes the cover.`,
    "deck-writer": `## The narrative form
The focus names a narrative form (focus.narrative). Each slide of the deck is
one step of the progression with the anchor in it: a new place or moment for
the guide, a new scene for the object, in order, each slide making the next
wanted. A list's items or a procedure's steps are the progression's steps.`,
    "deck-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether every slide advances the progression with the anchor
present, in an order that builds curiosity.`,
    "visual-writer": `## The narrative form
The focus names a narrative form (focus.narrative). The anchor is in every
slide's image, described with the same words every time in the cast, and
each slide shows the progression's step its words take. A brand character
anchor is that character (characterPlan uses its id); a figure or an object
is the motif and the protagonist. When the ending returns, the last image
takes the cover's framing again.`,
    "visual-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether the anchor is in every image, described the same way
every time, and each image shows its slide's step of the progression.`,
  },
};

export const NARRATIVE_ROLES = {
  "focus-narrative-judge": `You review the narrative form chosen for a social carousel of the publication described below, against the story's verified facts, its focus (focus.narrative is the form) and the material People and places found. Follow the narratives skill and its review part.`,
} as const;
