import type { Draft2Skill } from "./draft2-skills";

/**
 * The narratives skill: how a carousel is told across its slides when the
 * focus names a narrative form other than classic. Every step that writes or
 * judges words or images reads it then, with its own role's part; a classic
 * story's instructions stay exactly as they were before narrative forms.
 * The focus editor reads the shared text to choose a form, and the judge
 * that reviews Claude's choice reads its own part. Version 2 adds panorama
 * and follow-the-line, drawn once as one wide master scene. Version 3 makes
 * the anchor a carrier (never one of the story's own subjects or items; a
 * real object travels only when the facts say it moves) and lifts the visual
 * script's recurring-element limits for it: on every slide by design, what
 * must change is its state and its scene. Version 4: a scene or a line binds
 * the images, not the words (the words follow the sections' order), and needs
 * an identity that can hold one continuous photographic scene.
 */
export const NARRATIVES_SKILL: Draft2Skill = {
  name: "narratives",
  version: "4",
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
- panorama: one wide scene runs across every slide, read left to right; each
  slide is the next section of it, and the image continues past every edge
  into the next slide.
- follow-the-line: a line with a real meaning (a trail, a route, a street, a
  river) enters every slide at its left edge and leaves at its right edge,
  where the next slide picks it up; it leads the reader to what it reaches.

The anchor is what stays: the guide, the object, the scene or the line, the
same on every slide, described the same way every time. The progression is
what changes from slide to slide: each slide is one step of it, in an order
that makes the next step wanted. The ending either resolves the story or
returns: the last slide comes back to the cover's frame, now read with what
the reader knows.

The anchor is a carrier, never one of the story's own subjects. A thing the
facts describe as one of the story's attractions, products, stops or items
is what a slide shows, not what carries the reader to it: an anchor taken
from the list would stand beside things the facts never place it with. A
real object from the facts travels only when the facts say it moves through
the scenes (a float along a parade, a torch from hand to hand); otherwise the
thread is a neutral carrier: a brand character, an anonymous figure, or a
stylized echo of the object (its light, its silhouette, its colour) that
never claims to be present.

Because the anchor is on every slide by design, the visual script's limits
on a recurring element (at most two slides led, never two in a row, one
return at the end) do not apply to it, and its presence is never repetition.
What must change is its state and the scene around it: where it is, what it
does or finds, what the hour or the light does to it, one step per slide.

What a form never changes is the facts. The anchor never says, sees or vouches
for anything the facts do not: a guide is neither a witness nor a source, and
its words on a slide are the slide's words, held to the same facts. An object,
a figure or a scene never suggests what the facts do not say (no ticket for a
free event, no dog where the facts never say dogs are welcome), and a line
goes only where the facts say it goes. Aggressive curiosity, conservative
facts.`,
  roleText: {
    "focus-narrative-judge": `## Reviewing a narrative form
The writer chose a form other than classic. Keep it only if it earns its
place; otherwise the story is told classic. Judge:
- curiosity: does the form make the reader want the next slide more than a
  classic telling would? An anchor that only decorates does not.
- fit: does it serve these facts, this audience and this goal? A schedule of
  unrelated items rarely needs a guide; a walk, a visit, a search, a route or
  a change over time often does. A panorama needs one continuous world, a
  line a route the facts give.
- truth: does the anchor suggest anything the facts do not say? Is it a real
  person of the story (material.people)? Either sends it back to classic.
- carrier: is the anchor one of the story's own subjects or items (an
  attraction, a product, a stop the facts list)? Then classic, or another
  anchor, unless the facts say it moves through the scenes.
- feasibility: can every image keep the anchor the same? A brand character
  with a reference image can; a figure or an object must be one thing,
  described the same way every time; a panorama or a line is drawn once as a
  wide scene and cut into the slides, so it also needs an identity that can
  hold one continuous photographic scene: an identity built on cut-outs over
  flat colour planes, or on a different layout per slide, cannot, and sends
  the form back to classic. And the story's steps must be places along the
  scene or the line; steps that are not places (a roster, a result, a plan)
  would have to be encoded in objects, which is abstraction, not a panorama.
