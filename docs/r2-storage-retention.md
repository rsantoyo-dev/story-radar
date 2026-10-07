# R2 storage retention

Generated images live in fal storage for 30 days. Anything Press Craftor must keep longer is copied to the private R2 bucket. Every object it writes there carries its retention class in the key, and one R2 lifecycle rule per class deletes it. Nothing in the app deletes these objects on a timer.

## Classes

| Class | Prefix | Kept for | What goes there |
| --- | --- | --- | --- |
| `7d` | `<prefix>/retention/7d/` | 7 days | Delivery JPEGs of a frozen package that has not been published |
| `180d` | `<prefix>/retention/180d/` | 180 days | Approved generated images, edit bases |
| `permanent` | `<prefix>/retention/permanent/` | Until deleted on purpose | Delivery JPEGs of published packages (the exact files sent to Instagram or Facebook) |

Non-approved variants are not copied: they stay in fal and disappear after 30 days, as before.

The days live in `scripts/r2-lifecycle-rules.mjs`; the class names live in `src/app/modules/stories/r2-retention.ts`. A test fails if they disagree.

## How images get there

- **On approval**, the image is copied from fal to the `180d` class. If the copy fails, approval still succeeds.
- **Every hour**, `.github/workflows/storage-maintenance.yml` calls `/api/internal/storage-maintenance/tick`. It copies approved images still inside fal's window that have no R2 copy yet, oldest first. It also moves the delivery files of published packages to `permanent`.
- **When a publication confirms**, its delivery files move to `permanent` right away. The hourly pass retries if that copy fails.
- **Reads** (download, freezing a package, edit bases) use the R2 copy when there is one and fall back to fal.

## Setup

1. Apply the lifecycle rules once, then again whenever the days change:

   ```bash
   npm run r2:lifecycle            # shows what would change
   npm run r2:lifecycle -- --apply # writes the rules
   ```

   It needs the `CLOUDFLARE_R2_*` variables and an access key allowed to edit the bucket's lifecycle configuration. Rules not created by this script, such as R2's default multipart-abort rule, are kept.

2. The hourly workflow uses the auto-collection worker settings (`AUTO_COLLECTION_WORKER_URL` variable and `AUTO_COLLECTION_WORKER_SECRET` secret). If those are set, nothing else is needed.

## Not covered yet

- Objects written before this change keep their old keys outside `retention/` and are never expired. This includes delivery JPEGs of packages that were never published, and edit bases stored with brand assets.
- The studio still shows approved images through their fal URL. After 30 days the image is safe in R2, but those previews stop loading until they read the R2 copy through an authenticated route.
- Documentary outputs, brand assets, characters and documents keep their current keys and have no expiry.
