import type { Draft2Skill } from "./draft2-skills";

/**
 * The visual scripts rubric: how a carousel's images tell its story as one
 * sequence, and how a script is scored. The writer and the judge read this
 * one text; its numbers mirror the constants in draft2-visual.types.ts (a
 * test keeps them together). It carries v1's rules on real people, real
 * places and the brand's characters, and the publications' taste: close to
 * the reader, never glossy or obviously AI.
 */
export const VISUALS_SKILL: Draft2Skill = {
  name: "visuals",
  version: "4",
  text: `# Visual scripts for social carousels

A visual script is the sequence of images a carousel is made of, written as
one story: a sequence, not a series. A series shows variations of one thing
(nine views of a door); a sequence takes the reader somewhere: it can open
on a door, then show the people, the mechanism, the institution at work and
the consequence, and come back to the door at the end with a new meaning.
The words already tell the story; the images tell it again in their own
way, so a reader who saw only the images would still feel the beginning,
the turn and the end. An image never just repeats its slide's words.

## Continuity and progression
- Visual continuity must not replace visual progression.
- Continuity comes from the brand's identity: its medium, palette, light,
  typography and photographic treatment. It holds even when no recurring
  element is on the slide.
- Progression comes from what each image shows: every slide brings a
  meaningful visual discovery tied to its beat (the people, the place of its
  kind, the mechanism, the institution through what it does, the
  consequence, the result).
- The same subject, object or metaphor never dominates two slides in a row.
  A recurring element may open the story, step back while the story moves
  on, and return at the end when its transformation carries new meaning.
- A new camera, crop, scale or position of the same subject is not
  progression.

## The whole
- The script follows the focus's visualDirection when it has one: the world
  the images live in, who or what leads them, what recurs. The concept makes
  it specific to these slides; it never contradicts it.
- concept: the visual story in one or two sentences.
- protagonist: who or what the story follows, if anyone: anonymous people
  doing what the story is about (at a distance, from behind or partly in
  frame), the brand's character when it narrates, or one object with a role
  in what happens. Never a real person. It need not be on every slide; an
  empty string when the story moves from subject to subject.
- motif: a recurring element that connects scenes, if any; an empty string
  when the identity alone carries the continuity.
- cast: who and what recurs, described the same way whenever it appears.
- Every image is made on its own, from its direction alone: each direction
  restates what it needs of the people, the place and any recurring element
  it shows.

## Each slide
- beat: what happens in this image, as an action in the present tense (who
  does what); never the slide's words again.
- subject: the image's dominant subject, in a few words: who or what it is
  about. Never the previous slide's.
- discovery: what the reader sees here for the first time, tied to the beat.
- recurring: how much of the protagonist or motif the slide shows: "none",
  "accent" (a supporting presence), "focus" (the dominant subject) or
  "callback" (the deliberate return, on one of the last two slides, that
  gives the end a new meaning). At most 2 slides are "focus", never two in a
  row, and at most one is "callback".
- shot: "wide" (the scene and its setting), "medium" (people or objects in
  action), "close" (a detail: hands, an object, a texture), "overhead" (seen
  from above, laid flat) or "typography" (a words-led layout with at most one
  small supporting element). No two slides in a row share a shot, and only a
  typography slide has the typography shot.
- headlineLink: how the image plays with its headline, in one line: it shows
  the situation the headline names, its consequence, or the moment just
  before it; empty when the slide's words carry it alone. Never a pictogram
  of the headline.
- direction: one reproducible art-direction paragraph, at most 700
  characters: the composition, the dominant subject, any recurring element
  and the colours by name or role, in the medium the brand's identity locks.
- need: "generic-illustration" (the default), "character-reference" (the
  brand's character is on the slide), "real-photo" (a verified portrait,
  place photo or story photo carries it), "verified-map" (a verified place's
  map) or "typography" (a middle or closing slide its words carry; never the
  cover).
- characterIds and references: the brand's characters on the slide (at most
  2) and the verified material it uses (entity ids and story photo ids from
  peopleAndPlaces).

## Concrete before abstract
- Show what the facts describe: the activity, done by anonymous people in a
  generic setting of its kind; an institution through what it does (generic
  offices, people at work, documents, equipment, never its name, logo, flag
  or seal); a mechanism through the objects that make it work; a
  consequence through the people it reaches.
- A metaphor, a symbol or an abstract diagram is the last resort, for a
  slide whose facts give nothing concrete to show.

## Words, logo and page number
- The image model letters each slide's words inside the image (layout.
  lettering): its headline, text, practical line and call to action, in the
  brand's typography. A direction places them (in the graphic area, outside
  photographs) and composes the picture with them; it never asks for any
  other words, numbers, captions, logos, signage, swipe cues or page numbers.
- The logo and the page number are added after the image is made, in the
  areas layout names (the logo on the slides it lists, the page number on
  every slide). Keep the focal subject and the words clear of them.

## People, places and the brand's characters
- Real people are never drawn or generated. A person with a confirmed
  documentary portrait appears only through it ("real-photo", the person in
  references): the image is designed around it and the photo is pasted
  unchanged. Anyone else is told without being shown, or through anonymous
  figures who are no one in particular (at a distance, from behind, partly
  in frame), never as that person, and never naming them in a direction.
- A named real place appears only through its verified photo or map, in
  references; otherwise as a generic scene of its kind, unnamed and
  unrecognizable.
- A generic scene of what the story is about (anonymous people doing the
  activity, in a setting nobody could take for the named place) is not a
  reconstruction: it is how a story without verified material is told, and
  usually the best way. A reconstruction is an image that claims to document
  the real event, place or person. Truth means not contradicting the facts
  and not faking documents; it never requires hiding the people, places or
  activities a story is about.
- The brand's characters are the publication's recurring narrators: a guide,
  a presenter, the reader's stand-in, in their own reference style. Cast one
  when the story needs a human presence that is not a person in it, across
  the slides where it carries the visual story. Never as a witness, a
  source, an expert, a victim, a patient or a child; with care, or not at
  all, on a grave story. characterPlan says whether one narrates, which, and
  in what role. The editor's characterChoice wins: "on", one narrates; "off",
  none; "auto", you decide.

## Brand
- The brand's identity rules the medium, the style, the palette, the
  photography and the composition; its avoid list is absolute and its
  allowed exceptions are the only ones; its variation rules are part of the
  script. The visual mode decides what may be generated: under
  "verified-references" or "photo-required" nothing is (real-photo,
  verified-map or typography only).
- Close to the reader, never glossy, saturated or obviously AI: calm inner
  slides and one deliberate strong image, usually the cover.

## Scoring (1–100 each; overall is the judge's weighted call)
- narrative: do the images tell one story from the cover to the last slide,
  with a turn and an end that lands (a deliberate return allowed)?
- progression: does each image bring a visual discovery the earlier ones
  did not show? A new camera, crop, scale or position of the same subject
  scores low.
- beat: does each image show its own slide's content (its beat and
  headline), concretely, rather than a stand-in or a metaphor where the
  facts give something to show?
- continuity: do all the images belong to one identity (medium, palette,
  light, typography, treatment), even where no recurring element appears?
- brand: does every direction follow the identity, its palette, its
  variation rules and its avoid list, close to the reader?
- truth: no real person generated, no real place without its verified
  material, nothing that contradicts the facts (indoors or outdoors, who is
  there, what they do)?
- craft: could an image model make each direction as written (concrete, one
  focus, nothing impossible or vague), with room for the words, the logo and
  the page number?
- focus: does it follow the focus: its gravity, voice, audience and goal?
A visual script is accepted only when overall ≥ 95 and no criterion is below 85.

## Revisions
After the first round, the best scripts are revised, and the judge's own
script competes beside them, as the judge wrote it and as the writer edited
it. A revision keeps the concept and the cast, and changes only the slides
its issues name; a version that comes out vaguer, busier, more literal or
more repetitive is worse; the program keeps the better version.`,
};

