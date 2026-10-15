# Logo versions

Since 2026-10-15 a Topic's creative profile can hold several versions of its
logo besides the main one, and Draft 2 places the right one on each slide.

## What the editor sets

In **Brand logo** (creative profile):

- **Main logo:** the uploaded PNG, as before, plus **Made for**: light
  backgrounds (positive), dark backgrounds (negative) or any background
  (alpha, the default). The main logo is always a full logo.
- **Logo versions:** up to 8 more PNGs. Each has:
  - a **Shape**: full logo or symbol only;
  - a **Made for**: light, dark or any background.
  An upload guesses the shape (a version clearly squarer than the main logo
  is its symbol) and starts as "any background".
- **Inner slides show** (only when the logo is on all units): the full logo
  or the symbol alone. With no symbol uploaded, the inner slides keep the
  full logo.

Settings live in the `brand_overlay` JSON (`versions`, `innerForm`,
`mainTone`); no migration. Every version must be one of the Topic's uploaded
logos (`saveCreativeProfile`). Reads attach each version's public metadata
(`versionAssets`) for the previews.

## What Draft 2 does

- **Form per slide** (`creativeLogoFormForSlide`): the cover shows a full
  logo; the other slides the inner form.
- **Candidates** (`creativeLogoVersionsForSlide`): the versions of that form,
  else the full ones, else any. The main logo is a candidate.
- **The reserved slot** (`creativeLogoZoneSize`): the prompt's exclusion zone
  and the page number use proportions that hold every candidate of the
  slide: the symbol's square on an inner slide, the full logo's band on the
  cover.
- **The choice** (`chooseCreativeLogoVersion`), made on the finished image
  right before the logo is composited:
  1. Each candidate is measured where it would go: the CIE lightness of the
     image behind its pixels (the backdrop blended in) and how far its own
     pixels differ from it, weighted by its opacity.
  2. The background is light (60 or more), dark (40 or less) or mixed.
  3. A light background takes a positive version, a dark one a negative, a
     mixed one an alpha; each takes an alpha next. Among the same kind, the
     one that stands out most, then the first listed (the main logo).
  4. A version that would all but vanish (less than 20 points from what is
     behind it) gives way to one that reads at least 10 points better,
     whatever its label.
- **Record:** the attempt keeps `logo: { form, tone, assetId }`.

Compositing goes through `compositeStoredCreativeBrandVersion`
(manage-creative-assets.ts), which checks each PNG's sha256 and reads each
one once per request. v1 ignores the versions: it composites the main logo
as before.

## Checked on real covers

The rule was run on 18 stored covers of Hello Austin, Salut St-Jean and Salut
Brossard with a white version of each logo standing in for a negative. Every
cream or light cover kept the main logo; the one cover whose logo sits on a
dark photo took the negative; the two mid-tone covers kept the sticker-style
main logo, which reads on any background.
