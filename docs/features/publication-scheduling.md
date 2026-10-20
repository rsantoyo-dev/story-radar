# Scheduled publication

Date: 2026-10-19. The editor asked whether posts can be scheduled "using
Meta's platform", and whether a page has to stay open for it.

## What Meta allows

- **Facebook Pages**: native scheduling (`published=false` +
  `scheduled_publish_time`, 10 minutes to 30 days ahead). Not used yet: our
  Facebook post is several unpublished photos attached to one feed post, and
  whether those photos survive until a scheduled time (a secondary source says
  unpublished photos are deleted after about 24 hours) has to be proven on one
  real post first. A natively scheduled post would also show in Business
  Suite's planner.
- **Instagram**: no scheduling in the publishing API: `media_publish`
  publishes at once, and a media container expires 24 hours after it is
  created. Meta's documentation says an app that lets people schedule keeps
  the post and publishes it at the time.

So both channels are scheduled the same way, by the app: one path, the one
the immediate send already proved live.

## How it works

1. The Publish confirmation (`RunPublishActions`, Draft 2's publish screen)
   has **Publish now** or **Schedule for later** with a date and time in the
   browser's time zone (10 minutes to 6 days ahead in the field).
2. `POST …/publication-job` with `publishAt` opens the order as
   `scheduled` (`instagram_publication_jobs.publish_at`, migration 0116). The
   server checks the window (`schedulePublishAt`: at least 5 minutes from now,
   at most 6 days after the freeze, because the frozen delivery JPEGs sit in
   R2's 7-day class until published) and keeps the frozen package and its
   delivery links valid until the time plus two hours (`keepPackageUntil`;
   they are frozen for 24 hours). The content stays exactly as frozen.
3. No step runs a `scheduled` order: the run returns at once, the claim query
   never selects it, and a page reading it does not poll every few seconds.
4. **The server publishes it, no page open**: the publication worker
   (GitHub Actions, every 5 minutes, calling `/api/internal/instagram-
   publications/resume` on production) first queues every scheduled order
   whose time has come (`promoteDueScheduledJobs`, which starts its delivery
   window), then runs it like any order. A page open at that time queues it
   too (reconcile-on-read). Expect it within about 5 to 15 minutes of the time.
5. Before its time the order can be **sent now** (`PATCH` `publish-now`) or
   **cancelled** (`cancel-schedule`): nothing was sent, so the row goes and the
   same post can be published or scheduled again. While it waits, the draft
   offers no second send to that channel (`UNRESOLVED_SEND_STATUSES`).
6. If the approvals change before the time, the package goes stale and the
   order is suspended at its time instead of publishing old content.

## Safety with the shared database

Production may run code older than this change against the same database. A
`scheduled` row is invisible to it: its claim query selects only the statuses
it knows, so an older worker can never publish a scheduled post early; it
simply does nothing with it until production runs this code. **Scheduling
needs this code deployed to production**, since the worker calls production.

## Not done

- Facebook's native scheduling (see above), and so Business Suite's planner.
- Scheduled posts on the Today board.