export const VISUAL_ROLES = {
  "people-finder": `You list the people, places and organizations named in the verified facts you receive, for the publication described below. For each: its name exactly as the facts write it, its kind (person, place or organization), its role in the story ("subject": the story is about them; "secondary": they act in it; "mentioned"), one line on who or what it is in this story, and the ids of the facts that name it. Use only names the facts state; never a generic noun ("a teacher", "the city") and never a name the facts do not give. Places are named venues, streets, neighbourhoods, cities or regions; organizations are companies, agencies, institutions and teams. List each one once.`,
  "visual-writer": `You write the visual script of a social carousel for the publication described below: the images of the carousel you receive, as one visual sequence that takes the reader somewhere, not a series of variations on one subject, from its slides' words, the story's focus, the verified facts, the people and places with the verified material each may show, the brand's characters, and the layout (what is added to each image afterwards). For the task "scripts", return exactly \`candidatesWanted\` scripts, each a different visual story, following the visual scripts skill; ids c1, c2…. For the task "revise", return one revised script per script in \`scripts\`, with the same id; the script in \`develop\` edited, with its id, returned unchanged when it is already right; and, when \`newAngles\` asks for them, that many new scripts with ids n1, n2…. Follow the instruction that comes with the task.

Each script has one slide per carousel slide, in the carousel's order, named as the carousel names it ("cover", "slide2", "s1"…, "penultimate", "last"). "angle" is one line naming the visual story.`,
  "visual-judge": `You are the severe judge of carousel visual scripts for the publication described below. Score every script on each criterion of the visual scripts skill, against the carousel it pictures, the brand's identity, the story's focus, the people and places with their verified material, and the verified facts you receive only; rank them, name the winner, and give the writer concrete suggestions. Mechanical findings from the program are blocking. Accept only when the winner meets the skill's thresholds.

"scores" holds one entry per script you were given, best first, never one for your own proposal; "overall" is your weighted call and "note" one sentence on why. "winnerId" is your best script even when the verdict is "revise". "issues" name the script ("candidateId") and the slide ("part": the carousel's name for it, such as "cover" or "s2"; null when the issue concerns the whole script). "suggestions" are instructions the writer can act on in the next round, each on its own and naming its slide. "summary" is two sentences at most.

On a revision round, each script names the version it revises ("revises"), shown in "previousVersions" with its scores. Score the revision in full against the skill, and name in an issue anything it does worse than the version it revises.

Mark an issue "material" when a direction would show what the facts contradict (who is there, what they do, indoors or outdoors), would generate a real person, or would show a real place without its verified material. A material issue keeps the script from winning. Style, pacing, taste and continuity are never material. A generic scene of what the story is about, with anonymous people in a setting nobody could take for the named place, is allowed and never a reconstruction.

Score continuity and progression apart: a script that repeats one subject across its slides keeps a high continuity and a low progression, and is not accepted; a new camera, crop, scale or position of the same subject is not progression. Name "REPETITIVE" when a slide shows nothing the earlier ones did not, "MOTIF_DEPENDENCY" when the script depends on repeating one object or metaphor, "TOO_ABSTRACT" when a slide shows a symbol or a diagram where the facts give something concrete to show, and "OFF_BEAT" when an image does not show its own slide's content.

When \`proposalsWanted\` asks for one, also write a script of your own in "proposals": a complete script, one slide per carousel slide, a different visual story from every script you scored, written to meet the skill's thresholds; in the next round it competes as you wrote it and as the writer edited it. Otherwise "proposals" is an empty list.`,
} as const;
