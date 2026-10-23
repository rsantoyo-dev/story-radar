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
 * Version 2, 2026-10-16: each beat names its image's dominant subject, and
 * an image line asks for no words or numbers and nothing the brand avoids;
 * the program checks both (draft2-spine-checks.ts), since the first story
 * under the bound spine lost its visual and two images to such lines.
 * Version 4, 2026-10-16, after the spaghetti story's spine (the editor: "the
 * spine is the most important now"): the last beat pays the promise in the
 * reader's hands, as the goal asks, never with the study's limits (the same
 * fault as the Brossard closing); one link of a mechanism per beat; the guard
 * on slide 2 unless the cover's headline makes the claim it prevents; the
 * images a sequence, not a series (the program counts one subject on more
 * than two thirds of the beats), and no figure asked of an image.
 * Version 5, the same day: the editor's notes (the Spine screen's "Rewrite
 * with these notes"): the planner revises the plan the focus already carries
 * to follow them, within the facts and these rules, and says in the spine's
 * reason what it did with each. Version 6, 2026-10-17 (the editor: "some
 * carousels come out longer than they need; it should be just right for the
 * news"): as many slides as the story needs, an arc from one middle beat;
 * a fact too small for a slide is a clause in another beat; a notice's
 * climax is what changes for the reader, never a qualifier dressed as a
 * twist (the Milan boulevard notice padded to six slides around "the two
 * weeks may change"). Version 7, the same day: focus.presentation, the
 * editor's choice of words set by the program and of one panorama cut into
 * the slides; the beats plan for it. Version 8, the same day, after the
 * coffee ring's first panorama spine failed twice (over six beats, words
 * over 200 characters) and then passed with a cut of the drop, a magnified
 * edge, a view from above and two panels: a panorama keeps one view and one
 * scale (the program checks it), and the planner reads the numbers it is
 * checked against (spineLimits) in its request. Version 9, the same day:
 * the facts every spine must place (factsToCover) are in the request too, so
 * a first answer places them instead of being asked again for them.
 * Version 10, 2026-10-18, after the coffee ring's and the altitude's
 * panoramas came out as six slides glued together (colour stripes at the
 * cuts, the subjects in a thin strip, the editor writing the scene's prompt
 * by hand): a panorama's spine designs its scene (spine.panorama: the world,
 * what left to right means, the one field of the words' band, what crosses
 * the seams, the right end, and each beat's station with its size), the
 * turn's station the largest, no section with a background of its own (the
 * program checks it), and four or five beats read larger than six.
 * Version 11, the same day, after the first panorama under it (Brossard's
 * planting): the world obeys the identity (a flat plane with the facts'
 * objects under an identity of objects on flat planes, never a photographic
 * place standing in for a named event), and a station's subject is one of
 * the facts' things, never a prop.
 */
export const SPINE_SKILL: Draft2Skill = {
  name: "spine",
  version: "12",
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
- payoff: the reward of the promise, what the reader takes away; the last
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
  It never asks the image for numbers, labels, captions, a logo or any
  words (numbered cards, labelled steps, a big figure, a percentage): the
  image model letters only the slide's own words; a number belongs to the
  words. It never asks for what the brand's identity avoids.
- subject: the image's dominant subject, in a few words ("a corn kernel",
  "a rolled tortilla"), never the previous beat's: two slides in a row
  never show the same thing, even at another scale.
- withholds: what this slide keeps for the next one, the open loop, at most
  160 characters; empty on the last slide only.
- factIds: the verified facts this beat rests on; a hook may rest on none.

## Rules
- Four to ten beats, one per slide: one cover, one slide2, the deck's middle
  slides (one to five for an arc; one per item or step otherwise, the first
  item allowed on slide2), one penultimate for an arc, one last.
- As many slides as the story needs, never more. Count what the reader
  must learn, one step per slide, and stop: a short notice (a road change, a
  schedule, one decision) runs five slides, an arc with one middle beat; a
  rich story runs up to ten. A fact too small for a slide of its own (the
  hour it starts, the project it belongs to) is a clause in the beat that
  needs it, cited there. A slide added to reach a count, to give an image
  room or to restate is padding, and the reader feels it.
