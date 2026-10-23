# Draft 2 · Step 8: Images

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then the other Draft 2 briefs
(`docs/features/draft2-*.md`, the visual script's above all), then this
document.

## 1. Goal

Make each slide of the carousel from the chosen visual script, in the
brand's identity, with the slide's words lettered in the image and the
brand's logo and page number added afterwards, then check each image before
the editor sees it.

```text
Facts → Focus → Opening → Closing → Deck → People and places → Visual script → Images → Caption → Publish
```

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| The image loop | generate → review → correct: at most three provider calls a slide (the image, Sol's review, one correction) |
| Quality | low (v1's default; the editor finds low quality enough) |
| Who letters the words | the image model, as in v1 (`<VISIBLE_TEXT>`); no brand fonts exist for a local renderer |
| Logo and page number | v1's post-production, as the Topic configures them (`brandOverlay`, `carouselChrome`) |
| Storage | a `draft2_sessions.images` column plus private R2 files; v1's asset tables need a v1 draft row (section 7) |
| Strict visual modes | not in Draft 2 yet: under `photo-required` or `verified-references` v1 composes the slides |

## 3. Reuse of v1 (`draft2-images.ts`)

Draft 2 calls v1's pieces directly; only v1's orchestration (module-private
and keyed on `creative_assets` rows) is rewritten.

- **Prompt:** `buildCreativeImagePrompt` with an in-memory `CreativeDraft`
  (format, 4:5, units, concept) and `CreativeBrief` (profile snapshot, tone,
  key facts): only the fields it reads.
  - `slideUnit` maps a slide: headline; the cover's text as subheadline;
    the body with a practical line under it; the call to action as
    `ctaQuestion`.
  - The direction is led by "What happens: …" (the beat) and "With its
    headline: …" (the headline link).
  - The concept carries the script's whole: concept, protagonist, cast and
    motif.
  - The tone comes from the focus: gravity → `somber` / `cautious` /
    `playful` / `informative`; its humor and energy dials.
  - The prompt keeps all of v1's locks (real people, real places, named
    works), the visual campaign guide with its avoid list, and the spatial
    contracts for the logo and the page number.
- **References,** in v1's order:
  - the characters' primary images;
  - the brand references (`selectBrandReferencesForDraft`);
  - the story photos (`resolveStoryReferences`);
  - then the place photo, or the base of an edit, last.
- **Material** (`slideMaterial`, from the script's references and the
  inventory):
  - a person's confirmed or linked portrait, and a place photo that may not
    be sent, are pasted unchanged (`compositeDocumentaryPortrait`), with the
    portrait zone in the prompt and no character on the slide;
  - a verified place's map on a map slide:
    - Google's static map, in the brand's colours, labelled with the name and
      address, when Google matched the place;
    - else a map of its Wikidata point, Google's or an OpenStreetMap render
      credited on its card;
    - fetched once, stored in R2, and pasted in the inset (`compositeMapPanel`);
  - a place's story photo is adapted by the model;
  - a verified Wikidata place photo, fetched again (v1's 24 h rule), is the
    model's identity reference (`verifiedPlacePhotoInstruction`, shared with
    v1);
  - anything that cannot be shown leaves a note on the slide.
- **Post-production:** in v1's order, once the image is normalised to
  1080×1350:
  1. the pasted photo;
  2. the map panel;
  3. the page number (`buildCreativeCarouselChrome`, with the same logo
     exclusion zone the prompt reserved);
  4. the logo: the version that reads best there
     (`compositeStoredCreativeBrandVersion`, see `logo-versions.md`).
- **Provider:** `submitFalImage` / `pollFalImage` with `IMAGES_QUALITY`
  (low); the endpoint follows the references (text-to-image, or edit).
- **Cost:** `estimateFalImageCost` and `recordUsageCharge`, idempotency key
  `draft2-image:{runId}:{slide}:v{n}`. Sol's reviews go through the story's
  text budget like every Draft 2 call.

## 4. The loop (`runDraft2Images`)

A run has one slide per carousel slide. Each slide has attempts:
- `generate`: the first image;
- `correct`: the automatic correction;
- `regenerate`: the editor's.

Statuses: queued → submitting → generating → generated | failed.

1. **Submit** queued attempts, three at a time.
   - The prompt is stored in R2 first.
   - The attempt is marked `submitting` before fal is called.
   - An attempt left `submitting` without a request id for more than 3
     minutes (its request died after fal may have accepted it) is failed
     and never sent again on its own.
2. **Poll** generating attempts. When an image is done, it is
   post-produced, stored and charged:
   - `{slide}-v{n}.png`, the slide as shown;
   - `{slide}-v{n}-base.png`, the image before the overlays, the base of an
     edit.
3. **Review** each new `generate` or `regenerate` image with Sol
   (`draft2_image_review`, low reasoning, 864 px JPEG):
   - v1's checks (`buildImageReviewInstructions`, `imageReviewIssues`):
     real-person likeness, people around a verified photo, third-party
     logos, the brand's avoid list, the facts, invented named subjects;
   - plus `skills/images.ts`:
     - `transcription`: the slide's words as drawn; the program compares
       them with the slide's (`textDifferences`: accents count; the page
       number, the logo and spacing do not);
     - `textCovered`: an overlay covers words;
     - `textNote`: broken lettering;
     - `storyNote`: never blocking.
   - A review that cannot run leaves the image for the editor.
4. **Correct** a `generate` image with blocking issues, once: an edit from
   its base, with the issues as the instruction (`IMAGE EDIT v1`). A
   correction is final as it comes.
5. **Settle.** The run is `ready` when every shown image passed its review,
   else `needs-review`.
6. **Pause and continue.** A request stops at 230 s, and before a review it
   could not finish (280 s deadline). It pauses with everything saved; the
   canvas continues it with the same request ids.

The editor:
- asks for another image of a slide: from its prompt again, or an edit of
  the image shown with what to change. It is queued, made and reviewed, and
  never corrected on its own;
- chooses the version a slide shows.

## 5. The visual script the images read (v2, then v3)

Since visuals v3 (`draft2-visual.md`), each slide also names its dominant
`subject`, which leads its direction after the beat ("Its subject: …"), and
the prompts' concept no longer names the protagonist or the motif: only how
the recurring cast looks when a slide shows it, so no image is asked to
repeat it.

v2, for reference:

- **Whole:** a `protagonist` the images follow.
- **Per slide:**
  - the `beat` is an action;
  - a `shot`: wide, medium, close, overhead or typography. No two adjacent
    slides share one (`SAME_SHOT`), and only a typography slide has the
    typography shot (`SHOT_MISMATCH`);
  - a `headlineLink`.
- **Context:** `layout`, which says that the image model letters the words,
  where the logo goes and on which slides, and where the page number goes.
- **Skill visuals v2:**
  - a story is something happening; never one subject resized from slide to
    slide;
  - a generic scene of the activity is not a reconstruction;
  - a new judge code, `REPETITIVE`.

## 6. Persistence, API, canvas

- **Column:** `draft2_sessions.images` (jsonb, additive migration 0106).
  - Holds the run, its slides and attempts, and earlier runs.
  - No R2 key, prompt or credential is in it: keys are derived on the
    server (`buildDraft2ImageObjectKey`, `180d` retention, under
    `draft2-images/topics/{topic}/{session}/{run}/`).
- **Routes:**
  - `POST /api/radar/draft2/images` `{ storyId, sessionId, continue? }`;
  - `PATCH` `{ sessionId, action: "regenerate", slide, instruction?, edit? }`
    or `{ sessionId, action: "choose", slide, version }`;
  - `GET /api/radar/draft2/images/file?sessionId&run&slide&version`
    streams one finished image (private, no-store, checked against its
    sha256).
- **Canvas, step 8:**
  - the run's slides in a grid, each image read with the editor's
    credentials into a blob URL;
  - its versions;
  - Sol's issues or "passed" with its story note;
  - "Corrected from v1 for: …";
  - what the slide could not show;
  - "Another image", with an edit option.

## 7. Why not v1's asset tables

`creative_assets` → `creative_asset_batches` → `creative_drafts` →
`story_creative_briefs` are NOT NULL foreign keys. Storing Draft 2's images
there means writing a v1 brief and draft for each run, as the documentary
pipeline does. Those drafts would then:
- appear in v1's Studio and daily preparation, which hide only the
  `documentary` provider;
- meet v1's copy checks on approval;
- not pass v1's approval-time image review, which reads only fal.media
  URLs.

Publishing (which needs a v1 draft and batch for
`instagram_publication_packages`) copies the approved carousel into v1 rows
once, at approval, under the `draft2` provider (`draft2-caption.md`).

## 8. Tests

- `draft2-images.types.test.ts`:
  - the unit mapping and material resolution;
  - the prerequisites and a new run;
  - the word comparison and Sol's review;
  - corrections and settling;
  - the editor's actions.
- `draft2-images.test.ts` (providers mocked):
  - the full loop: endpoints, references, post-production order, storage,
    charges, reviews, the trace;
  - a correction from the base;
  - pause and continue without resubmitting;
  - a lost submission;
  - the editor's edit and choice;
  - a pasted portrait and a map panel;
  - prerequisites.
- `draft2-visual.types.test.ts`: the layout, the shot rules, the v2 schema.
- `draft2-skills.test.ts`: visuals v2 and the image judge's rubric.

## 9. The narrative form's anchor plate (2026-10-12)

When the visual script follows a narrative form (`draft2-focus.md` §12)
whose anchor is a figure or an object, a new images run draws that anchor
once before any slide: one text-to-image call, alone and whole on a plain
background in the brand's identity, with no word, logo or frame
(`anchorPlate` on the run; `anchor-plate.png` and its prompt beside the
slides' files). It is sent and polled as a slide is (stored prompt first,
"submitting" before fal, never sent twice, the same grace period for a lost
submission) and charged once (`draft2-anchor-plate:<runId>`). The slides wait
for it; a plate that fails leaves them to the script's words, with a note.

Every slide that carries the anchor (everything but a verified photo, a
verified map or a typography card) receives the plate right after the brand
character's references, and its prompt names it by position (ANCHOR
REFERENCE); the brand references' budget counts it. A brand character needs
no plate: its references already travel with each slide that casts it.

