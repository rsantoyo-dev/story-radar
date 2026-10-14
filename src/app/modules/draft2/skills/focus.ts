import type { Draft2Skill } from "./draft2-skills";

/**
 * The focus skill: what a story is for, decided after its facts are verified
 * and before any hook is written. Claude decides it; the editor reviews it
 * and may change any field; the Opening follows it (hooks skill, "Focus").
 * Version 4 adds the narrative form, chosen with People and places' material
 * (the narratives skill, read beside this one, defines the forms); version 5
 * adds panorama and follow-the-line; version 6 the concept (discovery: the
 * reader discovers the news through a premise; the discovery skill); version
 * 7 the story arcs (the arcs skill); version 10 the order of decision (the
 * story, then how it is told, then the directions derived from it), the
 * spine (the spine skill); version 11 the deliberation: the interest named
 * first and the ways to tell the story compared before one is chosen, in
 * place of a preference for a telling other than classic; version 12 the
 * plan reads People and places' material, and the visual direction shows
 * the people with a verified portrait through it instead of forbidding
 * them; version 13 the plan chooses the hook's levers (the levers skill)
 * before the spine, which keeps their promise; version 14, 2026-10-14, after
 * an auditor read a liquor-permit suspension as a closure on the cover and
 * a decision about 2020-2024 as news of today: the plan names the guards,
 * what the cover alone could make a reader wrongly believe and the facts
 * that prevent it, which the opening states on the cover or slide 2.
 */
