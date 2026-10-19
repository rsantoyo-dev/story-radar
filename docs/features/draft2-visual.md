# Draft 2 · Steps 6 and 7: People and places, Visual script

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then the other Draft 2 briefs
(`docs/features/draft2-*.md`), then this document.

## 1. Goal

With the carousel's words written, the images must tell the story too, as
one sequence and not one picture per slide: a recurring cast, a world that
holds together, a motif that evolves, so the visual script represents the
whole. Before writing it, the step finds who and where the story involves
and what verified images exist of them. It also decides whether the brand's
own characters narrate.

```text
Facts → Focus → Opening → Closing → Deck → People and places → Visual script → (Images) → Review
```

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| A person's Commons photo | the editor confirms each match among the candidates; places are confirmed by Wikidata within the Topic's geo scope |
| The brand's characters | Claude decides in each script, with v1's rules, and Sol judges; the editor may force "on" or "off" |
| Funnel | 2 scripts (3 until 2026-10-10: the focus's `visualDirection` now fixes the approach, so the scripts differ in execution) → Sol proposes 1 → 2 revised (1 for a long carousel) + Sol's as written + as edited → the best revised once more → Sol's pick; round 1 at medium effort. The schema's and the parser's ceiling is the largest round (`VISUAL_ROUND_MAX_CANDIDATES`, 3); the skill is visuals v4 |
| Scope | the script only; images are a later step that reuses v1's generator |

Added the same day, after the first real run (St-Jean, best script 91/100
after two rounds):

| Question | Decision |
| --- | --- |
| A third round? | yes, revising only the best version: Sol's script as written and as edited were two near-identical 91s, and Sol's remaining issues were precise fixes (sizes, a repeated composition, one beat) |
| A run that ended after two rounds | continues with round 3 alone ("Continue with round 3"), while the deck and the people and places are the ones it followed |
| A person or place the lookups miss | the editor gives them one of the story's photos, from v1's story photo panel (upload, or Commons under another name) |
| Maps | Google Maps for the map of a place Wikidata has no match or no coordinates for, in the same search, when Google is configured |
| A wrong place match | the editor sets it aside ("Not this place") |

Visual script v2, the same day, after the 94 (the same toad at six sizes,
three closing slides on one formula):

| Question | Decision |
| --- | --- |
| A real story | a `protagonist` the images follow, and each beat is an action: something happens on every slide |
| The headline | the image model letters the words; each slide says how its image plays with its headline (`headlineLink`, optional) |
| Repetition | a `shot` per slide (wide, medium, close, overhead, typography); no two adjacent slides share one |
| Logo and page number | the script reads where the Topic puts them (`layout`) and keeps them clear |
| Reconstruction | a generic scene of the activity (anonymous people, a setting nobody could take for the place) is allowed, and the judge flags `REPETITIVE` scripts |

Visual script v3, the same day, after the first two image decks (Tech: nine
views of one "shutter"; St-Jean: one toad on six slides, both accepted by Sol
with continuity 97–98). The editor chose to fix it in the script and its
judge, with no new call:

| Question | Decision |
| --- | --- |
| The rule | visual continuity must not replace visual progression: continuity comes from the brand's identity, progression from what each image shows |
| The recurring element | the protagonist and the motif are optional; a slide gives it `none`, `accent`, `focus` (at most two slides, never two in a row) or the `callback` that closes the story (once, on one of the last two slides) |
| Each slide | its dominant `subject` (never the previous slide's) and its `discovery` (what the reader sees there first) |
| The judge | Sol scores progression, beat relevance and identity continuity apart; a new camera, crop or scale is not progression; codes `MOTIF_DEPENDENCY`, `TOO_ABSTRACT`, `OFF_BEAT` |
| Safety | concrete before abstract: the activity with anonymous people, institutions through what they do; a metaphor is the last resort. Truth never requires hiding the people, places or activities a story is about |

## 3. Step 6 · People and places (`draft2-inventory.ts`, `draft2-inventory.types.ts`)

1. **Extraction.** One Claude call (role `people-finder`, medium effort, the
   facts cached) lists the people, places and organizations the facts name,
   each with its role and fact ids. The program keeps only names their cited
   facts contain, once each (at most 16).
2. **Lookups,** reusing v1 and within a 90 s budget. A failed lookup is
   recorded on its entity, never fatal.
   - **People** (at most 8): `searchCommonsPeople`, Wikidata humans with a
     licensed Commons photo. The editor confirms one ("This is them"), which
     imports it with `importCommonsPersonPhoto` as a story photo that is
     never sent to a model, or rejects them all. A photo qualifies by
     `commonsPortraitTerms` (since 2026-10-13): a reusable license, a credit
     when the license asks for one, at least 480 px on its short side (the
     narrowest portrait frame; 500 before). The Permission field no longer
     keeps a photo out (it carries Commons' license reviews: a Flickr
     review, a permission ticket); Commons' personality-rights warning no
     longer does either, and is shown on the candidate for the editor to
     read before confirming; any other restriction still keeps it out.
   - **Places** (at most 6), only with a complete geo scope:
     - `documentaryProviders().resolve` for the Wikidata identity, only
       with a Wikimedia contact (the Topic's, else `CREATIVE_GEO_CONTACT`):
       without one, v1's lookup would quietly find nothing, so the place's
       note says to add it;
     - `.photo` for a Commons photo, else `openversePlacePhoto`;
     - a map is possible when there are coordinates;
     - **Google Maps** when Wikidata has no match or no coordinates, and
       Google Maps Platform is configured (`googleMapsConfig`): one Places
       text search with v1's rule (`selectMatchingGooglePlace`: one name-
       and scope-matched point), never a match at another street address
       than the facts state (`providerAddressMatchesStated`). Only its
       identity is kept (`place.google`: id, name, address, coordinates,
       whether the name is exactly the story's); the map is drawn when the
       images are made. The search is billed to the story, like v1's.
   - **Organizations** are never looked up and never drawn.
   - **The story's active photos and the Topic's character roster** (only
     characters with a reference image) are kept too.
3. **Decisions:**
   - confirm, reject or reopen a person;
   - set a place's match aside ("Not this place", status `rejected`) or
     take it back;
   - give a person or place one of the story's photos (`storyPhoto`), or
     take it back: a person's is only ever a documentary portrait, pasted
     unchanged, and never a reference the script may use by the photo's
     own id (`referencePhotos`); a place's is its photo;
   - read the story's photos again after the editor added or removed one
     in the panel (a link to a removed photo is dropped); the canvas also
     reads them once each time People and places opens, and on "Read the
     story's photos again", so a photo added on the story's page or in
     another tab appears without a new search;
   - a person given a story photo no longer waits for confirmation, even
     with Commons candidates still open (`awaitsConfirmation`): the photo
     is their portrait;
   - the characters choice (`auto` | `on` | `off`, which reads the roster
     again).

   Each decision that changes something bumps the inventory's version; one
   that changes nothing keeps it, since a visual script records it.
4. **A new search** keeps every confirmed or rejected person, every story
   photo given (while it is still one of the story's), every place set
   aside while the same match comes back, and the characters choice.

Photo evidence older than 24 h is checked again before images are made (v1's
`eligiblePhoto`); the inventory only says what exists.

## 4. Step 7 · Visual script (`draft2-visual.ts`, `draft2-visual.types.ts`, `skills/visuals.ts`)

**Prerequisites.** A finished deck with a chosen version, connecting the
opening and closing chosen now, and the people and places found. A
continued run needs the inventory version it read.

**Context** both models read, cached:
- `focus`
- `carousel`: every slide's words, in order (`cover`, `slide2`, `s1`…,
  `penultimate`, `last`)
- `layout` (`visualLayout`): the image model letters the words; the logo's
  area and slides, and the page number's, as the Topic configures them
- `peopleAndPlaces`: each entity with what it may show, and the story's
  photos
- `characters` and `characterChoice`
- `verifiedFacts`

The instructions add the brand brief, the visual identity in full
(`resolveCreativeVisualGuidance`) and the visual mode.

**A script:**
- `concept`, `cast`, and an optional `protagonist` and `motif` (empty when
  the identity alone carries the continuity);
- `characterPlan { use, characterIds, role }`;
- one slide per carousel slide: `beat` (what happens in the image),
  `subject` (its dominant subject), `discovery` (what it shows first),
  `recurring` (`none` | `accent` | `focus` | `callback`), `shot`,
  `headlineLink`, `direction` (≤ 700 characters), `need` (v1's
  `visualNeed`), `characterIds` (≤ 2) and `references` (entity and story
  photo ids).

**Criteria (v3):** narrative, progression, beat, continuity (the identity),
brand, truth, craft, focus.
Accepted at overall ≥ 95 with every criterion ≥ 85. The judge's issue codes
are `ILLUSTRATES_TEXT`, `BREAKS_CONTINUITY`, `REPETITIVE`, `MOTIF_DEPENDENCY`, `OFF_BEAT`, `TOO_ABSTRACT`, `OFF_BRAND`, `LOOKS_AI`,
`CONTRADICTS_FACTS`, `CROWDS_TEXT`, `VAGUE`, `CHARACTER_MISUSED` and
`OFF_FOCUS`.

**Program findings, any one blocking:**

| Code | When |
| --- | --- |
| `SLIDE_ORDER` | not one slide per carousel slide, in order |
| `DIRECTION_TOO_LONG`, `DIRECTION_TOO_SHORT`, `BEAT_MISSING` | a part outside its limits |
| `CHARACTER_UNKNOWN`, `CHARACTER_OFF_PLAN`, `CHARACTER_CHOICE`, `TOO_MANY_CHARACTERS` | characters outside the roster, the plan or the editor's choice |
| `REFERENCE_UNKNOWN` | a reference to material that is not verified |
| `NEED_MISMATCH` | the kind of image is not backed by what it needs, or a character is on verified material |
| `STRICT_MODE` | anything generated under `verified-references` or `photo-required` |
| `COVER_TYPOGRAPHY` | a typography cover |
| `UNVERIFIED_PERSON`, `UNVERIFIED_PLACE` | a real name in a direction without its portrait, photo or map in the slide's references |
| `ORGANIZATION_NAMED` | an organization named in a direction |
| `AVOID_TERM` | a term from the identity's avoid list |
| `FORBIDDEN_ELEMENT` | words, logos, signage or swipe cues in the image |
| `DUPLICATE_CANDIDATE` | as elsewhere |
| `SAME_SHOT` | two adjacent slides with the same shot |
| `SHOT_MISMATCH` | a typography slide without the typography shot, or the reverse |
| `SUBJECT_MISSING`, `DISCOVERY_MISSING` | a slide without its dominant subject or what it shows first |
| `SAME_SUBJECT` | two adjacent slides about the same subject (the same words, or most of their longer words) |
| `RECURRING_DOMINANT` | the recurring element leads more than two slides, or two in a row |
| `CALLBACK_MISPLACED` | more than one return, or a return before the last two slides |

**The output keeps v1's slide contract** (`visualDirection`, `visualNeed`,
`characterIds`, story references), so the image step can feed
`buildCreativeImagePrompt`.

## 5. Shared funnel changes

- A funnel step's plan may be chosen per run (already used by the deck).
- `newRun` receives the profile, so the run records the visual mode.
- A run that ended without an accepted candidate continues (`resume`)
  once its step's plan has gained rounds, with only the added rounds
  (`funnelExtendable`): every round it ran was judged, and its snapshot's
  checks still hold.

## 6. Persistence, API, canvas

- **Columns:** `draft2_sessions.inventory` and `draft2_sessions.visual`
  (jsonb, additive migration 0105). `aliveSince()` covers both steps.
- **People and places:** `POST /api/radar/draft2/inventory`
  `{ storyId, sessionId }`; `PATCH` `{ sessionId, action, … }`, where
  `action` is `confirm` `{ entityId, candidateId }`, `reject` or `reopen`
  `{ entityId }`, `photo` `{ entityId, storyPhotoId | null }`, `photos`, or
  `characters` `{ characters }`.
- **Visual script:** `POST /api/radar/draft2/visual`
  `{ storyId, sessionId, continue? }`; `PATCH` `{ sessionId, candidateId }`.
- **Canvas, step 6:**
  - the characters choice;
  - people with their Commons candidates (thumbnail, author and license,
    "This is them" or "None of these");
  - places with their Wikidata item and photo, or Google Maps' match
    (name, address, a warning when Google's name differs), the map, and
    "Not this place";
  - for each person and place, "Their/Its photo from the story";
  - organizations and story photos;
  - v1's story photo panel (`StoryPhotosPanel`, with `onChanged`) in a
    disclosure, to upload a photo or find one on Commons under another
    name.
- **Canvas, step 7:**
  - the funnel view, with the chosen script's concept, motif, cast and
    characters;
  - each slide's words beside its beat, direction, kind of image and
    material;
  - a notice when the deck or the people and places changed since the
    script, or the focus's visual direction (a new script follows the
    direction as the focus has it now, with the rest of the focus its
    words followed; see `draft2-focus.md` §7);
  - "Continue with round 3" on a run that ended after two rounds.

## 7. Tests

- `draft2-inventory.types.test.ts`: the name check, carried decisions
  (people, story photos, places set aside), the editor's actions,
  material, the photos a script may use, and what the models read.
- `draft2-inventory.test.ts`: the extraction, the lookups and their
  failures, Google Maps for a place Wikidata misses (and a match at
  another address), no Wikimedia contact, confirming and choosing, giving
  and taking back story photos, reading them again, setting a place
  aside, a new search, prerequisites.
- `draft2-visual.types.test.ts`: the carousel and plan, an ended run that
  can continue, parsing, every program finding (a person's story photo
  among them), duplicates, the requests.
- `draft2-visual.test.ts`: the context and instructions, the three rounds,
  continuing an ended run with round 3, a long carousel, prerequisites,
  resuming, choosing.
- `draft2-skills.test.ts`: the visual scripts rubric matches the constants.

## 8. Out of scope

- Generating the images: step 8, `docs/features/draft2-images.md`.
- The publication caption, which carries photo credits.

## 9. Narrative forms (2026-10-12)

With a focus narrative form other than classic (`draft2-focus.md` §12), the
writer and the judge read the narratives skill's visual part, and the program
adds `ANCHOR_MISSING`: every slide the script generates carries the anchor. A
brand character guide is cast on it by its id; a figure or an object is the
recurring element (`recurring` other than `none`). A verified photo, a
verified map or a typography card is exempt. A classic script is checked as
before.

A panorama or a line is one wide scene cut into the slides: adjacent slides
may share a shot (no `SAME_SHOT`), a typography card breaks the scene
(`SECTION_MISSING`), a line is the recurring element on every slide, and a
panorama's scene needs no recurring mark (every slide is a section of it).

## 10. Words and images in two voices (2026-10-12)

A quality review of the first runs with narrative forms (visuals skill v5,
narratives v3) changed three things the judge and the writer read, after
every visual run of the day had ended between 79 and 86 after five rounds:

- **One story in two voices.** The script no longer "tells the story again
  in its own way": an image adds what the words cannot say (the scale of a
  thing, its consequence, the moment just before or after, the detail that
  proves it, the contrast between two things), so the reader learns something
  from the image the words did not tell. "An image never just repeats its
  slide's words" stays.
- **One beat per image, and the turn.** A beat is the one action the headline
  leads with; a second fact the words carry is not missing from the image
  (the judge flagged OFF_BEAT twelve times a run for images that showed one
  of a slide's two facts). One slide carries the story's turn: image-led,
  words stepping back, something true the reader did not expect, named in the
  concept; the progression criterion asks for it.
- **The words are fixed inputs.** A headline at odds with its own slide (the
  Brossard practical last slide titled after the puppets) is said in the
  summary for the editor, never as OFF_BEAT against the script; the closings
  skill (v2) now asks the one-slide closing's headline to name what the slide
  gives.

With a narrative form, the anchor is on every slide by design, so the
program's limits on a recurring element (`RECURRING_DOMINANT`,
`CALLBACK_MISPLACED`) do not apply, and the judge is told its presence is
never `REPETITIVE` or `MOTIF_DEPENDENCY`; what must change is its state and
its scene. The `FORBIDDEN_ELEMENT` check learned the French phrasings of a
free logo corner ("logo en haut à gauche dégagé") and of a negation ("aucun
logo ni interface", "pas de visage, de logo ni de lieu"): fourteen false
findings in one St-Jean run had blocked every clean script.

## Visual script v6: visual truth for events and places (2026-10-14)

An auditor read the Salut St-Jean carousel on Mon Vieux-Saint-Jean la nuit:
the cover was a quiet street, not a festival; a wrestling ring with its
public, an acrobat on a stage and a giant puppet looked like photographs of
the event; the closing street had Parisian façades; a vendor slide showed a
vegetable stall with pumpkins and baguettes for "marchands variés"; the
fluorescent 1980s cabaret was drawn as contemporary dance. The Focus had
asked for photographic cut-outs on flat colour fields; the script turned
them into scenes, and the skill even called a generic scene "usually the
best way".

Visuals skill v6:
- A named event, show, venue, business or place without its verified photo
  is never a scene that could pass for a photograph of it (its stage,
  performers, public, stalls, street or buildings): it is told with
  photographic cut-outs of the objects involved on the brand's colour
  fields, a typography- or date-led slide, an anonymous person in a neutral
  setting, or clearly conceptual illustration. A real place looks real only
  through its verified photo. A generic scene of an everyday activity stays
  allowed when nobody could take it for the named place.
- Each image carries what its words name (colours, era, mood) and nothing
  the facts and words do not give.
- The cover is the promise at its strongest within these rules, the
  headline dominant; the last image never calmer or emptier than the cover.
- The judge's truth criterion covers both; new judge codes UNVERIFIED_SCENE
  and INVENTED_DETAIL.

The Salut brands' own identity said the opposite in its `fallback` ("show
what happens there as a generic photographic scene"): rewritten the same
day in the data (Salut St-Jean and Salut Brossard, the old values kept in
the session's scratch backup), with the "anonymous people" allowance
limited to everyday activities in neutral settings. v1's prompt opener no
longer offers "a photorealistic scene": the identity sets the medium.

## Brand characters on any slide, chosen by the editor (2026-10-14)

The editor wants the brand's characters (Jo for Salut St-Jean; two for Hello
Austin) selectable on each image, in the visual script and in the images,
not only as the carousel's narrator: "a veces no quiero que sea el narrador,
ella podría ser la que baila"; and preselected by the AI now and then, when
the image merits it.

- **Visuals skill v7:** a character may take part in one slide's action
  (the reader's stand-in dancing the line dance, tasting, trying the thing)
  without narrating, two on a slide when the brand has two, within the
  brand's rules on its characters: its own reference style in the graphic
  area, never inserted into a documentary photograph, never as if it
  attended the real event or stood at a named place, never on a slide that
  rests on a verified photo or map (since v8, a map slide may carry one: see
  below).
- **The program** no longer flags a character cast on a slide without a
  narrator plan (CHARACTER_OFF_PLAN keeps only a planned narrator who never
  appears); the editor's characterChoice still wins ("off": none).
- **The editor's cast** (`editorCast`): the brand's characters with a
  reference image, each once, at most two, none on verified material; an
  empty list takes them off. On the chosen script, "Brand characters per
  image" under the Visual script edits the chosen version in place
  (`editVisualCharacters`, PATCH visual `{ slide, characterIds }`); the next
  images run reads it. Images already made keep their cast.

## Characters beside a map card (2026-10-14)

Salut St-Jean's last slide rests on the verified map of the Vieux-Saint-Jean,
and the editor wanted Jo or Elvis there: the cast panel refused it. A map
card is the program's paste in the brand's graphic area, not a documentary
scene of the place, so a character beside it misleads no one, as long as it
does not seem to stand at the place.

- **Visuals skill v8:** on a verified map slide a character may stand in the
  graphic area beside the card, as the reader's guide consulting the practical
  information, never inside a scene of the place. A verified photo keeps them
  off, as before: the brand's character never stands beside a real person's
  photo or in a real place's.
- **The program:** `NEED_MISMATCH` flags a character only on a `real-photo`
  slide, and `editorCast` refuses a cast only there.
- **Images:** a map slide with a character adds one line to the prompt: the
  characters stand beside the card's zone, in their own reference style,
  never inside a scene of the place, never in front of the card.
- **Canvas:** the script's cast panel and the slide's "Another image" offer
  the characters on map slides too.

## Addendum, 2026-10-15: the script executes the spine (visuals v10)

Each slide's beat is the spine's image line, bound by the program on every
parse (`spineImageLines`, `bindSpineBeats`); the models receive the same map
as `spineBeats`. The judge scores fidelity to the beat, identity, brand,
truth, craft and originality (`PREDICTABLE` names a stock image); it never
asks for another narrative than the spine's. One script plus the judge's
proposal, then the best revised beside the proposal as written and as
edited, both rounds at medium, and no extra round on the funnel's own. Why:
22 real runs under the earlier rubric, none accepted. Brief:
`docs/features/draft2-spine.md`.

## Addendum, 2026-10-19: the audit of the flow (visuals v16)

The editor asked for a full review of the visual-script flow once it had
become stable and cheap ("que nada se nos escape"). Measured on the 16 runs
since 2026-10-15 and on the 25 scripts Luna had judged at both efforts
(`round.shadow`, 2026-10-15/16):

- **The judge at low under-scores.** Low scored 3 points under medium on
  average, 7 to 13 under on a first script (b7e9c5b9 c1: 76 against 89),
  named the same winner, and under v3 (ten runs, 55–85) accepted nothing
  where medium's 86–91 would now pass the 90/85/70 gate. A judgment costs
  0.001–0.005 $ at either effort; low saves a minute a round. `VISUAL_PLAN_V3`
  judges at medium; the editor's choice per step still wins.
- **The judge used the program's codes, wrongly.** In one run it named five
  directions of 448–530 characters `DIRECTION_TOO_LONG` in both rounds; the
  writer cut them and craft fell 52→45. Two panoramas were judged on
  `SHOT_MISMATCH` ×7 and ×5 for shots the skill told the writer to ignore;
  `SECTION_MISSING`, `DUPLICATE_CANDIDATE` and `DISCOVERY_MISSING` appeared
  without a program finding. Now the judge's schema offers `VISUAL_JUDGE_CODES`
  only, the parser drops an issue under a mechanical code
  (`funnelParseEvaluation({ dropCodes })`), and the judge's role says what
  the program has already checked.
- **Three contradictions between the context and the skill**, each read in
  the judge's `OTHER` issues: the skill forbade mentioning the logo while the
  program allowed room kept for it (two runs faulted "no logos" / "esquina
  libre para el logo"); `layout.lettering` said the image model letters the
  words under the program's band, so the writer placed them where the model
  would have (three `OTHER` issues in one judgment, 70accab8); the skill
  pointed to stations "in spineBeats", where there were none (9e222181:
  "the structure has no panorama field"). Now `visualLayout(profile,
  carousel, presentation)` says who letters the words; the skill allows
  room-keeping and says "no words" is right under the program's band; the
  context carries `stations` (slide → size, character, crossing,
  `spineStations`) and `bindPanoramaShots` sets every section's shot to wide
  (no `SHOT_MISMATCH` or `SAME_SHOT` in one wide scene).
- **A spine's image lines edited by hand never reached the script.**
  `visualFocus` took only the visual direction and the presentation from the
  focus as it stands; the spine stayed the deck's snapshot, so the Brossard
  panorama's hand-fixed scene (focus v5) would have been ignored by the next
  run (visual at v3). Now the spine's image lines, subjects and panorama
  follow the focus while the beats are the same slides (`spineForImages`),
  `wordsFollowFocus` ignores those parts (an image line is not the words'),
  and `visualDirectionChanged` marks the script stale for them ("The focus's
  images changed since this script").
- **Smaller:** the fix pass counted words for a limit in characters
  (`lengthHint` now says "Remove at least N characters", `VISUAL_FIX_INSTRUCTION`
  cuts what a direction repeats, never its subject); the visual writer read
  the text writers' standard (headline word counts, cited facts) and now
  reads `VISUAL_WRITER_STANDARD`; `MOTIF_DEPENDENCY` was named on almost every
  run for a constant accent and is now a motif that leads more than two
  slides or carries the progression; the editor's panorama (imageMode) adds
  the narratives skill the visuals skill points to; `VISUAL_PLAN_V3_PANORAMA`
  and `visualPlan`'s panorama option, identical to the plain plan, are gone.

Not changed, with the data for it: no extra round on the funnel's own (the
third to fifth rounds never raised a script's best), the writer at medium,
one script a round, the gate of 2026-10-19. The two `error` calls of 0 s in
81386ecd were Anthropic's "credit balance too low", not the flow. Watch on
the next runs: acceptance at medium, how often the judge's `OTHER` survives
the removed contradictions, and whether `MOTIF_DEPENDENCY` still appears
when the motif is an accent.
