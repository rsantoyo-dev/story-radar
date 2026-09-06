import assert from "node:assert/strict";
import { test } from "node:test";

import {
  instagramPermalinkShortcode,
  sameInstagramPermalink,
} from "./instagram-permalink";

test("extracts the shortcode from every permalink shape", () => {
  assert.equal(
    instagramPermalinkShortcode("https://www.instagram.com/p/C1a2b3c4d5e/"),
    "C1a2b3c4d5e",
  );
  assert.equal(
    instagramPermalinkShortcode("https://instagram.com/reel/C1a2b3c4d5e"),
    "C1a2b3c4d5e",
  );
  assert.equal(
    instagramPermalinkShortcode("https://www.instagram.com/reels/C1a2b3c4d5e/"),
    "C1a2b3c4d5e",
  );
  assert.equal(
    instagramPermalinkShortcode("https://www.instagram.com/tv/C1a2b3c4d5e/"),
    "C1a2b3c4d5e",
  );
  assert.equal(
    instagramPermalinkShortcode(
      "https://www.instagram.com/press.craftor/p/C1a2b3c4d5e/",
    ),
    "C1a2b3c4d5e",
  );
});

test("ignores query string and hash", () => {
  assert.equal(
    instagramPermalinkShortcode(
      "https://www.instagram.com/p/C1a2b3c4d5e/?igshid=abc&utm_source=ig#comments",
    ),
    "C1a2b3c4d5e",
  );
});

test("rejects non-Instagram hosts and malformed input", () => {
  assert.equal(
    instagramPermalinkShortcode("https://example.com/p/C1a2b3c4d5e/"),
    null,
  );
  assert.equal(
    instagramPermalinkShortcode(
      "https://instagram.com.evil.test/p/C1a2b3c4d5e/",
    ),
    null,
  );
  assert.equal(
    instagramPermalinkShortcode("https://www.instagram.com/press.craftor/"),
    null,
  );
  assert.equal(instagramPermalinkShortcode("not a url"), null);
  assert.equal(instagramPermalinkShortcode(""), null);
  assert.equal(instagramPermalinkShortcode(null), null);
  assert.equal(instagramPermalinkShortcode(undefined), null);
});

test("sameInstagramPermalink matches /p/ and /reel/ of the same media", () => {
  assert.equal(
    sameInstagramPermalink(
      "https://www.instagram.com/p/C1a2b3c4d5e/",
      "https://instagram.com/reel/C1a2b3c4d5e/?igshid=x",
    ),
    true,
  );
  assert.equal(
    sameInstagramPermalink(
      "https://www.instagram.com/p/C1a2b3c4d5e/",
      "https://www.instagram.com/p/Zzzzzzzzzzz/",
    ),
    false,
  );
  assert.equal(sameInstagramPermalink(null, null), false);
  assert.equal(
    sameInstagramPermalink("https://example.com/p/C1a2b3c4d5e/", null),
    false,
  );
});
