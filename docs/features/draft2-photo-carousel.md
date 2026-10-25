# Draft 2 — the photo carousel

**Since:** 2026-10-25. **Asked for:** "necesito mostrar todas las fotos que
tomamos… todas las fotos deben salir" (Salut Saint-Jean, the Halloween
afternoon at Carrefour Richelieu).

## What it is

A third way of making a carousel's images, chosen in the Focus step beside
"One image per slide" and the panorama: **the story's own photos, one per
slide**. Nothing is drawn. The program sets each slide's words on its photo,
adds the page number and the logo, and stores it like any generated image, so
the review, the hand edits, the caption and the publication work unchanged.

## The album

The album is every active photo of the story that the editor declared their
own or licensed **and** allowed to the models (People and places), in the
order they were added — a person's portrait among them, since the editor
chose to show every photo. A photo for reference only, or kept from the
models, is not on it. A photo carousel runs 5 to 9 slides, so the album has
5 to 9 photos (`PHOTOS_COUNT`), and it is told as an arc (`PHOTOS_STRUCTURE`).

## Who decides what

- **Spine (planner, Claude high).** `spineLimits.photos` lists the album and
  the photos travel with the request as 640 px previews. The spine has
  exactly one beat per photo and each beat carries `photo`, the id of the
  photo its slide shows: the planner places them in the order that tells the
  story (the cover takes the one that stops the thumb). The program refuses a
  spine with a beat without its photo, a photo on two beats or a photo on
  none, and asks again with the rule (spine skill v15).
- **Draft (v4 writer, Opus) / Opening, Closing, Deck (v2, v3).** The request
  carries the photos with the slide each took, attached as images in that
  order: the words tell what the photo shows and what happened there.
- **Visual script.** Written by the program, no model: one slide per photo as
  the spine placed them (`need: "real-photo"`, `references: [photoId]`, the
  spine's image line as the beat), stored as a ready one-version run (`p1`).
- **Images.** Composed by the program from the photo file (fitted edge to
  edge, `fit: "cover"`), then the words, the page number and the logo;
  attempt `kind: "own"`, free, never sent to a model, never reviewed. The same
  composition the editor's "Use one of the story's photos" action uses.

## Rules kept

- Rights: only publishable photos (`own` or `licensed`) ever reach a slide;
  a photo declared reference only since the run began fails its slide and
  says why.
- Transmission: photos the editor kept from the models never reach the
  planner or the writer, so they cannot be in the album.
- Nothing is reconstructed: the slide shows the photo as taken, fitted.

## Not yet

- Reordering photos by hand (the spine's hand edit can change a beat's
  `photo`; there is no picker).
- A photo carousel of a list or a procedure.
- Mixing drawn slides and photos in one carousel.
