import assert from "node:assert/strict";
import test from "node:test";

import { unitCostMicros, unitPrice } from "./provider-prices";
import { spendingProduct } from "./spending-products";

test("operations become named products; a search fee keeps its parent's stage and unknown work stays visible", () => {
  assert.deepEqual(spendingProduct("creative_image", "image"), { key: "creative_image", label: "Slide image", group: "Images" });
  assert.deepEqual(spendingProduct("ai_research:web_search", "search"), { key: "ai_research:web_search", label: "AI research · web search", group: "Discovery" });
  assert.deepEqual(spendingProduct("new_thing_v2", "map"), { key: "new_thing_v2", label: "New thing v2", group: "Places & maps" });
  assert.equal(spendingProduct("mystery", "reader").group, "Other");
});

test("unit prices round up to whole micros and a configured override wins without breaking on bad JSON", () => {
  const staticMap = unitPrice("google/static_map", "");
  assert.equal(staticMap?.usdPerUnit, 0.002);
  assert.equal(unitCostMicros(staticMap!, 1), 2_000);
  assert.equal(unitCostMicros(unitPrice("openai/text-embedding-3-small", "")!, 1_234), 25, "0.02 USD per million tokens, rounded up");
  assert.equal(unitPrice("google/static_map", '{"google/static_map":{"usdPerUnit":0.005,"unit":"request"}}')?.version, "configured");
  assert.equal(unitPrice("google/static_map", "{not json")?.usdPerUnit, 0.002);
  assert.equal(unitCostMicros(staticMap!, -3), 0);
});
