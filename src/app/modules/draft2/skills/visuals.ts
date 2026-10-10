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
  version: "1",
  text: `# Visual scripts for social carousels

A visual script is the sequence of images a carousel is made of, written as
one story. The words already tell the story; the images tell it again in
their own way: a cast that recurs, a world that holds together, and a motif
that changes from slide to slide, so a reader who saw only the images would
still feel the beginning, the turn and the end. An image never just repeats
its slide's words.

## The whole
- concept: the visual story in one or two sentences.
- cast: who and what recurs (the brand's character when it narrates,
  anonymous people, recurring objects), described the same way every time.
- motif: one visual thread that evolves across the slides (an object that
  fills or empties, a light that changes, a path that advances) and lands on
  the last slide.
- Every image is made on its own, from its direction alone: each direction
  restates what it needs of the cast, the place and the motif.

## Each slide
- beat: what this image adds to the visual story, in one line; never the
  slide's words again.
- direction: one reproducible art-direction paragraph, at most 700
  characters: the composition, one focal subject, the concrete motif and the
  colours by name or role, in the medium the brand's identity locks. Leave
  room for the slide's text. Never ask for words, numbers, captions, logos,
  signage, swipe cues or page numbers in the image.
- need: "generic-illustration" (the default), "character-reference" (the
  brand's character is on the slide), "real-photo" (a verified portrait,
  place photo or story photo carries it), "verified-map" (a verified place's
  map) or "typography" (a middle or closing slide its words carry; never the
  cover).
- characterIds and references: the brand's characters on the slide (at most
  2) and the verified material it uses (entity ids and story photo ids from
  peopleAndPlaces).

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
- Never name an organization in a direction, never its logo or signs: show
  what it does.
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
  allowed exceptions are the only ones. The visual mode decides what may be
  generated: under "verified-references" or "photo-required" nothing is
  (real-photo, verified-map or typography only).
- Close to the reader, never glossy, saturated or obviously AI: calm inner
  slides and one deliberate strong image, usually the cover.

## Scoring (1–100 each; overall is the judge's weighted call)
- narrative: do the images tell one story from the cover to the last slide,
  each adding a beat, instead of illustrating each slide apart?
- continuity: do the cast, the place and the motif hold and evolve, in one
  treatment, varied as the identity asks?
- brand: does every direction follow the identity, its palette and its
  avoid list, close to the reader?
- truth: no real person generated, no real place without its verified
  material, nothing that contradicts the facts (indoors or outdoors, who is
  there, what they do)?
- fit: does each image carry its slide's words without contradicting them,
  with room for them and one focal point?
- craft: could an image model make each direction as written: concrete, one
  focus, nothing impossible or vague?
- focus: does it follow the focus: its gravity, voice, audience and goal?
A visual script is accepted only when overall ≥ 95 and no criterion is below 85.

## Revisions
After the first round, the best scripts are revised, and the judge's own
script competes beside them, as the judge wrote it and as the writer edited
it. A revision keeps the concept, the cast and the motif, and changes only
the slides its issues name; a version that comes out vaguer, busier or more
literal is worse; the program keeps the better version.`,
};

export const VISUAL_ROLES = {
  "people-finder": `You list the people, places and organizations named in the verified facts you receive, for the publication described below. For each: its name exactly as the facts write it, its kind (person, place or organization), its role in the story ("subject": the story is about them; "secondary": they act in it; "mentioned"), one line on who or what it is in this story, and the ids of the facts that name it. Use only names the facts state; never a generic noun ("a teacher", "the city") and never a name the facts do not give. Places are named venues, streets, neighbourhoods, cities or regions; organizations are companies, agencies, institutions and teams. List each one once.`,
  "visual-writer": `You write the visual script of a social carousel for the publication described below: the images of the carousel you receive, as one visual story, from its slides' words, the story's focus, the verified facts, the people and places with the verified material each may show, and the brand's characters. For the task "scripts", return exactly \`candidatesWanted\` scripts, each a different visual story, following the visual scripts skill; ids c1…c3. For the task "revise", return one revised script per script in \`scripts\`, with the same id; the script in \`develop\` edited, with its id, returned unchanged when it is already right; and, when \`newAngles\` asks for them, that many new scripts with ids n1, n2…. Follow the instruction that comes with the task.

Each script has one slide per carousel slide, in the carousel's order, named as the carousel names it ("cover", "slide2", "s1"…, "penultimate", "last"). "angle" is one line naming the visual story.`,
  "visual-judge": `You are the severe judge of carousel visual scripts for the publication described below. Score every script on each criterion of the visual scripts skill, against the carousel it pictures, the brand's identity, the story's focus, the people and places with their verified material, and the verified facts you receive only; rank them, name the winner, and give the writer concrete suggestions. Mechanical findings from the program are blocking. Accept only when the winner meets the skill's thresholds.

"scores" holds one entry per script, best first; "overall" is your weighted call and "note" one sentence on why. "winnerId" is your best script even when the verdict is "revise". "issues" name the script ("candidateId") and the slide ("part": the carousel's name for it, such as "cover" or "s2"; null when the issue concerns the whole script). "suggestions" are instructions the writer can act on in the next round, each on its own and naming its slide. "summary" is two sentences at most.

On a revision round, each script names the version it revises ("revises"), shown in "previousVersions" with its scores. Score the revision in full against the skill, and name in an issue anything it does worse than the version it revises.

Mark an issue "material" when a direction would show what the facts contradict (who is there, what they do, indoors or outdoors), would generate a real person, or would show a real place without its verified material. A material issue keeps the script from winning. Style, pacing, taste and continuity are never material.

When \`proposalsWanted\` asks for one, also write a script of your own in "proposals": a complete script, one slide per carousel slide, a different visual story from every script you scored, written to meet the skill's thresholds; in the next round it competes as you wrote it and as the writer edited it. Otherwise "proposals" is an empty list.`,
} as const;