Sol's review (images skill v2) answers `anchorShown` when it receives the
anchor: an image without it, or with another one, has a blocking issue, so
the one automatic correction redraws it, plate included. The canvas shows the
plate's state on the Images screen and counts its cost with the images'.

## 10. The master scene: panorama and follow-the-line (2026-10-12)

A panorama or a line is drawn once, before any slide, as one wide image
without a word: the whole carousel read left to right, with the script's
subject and beat for each section and, for a line, one continuous line from
the left edge to the right (`masterPlate` on the run; `master-scene.png` and
its prompt beside the slides' files). `masterLayout` sizes it under GPT
Image's 3:1 ceiling in multiples of 16 (1344 px high, up to 3840 wide) and
cuts 4:5 sections side by side, centred: 3 slides take its full height,
5 slides the middle 71%, 7 the middle 51%. It is sent, polled and charged
once like the anchor plate (`draft2-master-scene:<runId>`), and the slides
wait for it.

Each slide's request takes its section, cut from the master (read once,
checked against its hash) and sized as the slide is drawn, as the last input
image, with a MASTER SECTION instruction: keep the composition, horizon,
light and colors, and whatever touches the left and right edges, so the
slide continues its neighbours; redraw it in full and letter its words. An
edit or a correction redraws its own base instead. A master that fails, or a
section that cannot be cut, leaves the slide to be drawn on its own, with a
note. The brand references' budget counts the section.

