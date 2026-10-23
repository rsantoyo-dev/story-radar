# Draft 2: news integrity (2026-10-14)

An auditor read the Salut Brossard carousel on the Houston resto-bar at
Quartier DIX30, whose liquor permit the RACJ suspended for 21 days (a story
collected from the Journal de Montréal). The editor asked for the pipeline
to prevent every point, not to fix one post. Each point had one origin.

| Auditor's point | Where it came from | What prevents it now |
| --- | --- | --- |
| The cover lets readers believe the bar closed; the start date (at the police's discretion) appears only on slide 6 | No step decided which facts must come before a reader can stop | Focus guards + `GUARD_LATE` (program) + `MISLEADS` (judge) |
| The cover hides the cause behind a teaser; "permis" alone is ambiguous; no "du DIX30" | Hooks rewarded a curiosity gap; nothing asked for exact terms or the local place | Hooks v8 |
| The cover photo may come from the Journal de Montréal (rights) | Story photos had no rights; the image step redrew a real photo of the bar, logo included | Photo publication rights + real photos pasted unchanged |
| "Un engagement, pas un résultat" judges the bar | The closing asks for "what it means for the reader", which became a verdict | Fairness skill v1 + review v4 |
| Facts of 2020–2024 read as news of today | Same as the first point | Focus guards (period) + fairness skill |
| "Les incidents dépassent la drogue", "La nuance est dans le « peut »" | Headlines as commentary or comparisons without their terms | Decks v2, closings v3 |
| No credit to the outlet that reported the story | The caption added photo credits only | Source line after the caption |

## Guards (focus v14, hooks v8)

The focus plan names `guards`: what a reader who stops at the cover could
wrongly believe, each with one or two facts, each enough to prevent it ("le
Houston ferme" → the start-at-the-police's-discretion fact). At most two,
only risks the cover's subject invites, none when the story carries none.
They are Claude's (not an editable focus field), written in the plan call
before the spine, kept in `values.guards` and `ai.guards`, and read by every
step through `focusForModels`. A plan with none clears the earlier ones.

The opening must cite one of each guard's facts on the cover or slide 2:
`mechanicalOpeningIssues` reports `GUARD_LATE` otherwise (blocking). It says
what the facts say (what the measure is, when it starts, the period), never
a reassurance they do not give ("the bar is not closed"; hooks v9). The
judge names an opening whose words leave the misreading open in a
`MISLEADS` issue, a material one. Review v4 never takes a guard off the
cover or slide 2. The canvas shows the guards under the levers
("Misreadings to prevent") when there are any.

Hooks v8 also asks the cover to say the cause of a sanction, closure,
ruling or accusation when the cause is the draw (in the subheadline when the
headline cannot hold it), to name things as the facts do (a liquor permit,
not a bare permit), and to name the place the audience recognizes.

## Fairness (fairness skill v1)

Read by the opening, deck, closing and caption writers and judges and by the
review's editor. When the story names a person, business or organization
that is accused, investigated, sanctioned, sued, charged, convicted or
criticized: no verdict of the publication's own (irony, scare quotes,
insinuation, doubt about their sincerity or promises), accusations keep
their source, their response is stated plainly and attributed, a measure is
what the facts say it is, and past events keep their dates. A breach is a
material error; in Review it is a truth patch, which the autopilot applies.

## Concrete headlines (decks v2, closings v3)

A headline states its slide's fact (who did what, the number, the
consequence), so a reader who reads only the headlines follows the story:
never a comment on the facts or a comparison without its terms. The last
slide's meaning is never a verdict on the people the story names.

## Photo publication rights

`story_reference_photos.publication_rights` (migration 0109): `own`,
`licensed` (a free license included) or `reference`. Only `own` and
`licensed` photos may appear in a published image; a reference-only photo
informs the work and is never published, not even adapted (a model's
adaptation of a photo is still a derivative of it). Photos saved before the
column are `reference` until the editor declares them; Commons imports were
set to `licensed` by the migration and are imported as such.

- The upload form asks "What may we do with it?"; each photo card has a
  "Publication" select (`PATCH …/photos/[photoId]` with `publicationRights`).
- Draft 2's inventory carries `rights` on each photo and link. A declaration
  alone keeps the inventory's version (the steps read the same photos);
  `entityMaterial` and `referencePhotos` count only publishable photos, so
  the visual script is never offered a reference-only one, and People &
  places marks them.
- `slideMaterial`: a story photo a `real-photo` slide rests on is pasted
  unchanged (a model's redraw of the bar's façade passed for it, logo
  included); elsewhere an adaptable photo is the model's subject. A
  reference-only photo is never shown and the slide notes why.
- At the image step each attempt reads the photos' rights again and fails,
  saying why, on one declared reference only since the run began.
- Visuals skill v9 tells the script both rules.

v1 (deprecated) does not enforce the rights.

## Source line (captions v3)

