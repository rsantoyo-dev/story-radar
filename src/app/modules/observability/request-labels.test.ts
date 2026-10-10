import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeRoute } from "./request-labels";

describe("request labels", () => {
  it("names the requests editors make most", () => {
    assert.equal(describeRoute("POST /api/radar/creative/drafts/f427ba10-be81-499f-b02b-65dbcb8cf6c1/assets"), "Generate images");
    assert.equal(describeRoute("POST /api/radar/evaluate"), "Evaluate stories with AI");
    assert.equal(describeRoute("DELETE /api/radar/topics/9fde8339-6987-4c64-b6de-51ebbba063c5"), "Delete a brand");
  });

  it("falls back to the route's words for requests without a name", () => {
    assert.equal(describeRoute("DELETE /api/radar/topics/9fde8339-6987-4c64-b6de-51ebbba063c5/meta/facebook"), "Delete topics › meta › facebook");
    assert.equal(describeRoute("POST /api/radar/sources/detect"), "Sources › detect");
    assert.equal(describeRoute("GET /api/radar/stats"), "Read stats");
  });

  it("leaves anything that is not an API route unnamed", () => {
    assert.equal(describeRoute(undefined), undefined);
    assert.equal(describeRoute("topic.updated"), undefined);
  });
});
