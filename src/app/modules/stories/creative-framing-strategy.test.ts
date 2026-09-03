import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATIVE_FRAMING_STRATEGIES,
  DEFAULT_CREATIVE_FRAMING_STRATEGY,
  isCreativeFramingStrategy,
} from "./creative-content.types";
import { creativeBriefFramingInstruction } from "./creative-framing-instruction";

test("editorial framing keeps auto as the explicit default", () => {
  assert.equal(DEFAULT_CREATIVE_FRAMING_STRATEGY, "auto");
  assert.deepEqual(CREATIVE_FRAMING_STRATEGIES, [
    "auto",
    "reader-consequence",
    "explainer",
    "authority",
  ]);
});

test("framing strategy guard accepts known values and rejects unknown ones", () => {
  assert.equal(isCreativeFramingStrategy("reader-consequence"), true);
  assert.equal(isCreativeFramingStrategy("explainer"), true);
  assert.equal(isCreativeFramingStrategy("authority"), true);
  assert.equal(isCreativeFramingStrategy("viral"), false);
  assert.equal(isCreativeFramingStrategy(""), false);
  assert.equal(isCreativeFramingStrategy(undefined), false);
});

test("brief framing instructions keep reader-consequence requirements scoped", () => {
  const readerConsequence = creativeBriefFramingInstruction(
    "reader-consequence",
  );
  const explainer = creativeBriefFramingInstruction("explainer");
  const authority = creativeBriefFramingInstruction("authority");
  const automatic = creativeBriefFramingInstruction("auto");

  assert.match(readerConsequence, /State that reader-relevant change before/i);
  assert.match(readerConsequence, /must not open with an organization name/i);
  assert.match(explainer, /neutral, non-personal/i);
  assert.match(authority, /institution-, announcement-, or product-centered/i);
  assert.match(automatic, /Choose the strongest supported lens/i);
  assert.doesNotMatch(explainer, /must not open with an organization name/i);
  assert.doesNotMatch(authority, /must not open with an organization name/i);
});
