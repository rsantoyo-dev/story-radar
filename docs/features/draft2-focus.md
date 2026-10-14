# Draft 2 · Step 2: Focus

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then `docs/features/draft2-opening.md` (the
step this one feeds), then this document.

## 1. Goal

Between the verified facts and the hook, the editor needs to say what the
story is *for*: which editorial line it serves, whom it speaks to, how it is
framed and told, what it should earn and in what voice. v1 has these as
separate controls on its Focus tab (research context, "Structure for this
brief", "Framing for this brief", "Conversion goal for this brief") and an
"AI · Suggest editorial focus" button that only writes a paragraph; the
editor sets every control by hand.

In Draft 2 the Focus is its own step, the second one:

```text
Facts → Focus → Opening → Closing → Deck → Review
```

- One button ("Decide the focus") asks Claude to decide every field at once,
  each with a one-sentence reason, from the verified facts, the Topic's
  creative profile and its editorial lines.
- The editor can change any field by hand; each change is saved at once and
  the field becomes the editor's.
- Pressing the button again re-decides only the fields the editor did not
  set, so they fit what the editor chose (change the goal to "saves" and the
  direction, the reader consequence and the voice are decided again to match).
  Each edited field can go back to Claude's value.
- The Opening follows the focus: both of its models read it, and its judge
  scores a new criterion, `focus`, inside the acceptance gate.

The focus is guidance, never evidence: every sentence of the carousel still
rests on the verified facts.

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| Fields beyond v1's controls | the reader consequence, the voice of the story, the audience of the story (the Topic's acquisition lens stays out) |
| Who decides | Claude (it verified the facts and writes the opening); Sol stays the independent judge of the opening |
| Pressing the button after editing | the editor's fields stay; the AI decides the rest to fit them |
| How the Opening is judged against it | a new criterion, `focus`, 1–100, inside the gate (overall ≥ 95, every criterion ≥ 85) |

## 3. The fields

| Field | Values | Default the AI starts from |
| --- | --- | --- |
| `line` | one of the Topic's editorial lines that are not archived (id, revision, name, objective) | a line whose collection runs found the story (`editorial_story_contexts`) |
| `audience` | one phrase, at most 300 characters | the creative profile's audience, narrowed to this story |
| `framing` | `reader-consequence` · `explainer` · `authority` | the profile's `framingStrategy`; `auto` means the AI chooses |
| `readerConsequence` | one sentence and the fact ids it rests on, or null | — |
| `structure` | `arc` · `steps` · `list`, with the first fact of each step or item in order (`itemFactIds`) | the profile's `storyStructure` (`hook-steps` → steps, `hook-list` → list, `auto` → the AI chooses) |
| `goal` | `followers` · `discussion` · `saves` · `shares` | the profile's `conversionGoal` |
| `voice` | gravity (`light` · `ordinary` · `serious` · `grave`) and the five tone dials, 1–100 | the profile's dials, moved only as far as the gravity requires |
| `direction` | one paragraph, at most 1,500 characters (v1's editorial focus) | — |
| `visualDirection` | one or two sentences, at most 600 characters: how the images tell this story within the brand's visual identity (the world they live in, who leads them, what recurs); the visual script follows it (since 2026-10-10, focus skill v2; a focus decided before has none) | — |

An answer outside the contract (a field too long, a value the contract
does not accept) is asked for again once, with the rule it broke as
`correction` in the request (`FOCUS_ATTEMPTS`, skill v3, 2026-10-10: a
real run failed on a 301-character reader consequence); a second one fails
the step. Both calls are on the trace.

A framing or structure the profile fixes (not `auto`) is kept unless the
facts cannot support it, and the reason says so.

### Program findings (block the Opening until fixed)

- `NO_READER_CONSEQUENCE`: the framing is `reader-consequence` but the focus
  has no reader consequence.
- `TOO_FEW_ITEMS`: a `list` names fewer than 3 items, or `steps` fewer than 2
  (an editor who switches to a list asks the AI again to pick the items).

The AI's cited fact ids are filtered to the verified facts when its answer is
parsed. A reader consequence the editor writes by hand cites no facts; it is
the editor's direction, like v1's editorial focus.

## 4. The focus skill (`skills/focus.ts`, version "4")

A versioned TypeScript string like the other skills, composed with the role
`focus-editor` and the Topic's brand brief (`composeInstructions`). It
describes each field, the defaults, the rules for `editorChoices` and the
reasons. The trace records `{ focus: "3" }` on the call. Since version 2 the
call also reads the Topic's visual identity in full (as the visual step
does), the frame of `visualDirection`; version 3 states the 300-character
limits of the audience and the reader consequence and the `correction` rule.
Version 4 adds the narrative form and its alternatives (section 12); the call
reads the narratives skill beside it, and the trace records
`{ focus: "4", narratives: "1" }`.

