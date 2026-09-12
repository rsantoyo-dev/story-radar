import assert from "node:assert/strict";
import test from "node:test";
import { CREATIVE_FORMATS, isCreativeFormat } from "./creative-content.types";

test("every advertised AI format is accepted by the runtime validator", () => {
  for (const format of CREATIVE_FORMATS) assert.equal(isCreativeFormat(format), true);
  assert.equal(isCreativeFormat("sequence"), true);
  for (const value of ["recipe", "", null, undefined, {}, 1]) {
    assert.equal(isCreativeFormat(value), false);
  }
});
