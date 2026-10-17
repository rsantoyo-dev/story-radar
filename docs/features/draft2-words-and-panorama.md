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
