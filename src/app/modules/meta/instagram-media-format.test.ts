import assert from "node:assert/strict";
import { test } from "node:test";

import {
  instagramMediaFormat,
  isInstagramMediaFormat,
} from "./instagram-media-format";

test("classifies each Instagram media shape", () => {
  assert.equal(
    instagramMediaFormat({ mediaType: "CAROUSEL_ALBUM" }),
    "carousel",
  );
  assert.equal(
    instagramMediaFormat({ mediaType: "VIDEO", mediaProductType: "REELS" }),
    "reel",
  );
  assert.equal(
    instagramMediaFormat({ mediaType: "VIDEO", mediaProductType: "FEED" }),
    "video",
  );
  assert.equal(instagramMediaFormat({ mediaType: "VIDEO" }), "video");
  assert.equal(instagramMediaFormat({ mediaType: "IMAGE" }), "image");
});

test("is case-insensitive and defaults unknown types to image", () => {
  assert.equal(
    instagramMediaFormat({ mediaType: "video", mediaProductType: "reels" }),
    "reel",
  );
  assert.equal(instagramMediaFormat({ mediaType: "STORY" }), "image");
  assert.equal(instagramMediaFormat({ mediaType: null }), "image");
});

test("isInstagramMediaFormat guards the filter value", () => {
  assert.equal(isInstagramMediaFormat("carousel"), true);
  assert.equal(isInstagramMediaFormat("reel"), true);
  assert.equal(isInstagramMediaFormat("album"), false);
  assert.equal(isInstagramMediaFormat(undefined), false);
});
