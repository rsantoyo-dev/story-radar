# Draft 2 — words set by the program, and the panorama

Built 2026-10-17 from the editor's ask: "put the words afterwards, so we
sometimes avoid making images again", and "one wide image narrating a story,
then cut for each slide". Both are options, chosen per story in the Focus,
before the Spine. The first version is generic: one sans family and the
brand palette's darkest and lightest colours.

## In the Focus

Two editor fields under Goal (`textMode`, `imageMode`; `FOCUS_EDITOR_FIELDS`):

- **Words on the images**: "Drawn in the image" (as before, the default) or
  "Set by the program".
- **Images**: "One image per slide" (the default) or "One panorama cut into
  the slides (up to 6)". A panorama always takes the program's words.

Claude never decides them and gives no reason for them; a new decision keeps
them (`decidedFocus`). `focusPresentation(values)` resolves the pair.
`focusForModels` adds `presentation` when it is not the default, so the
Spine (skill v7) and the visual script (visuals v12) plan for it.

- A panorama is planned as one scene: `imageMode` is a telling field (the
  spine goes stale), the spine has at most `FOCUS_PANORAMA_MAX_SLIDES` = 6
  beats (`spineShapeProblem`'s `maxBeats`, a `SPINE_SHAPE` finding when the
  spine is longer), and the subject checks (`SPINE_SAME_SUBJECT`,
  `SPINE_SERIES`) do not apply to its sections.
- The words never follow these fields (`wordsFollowFocus` ignores them); the
  visual script does (`visualFocus`, `visualDirectionChanged`), so a change
  asks for a new script and new images, never for new words.

## Words set by the program

- **The image**: the shared prompt builder's `wordsSetAfterwards` (v1 never
  sets it) drops the text to letter, the language lock and the brand
  lettering, and asks for no word at all; `textBandPrompt` asks for a calm,
  plain band where the words go; the cover asks for its subject below it
  (`COVER_PROGRAM_PROMPT`). Corrections ask for no words either.
- **The band** (`textBandFor`): along the top, 540 px tall, below the logo
  when the logo sits on top; along the bottom, above the page number, when a
  real photo bleeds from the top or the map card sits top right.
- **Setting the words** (`draft2-text-layer.ts`, `setSlideWords`), in
  `finish` after the pasted photo and the map and before the page number and
  the logo: Pango through sharp with the bundled Liberation Sans (the font
  already used for the page number on Vercel); headline bold, text, practical
  line and call to action smaller; sizes come down together until they fit.
  On a calm band with enough contrast the words sit on the image in the
  palette colour that reads; otherwise on a card of the palette's lightest
  colour. The attempt keeps the words it set (`attempt.words`).
- **The review**: Sol reads the finished slide with the words as the program
  set them (`expectedText`), so the words always match.
- **Changed words, free**: a hand edit or a review patch after the images
  shows "The words of N slides changed since their images" on the Images
  screen; "Set the new words" (`PATCH /images { action: "words" }`) makes a
  new version of each changed slide from the image it shows, before its
  overlays, with the words it has now: kind `words`, no model, no cost, the
  earlier review kept with its issues about the words dropped.

## The panorama

- `newImagesRun` queues a master plate (`PANORAMA_SCENE`, `masterLayout`:
  up to 3840 × 1344, under GPT Image's 3:1) and one `section` attempt per
  slide.
- The plate is drawn once (`panoramaScenePrompt`): the carousel as one
  continuous scene, left to right, something crossing each cut, the top of
  every section calm for the words, no words at all.
- Each slide is its section cut as it is (`cutSection`), brought to
  1080 × 1350 and finished like any slide; no model call per slide, so the
  scene runs on across every swipe. A scene that fails leaves each slide to
  be drawn on its own. A section is never corrected automatically (an edit
  would break the seams); the editor can still make another image.
- Section size by slides: 3 slides ≈ 1075 × 1344 (no upscale), 4 ≈ 960 ×
  1200, 5 ≈ 768 × 960, 6 ≈ 640 × 800 (1.7× upscale).

## Not built yet

- Brand fonts and several text layouts per brand (top band, bottom card,
  side column) chosen by the visual script.
- A check that the seams of a panorama line up after the words are set.
- Choosing the presentation as a brand default in the creative profile.

## Addendum, 2026-10-17: the first real panorama (spine v8)

The coffee ring story's first panorama Spine failed twice: the planner's
answers had more than six beats or a beat's words over 200 characters, and
the second answer broke a hard rule again. The retry passed, but with a cut
of the drop, a magnified edge, a view from above and two panels, which one
wide image cannot hold. The editor's copy was fixed by hand (one counter seen
from above at one scale, each step the next drop along it). Since then:

- **One view and one scale** (spine v8): a panorama's step is the next thing
  along the scene, never a cut-away, a close-up, a magnified view or panels.
  The program checks the image lines (`SPINE_PANORAMA_VIEW`, Spanish, English
  and French terms; "vista desde arriba" alone is a view, not a break): the
  first answer is asked again, the second's problems are notes.
