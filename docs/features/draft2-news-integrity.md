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