Sol checks a line as an anchor (`anchorShown`); a panorama's scene is every
slide by construction. The edges continue the scene but are not matched to
the pixel: a blend across the seams is a later step, to try once the master
holds on real stories.

## 11. The plates never ran until 2026-10-12 evening

Both plates recorded so far, Brossard's anchor plate (traveling object) and
Saint-Jean's master scene (panorama), ended `failed` with "The Draft 2 image
file name is invalid" before fal.ai was called: their prompt files were named
`anchor-plate.prompt.txt` and `master-scene.prompt.txt`, and the R2 key rule
admits one dot only, the extension's. The tests mock R2, so the rule never
ran there. The names are now `anchor-plate-prompt.txt` and
`master-scene-prompt.txt`, the rule lives in one exported pattern
(`DRAFT2_IMAGE_FILE_PATTERN`, `r2-retention.ts`) that the writer and a test
share, and the test checks every Draft 2 file name against it. Until this
fix, every narrative form fell back to slide-by-slide generation without
its anchor or its scene, which is part of why those runs scored low.

## 12. A real photo fits its frame (2026-10-13)

The editor's first post of five personalities, each with a verified
portrait, came out with photos cut: a vertical photo in the full-width band
(1080×600) lost the chin and was enlarged 1.7 times, an action photo lost
its player's head behind the arch, a close-up lost the top of the head. The
layout was v1's rotation by slide order, and without the editor's focal
point the crop was sharp's `attention`; nothing knew where the person was.

