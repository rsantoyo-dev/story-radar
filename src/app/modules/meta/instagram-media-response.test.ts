import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInstagramMediaListResponse } from "./instagram-media-response";
import { MetaGraphApiError } from "./meta-token-response";

test("parses an image post with no children", () => {
  const { media, nextCursor } = parseInstagramMediaListResponse({
    data: [
      {
        id: "1789",
        media_type: "IMAGE",
        media_product_type: "FEED",
        permalink: "https://www.instagram.com/p/abc/",
        caption: "Hola",
        media_url: "https://scontent.example/img.jpg",
        timestamp: "2026-09-01T10:00:00+0000",
      },
    ],
  });
  assert.equal(media.length, 1);
  assert.equal(media[0].externalId, "1789");
  assert.equal(media[0].mediaType, "IMAGE");
  assert.equal(media[0].caption, "Hola");
  assert.equal(media[0].publishedAt, "2026-09-01T10:00:00.000Z");
  assert.deepEqual(media[0].children, []);
  assert.equal(nextCursor, undefined);
});

test("parses a carousel as one publication with ordered children", () => {
  const { media } = parseInstagramMediaListResponse({
    data: [
      {
        id: "42",
        media_type: "CAROUSEL_ALBUM",
        timestamp: "2026-08-20T09:00:00+0000",
        children: {
          data: [
            { id: "42a", media_type: "IMAGE", media_url: "https://x/1.jpg" },
            { id: "42b", media_type: "VIDEO", thumbnail_url: "https://x/2.jpg" },
          ],
        },
      },
    ],
  });
  assert.equal(media.length, 1);
  assert.equal(media[0].children.length, 2);
  assert.deepEqual(
    media[0].children.map((c) => c.externalId),
    ["42a", "42b"],
  );
  assert.equal(media[0].children[1].mediaType, "VIDEO");
});

test("drops entries missing an id or an unparseable timestamp", () => {
  const { media } = parseInstagramMediaListResponse({
    data: [
      { media_type: "IMAGE", timestamp: "2026-09-01T10:00:00+0000" },
      { id: "no-time", media_type: "IMAGE" },
      { id: "bad-time", media_type: "IMAGE", timestamp: "not-a-date" },
      { id: "ok", media_type: "IMAGE", timestamp: "2026-09-01T10:00:00+0000" },
    ],
  });
  assert.deepEqual(
    media.map((m) => m.externalId),
    ["ok"],
  );
});

test("returns nextCursor only when paging.next is present", () => {
  assert.equal(
    parseInstagramMediaListResponse({
      data: [],
      paging: { cursors: { after: "CURSOR" }, next: "https://graph/next" },
    }).nextCursor,
    "CURSOR",
  );
  assert.equal(
    parseInstagramMediaListResponse({
      data: [],
      paging: { cursors: { after: "CURSOR" } },
    }).nextCursor,
    undefined,
  );
});

test("an empty data array is a valid empty page", () => {
  assert.deepEqual(parseInstagramMediaListResponse({ data: [] }), { media: [] });
});

test("a body that is not { data: [...] } throws instead of being an empty page", () => {
  for (const bad of [null, "nope", 200, [], {}, { data: null }, { data: "x" }]) {
    assert.throws(
      () => parseInstagramMediaListResponse(bad),
      MetaGraphApiError,
    );
  }
});