## 5. Contracts (`draft2-focus.types.ts`)

```ts
type Draft2FocusValues = {
  line: { id: string; revision: number; name: string; objective: string } | null;
  audience: string;
  framing: "reader-consequence" | "explainer" | "authority";
  readerConsequence: { text: string; factIds: string[] } | null;
  structure: { kind: "arc" | "steps" | "list"; itemFactIds: string[] };
  goal: CreativeConversionGoal;
  voice: { gravity: "light" | "ordinary" | "serious" | "grave"; formality: number; humor: number; energy: number; optimism: number; provocation: number };
  direction: string;
};

type Draft2Focus = {
  status: "running" | "ready" | "failed";
  version: number;                 // +1 on every decision, edit and reset; an opening records the version it followed
  values?: Draft2FocusValues;      // the focus as it stands
  ai?: Draft2FocusValues;          // Claude's own values, kept under the editor's changes
  reasons?: Partial<Record<Draft2FocusField, string>>;
  edited: Draft2FocusField[];      // the editor's fields; the AI keeps them
  lineOptions: Draft2FocusLine[];  // the Topic's lines when the focus was decided, for the editor's select
  decidedBy?: { provider; model };
  decidedAt?: string;
  updatedAt?: string;
  error?: string;
};
```

- `DRAFT2_FOCUS_SCHEMA`: every field required, `reasons` one string per
  field. The Anthropic adapter strips numeric bounds, so the parser clamps the
  dials to 1–100.
- `parseFocusDecision(answer, { facts, lines, editorChoices })`: a malformed
  answer, an unknown enum or a line id outside the options is a response
  error (never persisted); unknown fact ids are dropped; the editor's fields
  overwrite whatever the AI returned for them.
- `applyFocusEdit(focus, field, value, facts)` and `resetFocusField(focus,
  field)`: validate the value, set or restore the field, bump the version.
- `focusFindings(values)` and `focusForModels(values)`: the program's
  findings, and the compact focus the Opening's models read (dials with their
  words, as in the brand brief).

## 6. The step (`draft2-focus.ts`)

`decideDraft2Focus({ topicId, storyId, sessionId })`:

1. The session must belong to the story, its facts must be verified, and no
   other Draft 2 run may be in progress (`activeDraft2Session`, then the atomic
   `claimDraft2Session` with `step: "focus"`).
2. Reads the creative profile, the Topic's lines (`activeEditorialLines`, read
   only: it never creates the default line) and the lines that found the story
   (`storyCollectionContexts`).
3. One Claude call (`generateAnthropicStructuredResponse`, effort high,
   240 s): instructions from the skill and the brand brief, the verified
   facts as the cached `context`, and the request: the story's title, today's
   date, the profile's defaults, the lines, `foundBy` and the editor's
   choices. A 30 s heartbeat keeps the run alive in `aliveSince()` (two
   minutes of silence for `focus`, as for `opening`).
4. Saves the focus: `status: "ready"`, `version + 1`, the trace entry
   (`step: "focus"`). A failure keeps the earlier values, marks the focus and
   the session failed and keeps the trace.

`editDraft2Focus({ topicId, sessionId, field, value | reset })` saves one
field without a provider call. It is refused while Claude is deciding.

## 7. The Opening follows the focus

