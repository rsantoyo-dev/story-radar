import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedImageArchiveSegments,
  deliverySegments,
  editBaseSegments,
  isFalImageUrl,
  retentionClassOf,
  retentionObjectKey,
  retentionPrefix,
} from "./r2-retention";

const topicId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const packageId = "33333333-3333-4333-8333-333333333333";

test("each kind of object lands in its retention class", () => {
  assert.equal(
    retentionObjectKey("press-craftor", "180d", approvedImageArchiveSegments({ topicId, assetId, version: 3 })),
    `press-craftor/retention/180d/creative-approved/topics/${topicId}/${assetId}/v3.png`,
  );
  assert.equal(
    retentionObjectKey("/press-craftor/", "180d", editBaseSegments({ topicId, id: assetId })),
    `press-craftor/retention/180d/edit-bases/topics/${topicId}/${assetId}.png`,
  );
  assert.equal(
    retentionObjectKey("press-craftor", "7d", deliverySegments("publication-delivery", { topicId, packageId, unitOrder: 2 })),
    `press-craftor/retention/7d/publication-delivery/topics/${topicId}/${packageId}/2.jpg`,
  );
  assert.equal(
    retentionObjectKey("press-craftor", "permanent", deliverySegments("published", { topicId, packageId, unitOrder: 2 })),
    `press-craftor/retention/permanent/published/topics/${topicId}/${packageId}/2.jpg`,
  );
});

test("keys are classified by their retention prefix; legacy keys have none", () => {
  const key = retentionObjectKey("p", "7d", deliverySegments("publication-delivery", { topicId, packageId, unitOrder: 1 }));
  assert.equal(retentionClassOf("p", key), "7d");
  assert.equal(retentionClassOf("p", `p/topics/${topicId}/publication-delivery/${packageId}/1.jpg`), undefined);
  assert.equal(retentionPrefix("p/", "permanent"), "p/retention/permanent/");
});

test("unsafe segments, versions and prefixes are rejected", () => {
  assert.throws(() => retentionObjectKey("p", "7d", ["..", "x"]));
  assert.throws(() => retentionObjectKey("p", "7d", ["a/b"]));
  assert.throws(() => retentionObjectKey("", "7d", ["a"]));
  assert.throws(() => approvedImageArchiveSegments({ topicId, assetId, version: 0 }));
  assert.throws(() => deliverySegments("published", { topicId, packageId, unitOrder: 1.5 }));
});

test("only fal-hosted https images are archivable", () => {
  assert.equal(isFalImageUrl("https://v3.fal.media/files/abc/image.png"), true);
  assert.equal(isFalImageUrl("https://fal.media/files/abc.png"), true);
  assert.equal(isFalImageUrl("http://v3.fal.media/files/abc.png"), false);
  assert.equal(isFalImageUrl("https://fal.media.evil.example/x.png"), false);
  assert.equal(isFalImageUrl("/api/radar/creative/documentary?asset=1"), false);
  assert.equal(isFalImageUrl(null), false);
});
