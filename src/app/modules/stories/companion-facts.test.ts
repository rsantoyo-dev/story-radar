import assert from "node:assert/strict";
import test from "node:test";

import type { CreativeKeyFact, GeneratedCreativeDraft } from "./creative-content.types";
import { companionVerifiedFacts } from "./companion-facts";

const facts: CreativeKeyFact[] = ["fact-1", "fact-2", "fact-3", "fact-4", "fact-5", "fact-6", "editor-1a2b3c4d", "fact-7"]
  .map((id) => ({ id, statement: `Statement ${id}` }));
const unit = (order: number, factIds: string[]) => ({ order, factIds }) as unknown as GeneratedCreativeDraft["units"][number];

test("a parent citing more than six facts keeps the first six in slide order instead of failing", () => {
  const parent = { units: [unit(3, ["fact-3"]), unit(1, ["fact-1", "editor-1a2b3c4d"]), unit(2, ["fact-2"]), unit(4, ["fact-4", "fact-5"]), unit(5, ["fact-6", "fact-1"])] };
  assert.deepEqual(companionVerifiedFacts(parent, facts).map((fact) => fact.id), ["fact-1", "editor-1a2b3c4d", "fact-2", "fact-3", "fact-4", "fact-5"]);
});

test("only facts the parent actually cites and the brief knows are used", () => {
  const parent = { units: [unit(1, ["fact-2", "unknown"]), unit(2, [])] };
  assert.deepEqual(companionVerifiedFacts(parent, facts).map((fact) => fact.id), ["fact-2"]);
  assert.deepEqual(companionVerifiedFacts({ units: [unit(1, [])] }, facts), []);
});
