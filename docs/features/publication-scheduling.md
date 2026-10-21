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

## Addendum, 2026-10-21: the worker drives an order to the end

A Salut St-Jean carousel scheduled for 06:00 (Toronto) was never posted. The
worker promoted both orders on time, but it advanced each order one step per
pass, and GitHub's "every 5 minutes" ran every 10 to 20: in three passes the
Instagram order had made two containers and the Facebook one none when their
30-minute delivery window closed ("The delivery window expired"). An open page
drives an order every 2.5 seconds, which is why publishing now always worked.
Then the post could not be sent again: confirming it answered with the stopped
order, and the only retry button was in v1's Publication tab, removed on
2026-10-19.

- **One pass drives each order step after step** (`resumePublicationJobs`,
  75 seconds per pass, then no new step; the route allows 120 and the lease
  150). A step that moved the order on is followed after one second; one that
  found Meta still processing a container waits the usual five. A read or a
  request still drives one step, as before.
- **Confirming a stopped post retries its order.** When the server answers a
  publish with an earlier order of the same post that stopped before anything
  was posted (suspended `invalidated` or a retryable failure, `canRetry`), the
  Publish screen retries it by name, now or at the new time. An uncertain
  outcome is never retried here.
- **A retry may be scheduled.** It waits as `scheduled`, its delivery window
  starting at promotion, and its package and delivery links are kept until two
  hours after the new time.
- The confirmation now says "within about 5 to 20 minutes".