- **Before a slide with a real photo goes out** (`preparePortraits`), Luna
  (`draft2PortraitModel`, `DRAFT2_MODEL_PORTRAIT`, default `gpt-6-luna`,
  effort low, ≈ $0.0005) looks once at a 768 px preview of each distinct
  photo and answers where the named person's face and visible body are, as
  fractions of the image (`DRAFT2_PORTRAIT_SUBJECT_SCHEMA`,
  `parsePortraitSubject`: percentages read as fractions, a box without area
  dropped, nobody found is an error). The photo is only looked at: it is
  never edited or sent to the image model (Sol's review already sees it in
  the finished slide). The editor's focal point on the photo, when set, wins
  and takes the place of Luna's answer (`focusSubject`).
- **The layout** (`fitPortrait`, creative-portrait-composite.ts): each of
  the five layouts' frames is filled with the largest window of its shape
  placed on the person (the face's middle at 40% of the window's height,
  else the person centred); the layout that cuts the least of the face
  (weight 30) and of the body (3), hides no face behind an arch's rounded
  top or a circle's edge (20), and enlarges the photo the least beyond 1.15
  (4 per unit) wins; the layout of the photo slide before only breaks ties
  (0.6), the slide's rotation the last ones. Without anyone located the
  slide keeps its rotation and the composite's automatic crop, with a note.
- **One fit, three uses:** the slide's material keeps it
  (`pasted.portrait`: layout, crop, source `ai` | `editor` | `automatic`,
  face, person); the prompt reserves that layout's zone, the composite shows
  that window (`compositeDocumentaryPortrait({ crop })`, which wins over the
  focal point), and Sol is told that region. Each attempt records the fit
  it was made with (`attempt.portrait`): an edit or a correction keeps its
  base image's, a fresh image (the first, or "make it again" without an
  edit) takes the photo's fit, which is chosen then for a slide made before
  this step; an image made before keeps the slide's rotation.
- The trace records each look (`draft2_portrait_subject`, with its cost).

## 13. Corrections that can fix what they find (2026-10-14)

On the same St-Jean run Sol flagged every first image for what the auditor
later saw (a street presented as the Vieux-Saint-Jean, a crowd implying
attendance, an invented market stall), but the one automatic correction is
an edit that keeps the layout and the scene, so it could not fix them, and
it was never reviewed.

- **Images skill v3:** `inventedDetails` lists what the image shows that the
  slide's facts and words do not give (products, food, signage, a style of
  architecture, performers, a crowd at the event) and what contradicts the
  words; a scene that passes for a photograph of a named event or place
  without its verified material goes in `inventedNamedSubject`.
- **Rework:** a review that finds the image wrong in what it shows (a person
  who could be real, people outside a verified photo, an invented named
  subject, a contradicted fact, an invented detail) marks `rework`; its
  correction is a new image from the slide's prompt with the refused
  problems as requirements (`reworkInstruction`, `correctsVersion`, no
  base). A flaw in how it is drawn (a decorative line, a shadow) is still
  edited.