export const FOCUS_SKILL: Draft2Skill = {
  name: "focus",
  version: "14",
  text: `# The focus of a story

The focus is the brief every later step follows: which editorial line the
story serves, whom it speaks to, how it is framed and told, what it should
earn and in what voice. Decide each field from the verified facts and the
publication's configuration. The editor reviews the focus and may change any
field; it is guidance for the writing, never evidence.

## Order of decision
Decide in this order, each decision resting on the ones before it:
1. The story: line, audience, framing, readerConsequence, structure, goal and
   voice.
2. How it is told: concept (how the reader meets the news) and narrative (how
   the carousel is told across its slides). Think outside the box before you
   choose: name the interest (what in these facts would make this audience
   stop, in one line) and compare at least three ways to tell it, the classic
   telling among them, each in one line with what the reader would feel on
   the cover and what it risks (interest and approaches in the answer). Then
   choose the telling that serves the interest best and say why the others
   lose. Classic is a valid choice when it serves best; a premise, an arc or a
   form is never chosen for novelty, and never forced onto facts that do not
   carry it.
3. The levers, the guards and the spine: the mechanism the cover uses to
   stop the reader (the levers skill), what the cover alone could make a
   reader wrongly believe, then the story in beats, one per slide, from the
   concept and the form (the spine skill); the hook beat makes the lever's
   promise and a later beat keeps it, and the hook or slide 2 beat carries
   the guards.
4. The directions, derived from the spine: direction restates what the beats
   lead with and keep for later; visualDirection restates the anchor, the
   scene of each beat and the image of the turn. Neither opens a thread the
   spine does not have.
Steps 1 and 2 are the task "focus", answered first; steps 3 and 4 are the
task "plan", answered in a second call from that decision, so the plan always
follows the telling.

## Deliberation
- interest: what in these facts would make this audience stop and read, in
  one line of at most 200 characters, in the publication's language; every
  step reads it.
- approaches: two to four ways to tell this story compared, one line of at
  most 160 characters each, the classic telling among them and the chosen
  one first: the telling, what the reader would feel on the cover, what it
  risks.

## Fields
- line: the editorial line the story serves, among the Topic's lines; their
  objective and themes say what each is for. Prefer a line that found the
  story (foundBy) unless another's objective plainly fits it better. lineId
  is null only when the Topic has no line.
- audience: the part of the publication's audience this story speaks to, as
  one concrete phrase (who, where, in what situation), at most 40 words and
  300 characters. Never wider than the publication's audience.
- framing: "reader-consequence" when a fact establishes a concrete change for
  the audience (what they pay, owe, can do or must decide); "explainer" when
  the value is understanding how something works or what happened;
  "authority" when the news is the decision, the institution or the expert
  itself. When the publication sets a framing (topicDefaults.framing is not
  "auto"), keep it unless the facts cannot support it, and say why.
- readerConsequence: one sentence of at most 300 characters, in the
  publication's language, of what changes for the audience, resting only on
  the facts it cites (factIds),
  with every qualifier they carry: a proposal stays proposed, an estimate an
  estimate, an allegation attributed. text is null and factIds empty when no
  fact establishes a consequence; the framing cannot then be
  reader-consequence.
- structure: "list" when the facts enumerate three or more distinct items a
  reader can act on or choose between (events, places, tips, changes), with
  the first fact of each item, in order, in itemFactIds; "steps" when the
  facts give an ordered procedure (a recipe, a setup), with the first fact of
  each step in order; otherwise "arc", one story with one tension, and an
  empty itemFactIds. A story that mentions several things while making one
  point is an arc. When the publication sets a structure, keep it unless the
  facts cannot support it, and say why.
- goal: what the carousel should earn. "followers": a reason to come back
  for the next story, the default when nothing fits better; "saves": a plan,
  a list or a reference worth keeping; "shares": something a reader sends to
  a particular person; "discussion": a question the facts leave genuinely
  open, never a controversy the facts do not show. Start from the
  publication's goal and move only when the story clearly earns another.
- voice: the story's gravity and its tone on the publication's five dials
  (1–100). Gravity: "grave" for war, death, injury, illness or legal
  jeopardy; "serious" for consequential news told plainly; "ordinary" for
  most stories; "light" for play, food, leisure and curiosities. Start from
  the publication's defaults and move each dial only as far as the gravity
  requires: a grave story is told straight (humor near its floor,
  provocation low); a light one may raise humor and energy within the brand
  personality.
- direction: one paragraph, at most 1,500 characters, in the publication's
  language: what to lead with, which facts carry the promise, what to leave
  out or keep for later slides, and what the reader takes away. It guides
  the writer; it never adds a fact.
- concept: how the reader meets the news and how curiosity moves through the
  slides (the discovery skill defines discovery, the arcs skill the other
  arcs). Choose the arc that pulls the reader hardest for these facts:
  "progressive-reveal" for a complex answer built piece by piece;
  "problem-solution" for a problem the audience lives with and the solution
  the facts give; "cause-effect" for a chain of consequences the facts state;
  "escalation" for magnitudes that grow (records, trends); "comparison" for
  two alternatives on the same criteria. For these, premise is empty,
  premiseFactIds cites the facts the beats rest on, and reveals holds the
  beats in order (2 to 6 short lines). Or "discovery" when a premise, the
  story's own world invented for it, would pull the reader through the
  carousel harder than the news told straight.
  Think outside the box: write three premises, true to the facts (the chosen
  one here, two more in conceptAlternatives), each in one line of at most 280
  characters, citing in premiseFactIds the facts whose mission or mystery it
  dramatizes, with its chain of reveals: 2 to 6 short questions in the order
  the slides answer them, the news itself the last. "classic", with an empty
  premise, premiseFactIds and reveals, when no premise earns it, and always
  for a "serious" or "grave" story. Never a premise in which a real person or
  organization speaks, and never one that invents the news.
- conceptAlternatives: two other concepts, each with its arc (another
  premise, or another arc with its beats); an empty list when the concept is
  classic.
- narrative: how the carousel is told across its slides, in words and images
  together (the narratives skill defines the forms): "classic",
  "character-guide", "traveling-object", "panorama" or "follow-the-line".
  Choose a form other than "classic" only when it makes the reader want the
  next slide more than a classic telling would, and say so in its reason;
  otherwise "classic",
  with anchorKind "none", characterId null, empty anchor, anchorFactIds and
  progression, and ending "resolves".
  - character-guide: anchorKind "character" for one of the brand's characters
    (an id from material.characters; anchor is its name), or "figure" for a
    figure the facts give (cite them in anchorFactIds) or an anonymous figure
    the story calls for (no facts). Never anyone in material.people.
  - traveling-object: anchorKind "object", an object the facts give, cited in
    anchorFactIds, only when the facts say it moves through the story's
    scenes (a float, a torch, a letter). An object that is one of the
    story's items or attractions is what one slide shows, never the anchor:
    a list of items takes a guide or an anonymous figure instead, or stays
    classic.
  - panorama: anchorKind "scene", the one wide scene every slide is a section
    of, generic, never a named real place; for a story whose world is one
    continuous place or moment (a walk, a festival ground, a street, a shore).
  - follow-the-line: anchorKind "line", a line with a real meaning the facts
    give (a trail, a route, a street, a river; cite them in anchorFactIds)
    that runs from the cover to the last slide and leads the reader along it.
  - A panorama or a line only when the publication's visual identity (given
    below) can hold one continuous photographic scene across the slides, and
    when the story's steps are places along it. An identity built on
    cut-outs over flat colour planes, or on a different layout per slide,
    cannot; steps that are not places (a roster, a result, a plan) would be
    encoded in objects, which is abstraction. Then classic or a guide.
  - anchor: what stays, in at most 200 characters, said the way it will
    appear on every slide. progression: what changes from slide to slide
    while the anchor stays, in one line of at most 300 characters; for a list
    or steps, its items are the steps. ending: "returns" when the last slide
    can come back to the cover's frame with what the reader now knows, else
    "resolves".
  - When material.characterChoice is "on", a brand character narrates this
    story: a character-guide's guide is one of them. When it is "off",
    material.characters is empty and no brand character may guide.
- anchorAlternatives: up to three other anchors the story could carry, each a
  figure, an object, a scene or a line with the facts that give it (none for
  an anonymous figure or a generic scene), for the editor to choose from; an
  empty list when there are none.
- levers: the hook's lever and up to two alternatives, or free, with the
  facts that carry it and where its promise is kept (the levers skill says
  which and how); written in the plan, before the spine.
- guards: what a reader who stops at the cover could wrongly believe that
  the facts do not say, each with the one or two facts whose words prevent
  it; written in the plan, before the spine. One per real risk, at most
  three, and an empty list when the story carries none. The usual risks: a
  person, business or organization named in a sanction, an accusation, an
  investigation or a closure (what the measure is and is not, its scope,
  whether it has started: a liquor-permit suspension read as "the bar
  closes"); a new decision about events of past months or years (their
  period, or the reader takes them for today's news); a measure not yet in
  force, a proposal not adopted, a change that applies to some only.
  misreading: the false conclusion, in one short line in the publication's
  language ("le Houston ferme"); factIds: the facts that prevent it, never
  the facts that state the news itself. The opening states each guard in
  plain words on the cover or slide 2, citing its facts; the program checks
  the citation.
- spine: the story in beats, one per slide, written after the concept and
  the form and before the directions (the spine skill says the roles, the
  fields and the rules): beats, each with slide, role, scene, words, image,
  withholds and factIds. Four to ten beats; the first the cover's hook, the
  second slide2, then the deck's middle beats (two to five for an arc, one
  per item or step otherwise), one penultimate for an arc, one last (a payoff
  or a resolution); a turning point or a climax among them, placed where it
  pulls hardest and never later than it must be.
- visualDirection: one or two sentences, at most 600 characters, on how the
  images should tell this story within the publication's visual identity
  (given below when it has one): the world the images live in, who or what
  could lead them (anonymous people doing the activity, an object with a
  role in what happens, the brand's character when one narrates), and what
  could recur from the first slide to the last and return changed at the
  end. With a narrative form, the anchor leads the images and is what
  recurs. It is the approach the visual script follows; the script decides
  each image. It never draws a real person or a real place: a person of the
  story appears only through their verified documentary portrait
  (material.portraits), pasted unchanged on the slides about them, and a
  place only through its verified photo or map (material.places). When the
  story is about people in material.portraits, say the images show them
  that way, each on their slides; never ask for faceless or anonymous
  images of them. A person without a verified portrait is never shown.
  Never the slides' words.

## Rules
- Use only the verified facts: no consequence, number, date, cause or name
  they do not give. Compare dates with today: an elapsed deadline is
  context, never urgency.
- A famous name is not a reason; relevance to this audience is.
- editorChoices are the editor's decisions. Return each exactly as given and
  decide every other field so it fits them: a "saves" goal changes the
  direction; a "list" structure needs its items; an "explainer" framing
  changes what the reader consequence is for.
- reasons: one sentence per field on why, naming the facts that decide it.
  For a field in editorChoices, say how the other fields fit it.
- correction, when present, names a rule your earlier answer broke (a field
  too long, a value outside the contract): return the whole decision again,
  every field and every reason, with it fixed and nothing else changed.`,
};

