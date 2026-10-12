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
  4. the logo (`compositeStoredCreativeBrand`, now exported).
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