- **The numbers in the request**: the plan request carries `spineLimits`
  (the fewest and most beats, six for a panorama, and each beat field's
  characters); the planner keeps ten characters of margin.
- **The last answer is cut, not failed**: a beat's scene, words, image or
  withholds over its limit on the last answer is cut at a word
  (`parseFocusPlan`'s `clip`); a beat count over the cap still fails.
- **Why an answer was refused** is the note of its call in the trace
  ("Refused by the program: …"), no longer only on the dev console.

## Phase 1, 2026-10-17: the brand's fonts

The editor: "fonts preloaded and per brand, two kinds… some 30 to choose
from", and "eventually we take the words off the other images too".

- **The fonts** (`brand-fonts.ts`): 33 open Google Fonts families plus the
  bundled Liberation Sans, in `fonts/brand/<dir>/` with their licenses (OFL;
  Roboto Slab Apache 2.0): display serifs (Fraunces Soft, Fraunces, DM Serif
  Display, Playfair Display, Young Serif, Gloock, Abril Fatface), text serifs,
  slabs, sans, condensed and handwritten faces. A variable family is one file
  whose weight is the `wght` axis; Fraunces Soft sets `SOFT` 100 (rounded
  serifs), and the optical size follows the size the words are drawn at.
- **Drawn by Skia** (`@napi-rs/canvas`, now a direct dependency and a server
  external package): it reads each font from its file on every host. The
  Pango that sharp ships draws with macOS's own fonts and ignored the bundled
  files on the editor's machine, so the first version's words were in a
  fallback face locally. `brand-fonts.server.ts` registers the catalog once.
- **The brand's choice**: the creative profile's "Words on slides" (Visual
  tab) sets one family and weight for the headlines and one for the text
  (`creative_profiles.words_style`, migration 0115, nullable; absent:
  Liberation Sans). Fogón Lab's guide describes "a very heavy display serif
  with soft rounded serifs" and "a clean geometric sans of medium weight":
  Fraunces Soft Black and DM Sans Medium.
- **The layout** (`Draft2WordsLayout`): the program now writes one for every
  slide it letters: the block's box, alignment, each role's font, weight,
  size and colour, and the background (none, a card or a band, its colour and
  opacity). `autoWordsLayout` chooses it as before (the band, calm or card,
  sizes fit together); `drawWords` draws any layout. Words set again keep the
  layout of the version they come from.

## Phase 2, 2026-10-17: the panorama's scene

The editor: "show the first image, so we can regenerate it, adjust it and
divide it again". The first real panorama (the coffee ring) showed why: Sol
flagged all six slides for an ochre counter, and only a new scene fixes that;
the scene also shows what the slides hide (Chispa left almost entirely
outside the last cut).

- **The scene on the Images screen** (`SceneEditor`): the one wide image, at
  its own proportions, with its numbered cuts drawn on it
  (`draft2SceneFile`, `GET /images/file?plate=master&version=n`, a 1920-wide
  JPEG; sharp resizes before it composites, so the cuts are drawn first).
- **Cut again, free** (`PATCH /images { action: "cut", offset }`): arrows move
  the cuts, "Smaller"/"Larger" set the sections' size (60 % to 100 % of the
  largest), and the scene shows each try (the offset clamped as the server
  cuts it, `cutSections`). "Cut again" gives every slide a new version, its
  section of the same scene with its words where they were (the layout is
  kept) and the review of the version it replaces; no model, no cost.
- **Make the scene again** (`{ action: "scene", instruction }`): a new
  version of the scene (`master-scene-v2.png`, charged once as its own image)
  with what the editor asks to change in its prompt, the earlier one in the
  plate's history; every slide's next version waits as a section of it, and
  the canvas continues the run. Nothing earlier is overwritten.

## Phase 3, 2026-10-17: the words as an object

The editor: "the texts must be editable graphically: move them, size them,
adjust them by hand, a background or not, styles: a graphic editor of the
text object that sits on top".

- **"Words: place and style"** on every slide whose words the program set
  (`WordsEditor`): the slide as the server sets it, with the box of the words
  over it. Drag the box to move the words, its right edge to widen or narrow
  them (no narrower than 240 px); the arrow keys move it (Shift for larger
  steps). Controls: alignment; the headline's and the text's font (the 34
  bundled families), weight, size in slide pixels and colour; what sits
  behind the words (none, a card, a band across the slide), its colour and
  opacity.
- **What shows is what is published**: each change is tried on the server a
  moment after the last one (`POST /api/radar/draft2/images/words`,
  `previewDraft2Words`): the image the slide shows, before its overlays, with
  the words set as tried, the page number and the logo; nothing stored, no
  model. `X-Words-Bottom` gives the block's height for the box.