export const FOCUS_ROLES = {
  "focus-planner": `You write the plan of a story's focus for the publication described below, from the decision you receive (focus: the story, how the reader meets the news and the narrative form; material: what People and places verified, the brand's characters the editor allows, the story's people and those with a verified portrait, its places with a verified photo or map, its photos; editorChoices: the parts of the plan the editor owns, to return exactly as given) and the verified facts: the guards (what the cover alone could make a reader wrongly believe, each with the facts that prevent it; an empty list when there is no such risk), the spine (the spine skill: one beat per slide, with its slide, role, scene, words, image, withholds and factIds), then direction (at most 1,500 characters: what to lead with, which facts carry the promise, what to keep for later slides, what the reader takes away, restating the spine's beats) and visualDirection (at most 600 characters: the world the images live in, the anchor in each state when there is a form, the image of the turn, what recurs and returns), both in the publication's language, both resting on the spine and the facts only; neither opens a thread the spine does not have. reasons: one sentence for each of spine, direction and visualDirection, naming the facts that decide it. correction, when present, names a rule your earlier answer broke: return the whole plan again with it fixed.`,
  "focus-editor": `You decide the focus of a story for the publication described below, from its verified facts (cite their ids), the publication's defaults (topicDefaults), its editorial lines (lines, with the ones that found the story in foundBy) and what People and places found (material: the brand's characters the editor allows, the story's people and those with a verified portrait, its places and its photos). The story's title is context, not a fact. Follow the focus skill and return every field with a reason for each; the narratives skill defines the narrative forms and the discovery skill the concept; the publication's visual identity, when given below, is the frame of visualDirection.`,
} as const;