- Every beat rests on the facts; the spine orders them and adds none. A beat
  that would need a fact the list does not have is a beat the story does not
  have.
- The turning point or the climax is the strongest true thing the facts
  hold, placed where it pulls hardest, never later than it must be; a
  surprise the facts do not support is not a twist. A story with no change
  of direction (a notice, a schedule) has a climax, not a turning point:
  what changes for the reader. A qualifier ("the dates may change") is a
  clause, never the turn.
- The last beat pays the cover's promise in the reader's hands, as the
  focus's goal asks: for saves, what the reader keeps and uses (the steps,
  the rule, the plan, the schedule); for shares, the one thing they would
  send someone; for discussion, the question the facts leave to them; for
  followers, what it changes for them that no other post told them. What
  the finding does not cover is a clause inside it when the reader needs it
  ("with round spaghetti, not linguini"), never the beat's job; what the
  result might explain someday elsewhere (other materials, future research)
  is not a reward for this reader. A last beat of limits recaps the study;
  it pays nothing.
- One step per middle beat: each changes what the reader knows or can do.
  Two beats in a row that explain links of one mechanism (what the twist
  does, then what the untwisting does) are one beat; a middle that reads as
  a lesson has too many beats. The arc's one to five middle beats are a
  range, not a target: fewer, stronger slides beat a complete explanation.
- With a narrative form, each scene names the anchor's state on that slide.
  With a discovery premise, the beats are its reveals and the news is the
  last. With an arc concept, the beats are its beats.
- The direction and the visual direction are written after the spine and
  restate its choices; they never open another thread.
- No beat's job is the method. How a result was obtained is a clause in the
  beat that needs it ("in a test with 72 people"), never a slide of its own:
  nobody swipes for the procedure.
- No beat adds an aside the reader would not assume (what a study did not
  test, a detail of another source): a guard is only for a misreading the
  cover itself invites.
- A guard's fact goes in the slide2 beat's words, the first thing a reader
  who swipes meets; the cover's words carry it only when the cover's
  headline itself would make the claim the guard prevents (a suspension that
  reads as a closure). A cover that spends its subheadline on a qualifier
  gives up its pull.
