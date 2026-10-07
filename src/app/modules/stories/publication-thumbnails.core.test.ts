import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PUBLICATION_THUMBNAIL_CANDIDATES,
  pickCoverAsset,
  resolvePublicationThumbnails,
  type LinkedInstagramMediaThumbnail,
} from "./publication-thumbnails.core";

const media = (
  overrides: Partial<LinkedInstagramMediaThumbnail>,
): LinkedInstagramMediaThumbnail => ({
  storyId: "story-1",
  publishedAt: new Date("2026-10-01T12:00:00Z"),
  publishedPackageId: null,
  linkedBatchId: null,
  mediaType: "IMAGE",
  mediaUrl: null,
  thumbnailUrl: null,
  accessState: "accessible",
  ...overrides,
});

test("prefers the exact published cover over a linked batch and Instagram's signed URL", () => {
  const result = resolvePublicationThumbnails({
    publishedPackages: [
      { storyId: "story-1", packageId: "pkg-1", publishedAt: new Date("2026-10-01T12:00:00Z") },
    ],
    linkedMedia: [
      media({
        linkedBatchId: "batch-1",
        mediaUrl: "https://scontent.cdninstagram.com/v/post.jpg?sig=abc",
      }),
    ],
    packageCoverUrls: new Map([["pkg-1", "https://v3.fal.media/files/cover.png"]]),
    batchCoverUrls: new Map([["batch-1", "https://v3.fal.media/files/batch-cover.png"]]),
  });

  assert.deepEqual(result.get("story-1"), [
    "https://v3.fal.media/files/cover.png",
    "https://v3.fal.media/files/batch-cover.png",
    "https://scontent.cdninstagram.com/v/post.jpg?sig=abc",
  ]);
});

test("orders the newest publication first within a tier and removes duplicates", () => {
  const result = resolvePublicationThumbnails({
    publishedPackages: [
      { storyId: "story-1", packageId: "old", publishedAt: new Date("2026-09-01T00:00:00Z") },
      { storyId: "story-1", packageId: "new", publishedAt: new Date("2026-10-01T00:00:00Z") },
    ],
    linkedMedia: [media({ publishedPackageId: "new" })],
    packageCoverUrls: new Map([
      ["old", "https://v3.fal.media/old.png"],
      ["new", "https://v3.fal.media/new.png"],
    ]),
    batchCoverUrls: new Map(),
  });

  assert.deepEqual(result.get("story-1"), [
    "https://v3.fal.media/new.png",
    "https://v3.fal.media/old.png",
  ]);
});

test("uses the video still for reels and skips inaccessible or unsafe URLs", () => {
  const result = resolvePublicationThumbnails({
    publishedPackages: [],
    linkedMedia: [
      media({
        storyId: "reel",
        mediaType: "VIDEO",
        mediaUrl: "https://scontent.cdninstagram.com/video.mp4",
        thumbnailUrl: "https://scontent.cdninstagram.com/still.jpg",
      }),
      media({
        storyId: "gone",
        accessState: "inaccessible",
        mediaUrl: "https://scontent.cdninstagram.com/gone.jpg",
      }),
      media({ storyId: "unsafe", mediaUrl: "http://example.org/plain.jpg" }),
      media({ storyId: "script", mediaUrl: "javascript:alert(1)" }),
    ],
    packageCoverUrls: new Map(),
    batchCoverUrls: new Map(),
  });

  assert.deepEqual(result.get("reel"), ["https://scontent.cdninstagram.com/still.jpg"]);
  assert.equal(result.has("gone"), false);
  assert.equal(result.has("unsafe"), false);
  assert.equal(result.has("script"), false);
});

test("caps the candidate list", () => {
  const result = resolvePublicationThumbnails({
    publishedPackages: Array.from({ length: 6 }, (_, index) => ({
      storyId: "story-1",
      packageId: `pkg-${index}`,
      publishedAt: new Date(2026, 0, index + 1),
    })),
    linkedMedia: [],
    packageCoverUrls: new Map(
      Array.from({ length: 6 }, (_, index) => [`pkg-${index}`, `https://v3.fal.media/${index}.png`]),
    ),
    batchCoverUrls: new Map(),
  });

  assert.equal(result.get("story-1")?.length, MAX_PUBLICATION_THUMBNAIL_CANDIDATES);
});

test("a cover is the first slide's newest version that has an image", () => {
  assert.deepEqual(
    pickCoverAsset([
      { unitOrder: 2, version: 1, imageUrl: "https://v3.fal.media/2.png" },
      { unitOrder: 1, version: 1, imageUrl: "https://v3.fal.media/1a.png" },
      { unitOrder: 1, version: 3, imageUrl: null },
      { unitOrder: 1, version: 2, imageUrl: "https://v3.fal.media/1b.png" },
    ]),
    { unitOrder: 1, version: 2, imageUrl: "https://v3.fal.media/1b.png" },
  );
  assert.equal(pickCoverAsset([]), undefined);
});
