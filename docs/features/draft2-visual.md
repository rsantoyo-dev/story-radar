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
| Funnel | 3 scripts (2 for a carousel of more than 10 slides) → Sol proposes 1 → 2 revised (1 for a long carousel) + Sol's as written + as edited → Sol's pick; round 1 at medium effort |
| Scope | the script only; images are a later step that reuses v1's generator |

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
     never sent to a model, or rejects them all.
   - **Places** (at most 6), only with a complete geo scope:
     - `documentaryProviders().resolve` for the Wikidata identity;
     - `.photo` for a Commons photo, else `openversePlacePhoto`;
     - a map is possible when there are coordinates.
   - **Organizations** are never looked up and never drawn.
   - **The story's active photos and the Topic's character roster** (only
     characters with a reference image) are kept too.
3. **Decisions:** confirm, reject or reopen a person, and the characters
   choice (`auto` | `on` | `off`, which reads the roster again). Each
   decision bumps the inventory's version.
4. **A new search** keeps every confirmed or rejected person and the
   characters choice.

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
- `peopleAndPlaces`: each entity with what it may show, and the story's
  photos
- `characters` and `characterChoice`
- `verifiedFacts`

The instructions add the brand brief, the visual identity in full
(`resolveCreativeVisualGuidance`) and the visual mode.

**A script:**
- `concept`, `cast` and `motif`;
- `characterPlan { use, characterIds, role }`;
- one slide per carousel slide: `beat` (what the image adds), `direction`
  (≤ 700 characters), `need` (v1's `visualNeed`), `characterIds` (≤ 2) and
  `references` (entity and story photo ids).

**Criteria:** narrative, continuity, brand, truth, fit, craft, focus.
Accepted at overall ≥ 95 with every criterion ≥ 85. The judge's issue codes
are `ILLUSTRATES_TEXT`, `BREAKS_CONTINUITY`, `OFF_BRAND`, `LOOKS_AI`,
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

**The output keeps v1's slide contract** (`visualDirection`, `visualNeed`,
`characterIds`, story references), so the image step can feed
`buildCreativeImagePrompt`.

## 5. Shared funnel changes

- A funnel step's plan may be chosen per run (already used by the deck).
- `newRun` receives the profile, so the run records the visual mode.

## 6. Persistence, API, canvas

- **Columns:** `draft2_sessions.inventory` and `draft2_sessions.visual`
  (jsonb, additive migration 0105). `aliveSince()` covers both steps.
- **People and places:** `POST /api/radar/draft2/inventory`
  `{ storyId, sessionId }`; `PATCH` `{ sessionId, action, … }`.
- **Visual script:** `POST /api/radar/draft2/visual`
  `{ storyId, sessionId, continue? }`; `PATCH` `{ sessionId, candidateId }`.
- **Canvas, step 6:**
  - the characters choice;
  - people with their Commons candidates (thumbnail, author and license,
    "This is them" or "None of these");
  - places with their photo and map;
  - organizations and story photos.
- **Canvas, step 7:**
  - the funnel view, with the chosen script's concept, motif, cast and
    characters;
  - each slide's words beside its beat, direction, kind of image and
    material;
  - a notice when the deck or the people and places changed since the
    script.

## 7. Tests

- `draft2-inventory.types.test.ts`: the name check, carried decisions, the
  editor's actions, material, and what the models read.
- `draft2-inventory.test.ts`: the extraction, the lookups and their
  failures, confirming and choosing, a new search, prerequisites.
- `draft2-visual.types.test.ts`: the carousel and plan, parsing, every
  program finding, duplicates, the requests.
- `draft2-visual.test.ts`: the context and instructions, the rounds, a long
  carousel, prerequisites, resuming, choosing.
- `draft2-skills.test.ts`: the visual scripts rubric matches the constants.

## 8. Out of scope

- Generating the images, which will reuse v1's prompt builder, references
  and image review.
- The publication caption, which carries photo credits.
