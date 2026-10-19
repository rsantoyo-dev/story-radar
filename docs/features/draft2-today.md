# Today is Draft 2; the v1 studio retired

Date: 2026-10-19. The editor: "remove the v1 flow, we will not use it any
more, and gather what we have of v2 in the Today section; the old links stay
alive but are not shown, except on stories already published".

## What went

- The v1 studio page (`creative-draft-workspace.tsx`, 4,485 lines) and its
  panels: the hook tournament, the editor's facts, the documentary panel,
  the brand image editor, `workspace-error-action`.
- From Today, for a day: "Prepare my day" (`daily-preparation-panel.tsx`)
  and "What should we publish today?" (`daily-editorial-planner-panel.tsx`).
  **Back the same day** (the editor: "the software must choose what is best
  for today, that already existed"), through Content and into Draft 2; see
  "Today" below and `docs/features/prepare-my-day.md`.
- The API routes only they called: `daily-planner`, `daily-preparation`,
  `stories/[id]/editor-facts`, `stories/[id]/creative`, `creative/briefs`,
  `creative/drafts/[id]` (save, approve, hooks, fidelity), `companion`,
  `recover`, `edit-requests`, `assets` (generation and download),
  `creative/documentary`.

## What stays, and why

- The server modules of v1 (`manage-creative-content`, the generators, the
  tournament): Draft 2's images import them in a chain and publishing reads
  v1's rows; retiring them is a refactor of its own.
- The publication path: `publication-package`, `publication-job`,
  `publication-candidate`, `creative/assets/[id]` (the images' bytes),
  `stories/[id]/instagram`, the channels and candidate panels,
  `run-publish-actions`. Draft 2 publishes through them.
- The scheduled reader (`auto-collection.ts`): its due run collects,
  evaluates and selects (its target step was already "recommend"); a scoop
  is now approved and its **content** prepared (`targetStep: "content"`),
  ready for Draft 2, instead of a v1 brief and draft. The urgent banner says
  "Preparing its content…" and "Content ready: open it in Draft 2".
- `story-instagram-results.tsx`, for the published story's page.

## The old links

`/topics/[topicId]/stories/[storyId]` (with `tab`, `draftId`,
`preparationRunId`, `editorialRunId`) stays a route:

- with `tab=publication` and no Draft 2 session, it is the page of a story
  published with the earlier studio: its title, its Instagram results and
  the way into Draft 2 (`published-story-page-client.tsx`);
- otherwise it redirects to the story in Draft 2, on the publish screen when
  the link asked for the publication.

`storyWorkspace` sends only `tab: "publication"` to that page; a v1 draft or
run in a link opens Draft 2. The dashboard's "Review publication" and "Open
Story" pass `tab: "publication"`, so a Draft 2 story lands on its publish
screen and a v1-published one on its page. `storyHref` now builds that link.

## Today

`#today` shows the urgent stories' banner, then **Prepare my day** and
**What should we publish today?** (restored on 2026-10-19: the run collects,
evaluates, selects today's story, approves it and prepares its content; the
planner's cards view or prepare the content, approve the story and open it
in Draft 2; the routes `/api/radar/daily-planner` and
`/api/radar/daily-preparation` are back, the preparation offering the steps
through Content only, `DRAFT2_PREPARATION_STEPS`), then **Draft 2 · Today**
(`draft-2-today-panel.tsx`, logic in `draft-2-today.core.ts`): every story in
production once, from `GET /api/radar/draft2/sessions?topicId` (the latest
session per story with its step, status, whether it is alive, approval, cost
and time, summed in SQL: `listDraft2SessionSummaries`), in groups:

| Group | When | Opens |
|---|---|---|
| Needs you | needs-review, failed, or running with no heartbeat | the step |
| In progress | running and alive | the step |
| Ready to publish | approved, not published | Publish |
| Waiting to continue | the last step finished (status ready) | the step |
| Not started | selected, no session | the canvas |
| Published today | a destination published today | Publish |

Each card: source, last change, pipeline, the state in a line (the error's
first line when it failed), the cost, and one button. The panel reads the
sessions again every 30 s while one runs. The Topic overview's Production
card counts Draft 2 (Selected · In Draft 2 · Needs you · Approved · Ready /
published) instead of v1 briefs, drafts and images.

## Not done

- Removing the v1 server modules (the refactor above).
- The scoop settings panel still says "prepare scoops ahead"; it now means
  their content.
