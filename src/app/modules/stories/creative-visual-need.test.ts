import assert from "node:assert/strict";
import test from "node:test";
import { isCreativeVisualNeed, visualNeedsByOrder } from "./creative-visual-need";
import type { GeneratedCreativeDraft } from "./creative-content.types";

test("the writer's visualNeed is recovered from the AI snapshot by unit order, unknown values declare nothing", () => {
  const snapshot = { units: [
    { order: 1, visualNeed: "verified-map" },
    { order: 2, visualNeed: "generic-illustration" },
    { order: 3, visualNeed: "drawn-map" },
    { order: 4 },
  ] } as unknown as Partial<GeneratedCreativeDraft>;
  const byOrder = visualNeedsByOrder(snapshot);
  assert.equal(byOrder.get(1), "verified-map");
  assert.equal(byOrder.get(2), "generic-illustration");
  assert.equal(byOrder.get(3), undefined);
  assert.equal(byOrder.get(4), undefined);
  assert.equal(visualNeedsByOrder(undefined).size, 0);
  assert.equal(visualNeedsByOrder({}).size, 0);
  assert.equal(visualNeedsByOrder({ units: "nope" } as unknown as Partial<GeneratedCreativeDraft>).size, 0);
  assert.ok(isCreativeVisualNeed("typography"));
  assert.equal(isCreativeVisualNeed("map"), false);
  assert.equal(isCreativeVisualNeed(1), false);
});
