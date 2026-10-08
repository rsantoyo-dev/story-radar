import assert from "node:assert/strict";
import test from "node:test";

import {
  creativeBriefStructureInstruction,
  creativeScriptStructureInstruction,
} from "./creative-framing-instruction";

test("a hook-list brief always plans a list; an auto brief plans one only when the source enumerates items", () => {
  assert.equal(creativeBriefStructureInstruction("hook-steps"), '\n\nSet carouselPlan.structure to "arc".');
  const list = creativeBriefStructureInstruction("hook-list");
  assert.match(list, /^\n\nSTORY STRUCTURE: hook-list/, "carries its own separator so callers can append it directly");
  assert.match(list, /how many items the source enumerates/);
  assert.match(list, /one slide per item in source order/);
  assert.match(list, /never promise more items than the facts enumerate/);
  assert.match(list, /does not enumerate distinct items, plan an ordinary carousel/);
  assert.match(list, /up to 20 \(hook, up to 18 items, conclude\)/);
  assert.match(list, /set carouselPlan\.structure to "list"/);
  assert.match(list, /Never extract a fact that only says a detail is missing/);

  // The default decides from the source and declares what it planned.
  for (const auto of [creativeBriefStructureInstruction("auto"), creativeBriefStructureInstruction(undefined)]) {
    assert.match(auto, /^\n\nSTORY STRUCTURE: decide from the source/);
    assert.match(auto, /three or more distinct items/);
    assert.match(auto, /set carouselPlan\.structure to "list"/);
    assert.match(auto, /Otherwise set carouselPlan\.structure to "arc"/);
    assert.match(auto, /one slide per item in source order/);
  }
});

test("the script instruction states list items for hook-list, and steps only for a confirmed procedure", () => {
  const list = creativeScriptStructureInstruction("hook-list");
  assert.match(list, /STRUCTURE FOR THE SCRIPT: hook-list/);
  assert.match(list, /count-and-subject promise/);
  // The cover adds a verifiable draw only when the hook slide cites it.
  assert.match(list, /a draw that makes the list worth opening/);
  assert.match(list, /Count a subset only when the hook slide cites a fact for every item in it/);
  // A list slide is light: short headline, one sentence and a practical line; fine print goes to the caption.
  assert.match(list, /headline: at most 8 words/);
  assert.match(list, /never a price, an admission rule, a warning or a condition/);
  assert.match(list, /body: at most 18 words: one short sentence on what happens there/);
  assert.match(list, /Keep every required qualifier with the fact it qualifies/);
  assert.match(list, /the caption carries them, with their qualifiers/);
  // The closing gives one takeaway instead of re-listing the items.
  assert.match(list, /one concrete takeaway that helps the reader choose or plan/);
  assert.match(list, /never a re-listing or comparison of the items, a synthesis, a recap label/);
  assert.match(list, /do not present one item's neighborhood, venue or condition as the subject of the whole list/);
  // A hook-steps profile whose brief found no procedure was downgraded to a
  // plain carousel; telling the writer to produce steps anyway would invent them.
  assert.equal(creativeScriptStructureInstruction("hook-steps", false), "");
  assert.match(creativeScriptStructureInstruction("hook-steps", true), /STRUCTURE FOR THE SCRIPT: hook-steps/);
  assert.equal(creativeScriptStructureInstruction("auto", true), "");
  assert.equal(creativeScriptStructureInstruction(undefined), "");
});
