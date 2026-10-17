# Photo bank

Built 2026-10-17 from the editor's ask: "every time I upload photos of places
or people, they must be kept in an image bank, associated with them, so they
can be found: I uploaded photos of Jo at Les Parulines; if that park comes up
one day, I should have those images, even before Commons'".

The case that prompted it: in "Un ciel gris… notre pause d'automne" the editor
gave "jo parulines entrance" to the parc naturel des Parulines (Google place
`ChIJNZk2Ru2h…`). Three days later, "5 idées pour le week-end" named the same
park, with the same Google id, and found nothing: the script fell back to a map
and a leash cut-out, and the editor uploaded "parc pirulines" again. A story
photo belonged to one story only; the link to the park lived in one session.

## 1. What it is

A **workspace-level** bank (shared by all the workspace's brands, never across
workspaces): every photo a story receives, stored once with its rights and
credit, and filed under the **places and people it shows**.

- `photo_bank_photos`: the photo (name, description, credit, rights, whether it
  may be sent to the image provider, source `upload` | `commons`, focal point,
  origin brand and story, `retired_at`). Its bytes are a permanent,
  content-addressed R2 object, `<prefix>/workspaces/<workspace>/photo-bank/<sha256>.webp`
  (`buildPhotoBankObjectKey`): the same bytes are one photo (`unique
  (workspace_id, sha256)`).
- `photo_bank_subjects`: a place or a person, with what identifies it beyond
  its name (a place's Google Maps place id and Wikidata item, a public person's
  Wikidata item), its aliases (the names stories gave it), a place's address
  and point, a person's `consent_at` and `confirmed_at`.
