# Full articles before the evaluation, and good stories left for review

**Since:** 2026-10-27. **Asked for:** "la idea es que no suceda de nuevo… siempre
tratar de traer la noticia completa; si la noticia es buena puede quedar como
buena pero necesita revisión: no seleccionarla automáticamente, pero sí en la
lista de preseleccionadas" (Salut Brossard, *La place de la Gare s'illumine
avec Jardin céleste*).

## What went wrong

brossard.ca has no feed for its `/actualites/`; Salut Brossard reads the city
through a Google News search (`site:brossard.ca`). A Google News item links to
`news.google.com/rss/articles/<id>`, and the collector stored the feed's text,
which for Google is the title. In 21 days, 713 of 761 evaluated Brossard
stories carried only an excerpt; the evaluator left the good ones "for
review" ("l'extrait répète seulement le titre"), and a review decision reached
neither the shortlist nor the day's plan. The article had been collected on
9 October; nobody saw it.

## What changed

1. **Google News links resolve to the publisher** —
   `sources/rss/google-news-link.ts`. The article page carries a signature
   and a timestamp; Google's own resolver answers them with the publisher's
   address (two requests, nothing stored). `prepareStoryContent` resolves the
   link before fetching, so "Prepare content" and every fetch below work for
   Google-proxied sources. A link Google will not resolve is a failed fetch,
   recorded like any other.
2. **The full article before the judgment** —
   `enrich-candidates-before-evaluation.ts`, inside
   `evaluateEditorialCandidates`. Candidates with only an excerpt (or
   nothing) are fetched from their publisher, four at a time, within
   `AI_ENRICH_BEFORE_EVALUATION_MS` (45 s by default; 0 turns it off), the
   strongest local signal first, at most 20 per run. Every attempt is stored
   in `story_content_enrichments`; a failed or blocked one is not retried for
   7 days. What gains content is read again before the model, since the
   content changes the evaluation's input hash — a story evaluated on its
   title is evaluated anew on its article.
3. **A review decision is never the pick** — `withoutReviewPicks` in
   `daily-editorial-planner.types.ts`, applied to every plan. The planner is
   told (prompt v4) and the program enforces it: a recommendation or an
   alternative the evaluation left for review moves to the deferred with its
   reason ("Needs a human's look before selection…"), the first shortlisted
   alternative stands in, and with none left the day has no automatic pick.
   "Prepare my day" therefore never runs a review story.
4. **Good but review is listed** — `GOOD_BUT_REVIEW_MIN_SCORE = 70`. The
   dashboard's shortlist (query and "Shortlist" view) includes a story the
   evaluation left for review with an editorial score of 70 or more, marked
   "Good, needs review"; it is not selectable in bulk (not `reviewable`), the
   existing promote action selects it by hand.

## Rules kept

- Nothing changes a saved evaluation or a human decision; the re-evaluation
  of an enriched story is a new row under a new input hash.
- Paywalled or blocked publishers stay blocked (`ArticlePaywallError`,
  `ArticleAccessBlockedError`); the reader fallback runs on the publisher's
  address, never on Google's.
- Private, malformed and oversized addresses are refused as before
  (`validatePublicArticleUrl`).

## Not yet

- The story's `canonical_url` stays the Google address (a unique key); the
  resolved address is kept in `story_content_enrichments.resolved_url`. Two
  copies of one article (feed and manual add) still rely on the semantic
  duplicate detection.
- A direct `brossard.ca/actualites` reader (no feed exists) would catch the
  notices Google indexes late or not at all.
