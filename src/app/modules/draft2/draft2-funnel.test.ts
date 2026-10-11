import assert from "node:assert/strict";
import test from "node:test";
import { numbersIn, statedNumbers } from "./draft2-funnel";
import type { Draft2Fact } from "./draft2-facts.types";

const facts: Draft2Fact[] = [{ id: "f1", claim: "Doors open at 10 a.m. for 1,200 visitors.", evidence: "10 a.m. … 1,200 visitors", kind: "event", status: "established", importance: 80 }];

test("the numbers a slide may state: the cited facts', a list's count and its items' own numbering", () => {
  assert.deepEqual([...statedNumbers(facts)].sort(), ["10", "1200"]);
  assert.deepEqual([...statedNumbers(facts, 5)].sort(), ["1", "10", "1200", "2", "3", "4", "5"], "a five-item list numbers its items 1 to 5 and states its count");
  assert.equal(statedNumbers(facts, 5).has("7"), false);
  assert.deepEqual(numbersIn("Tip 1 of 5: 1,200 visitors, 10 a.m.").map((number) => number.digits), ["1", "5", "1200", "10"]);
});