- A new run needs `session.focus.values`, a focus that is not being decided,
  and no program finding. It records `opening.focus = { version, values }`;
  a continued run keeps its own snapshot. A run stored before this step has
  none and cannot be continued (write it again).
- Both models read `{ focus, verifiedFacts }` where their provider caches it
  (Claude's `context`; since 2026-10-10 the tail of Sol's instructions, see
  `draft2-autopilot.md`).
- Hooks skill v6: a Focus section (framing, structure, goal and voice rules;
  the focus is guidance, not facts), the `focus` criterion, the voice judged
  against the focus's voice, and the judge issue code `OFF_FOCUS`.
- For a `list` or `steps` focus, the number of items the focus names counts
  as a stated number, so "5 things to do" is not an `UNSUPPORTED_NUMBER`.
- Scores stored before this step have no `focus`; they still read as passing
  on it.
- The words follow every field but `visualDirection` (since 2026-10-13,
  `wordsFollowFocus`): only the visual script reads it, so an edit to it alone
  never marks the opening as following another focus, and the autopilot does
  not write the words again for it. The focus's version still goes up; the
  words compare the values, without the visual direction, in any key order.
- A new visual script follows the visual direction as the focus has it now
  (`visualFocus`): the rest of its focus is the one its words followed, with
  their version. A script that followed another visual direction than the
  focus has now is "changed since" (`visualDirectionChanged`), and the
  autopilot writes it again.

## 8. Persistence and API

- `draft2_sessions.focus jsonb` (nullable, additive migration).
- `POST /api/radar/draft2/focus` `{ storyId, sessionId }`: decides the focus.
- `PATCH /api/radar/draft2/focus` `{ sessionId, field, value }` or
  `{ sessionId, field, reset: true }`: one edit.
- `GET /api/radar/draft2/session` already returns every column.

## 9. Canvas

- Steps: 1 Facts, 2 Focus, 3 Opening, then the steps still to build.
- The Focus panel: the button, the version, who decided it and when, the
  findings, and a form with one control per field (a select, a text area, or
  the voice's gravity and five dials). Each field shows Claude's reason, or
  "Your choice" with Claude's value and a "Use Claude's" button. Text fields
  save when they lose focus; selects when they change.
- The Opening's button waits for a focus without findings. When the focus
  changed after the opening was written, a notice says which version the
  opening followed.

## 10. Tests

- `draft2-focus.types.test.ts`: parsing (enums, lines, fact ids, the editor's
  fields kept), edits and resets, findings, the focus the models read.
- `draft2-focus.test.ts`: the step with the provider and database replaced:
  the request, the editor's choices, failures, busy sessions.
- `draft2-opening.test.ts` and `draft2-opening.types.test.ts`: the focus
  required and snapshotted, read by both models, the new criterion, the list
  count, legacy scores.
- `draft2-skills.test.ts` and `draft-2-canvas.core.test.ts`: the new skill,
  role and step.

## 11. Out of scope

- The Topic's acquisition lens (a later option; the vocabulary is the Topic's).
- A judge for the focus itself: the editor reviews it. Only a narrative form
  Claude chose is reviewed (section 12).
- Using the goal in a call to action: that is the Closing's.

## 12. Narrative forms (2026-10-12)

The editor's goal: carousels that pull the reader from one swipe to the next.
A narrative form says how the carousel is told across its slides, in words and
images together. It is one more focus field, `narrative`, with the same
machinery as the others: Claude decides it with a reason, the editor changes
it in a dropdown and the change stays theirs, "Use Claude's" gives it back.

### Decisions taken with the editor

- **People and places runs before the Focus** (canvas rail, pager, autopilot):
  the form is chosen with the brand's characters and the story's material in
  hand. `decideDraft2Focus` refuses to run until the inventory is ready, and
  the focus records the inventory version it read (`inventoryVersion`); the
  canvas says so when People and places changed since a non-classic form was
  chosen. Before the focus is decided, the autopilot stops while people wait
  for the editor's confirmation in People and places.