- In a list or a procedure, a guard is discharged by each item's own details
  on its slide (its days, its price, its reservation in the practical line),
  never by a general sentence on slide 2 ("Les autres sorties n'ont pas
  toutes les mêmes jours"): the slide2 beat is the first item's, and its
  words say what that item is and where.
- The images are a sequence, not a series: from beat to beat the dominant
  subject moves with the story (the place, the tool, the people's trace, a
  comparison, the consequence), within what the facts hold. The story's
  main object is the subject of at most two thirds of the beats, however
  its state changes; a narrative form's anchor recurs by design and is not
  counted. The program counts the subjects.
- The words name a source once ("a Penn State study") and then tell the
  facts; a researcher's or a spokesperson's name never in the words of the
  cover's or a headline's beat, and at most once in the carousel, for their
  own interpretation.
- focus.presentation, when given, says how the carousel is made, as the
  editor chose it. images "panorama": the images are one continuous scene,
  cut into the slides side by side, and the spine designs that scene (the
  section below). text "program": the program sets each slide's words on a
  calm band of its image, along the top (below the logo where there is
  one); an image line keeps its subject out of that band and asks for no
  word at all.

## A panorama's scene
With images "panorama", the spine carries "panorama" beside its beats: one
scene the image model draws once, read left to right, that the program cuts
into the slides. Its sections share one world by design, so the sequence rule
above does not apply to them; everything else below does.
- world: the one place in one view, as the model will draw it, at most 240
  characters ("a kitchen counter seen straight on, the stove at the left
  end, the window at the right"; "one hillside rising from a shore at the
  left to a snowy summit at the right"). The world obeys the identity given
  below: under an identity of photographic objects on flat planes, it is one
  long flat plane (a table, a counter, a band of ground as a flat plane) with
  the facts' objects along it, never a photographic place; and for a story at
  a named place or event without its verified photo, nothing in the scene
  stands in for that place or event. One point of view, one light, one
  scale from end to end: a step of the story is the next thing along the
  scene (the next drop on the counter, the next stretch of the slope), never
  a cut-away, a close-up, a magnified view or panels, which one wide image
  cannot hold; the program checks it.
- device: what left to right means. "journey": the eye travels through a
  place (a walk, a route, a climb). "time-lapse": the stages of one process
  laid side by side along the same surface, in order (the wet drop, the
  drying drop, the dry ring). "mechanism": one cause unfolding (what starts
  it, what it does, what it leaves). "comparison": the two ends differ and
  the middle is the change between them. Choose the device the facts hold
  and say why in the spine's reason.
- axis: the device in one line, at most 160 characters: from what, at the
  left, to what, at the right.
- field: the one plain surface of the words' band along the top of the whole
  scene (a wall, the sky, a flat field), in one colour of the brand across
  the whole width, at most 120 characters. The cover's background is this
  field: choose it by the identity's cover rule once, for the whole scene,
  never a background per section; the program refuses an image line that
  gives its section a background of its own ("sección sobre terracota",
  "fondo crema en la banda").
- carrier: what runs through every seam so the reader swipes to follow it,
  at most 160 characters: the surface itself by default (the counter, the
  ground, the hillside); a line (a path, a thread) only when the facts give
  one, never a decorative trail added to the scene.
- ending: "resolves" (the right end pays the story) or "returns" (the right
  end echoes the left end's frame, read with what the reader now knows).
- stations: one per beat, in the beats' order. Each has its size ("large",
  "medium" or "small": how much of its column the subject spans), whether
  the brand's character stands in it (character), and what crosses its right
  edge into the next section (crossing, at most 120 characters; empty on the
  last). Exactly one station is large, the turning point's or the climax's:
  the strongest true thing stands largest in the scene. The character, when
  the identity has one, stands in two or three stations at most, full body,
  never touching a cut.
- The beats: four or five read larger than six (each column is a slide;
  with six, the subjects shrink), and the cap is six. Each beat's image line
  is its station seen in the scene: the subject at the centre of its column,
  what it does there, what touches its edges; never a shot, a background or
  a "free band": the field and the words' band are the scene's. A station's
  subject is one of the facts' things (the trees, the gloves, the drop), in
  the state the facts give; a prop that dresses the scene (a tool, a
  container, a mound the facts do not name) is an invented detail the images
  pay for.
- The directions restate the scene: the direction says what the words do
  along the axis, the visual direction the world, the field and the carrier
  in one breath; neither invents a second scene.
- recentCovers, when given, are the publication's last covers, newest first
  (background, the brand's character on it, subject). Within the identity,
  the cover's image line and the visual direction vary from them: another of
  the identity's backgrounds than the last cover's, another kind of subject,
  and the brand's character on the cover only when the last cover did not
  have it (it may react on another slide). An identity's default cover
  ("the cover on terracotta") is the default of one post, not of every post.`,
  roleText: {
    "focus-planner": `## The numbers you are checked against
spineLimits gives them: the fewest and the most beats (a panorama's six),
and each beat field's characters (scene, words, image, withholds, subject).
Keep every field at least ten characters under its limit: the program
counts every character, and an answer over a limit is asked for again.
With spineLimits.panorama, the answer's spine carries "panorama" (world,
device, axis, field, carrier, ending, stations: one per beat, exactly one
large on the turn, a crossing on every station but the last) within the
characters it names; a panorama answered without it is asked for again.
factsToCover lists the facts the program requires a beat or a guard to rest
on: place each one in the factIds of the beat that needs it, even when the
beat states it in a clause, at most six facts a beat; a spine that leaves
one out keeps the Opening waiting.

## The editor's notes
notes, when present, are the editor's instructions on the plan the focus
already carries (focus.levers, guards, spine, direction and
visualDirection), in the editor's words. Return the whole plan revised:
follow every note within the verified facts and the rules above, and keep
what no note touches as it is, word for word where it still fits. A beat a
note changes may change what the beats around it withhold, and the
directions restate the revised beats. A note is guidance, never a fact: a
name, a date, a number or a claim the facts do not give stays out, and so
does a note that would break a rule above or the brand's identity.
reasons.spine says, in one or two sentences, what you did with each note
and which you could not follow, and why.`,
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