The caption run records the hosts of the story's sources (`story_sources`,
without "www.", the publication's own content left out, at most three) and
the line the post shows, in the publication's language: "Source :
journaldemontreal.com" (French, with a no-break space), "Fuente:", "Source:".
It goes after the caption and before the photo credits, counts toward
Instagram's limit, and the editor may leave it out per post ("Show the
source after the caption"; the choice carries to the next run). A caption
that writes its own source line is refused (`CREDIT_IN_TEXT`). The
publication freezes the same text v1 posts. Runs written before the line
have none, so their approvals stay current.

## Files

- Focus: `draft2-focus.types.ts` (guards), `skills/focus.ts` v14.
- Opening: `draft2-opening.types.ts` (`GUARD_LATE`, `MISLEADS`),
  `draft2-opening.ts`, `skills/hooks.ts` v8.
- Fairness: `skills/fairness.ts`, composed in the opening, deck, closing,
  review and caption steps.
- Deck, closing, review: `skills/decks.ts` v2, `skills/closings.ts` v3,
  `skills/review.ts` v4.
- Photos: `src/db/schema/story-materials.ts`, `drizzle/0109_story_photo_rights.sql`,
  `stories/story-materials.types.ts`, `story-materials.repository.ts`,
  `manage-story-photos.ts`, `commons-person-photos.ts`, the photo route,
  `story-photos-panel.tsx`, `draft2-inventory*.ts`, `draft2-images*.ts`,
  `skills/visuals.ts` v9.
- Source line: `draft2-caption*.ts`, `stories/story-content.repository.ts`
  (`storySourceUrls`), the caption route, `draft2-publication*.ts`,
  `skills/captions.ts` v3; the funnel's snapshot may now be asynchronous.

### The first run (2026-10-14)

Re-running the Houston story from Focus: the plan named three guards of two
facts each, and the first version required every fact of every guard on the
cover or slide 2; all fifteen openings failed the check (44 findings) and
Claude's revision ran out of output tokens. The openings themselves already
carried the auditor's points ("21 jours sans permis d'alcool au Quartier
DIX30", the start at the police's discretion and the 2020–2024 period on
slide 2), but some wrote "il n'est pas fermé", which the facts do not say.
Focus v15 and hooks v9: at most two guards, one fact enough, and no
reassurance the facts do not give.

## One form of address, outcomes and acronyms (2026-10-15)

The auditor's next read of the Houston post: the last slide said "Pour vos
sorties, retenez…" above "Suis Salut Brossard…" (vous and tu in one slide,
the problem the Brossard grid had across posts); slide 4 told that a man
sold cocaine at the bar without saying he was arrested and pleaded guilty
in 2023, so the sale read as ongoing; and it named the Longueuil police only
as "SPAL".

- **The brand sets the form of address** (`creative_profiles.reader_address`,
  migration 0110): informal (tu, tú; the default, closer to the reader) or
  formal (vous, usted), in the creative profile ("Address the reader"). The
  brand brief tells every writer and judge the form; English and other
  languages without the distinction are not affected.
