# Discover: the candidate views read the open candidates

Date: 2026-10-19. The editor: "the filters in Discover do not work well;
review the whole Discover functionality".

## What was wrong

The dashboard's collected list (`getEditorialDashboardStats`,
`collectedStories`) is every story of the Topic: the ones the collection kept,
the ones it set aside (below the local floor, or marked the same news as
another), the ones the editor rejected and the ones already selected. The four
candidate views (All, Needs evaluation, Ready to select, Evaluated) counted all
of them, so on 2026-10-19:

- canada en breve showed 1,013 candidates, 778 of them set aside at
  collection (local score about 10, none with an AI evaluation).
- Salut Brossard showed 260, 110 set aside; Tech 448, 67 set aside.
- "Needs evaluation" counted the set-aside stories, which the AI evaluation
  never scans (`findEditorialEvaluationCandidates` keeps the local floor), so
  "Evaluate with AI" never drained it: the filters looked broken.
- Stories the editor had decided (selected, rejected) stayed in Candidates
  beside the open ones.

Two smaller holes: a publication filter saved in the session for the
candidates list (no control shows one there) could hide every story with
nothing on screen to say so; and a score minimum of 0 hid the stories without
an evaluation while reading "≥ 0".

## What changed

`src/app/discover-candidates.core.ts` (pure, tested) gives each collected
story a stage and each view its stories:

- **decided**: the editor approved or rejected it, or it is selected or
  published;
- **set aside**: the same news as another candidate (`duplicateOfStoryId`),
  failed in processing, or rejected by the collection under the Topic's local
  floor without an AI evaluation (a story the AI already read stays open
  whatever the floor is today; a rejected story above the floor is open too,
  since the evaluation under a profile scans it);
- **open**: everything else.

The views: All, Needs evaluation, Ready to select and Evaluated read the open
stories; **Set aside** and **Decided** are views of their own, so nothing
disappears. The heading over the list says which view is on and what it
holds; the Discover hero reads "N open · M set aside · T collected". The
saved view is parsed by `parseCandidateView` (older states' two flags still
work). The candidates list always ignores a saved publication filter; a score
minimum below 1 is no minimum.

## Addendum, the same day: the controls threw

The dev server's log showed the real reason the filters "did not work": every
one of the six controls (Sort by, Then sort by, Story date, both score
minimums, Hide below the local floor) read `event.currentTarget` inside the
state updater, which React runs after the handler, when `currentTarget` is
null: each change threw `Cannot read properties of null (reading 'value')`.
Each handler now reads the value first; `src/app/react-event-updaters.test.ts`
fails on any updater that reads the event again.

## Checked and left as it was

- **Search** (`#discover/search`): the line's period, time zone, feeds and AI
  research travel in the collection context (`collectionContext`); a period
  override and a research question apply to that search only; RSS items and
  AI discoveries outside the window or the allowed domains are dropped
  (`inEditorialWindow`, `allowedEditorialUrl`). The `maxAgeHours` query
  parameter the client still sends is ignored when a line is chosen.
- **More filters**: editorial line (associations from the lines API, 2,000
  newest), story date (`publishedAt`, else `lastSeenAt`), score minimums (they
  hide stories without an evaluation, as the note under them says), the local
  floor toggle, the second sort key. The line filter guards against another
  Topic's data.
- **Diagnostics** reads the latest collection run only.

## Watch

Whether the editor wants a one-click way to bring a set-aside story back
(today: clear a duplicate on its card; lower the profile's local floor and
evaluate again for the rest).