- **A closed list we define, in code**, because each form needs a recipe the
  program can execute: `classic` (the method before narrative forms, the
  default, and unchanged), `character-guide` (a guide leads the reader through
  the story's places or moments), `traveling-object` (one object from the
  facts crosses its scenes, places or times) and, since the same day,
  `panorama` (one wide scene runs across every slide) and `follow-the-line`
  (a line with a real meaning, from the facts, runs from slide to slide).
  The last two are drawn once as one wide master scene, each slide redrawn
  from its section (`draft2-images.md` §10). Same place forms (another time,
  layer by layer) come after the anchor is tested on real stories.
- **The anchor is what stays.** A guide is one of the brand's characters (an
  id from People and places' roster, only while the editor allows them), a
  figure the facts give (an animal, a mascot), an anonymous figure the story
  calls for, or one the editor describes. Never a real person of the story:
  they appear only in verified documentary photos. An object Claude proposes
  comes from the facts. The ending either `resolves` or `returns` to the
  cover's frame.
- **Claude chooses, the judge reviews, the editor decides.** A form Claude
  chose (never classic, never the editor's) goes to the judge
  (`DRAFT2_MODEL_FOCUS_JUDGE`, else `DRAFT2_MODEL_JUDGE`, else Sol) in one
  low-effort call: `keep`, or `classic` with Claude's proposal kept beside it
  (`narrativeReview.proposed`) for the editor to take back. A review that
  cannot run leaves Claude's form standing, with why; it never fails the
  focus. Claude also offers up to three other anchors
  (`narrativeOptions`) for the editor's dropdown.
- **Classic stays as it was.** The models read the form, and every writer and
  judge reads the narratives skill, only when the form is not classic, so a
  classic story's prompts are exactly the ones before narrative forms.

### Contract (`draft2-focus.types.ts`)

- `Draft2FocusNarrative`, flat like the answer, so the editor's choice goes
  back to Claude exactly: `form`, `anchorKind` (`none`, `character`,
  `figure`, `object`, `scene`, `line`; `NARRATIVE_ANCHOR_KINDS` says which a
  form takes), `characterId`, `anchor` (at most 200 characters),
  `anchorFactIds`, `progression` (what changes from slide to slide, at most
  300) and `ending`. A focus without one, from before narrative forms, is
  classic (`focusNarrative`).
- Claude's answer: a form outside the list, an anchor of the wrong kind or
  without its words, a brand character the brand does not have or the editor
  turned off, an object or a line not taken from the facts, or a real person of the
  story as the anchor is a response error, asked for again once with the
  rule it broke. A brand character's anchor is its roster name.
- The editor's choice: classic needs nothing; a guide is a character (by id)
  or a figure in their words; an object needs its words. An anchor Claude
  found keeps the facts it cites; the editor's own words cite none.
- Program findings, against People and places as they stand (they block the
  Opening like the others): `NARRATIVE_CHARACTER_UNAVAILABLE` (the brand's
  characters turned off, or the character gone) and `NARRATIVE_REAL_PERSON`.
- `focusMaterial(inventory)`: the brand's characters the editor allows, the
  story's people (never drawn), its places with what verifies them, and its
  photos. `focusForModels` carries `narrative` (`narrativeForModels`) only
  when it is not classic.

### Skills

- `skills/focus.ts` version 4: the `narrative` field, `anchorAlternatives`,
  and a visual direction that follows the form; version 5 adds panorama and
  follow-the-line.
- `skills/narratives.ts` version 1 (version 2 adds panorama and
  follow-the-line): what each form is and what it never
  changes (the facts: aggressive curiosity, conservative facts), with a part
  for each role: the focus's judge, and the writer and judge of the Opening
  (the cover introduces the anchor, slide 2 takes the first step), the
  Closing (the progression's last step; resolve or return), the Deck (one
  step per slide, anchor present) and the visual script (the anchor in every
  image, described the same way; a brand character by its id).

### Downstream

- The visual script: every generated slide carries the anchor
  (`ANCHOR_MISSING`, `draft2-visual.md` §9).
- Images: a figure or an object is drawn once as a textless anchor plate,
  passed to every slide that carries it, and Sol checks the anchor
  (`draft2-images.md` §9); a panorama or a line is drawn once as a wide
  master scene, each slide redrawn from its section (§10).

### Next

- The form in the publication package, to compare forms on performance.
- Same place forms, once the anchor holds on real stories.

## 13. Concept: discovery (2026-10-12)

The editor's aim: carousels that make the reader curious enough to swipe to
the end, thinking outside the box within the story's tone. The concept says
how the reader meets the news, a focus field (`concept`) beside the narrative
form, with the same machinery (Claude's value and reason, the editor's
choice that stays, "Use Claude's").

- `classic`: the news, told straight (the method before concepts, the
  default, unchanged).
- `discovery`: the reader discovers the news. A premise, invented for the
  story (an SOS the park's animals sent, a message found on a trail, a
  mission order), is its world; a chain of reveals (2 to 6 short questions)
  is the order the slides answer them, each slide closing the gap the one
  before opened and opening the next; the news itself, plainly and
  completely, is the last reveal. In storytelling terms: a delayed reveal
  on a framing device, the "mystery box"; the curiosity gap is the engine.
- The premise invents the world, never the news: the mission or mystery the
  reader follows is the facts' own (it cites them in `premiseFactIds`);
  animals, objects and places may speak, real people and organizations never
  do; every practical value appears as the facts give it. The test: a reader
  who follows the premise literally ends up doing what the facts say ("bring
  « bonbons » to the animals" passes; "find who stole the bonbons" invents a
  theft and fails).
- Claude writes three premises (its choice and `conceptAlternatives`, kept
  as `conceptOptions` for the editor's dropdown, with "Write your own…").
  A premise Claude chose goes to the judge beside the narrative form, in
  parallel (`draft2_focus_concept_review`), which keeps it or sends it back
  to classic with the premise kept for the editor. Only for a light or
  ordinary gravity: Claude's answer is refused otherwise, and the program
  finds `CONCEPT_GRAVITY` on the editor's choice; `CONCEPT_REAL_PERSON` when
  a person of the story is in the premise. People and places now also gives
  the story's organizations (`material.organizations`).
- `skills/discovery.ts` (v1) is read by the focus's judge and, only for a
  discovery story, by the writers and judges of the Opening (the cover opens
  the first question inside the premise, never with the date, time or
  price), the Deck (one reveal per slide), the Closing (the last slide is the
  reveal, plainly and completely, then one line in the premise's world and
  the call to action), the visual script (each image a moment of the
  premise's world; no lettering beyond the slide's words, nothing official of
  a real organization) and the Caption (the premise's question first, the
  news plainly after). Focus skill v6.

## 14. Story arcs (2026-10-12)

From the editor's list of sixteen storytelling structures: several already
existed (Inverted Pyramid is classic, Delayed Reveal is discovery, Open Loop
→ Payoff is the engine of every arc, Countdown / List is the structure,
Journey and Character-Driven are narrative forms, Circular is the "returns"
ending). Five more are now concept arcs, chosen for the most curiosity at
the least factual risk; each slide is one beat, in order, resting on the
facts it cites:

| Arc | Each slide | Truth rule |
| --- | --- | --- |
| `progressive-reveal` | one more piece of the answer | every piece is a fact |
| `problem-solution` | problem, what it costs, the solution | both in the facts; no consequence added |
| `cause-effect` | one link of the chain | every link stated by the facts, qualifiers kept |
| `escalation` | bigger than the slide before | the facts' own magnitudes, the peak last |
| `comparison` | one criterion, both sides | each value as the facts give it; no verdict of the writer's |

They take no premise (`premise` empty), cite the facts their beats rest on
in `premiseFactIds`, hold the beats in `reveals` (the models read them as
`factIds` and `beats`), and apply at any gravity (a serious story may follow
a chain of causes). Claude's two alternatives may be other arcs (each option
records its `arc`). The judge reviews an arc with the arcs skill (`skills/arcs.ts`
v1: definitions, the review part and each role's part for the Opening, Deck,
Closing and visual script); the Caption reads only discovery's part. Focus
skill v7. Next candidates: Before → After (with the Same place forms),
Reverse Reveal, Investigation and Multiple Perspectives, which need finer
rules (a perception never stated as a false fact, clues that are verified
material, every voice attributed).

## 15. The anchor is a carrier (2026-10-12)

The first traveling-object run (Brossard's Halloween walk, a list of five
attractions with "une marionnette géante illuminée" as the object) showed
the rule the form needed: an anchor taken from the story's own items stands
beside things the facts never place it with (the judge's CONTRADICTS_FACTS
in round 5 was right), and the writer oscillates between leaving it out
(ANCHOR_MISSING) and inventing its presence. Focus skill v8 and narratives v3
now say: the anchor is a carrier, never one of the story's own subjects or
items; a real object travels only when the facts say it moves through the
scenes (a float, a torch, a letter); a list of items takes a guide or an
anonymous figure, or stays classic. The narrative judge checks it ("carrier").

Two presentation fixes in `narrativeForModels`: the progression is never
missing (the editor's edit may leave it empty; the structure then gives it:
a list's items or a procedure's steps one per slide, else one step of the
anchor's way from the cover to the ending), and when the focus also has a
`visualDirection`, the models are told the anchor replaces any other
recurring element it names (that run's direction, written before the editor
chose the form, made the park trail recur instead of the puppet).

Still open, for the editor's decision: a spine in the Focus that pairs each
beat's words with its image's job and names the slide of the turn, so the
Deck and the Visual follow one plan instead of the Visual following the
Deck's words (`draft2-handoff.md` §10).

### Scene forms and the words (2026-10-12, later)

Saint-Jean's golf story ran with `panorama` chosen by the editor. The Deck
lost four rounds to OFF_FOCUS because the narratives skill asked the words to
"manifest the continuous panorama", a visual requirement; and the visual
script could not satisfy the form against an identity built on photo
cut-outs over flat colour planes with a different layout per slide (the
judge, rightly: "the same 60% photo strip and cream field recur on every
slide"). Narratives v4 and focus v9: for a panorama or a line the words only
follow the sections' order, the scene is the images' work; and those two
forms need an identity that can hold one continuous photographic scene,
else classic or a guide. The editor's own form choice is still unreviewed
(Opus's decision); a non-blocking advisory review is proposed in
`draft2-handoff.md` §10.

## 16. The spine, and the order of decision (2026-10-12)

The editor's own reading, confirmed by the day's runs: the concept (how the
reader meets the news) and the narrative form must be decided before the
directions, so the written and the visual scripts follow the same plan, and
the carousel must reach a turning point or a climax. Focus skill v10 decides
in four steps, in two Claude calls: the story (line, audience, framing,
consequence, structure, goal, voice), then how it is told (concept and form,
with a stated preference for a telling other than classic: classic only when
no arc, premise or form fits these facts, this audience and this gravity,
and the reason says why), then the **spine**, then the two directions derived
from it. `FOCUS_FIELDS` follows that order.

The first call (task "focus", `DRAFT2_FOCUS_SCHEMA`) answers steps 1 and 2:
the story and how it is told, with a reason per field. The second (task
"plan", `DRAFT2_FOCUS_PLAN_SCHEMA`, role `focus-planner`, effort high) answers
steps 3 and 4 from that decision: the spine and the two directions, with
their reasons; it runs beside the judge's reviews of the telling, and a
telling the judge sends back to classic gets its plan written again. Each
call is asked again once when its answer breaks a rule. Two calls because a
single strict schema with the spine failed on Anthropic's grammar limit
("The compiled grammar is too large"), and because enums inside arrays are
what grow that grammar: neither schema has one now, and the parsers check
the values instead (a test keeps both facts true). The planner reads the
decision as the models read a focus, the earlier spine when there is one,
the parts of the plan the editor owns, which it returns as given, and
(since 2026-10-13) People and places' material, as the first call does.

### The levers (`levers`, the levers skill v1, focus skill v13, 2026-10-14)

The plan chooses the hook's lever before the spine: a primary (an eligible
lever or free), up to two alternatives, the facts that carry it and where
its promise is kept (`paidBy`), with `reasons.levers`. It reads
`eligibleLevers` and the Topic's `recentLevers`. `levers` is a plan field and
a telling field: the editor's edit sticks and marks the directions stale.
The Opening spreads its first fifteen openings over the levers (5, 3, 3 and
4 free). Brief: `docs/features/draft2-levers.md`.

### The spine (`spine`, the spine skill v1)

The story in beats, one per slide, each with:

| Field | What it is | Limit |
| --- | --- | --- |
| `slide` | cover, slide2, middle (the deck's slides in order), penultimate (an arc), last | |
| `role` | hook, setup, inciting, rising, turning-point, climax, resolution, payoff | |
| `scene` | what happens, present tense, told through the form and the concept | 240 |
| `words` | the words' job on the slide, never the words themselves | 200 |
| `image` | what the image adds that the words cannot say | 240 |
| `withholds` | what the slide keeps for the next one; empty on the last only | 160 |
| `factIds` | the verified facts the beat rests on; a hook may rest on none | 6 |

Program rules (`spineShapeProblem`, a response error for Claude's answer,
an input error for the editor's, a `SPINE_SHAPE` finding when the structure
changes under a spine): four to ten beats; the first is the cover and a
hook, the second slide2, then the middle beats (two to five for an arc, one
per item or step otherwise with the first item allowed on slide2), one
penultimate for an arc only, one last whose role is payoff or resolution; a
turning point or a climax among them; every beat but the last withholds
something. The roles are an adaptable sequence, never a mandatory eight.

### Who reads it

`focusForModels` carries the spine between the telling and the directions.
Every funnel step's writer and judge read the spine skill when the focus has
one (`creativeSkills`): the Opening takes the cover and slide2 beats, the
Deck its middle beats (`deckShape` fixes an arc's slide count to them), the
Closing the penultimate and last, the visual script the image line of every
beat with the turn's slide image-led; the judges score adherence within the
focus criterion. A focus decided before spines has none and nothing changes
for it.

### The directions follow the telling

An edit to the concept, the form or the spine marks the directions stale
(`staleDirections`), unless the editor owns both directions; the canvas says
so and offers "Rewrite the plan": the plan call again
(`rewriteDraft2FocusPlan`, `PATCH` with `rewrite: "plan"`), which writes a
new spine and new directions from the telling as it now stands, keeps any
part of the plan the editor owns, gives the rest back to Claude, moves the
version and clears the mark. The
Opening and the steps after it read the new directions through the focus
version they follow, as before.

### Still for the canvas

The spine shows as a read-only list under the narrative; editing the beats
(reorder, reword, mark the turn) and moving the Direction field below the
spine in the layout are the next UI work.

### Deliberation (2026-10-12, later)

Focus skill v11: before choosing the telling, Claude names the interest (one
line, ≤ 200 characters, `values.interest`, read by every step) and compares
two to four ways to tell the story, the classic telling among them and the
chosen one first (`focus.deliberation.approaches`, shown read-only). The
preference for a telling other than classic (v10) is withdrawn: the editor
wants stories thought outside the box, not forced out of it, and a form or a
premise is never chosen for novelty or forced onto facts that do not carry it.

### The visual direction and the story's people (2026-10-13)

Focus skill v12. The planner writes the visual direction, and it did not
read People and places: on a post about five personalities with a verified
portrait each, it reasoned that "no fact gives a verified photo of a
person" and wrote "sans visage", and the visual script followed it with
seven generic images. The plan now reads the material, which names the
people with a verified documentary portrait (`material.portraits`: a
confirmed Commons portrait, or a story photo the editor gave them). The
rule changed from "never a real person" to: never draw a real person or a
real place; a person appears only through their verified portrait, pasted
unchanged on the slides about them, and a place only through its verified
photo or map; when the story is about people with a portrait, the direction
says the images show them that way, each on their slides, and never asks
for faceless or anonymous images of them; a person without a verified
portrait is never shown.

## Focus v14: guards (2026-10-14)

The plan names the guards: what a reader who stops at the cover could wrongly
believe and the facts that prevent it, which the opening states on the cover
or slide 2. See draft2-news-integrity.md.