- **The program refuses the other form** (`draft2-address.types.ts`,
  `WRONG_ADDRESS` in the opening, closing, deck and caption, and in the
  review's patch checks): vous, votre, vos and French imperatives in "-ez"
  in an informal post (chez, assez and names inside a sentence excepted),
  tu, toi, ta, tes, t' in a formal one; usted in an informal Spanish post,
  tú, tu, te, ti in a formal one. Words in quotation marks are someone
  else's and never count.
- **Reader skill v1** (composed beside the fairness skill): one form in the
  whole post; organizations by the names the audience knows ("la police de
  Longueuil"), an acronym only after its full name once; plain words over
  jargon.
- **Fairness v2:** a past action keeps its outcome when the facts give one
  ("il a plaidé coupable en 2023").
- **Review v5:** a past action without its outcome is a truth patch; an
  organization named only by an acronym the audience may not know is a
  detail patch. Both are applied by the autopilot.


## Abbreviations the reader does not know (2026-10-15)

A Fogón Lab carousel on why onions make you cry kept its English source's
"LF" (lachrymatory factor) and "LFS" (the enzyme that makes it) on the cover
and five slides, in Spanish, after only "El LF, lo que irrita". Reader v1
allowed an acronym after its full name; the writers took the allowance
without even writing the name.

- **The program refuses them** (`draft2-abbreviations.types.ts`,
  `ABBREVIATION` in the opening, closing, deck and caption): an abbreviation
  the facts spell out ("Lachrymatory factor (LF)", "LFS (lachrymatory factor
  synthase)", "Service de police de l'agglomération de Longueuil (SPAL)") is
  one the source had to explain to its own readers. The post names the thing
  instead, or spells the abbreviation out itself before using it, in its own
  language, the abbreviation's letters those of the name ("la Régie des
  alcools, des courses et des jeux (RACJ)", on that slide or one the reader
  saw before: the cover for slide 2, the opening and earlier slides for the
  deck and the closing; the caption on its own). "Factor lacrimógeno (LF)"
  does not spell LF. The finding names what the abbreviation stands for.
- **Never refused:** everyday abbreviations (DJ, TV, ADN, GPS, COVID…, a
  short list in the module), one the facts use without spelling it out, a
  single letter, a formula, a Roman numeral, words in quotation marks.
- **Reader skill v2:** no abbreviation the reader would not say themselves;
  name the thing or say what it does; never initials from another language.
  The focus planner reads it too: the spine's words are what the writers
  say.
- **Review:** a patch is refused only for the findings it brings. A rule the
  chosen version already breaks (one newer than the carousel) no longer
  refuses every patch on that version.

Run over every stored session, the check finds what the auditor and the
editor saw: RACJ and SPAL in the Houston post, LF and LFS in the onion
carousel, and PSL, CJE, PMSD and CNESST elsewhere. A carousel written before
the rule keeps its abbreviations until the editor edits those slides by hand
(the edit shows the finding) and makes their images again.

### Compounds and a source's own name (2026-10-20)

A Salut Brossard carousel on a board game said "L'AREQ" on the cover and
four slides without saying what it is, though its facts wrote
"L’Association des personnes retraitées de la Centrale des syndicats du
Québec (AREQ-CSQ)". The editor: "in at least one place, not in a title, it
must say that AREQ is…".

- **A compound in brackets is read.** "(AREQ-CSQ)", "(RTL/STM)": each part
  is an abbreviation the source explained. Before, only one token in
  brackets was, so AREQ never counted and no step refused it.
- **The source's own name counts.** AREQ's letters are those of the
  association's older name; no initials of today's name carry them. When
  no initials before the brackets carry an abbreviation's letters, the name
  the source writes there is kept (within its clause, from the word with
  the abbreviation's first letter that carries the most of its letters).
  The finding shows it, and a text that writes that same name before the
  abbreviation spells it out, capitals and elisions aside. A part of it
  does not: "la Centrale des syndicats du Québec (AREQ-CSQ)" spells out CSQ
  only. Initials compare without accents ("l'Éducation" gives E).
- **In a text, never a headline.** The cover is read with slide 2's text
  below it, as a headline with its first paragraph: an abbreviation slide
  2's text spells out may stand on the cover. The finding and reader skill
  v3 say to spell it out once, in a text and never a headline, where it
  first appears or before.

Run over the 31 latest reviewed sessions, the change finds only this
carousel.

## Caveats are not content, and a list's item stands on its own (2026-10-22)

An auditor read the Salut Saint-Jean weekend carousel (five outings, 23–25
October) and scored it 8/10 on looks and poor on use: the cover said "vérifie
billets ou météo", slide 2 explained nothing of the Trinity experience and
ended on "Les autres sorties n'ont pas toutes les mêmes jours", the legends'
slide named the 17th and the 31st, the Relais hanté's pasted photo covered the
practical line, the pumpkin slide named no farm, Carrefour's one sentence was
"la roue de prix exige un achat", and the last slide was "Ta liste de vérifs
avant de partir". The Review had scored it 65 and the editor went on. One
cause: the Focus's two guards were discharged with warnings on every slide
instead of with each item's own details.

The program now refuses, in the same pass (`draft2-caveats.types.ts`,
`draft2-data-marks.ts`):

- **Opening:** `COVER_IS_CHORE`, a verification imperative on the cover
  ("vérifie", "confirme", "check", "verifica"); `BODY_IS_CAVEAT`, a list's
  slide 2 that opens with a condition. `GUARD_LATE` no longer applies to a
  list or a procedure: their guards are the Deck's.
- **Deck, for a list's items:** `ITEM_PLACE_MISSING`, a slide that names none
  of the places or organizers People and places found in its item's fact
  (the whole name or every capitalized word of it: "Ferme Reid" is not named
  by "la ferme"); `DATE_OUTSIDE_PERIOD`, a day outside the period the cover
  announces ("du 23 au 25 octobre", one month, a week at most; the days are
  read in the three languages, a year is never a day); `BODY_IS_CAVEAT`, a
  condition anywhere in the item's one sentence; `GUARD_UNCARRIED`, a guard
  whose facts no slide of the carousel carries.
- **Closing:** `CLOSING_IS_CHECKLIST`, a headline that names a checklist or
  a body with two sentences that carry a condition.
- **Images:** a slide that pastes a verified photo gets the program's words,
  whatever the presentation says (`programWordsOn`), on a band that ends
  above a photo starting in the lower half (`textBandFor`): the photo can no
  longer cover words the model lettered. Sol's "words covered" finding
  already asked for a new image; it now has nothing to find.

Skills: hooks v12 (the cover sells the experience; a list's cover names only a
theme every item shares), decks v6 (an item says what the reader does first,
names its place, keeps to the cover's days, carries no condition), closings v5
(never a checklist), spine v12 (a list's guards are discharged by each item's
practical line, never by a sentence on slide 2). Left to the judges: whether
each item's first line says what one does or sees before the logistics.
