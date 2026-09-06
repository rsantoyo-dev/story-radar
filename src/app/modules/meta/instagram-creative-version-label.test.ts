import assert from "node:assert/strict";
import { test } from "node:test";

import { instagramCreativeVersionLabel } from "./instagram-creative-version-label";

test("instagramCreativeVersionLabel builds format · vN · aprobado", () => {
  assert.equal(
    instagramCreativeVersionLabel({
      format: "carousel",
      status: "approved",
      version: 3,
    }),
    "Carrusel · v3 · aprobado",
  );
  assert.equal(
    instagramCreativeVersionLabel({
      format: "meme",
      status: "draft",
      version: 1,
    }),
    "Meme · v1",
  );
  // No version → no "v" segment.
  assert.equal(
    instagramCreativeVersionLabel({
      format: "carousel",
      status: "draft",
      version: null,
    }),
    "Carrusel",
  );
  // Unknown format passes through verbatim.
  assert.equal(
    instagramCreativeVersionLabel({
      format: "story",
      status: "approved",
      version: 0,
    }),
    "story · aprobado",
  );
});
