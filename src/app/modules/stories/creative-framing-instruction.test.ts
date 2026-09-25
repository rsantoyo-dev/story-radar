import assert from "node:assert/strict";
import test from "node:test";

import {
  creativeBriefStructureInstruction,
  creativeScriptStructureInstruction,
} from "./creative-framing-instruction";

test("only a hook-list brief gets a structure instruction, and it demands a count fact and one item per slide", () => {
  assert.equal(creativeBriefStructureInstruction("auto"), "");
  assert.equal(creativeBriefStructureInstruction("hook-steps"), "");
  assert.equal(creativeBriefStructureInstruction(undefined), "");
  const list = creativeBriefStructureInstruction("hook-list");
  assert.match(list, /^\n\nSTORY STRUCTURE: hook-list/, "carries its own separator so callers can append it directly");
  assert.match(list, /how many items the source enumerates/);
  assert.match(list, /one slide per item in source order/);
  assert.match(list, /never promise more items than the facts enumerate/);
  assert.match(list, /does not enumerate distinct items, plan an ordinary carousel/);
});

test("the script instruction states list items for hook-list, and steps only for a confirmed procedure", () => {
  const list = creativeScriptStructureInstruction("hook-list");
  assert.match(list, /STRUCTURE FOR THE SCRIPT: hook-list/);
  assert.match(list, /count-and-subject promise/);
  assert.match(list, /not a synthesis and not a recap label/);
  // A hook-steps profile whose brief found no procedure was downgraded to a
  // plain carousel; telling the writer to produce steps anyway would invent them.
  assert.equal(creativeScriptStructureInstruction("hook-steps", false), "");
  assert.match(creativeScriptStructureInstruction("hook-steps", true), /STRUCTURE FOR THE SCRIPT: hook-steps/);
  assert.equal(creativeScriptStructureInstruction("auto", true), "");
  assert.equal(creativeScriptStructureInstruction(undefined), "");
});