- **Apply** (`PATCH /images { action: "layout", slide, layout, all }`):
  a new version from the same image, free, the image's review kept with its
  issues about the words dropped (`applyWordsLayout`). "Give every slide this
  style" carries fonts, sizes, colours, background and alignment to every
  slide the program lettered, each keeping its own box (`withStyleOf`).
- **Checked**: `parseWordsLayout` keeps the box inside the slide, snaps a
  font to the catalog and its weight to the nearest it has, bounds the sizes
  (headline 28–160, text 18–80), and takes colours as `#rrggbb`.
- Styles in `draft-2-canvas.module.uxdsl` use the theme's tokens: the box's
  edge is `border(dashed-primary)`, its focus the shared `border(focus)` ring.

## 2026-10-18: the editor's own images, and styles in the words

The editor asked to upload their own image for a slide or to cut ("a
gallery of photos I took, and the program did not take them all"), and for
bold and other styles in the words. Both are optional; nothing changes for a
carousel that does not use them. No migration: everything lives in the
versioned images record.

**Your own image (each slide card).** "Your own image" lists the story's
photos with their rights; "Use on this slide" puts one there, fitted to the
slide: cropped around the photo's focal point (or where the eye goes when it
has none), or whole on the brand's lightest colour. "Upload and use it" adds
a photo to the story's photos (and so the photo bank), with its rights and
credit, and uses it at once. The result is a new version of kind `own`
(`placeOwnImage`, `PATCH /images { action: "own", slide, storyPhotoId, fit }`):
no model, no cost, the earlier versions kept. The program sets the slide's
words on it whatever the presentation, then the page number and the logo; no
portrait or map is pasted on it, since the photo is the slide. Sol never
reviews it (`imageCleared`): the run is ready with it, and approval lists no
issue for it.

- Only a photo declared own or licensed goes on a slide. Approval looks the
  photo up again (`prepareDraft2Publication`): one taken back to reference
  only, or removed, stops the approval.
- A licensed photo carries its credit to the caption (`captionCredits`), in
  place of the credits of the slide's material, which is not on it.
- Its words can be moved and restyled like any the program set; the version
  keeps its `own` record (`words` attempts copy it).

**Your own scene (a panorama's scene editor).** "Use your own scene" uploads
a JPG, PNG or WebP up to 25 MB (`POST /api/radar/draft2/images/scene`,
`placeOwnDraft2Scene`), with its rights and, when licensed, its credit. The
file is kept as sent (`master-scene-vN-own.<ext>`), and the scene, brought to
at most 3840 × 2160, becomes the scene's next version; the drawn one stays in
its history. Every slide is cut from it at once (`cutEverySlide`, shared with
"Cut again"), with its words, free and never reviewed. The cuts are the
largest 4:5 sections the scene holds (`cutSections` now reads the scene's own
size); a scene too small to give each slide 540 pixels of height is refused,
with the size it needs.

**Styles in the words (the words' editor).** On top of the box, alignment,
fonts, sizes, colours and background:

- **How it reads**: the headline and the text as they sit on the slide, with
  line breaks where the editor wants them and `**marked**` words ("Mark the
  selection" wraps the selected words). Only breaks and marks may change: the
  words stay the slide's (`readsAs`, `setAsMismatches`; the server refuses
  other words, and words changed later in the Deck set the slide as written).
  Kept per slide: "Give every slide this style" never copies it.
- **Marked words** take their own weight and colour (default: the font's
  heaviest weight in the role's colour).
- **Capitals**, **letter spacing** (−50 to 300 thousandths of the size) per
  role, and a **soft shadow** under the letters for words straight on a photo.

The renderer (`draft2-text-layer.ts`) places each line by its own width and
draws its runs one after the other, switching face for marked words.

### The headline and the text apart, and the brand's colours (2026-10-18)

The editor asked for the title and the subtitle to be handled apart, to use
the space better, and for the brand's colours to be quick to pick.

- **Two boxes.** The words' editor shows the headline's box and the text's.
  The text follows the headline until the editor drags its box (or presses
  "Set the text apart"); from then on it has its own place
  (`Draft2WordsLayout.textBlock`: box, alignment and background with its
  colour and opacity), and the headline keeps the layout's. "Put the text back
  under the headline" joins them again. The practical line and the call to
  action go with the text.
- **The renderer** draws each part as its own group (`drawGroup`): its card or
  band, its lines placed by their width. The preview reports where each part
  sits (`wordsParts`, header `X-Words-Parts`) for the editor's boxes. The
  shadow lifts only words straight on the image, never on a card or a band.
- **The brand's colours first.** Every colour (each role's, the marked
  words', each background's) shows the creative profile's palette as
  swatches (header `X-Brand-Palette`), then the browser's picker for any
  other; a background keeps its opacity slider beside its colour.
- **To every slide**: a slide whose text is apart keeps its text's place and
  takes the text's alignment and background; a slide whose text follows its
  headline keeps it so (`withStyleOf`).
