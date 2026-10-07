import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLiveStripeKey, signStripePayload, stripeForm, verifyStripeSignature } from "./stripe.core";

describe("stripeForm", () => {
  it("encodes nested objects and arrays the way Stripe expects", () => {
    const form = stripeForm({
      mode: "payment",
      line_items: [{ price: "price_1", quantity: 1 }],
      metadata: { workspace_id: "w1" },
      invoice_creation: { enabled: true },
      skipped: undefined,
      nothing: null,
    });
    assert.deepEqual([...form.entries()], [
      ["mode", "payment"],
      ["line_items[0][price]", "price_1"],
      ["line_items[0][quantity]", "1"],
      ["metadata[workspace_id]", "w1"],
      ["invoice_creation[enabled]", "true"],
    ]);
  });
});

describe("isLiveStripeKey", () => {
  it("tells live keys from test keys", () => {
    assert.equal(isLiveStripeKey("sk_live_abc"), true);
    assert.equal(isLiveStripeKey("rk_live_abc"), true);
    assert.equal(isLiveStripeKey("sk_test_abc"), false);
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_800_000_000;

  it("accepts a fresh signature", () => {
    assert.equal(verifyStripeSignature(payload, signStripePayload(payload, secret, now), secret, now), true);
  });

  it("accepts when any v1 signature matches (secret rotation)", () => {
    const good = signStripePayload(payload, secret, now).split(",")[1];
    const header = `t=${now},v1=${"0".repeat(64)},${good}`;
    assert.equal(verifyStripeSignature(payload, header, secret, now), true);
  });

  it("rejects a changed payload, a wrong secret, an old timestamp or a bad header", () => {
    const header = signStripePayload(payload, secret, now);
    assert.equal(verifyStripeSignature(`${payload} `, header, secret, now), false);
    assert.equal(verifyStripeSignature(payload, header, "whsec_other", now), false);
    assert.equal(verifyStripeSignature(payload, header, secret, now + 301), false);
    assert.equal(verifyStripeSignature(payload, "garbage", secret, now), false);
    assert.equal(verifyStripeSignature(payload, null, secret, now), false);
    assert.equal(verifyStripeSignature(payload, header, "", now), false);
  });
});
