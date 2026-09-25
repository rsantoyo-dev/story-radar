import assert from "node:assert/strict";
import test from "node:test";

import { sourceContribution } from "./source-contribution";

test("source identity is stable across repeated acquisitions and preserves provenance", () => {
  const first = sourceContribution({
    sourceType: "article", sourceUrl: "https://example.org/story#section",
    acquiredAt: new Date("2026-09-25T10:00:00Z"), mimeType: "text/html",
    title: "  Story  ", text: " Verified account ", metadata: { language: "en" },
  });
  const second = sourceContribution({
    sourceType: "article", sourceUrl: "https://example.org/story",
    acquiredAt: new Date("2026-09-26T10:00:00Z"), mimeType: "text/html",
  });
  assert.equal(first.externalId, second.externalId);
  assert.equal(first.provenance.sourceUrl, "https://example.org/story");
  assert.equal(first.content.text, "Verified account");
  assert.deepEqual(first.metadata, { language: "en" });
  assert.notEqual(first.acquiredAt, second.acquiredAt);
});

test("uploaded document identity follows bytes while provenance keeps its filename", () => {
  const hash = "a".repeat(64);
  const input = { sourceType: "document" as const, sourceUrl: "https://uploads.example.org/a.pdf", acquiredAt: new Date(), mimeType: "application/pdf", contentHash: hash, originalFilename: "Guide.pdf" };
  const contribution = sourceContribution(input);
  assert.equal(contribution.externalId, `document:${hash}`);
  assert.equal(contribution.provenance.originalFilename, "Guide.pdf");
});

test("source contributions reject credentialed URLs and malformed content hashes", () => {
  const input = { sourceType: "rss" as const, sourceUrl: "https://user:pass@example.org/feed", acquiredAt: new Date(), mimeType: "application/rss+xml" };
  assert.throws(() => sourceContribution(input), /without credentials/);
  assert.throws(() => sourceContribution({ ...input, sourceUrl: "https://example.org/feed", contentHash: "bad" }), /hash/);
});
