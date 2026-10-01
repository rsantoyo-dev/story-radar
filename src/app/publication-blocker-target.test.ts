import assert from "node:assert/strict";
import test from "node:test";

import { publicationBlockerTarget } from "./publication-blocker-target";

test("script blockers open the script tab", () => {
  assert.deepEqual(publicationBlockerTarget({ code: "draft-approval", message: "Approve the current script before preparing a publication." }), { tab: "script", label: "Go to script" });
  assert.equal(publicationBlockerTarget({ code: "stale-input", message: "The source changed." })?.tab, "script");
});

test("an image blocker points at that exact image", () => {
  assert.deepEqual(publicationBlockerTarget({ code: "image-approval", message: "Approve image 3.", assetId: "asset-3" }), { tab: "visuals", assetId: "asset-3", label: "Go to image 3" });
  assert.deepEqual(publicationBlockerTarget({ code: "stale-batch", message: "The image batch belongs to an earlier revision." }), { tab: "visuals", assetId: undefined, label: "Go to images" });
});

test("access and destination blockers have no in-draft target", () => {
  assert.equal(publicationBlockerTarget({ code: "publishing-access", message: "Verify access." }), undefined);
  assert.equal(publicationBlockerTarget({ code: "unsupported-format", message: "4:5 only." }), undefined);
});
