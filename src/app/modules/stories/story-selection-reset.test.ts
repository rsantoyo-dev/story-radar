import assert from "node:assert/strict";
import test from "node:test";

import { processingStatusAfterUnselect } from "./story-selection-reset";

test("clearing selection restores only usable content to ready", () => {
  assert.equal(processingStatusAfterUnselect("full"), "ready");
  assert.equal(processingStatusAfterUnselect("likely-full"), "ready");
  assert.equal(processingStatusAfterUnselect("excerpt"), "needs-enrichment");
  assert.equal(processingStatusAfterUnselect("missing"), "needs-enrichment");
});
