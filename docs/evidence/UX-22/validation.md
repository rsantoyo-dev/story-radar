# UX-22 validation record — September 28, 2026

## Safe fixture coverage

The development-only `/ui-showcase` page renders two distinct Topic palettes and eight non-production editorial states: first use, many Stories, multilingual copy, missing evidence, stale script, historical image, partial publishing permission, and uncertain publication. These are static UI fixtures and cannot send a provider request.

## Browser checks completed

An isolated localhost development copy was used so the existing project server and its files were not interrupted. Headless Chrome hydrated the page and opened the dialog fixture. The dialog focused its first field, kept Tab focus inside, closed on Escape, returned focus to the trigger, inactivated the background while open, and inherited the Press green Topic palette.

| Viewport | Screenshot | Document width | Horizontal overflow |
| --- | --- | ---: | --- |
| 390 px | [Showcase](showcase-390.png) | 390 px | None observed |
| 768 px | [Showcase](showcase-768.png) | 768 px | None observed |
| 1024 px | [Showcase](showcase-1024.png) | 1024 px | None observed |
| 1440 px | [Showcase](showcase-1440.png) | 1440 px | None observed |

The effective primary colors were `#246b4a` and `#246b8e`. At reduced-motion preference, the loading indicator's computed animation was `none`.

Repository checks completed: `npm run lint`, `npm run build`, and `npm test` (979 passing tests). These checks validate code and focused interactions; they do not replace the authenticated UX tasks below.

## Local authenticated review

The production build was launched locally with `.env.local` loaded explicitly. The repository's `.env.production.local` contains placeholders and otherwise masks the working local values under `next start`. The browser used the existing “frontend design systems” Topic for a read-only pass. At 390 px, Today and Production rendered their real Topic data and primary actions; their screenshots were kept under `/tmp` and were not added to the repository. No editorial or publishing action was submitted.

The local database is behind the current schema: requests for Sources and Topic documents fail because `knowledge_documents.object_key` does not exist. The column is defined in `drizzle/0078_lush_night_thrasher.sql`. This prevents a trustworthy full-screen authenticated review of Sources and related flows. The partial browser matrix was stopped rather than recording those failed screens as passes. No migration was run against the user's database.

## Remaining release checks

- Authenticated Story, source, creative, channel, and publication screens at the four widths and actual 200% browser zoom; align the local database schema first.
- Computed contrast measurements, complete keyboard and screen-reader inspection, and touch-target measurements in the real screens.
- End-to-end editorial tasks with mocked sends, including recovery and history.
- Observed tasks with three representative editors. No participant results are available yet.

These limits keep UX-22 and the other UX stories in progress. The screenshots show shared fixtures only; they do not prove the complete editorial workflow.
