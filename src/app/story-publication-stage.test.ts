import assert from "node:assert/strict";
import test from "node:test";

import { storyPublicationStage } from "./story-publication-stage";

test("unpublished selected stories stay in Production", () => {
  assert.deepEqual(storyPublicationStage({}), {
    active: true,
    publishedDestinations: [],
    pendingPlatforms: [],
  });
});

test("confirmed Instagram sends leave the active queue", () => {
  const stage = storyPublicationStage({
    confirmedPublications: [{ platform: "instagram", publishedAt: "2026-09-27T12:00:00Z", postUrl: "https://instagram.com/p/example" }],
  });
  assert.equal(stage.active, false);
  assert.equal(stage.publishedDestinations[0]?.platform, "instagram");
});

test("another pending destination keeps a published Story active", () => {
  const stage = storyPublicationStage({
    publications: [{ platform: "facebook", status: "scheduled" }],
    confirmedPublications: [{ platform: "instagram", publishedAt: "2026-09-27T12:00:00Z" }],
  });
  assert.equal(stage.active, true);
  assert.deepEqual(stage.pendingPlatforms, ["facebook"]);
});

test("confirmed publication supersedes stale tracking on its platform", () => {
  const stage = storyPublicationStage({
    publications: [{ platform: "instagram", status: "draft" }],
    confirmedPublications: [{ platform: "instagram", publishedAt: "2026-09-27T12:00:00Z" }],
  });
  assert.equal(stage.active, false);
  assert.deepEqual(stage.pendingPlatforms, []);
});

test("the latest confirmed post represents a platform in Published", () => {
  const stage = storyPublicationStage({
    publications: [{ platform: "instagram", status: "published", publishedAt: "2026-09-25T12:00:00Z" }],
    confirmedPublications: [
      { platform: "instagram", publishedAt: "2026-09-26T12:00:00Z" },
      { platform: "instagram", publishedAt: "2026-09-27T12:00:00Z", postUrl: "https://instagram.com/p/latest" },
    ],
  });
  assert.equal(stage.publishedDestinations.length, 1);
  assert.equal(stage.publishedDestinations[0]?.postUrl, "https://instagram.com/p/latest");
});