- **Corrections are reviewed** (`reviewAfter`), never corrected again. A
  correction made before this change stays settled without a review.
- **The cover's lettering** (`COVER_PROMPT`): the headline dominates, large
  and clean; the subheadline small, on one line; nothing else to read.

## 14. The map card goes where the words are not (2026-10-14)

On the St-Jean festival carousel the last slide carried the verified map of
the Vieux-Saint-Jean. The card is pasted by the program, always bottom
right; the slide's long closing text ran into that corner, so the card
covered words, while the model left an empty grey box top right and drew a
map of its own (invented streets: "rue Charles", "pont Gouin"). The editor
asked three times, in words, to move the map; each request went to the image
model, which can only draw another map.

- **The editor moves the card** ("Map card" on a map slide: bottom right,
  top right, bottom left; `MapPanelPosition`, `movedMapSlide`, image action
  `map`). The slide's panel keeps the position; a new image is made from the
  prompt (never an edit of the old layout), and its zone prompt, its paste
  and the review's region all use that corner. Bottom right stays the
  default, so earlier slides recompose as they were. A band never moves.
- **The zone prompt names the corner**, keeps the rest of the slide for the
  words, forbids any other empty box or placeholder, and any map or plan.
- **A direction that mentions a map, a plan or a real view gives way to the
  scene** on a map slide (v1's detectors plus the plain words map, plan,
  carte, mapa, plano): the card is the only geography.
- **An editor's request on a map slide** is followed by a line telling the
  model the card is pasted by the program and never to draw a map itself.
- **Words covered by a pasted photo or map** now ask for a new image
  (`rework`): an edit keeps the words where they were.

## 15. The editor casts each image (2026-10-14)

"Another image" on a slide that does not rest on a verified photo shows the
brand's characters as checkboxes (a map slide shows them too since
2026-10-14: the characters stand beside the card, see draft2-visual.md) ("Brand characters in this image"),
preselected with the slide's cast; the request sends `characterIds` with
the regenerate action, `editorCast` checks them against the inventory's
roster, and the slide keeps the new cast, whose reference images go with the
request (a new image or an edit). What they do goes in "What to change"
("Jo dances the line dance").

## 16. Room around the map card, and the card's words are not the slide's (2026-10-14)

With the card moved top right, every new image of the St-Jean last slide set
its title's last line to about 57% of the width while the card starts at
54%: the card hid the end of "pratique". The zone the prompt reserved started
at 52%, and the model set its words just past it; the editor's edits kept
that layout. The review also counted the real map's street names and the
card's label as words "not in the slide", and the card printed
"Vieux-Saint-Jean" twice (an area has no street address).

- The zone an inset card asks the model to keep free is 72 px wider than the
  card on every side (it was 24), so words set close to its edge still miss
  it. A band keeps 24.
- Images skill v4: the words printed on a pasted verified map or photo are
  left out of the transcription, and the pasted material is never flagged as
  invented, unverified or a mock-up.
- A labelled card prints the address only when it says something the name
  does not (`mapLabelLines`).

## 17. A character the editor just added (2026-10-14)

The editor added Elvis to Salut St-Jean's characters while a session was at
the Images step: the cast checkboxes read the roster People and places saved,
so Elvis was not offered, and running People and places again would have
moved its version and made the script and images stale. "Read the brand's
characters again" (in each slide's "Another image" and in the script's cast
panel) is the inventory action `roster`: it reads the Topic's characters with
a reference image and keeps the inventory's version, since a new character
is a new choice, not a change to what the steps read.

## 18. Photo rights, and real photos pasted unchanged (2026-10-14)

A story photo a real-photo slide rests on is pasted unchanged; a photo the
editor keeps as reference only is never shown, and an attempt fails, saying
why, on one declared reference only since the run began. See
draft2-news-integrity.md.

## 19. The transcription is a proofreader's (2026-10-15)