- `photo_bank_tags`: what a photo shows, with the story where the editor first
  said so (`origin_story_id`, null when tagged on the bank's page).
- `story_reference_photos.bank_photo_id`: the bank photo a story photo is, or
  is a copy of.

A story uses a bank photo through **its own copy** (`copyBankPhotoToStory`: a
story photo with the bank's name, credit, rights and focal point, its bytes
copied in R2). The story's material stays an immutable snapshot, every
existing reader (the images step, documentary portraits, the story's photos
panel) works unchanged, and retiring a bank photo never changes a story or a
publication. Migration `0114_photo_bank`.

## 2. How it fills itself

- **Every upload** to a story (`uploadStoryPhoto`) and **every Commons
  import** (`importCommonsPersonPhoto`, person or place) enters the bank
  (`bankStoryPhoto`); a Commons import is filed under its person or place,
  read from the description the import writes (`commonsSubject`: "Portrait
  from Wikimedia Commons (Wikidata Q…)"). The bank's failure never fails the
  upload: the next sync brings the photo in.
- **People and places teaches it**: a story photo the editor gives to a place
  or person is filed under them (`fileStoryPhoto`), with the ids the lookups
  found (`subjectOfEntity`: a verified place's Google and Wikidata ids,
  address and point; a person's confirmed Wikidata id; a place the editor set
  aside by its name alone). Taking that photo back in the same story forgets
  it (`untagStoryPhoto`, only the tag this story made).
- **The history came in on its own** (`syncPhotoBank`): every active story
  photo of the workspace without `bank_photo_id` is banked, and filed under
  the people and places the Draft 2 sessions of its story gave it. It runs,
  idempotent and quiet, at the start of every People and places search and
  every time the bank's page is read.

## 3. How a story finds it (before Commons)

In People and places, after the Wikidata, Commons, Openverse and Google
lookups (`withPhotoBank` in draft2-inventory.ts, rules in
photo-bank.types.ts and `bankOffer`):

- **Matching** (`matchSubject`): a place by its Google Maps place id, then by
  a Wikidata id (a place's item; a person's confirmed item or any of their
  Commons candidates'), then by its name or an alias: whole, or for a place
  its words in order ("Parc des Parulines", "Parulines" for "Parc naturel des
  Parulines"; the shorter name needs 8 letters or two words). A subject whose
  own ids differ from the story's is another place or person, whatever its
  name.
- **Given on its own** (`takesPhotoOnItsOwn`, `photoToTake`): a place matched
  by its ids takes one photo; a person only once the editor has confirmed
  them from the bank one time (`confirmed_at`) and the bank may show them. The
  photo given is the least used (then the longest unused, then the newest),
  so consecutive posts do not repeat one photo, and only one the publication
  may publish, not retired, showing no person the story does not name and no
  person without consent. It is linked as the entity's story photo, which the
  images step already prefers to the Commons or Openverse photo of a place.
- **Offered** (`entity.bank`): every photo of the match, in that order, each
  with why the program did not give it (`hold`: reference only, retired, "Jo
  appears in it and is not in this story", consent not recorded). The editor
  takes one with **Use this photo** (action `bank`), which confirms a person
  for next time.
- **Consent**: a person Wikidata does not know (Jo) is shown only once the
  editor records that they agreed to appear in the publication's posts: a
  checkbox in People and places (asked once, with their first photo) or on the
  bank's page. A public person keeps Commons' rules (a documentary portrait,
  pasted unchanged, never sent to the image model).
- **Refusal sticks**: taking the bank's photo off (unlinking it) marks the
  match `declined`; no photo is given on its own again in that story, and the
  editor may still choose one.
- **A Commons portrait an earlier story imported** comes from the bank: the
  confirm action copies it instead of downloading it again
  (`bankPhotoOfWikidata`).
- A bank that cannot be read leaves the people and places as the lookups found
  them (logged, never fatal).

## 4. The bank's page

Dashboard → Brand → **Photo bank** (`#photo-bank`, photo-bank-panel.tsx, read
through the selected brand, shown as Workspace): search places, people and
photos; places and people each with their photos, identity links (Google Maps,
Wikidata), aliases and, for a person Wikidata does not know, the consent
checkbox; each photo with its credit, where it was first used and how many
stories have it, its rights (declared once, they reach every story's copy),
what it shows (add a place or person, existing or new; take one off), and
retire / offer again; photos not given to anyone yet; and a form to add a
photo to the bank itself, with what it shows.

API (topic-scoped auth; the workspace is the topic's):
`GET/POST /api/radar/photo-bank`, `GET/PATCH /api/radar/photo-bank/photos/[photoId]`,
`PATCH /api/radar/photo-bank/subjects/[subjectId]`.

## 5. Rights and focal point

Rights are the photo's, not one story's: declaring them on a story photo
(its PATCH route) or on the bank's page updates the bank photo and every
story's copy of it (`syncStoryPhotoRights`). Published packages are frozen
and never change. A focal point set on a story photo becomes the bank
photo's, which the next copy starts from (`syncStoryPhotoFocus`).

## 6. Files

- `src/db/schema/photo-bank.ts`, `drizzle/0114_photo_bank.sql`
- `src/app/modules/photo-bank/photo-bank.types.ts` (pure: matching, holds, the
  photo given, parsers) and its test
- `src/app/modules/photo-bank/photo-bank.ts` (server: load, sync, file, copy,
  changes, upload)
- `src/app/modules/draft2/draft2-inventory.ts` (`withPhotoBank`, the `bank`
  action, the bank-first Commons confirm), `draft2-inventory.types.ts`
  (`Draft2BankMatch`, `bankMatches`, `bankOffer`)
- `src/app/draft-2-canvas.tsx` (`BankOffer` in People and places),
  `src/app/photo-bank-panel.tsx`, the dashboard's `#photo-bank` view
- `src/app/api/radar/photo-bank/**`

## 7. Open

- Merging two subjects filed apart (two names for one place without ids);
  renaming is in the API (`PATCH subjects/{ id } { name }`), not yet on the page.
- The v1 studio's story photo picker does not offer bank photos.
- Recognizing what a photo shows without the editor (image similarity, EXIF
  location) is not attempted: the editor's word is the bank's.
