import assert from "node:assert/strict";
import { test } from "node:test";
import { metaOrderStatus, uniqueDestinations } from "./meta-publication-contract";

test("the same Instagram account through two login mechanisms is one destination", () => {
  assert.deepEqual(uniqueDestinations([
    { platform: "instagram", accountId: "1789", connectionVersion: "v1", mechanism: "instagram-login" },
    { platform: "instagram", accountId: "1789", connectionVersion: "v1", mechanism: "facebook-login" },
  ]), [{ platform: "instagram", accountId: "1789", connectionVersion: "v1", mechanism: "instagram-login" }]);
  assert.throws(() => uniqueDestinations([
    { platform: "instagram", accountId: "1789", connectionVersion: "v1", mechanism: "instagram-login" },
    { platform: "instagram", accountId: "1789", connectionVersion: "v2", mechanism: "facebook-login" },
  ]), /one active connection revision/);
});

test("partial success and cancellation never turn an original two-destination order into success", () => {
  assert.equal(metaOrderStatus(["published", "failed"]), "partial");
  assert.equal(metaOrderStatus(["published", "cancelled"]), "partial");
  assert.equal(metaOrderStatus(["published", "scheduled"]), "partial");
  assert.equal(metaOrderStatus(["published", "published"]), "published");
});
