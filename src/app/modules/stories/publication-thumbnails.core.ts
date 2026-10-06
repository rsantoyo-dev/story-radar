/**
 * Picks the thumbnail candidates shown for a published Story.
 *
 * Preference order, newest publication first within each tier:
 *   1. The cover of the exact frozen package that was published (the asset
 *      version recorded in its delivery files). This is what went out.
 *   2. The cover of the image batch an editor linked to an imported post.
 *   3. Instagram's own thumbnail of a linked post. These are signed URLs that
 *      expire between syncs, so they are a fallback the client may fail on.
 *
 * Nothing here reads mutable current drafts: a thumbnail must show what was
 * published, not what the draft looks like now.
 */

export type PublishedPackageCover = {
  storyId: string;
  packageId: string;
  publishedAt: Date | null;
};

export type LinkedInstagramMediaThumbnail = {
  storyId: string;
  publishedAt: Date;
  publishedPackageId: string | null;
  linkedBatchId: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  accessState: string;
};

export type PublicationThumbnailInput = {
  /** App-sent publication jobs that confirmed. */
  publishedPackages: PublishedPackageCover[];
  linkedMedia: LinkedInstagramMediaThumbnail[];
  /** Cover image URL of each frozen package, resolved from its delivery files. */
  packageCoverUrls: ReadonlyMap<string, string>;
  /** Cover image URL of each linked image batch. */
  batchCoverUrls: ReadonlyMap<string, string>;
};

export const MAX_PUBLICATION_THUMBNAIL_CANDIDATES = 3;

export function resolvePublicationThumbnails(
  input: PublicationThumbnailInput,
): Map<string, string[]> {
  const tiers = new Map<string, Array<{ tier: number; at: number; url: string }>>();
  const add = (storyId: string, tier: number, at: Date | null, url: string | null | undefined) => {
    if (!url || !isDisplayableImageUrl(url)) return;
    const list = tiers.get(storyId) ?? [];
    list.push({ tier, at: at?.getTime() ?? 0, url });
    tiers.set(storyId, list);
  };

  for (const job of input.publishedPackages) {
    add(job.storyId, 1, job.publishedAt, input.packageCoverUrls.get(job.packageId));
  }
  for (const media of input.linkedMedia) {
    if (media.publishedPackageId) {
      add(media.storyId, 1, media.publishedAt, input.packageCoverUrls.get(media.publishedPackageId));
    }
    if (media.linkedBatchId) {
      add(media.storyId, 2, media.publishedAt, input.batchCoverUrls.get(media.linkedBatchId));
    }
    if (media.accessState === "accessible") {
      // Videos and reels expose a still in thumbnail_url; images and
      // carousels expose the (first) image in media_url.
      add(media.storyId, 3, media.publishedAt, media.thumbnailUrl ?? media.mediaUrl);
    }
  }

  const result = new Map<string, string[]>();
  for (const [storyId, list] of tiers) {
    const urls = [
      ...new Set(
        list
          .sort((left, right) => left.tier - right.tier || right.at - left.at)
          .map((entry) => entry.url),
      ),
    ].slice(0, MAX_PUBLICATION_THUMBNAIL_CANDIDATES);
    result.set(storyId, urls);
  }
  return result;
}

/** Lowest unit order wins; within it, the highest approved version. */
export function pickCoverAsset<
  T extends { unitOrder: number; version: number; imageUrl: string | null },
>(assets: readonly T[]): T | undefined {
  return [...assets]
    .filter((asset) => asset.imageUrl)
    .sort((left, right) => left.unitOrder - right.unitOrder || right.version - left.version)[0];
}

function isDisplayableImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