On the Fogón Lab onion carousel the image model lettered "manejıar" (a
dotless ı) for "manejar", and Sol transcribed "manejar": the slide passed,
and an image edit asked to fix the word copied it again from its base. Images
skill v5 asks for the transcription letter by letter, an extra, missing or
swapped letter, a dotless ı or a wrong accent kept as drawn, never corrected.
A word the image model keeps misspelling is better replaced in the copy and
the slide made again from scratch: an edit keeps the base's lettering.

## 2026-10-18: the slide studio

The editor: "the image editor with words and the carousel work, but the UI
needs better ergonomics". The words' editor lived inside a 15 rem card in
the slides' grid: a preview of 200–300 px and some twenty-five controls in
one column under it, the image scrolled out of view while adjusting, three
folded sections per card, Apply at the very bottom, no way to the next slide.

Now (`src/app/draft-2-slide-studio.tsx`): each card shows the image, its
status, its versions, what Sol found, and **Open**. The studio opens over
the screen, one slide at a time:

- the preview as tall as the window allows (`.studioStage`: the smaller of
  the column's width and the height left), with the headline's and the
  text's boxes on it;
- the controls beside it in groups by use: Place and Headline open, Text,
  How it reads, Image (versions, Sol, another image, your own image) and
  Map card folded; sizes as a slider with the number beside it;
- Apply and Undo always in view in the footer, with "Changes not applied"
  while the layout differs from the slide's; "Give every slide this style"
  beside them;
- ◀ ▶ in the header, or ← → when the focus is not in a field or on a box,
  move to the previous or next slide without closing; Esc closes. With
  changes not applied, moving or closing asks first (discard, or keep
  editing);
- a slide the image model lettered opens with its image and the image
  groups alone.

The words' editor, the preview call, the cast chooser, the review lines and
the private image moved there from the canvas unchanged; the panorama's
scene editor stays above the grid.

## 2026-10-19: why the visual script scored low, and the gate

The editor: "the visual script always gets low evaluations; fix it". Forty
runs in twelve days: three accepted; under v2 the best reached 88–94 after
five rounds and stayed "revise"; under v3 (one round) scripts at 55–83
shipped as they came. The causes, read in the judges' own findings:

- **Originality blocked everything.** The judge scored it 69–83 on every
  script (its rubric capped a direct illustration at 80), the floor per
  criterion was 85, and the spine had already decided what each image
  shows, so the script could not be "original" in subject. Scripts at 91
  with 93–96 on every other criterion were sent back for originality 80.
  Now (visuals v15) originality is judged on the execution of the beat and
  has its own floor of 70 (`VISUAL_GATE.floors`); PREDICTABLE lowers it and
  nothing else. The gate is the funnel's acceptable score, 90, the other
  criteria at 85.
- **INVENTED_DETAIL over-reached**: autumn foliage, a black plastic pot,
  canvas gloves were "not in the facts". The rubric now says what makes a
  detail invented: the claim a reader would take about the real event,
  place, people, product or result; an image's ordinary concreteness in a
  generic scene is the direction's to choose.
- **FORBIDDEN_ELEMENT false positives** (106): "dejar sitio para el logo",
  "libre para el logo": the writer is told where the logo goes and keeps
  room for it. `ALLOWED` now knows sitio, lugar, banda, franja, tercio,
  place, spot, slot, band, strip, third, bande, tiers, and "libre … logo"
  with the room named first.
- **v3 had no second round**, so the judge's findings never reached the
  writer. v3 keeps the revision round (run only when the first script is
  not accepted), as the panoramas already did; no proposal, the judge at
  low. OTHER is for when no code fits, naming the rule.

What stays: the beat is the spine's, truth is material, the brand's avoid
list is absolute. The judge's findings remain visible to the editor whatever
the score.

## 2026-10-22: a pasted photo never covers words

On the Saint-Jean weekend carousel the verified photo of mont Saint-Grégoire,
pasted in the lower half, covered the practical line the model had lettered;
the review said "renseignements pratiques tronqués" and the carousel waited
for an acknowledgement. A slide with a pasted photo now gets the program's
words whatever the presentation (`programWordsOn`), and the band the words
take ends above a photo that starts in the lower half (`textBandFor`, the
photo's own layout box). See draft2-news-integrity.md.