Return "keep" or "classic" with a reason of at most 300 characters that names
what decides it.`,
    "opening-writer": `## The narrative form
The focus names a narrative form (focus.narrative). The cover introduces the
anchor in its first state and makes the reader want to follow it: the guide
about to set out, the object at its start, the panorama's left end where the
eye enters, the line's beginning with a promise of where it leads. Slide 2
takes the first step of the progression and pays the cover's first promise.
Call the anchor only what the focus calls it. For a panorama or a line (an
anchor of kind scene or line), the words only name where the story enters
the scene and what its first section reaches; the scene itself is the
images' work, and the words never describe it.`,
    "opening-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether the cover introduces the anchor and slide 2 takes the
first step of its progression; an opening that ignores the form misses its
brief, however strong its hook. For a scene or a line, score only that the
words follow the sections' order, never whether they describe the scene: the
images carry it.`,
    "closing-writer": `## The narrative form
The focus names a narrative form (focus.narrative). The penultimate slide is
the progression's last step, with the anchor in it. The last slide resolves
the story with the anchor present (the panorama's right end, where the line
arrives), or, when the ending returns, comes back to the cover's frame and
lets the reader see it again with what they now know. For a scene or a line,
the words only name what the last section reaches; they never describe the
scene.`,
    "closing-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether the ending completes the progression with the anchor
present and, when the ending returns, echoes the cover. For a scene or a
line, "present" means the words reach the scene's end in order, not that
they describe the scene: the images carry it.`,
    "deck-writer": `## The narrative form
The focus names a narrative form (focus.narrative). Each slide of the deck is
one step of the progression with the anchor in it: a new place or moment for
the guide, a new scene for the object, the next section of the panorama, the
next thing the line reaches, in order, each slide making the next wanted. A
list's items or a procedure's steps are the progression's steps. For a
panorama or a line, each slide's words say what its section reaches or
shows, in order; the scene itself is the images' work, and the words never
describe it.`,
    "deck-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether every slide advances the progression with the anchor
present, in an order that builds curiosity. For a scene or a line, "present"
means the words follow the sections' order, not that they describe the scene:
the images carry it, and a deck is never OFF_FOCUS for leaving the scene to
them.`,
    "visual-writer": `## The narrative form
The focus names a narrative form (focus.narrative). The anchor is in every
slide's image, described with the same words every time in the cast, and
each slide shows the progression's step its words take. A brand character
anchor is that character (characterPlan uses its id); a figure or an object
is the motif and the protagonist. For a panorama or a line, every slide is
one section of a single wide scene read left to right, so no slide is a
typography card: one light, one horizon and one scale across the slides,
each direction saying what its section shows and what touches its left and
right edges; a line is the recurring element, entering each slide at the
left edge and leaving at the right. When the ending returns, the last image
takes the cover's framing again. The anchor replaces any other recurring
element the focus's visualDirection names. Its state changes on every slide;
mark it "focus" where it leads and "accent" where it accompanies: with a
form, those marks have no limit in number or adjacency.`,
    "visual-judge": `## The narrative form
The focus names a narrative form (focus.narrative). Within the focus
criterion, score whether the anchor is in every image, described the same way
every time, and each image shows its slide's step of the progression; for a
panorama or a line, whether the slides read as one continuous scene. Its
presence on every slide is the form, never REPETITIVE or MOTIF_DEPENDENCY;
judge whether its state and its scene change from slide to slide, and
whether its placing suggests nothing the facts do not say.`,
  },
};

export const NARRATIVE_ROLES = {
  "focus-narrative-judge": `You review the narrative form chosen for a social carousel of the publication described below, against the story's verified facts, its focus (focus.narrative is the form) and the material People and places found. Follow the narratives skill and its review part.`,
} as const;
