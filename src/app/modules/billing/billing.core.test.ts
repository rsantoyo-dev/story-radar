import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chargeRefundFrom,
  checkoutPurchaseFrom,
  checkoutSessionParams,
  creditPacksFromPrices,
  formatMoney,
  parsePackCredits,
  type StripePriceLike,
} from "./billing.core";
import { stripeForm } from "./stripe.core";

const product = { id: "prod_1", active: true, name: "Credits", description: "AI production credits", metadata: {} };

describe("parsePackCredits", () => {
  it("accepts whole positive numbers within the limit", () => {
    assert.equal(parsePackCredits("500"), 500);
    assert.equal(parsePackCredits(" 2000 "), 2000);
    for (const value of ["0", "-5", "1.5", "abc", "", undefined, 500, "200001"]) assert.equal(parsePackCredits(value), undefined);
  });
});

describe("creditPacksFromPrices", () => {
  it("keeps active one-time prices with credits metadata, cheapest first", () => {
    const prices: StripePriceLike[] = [
      { id: "price_big", active: true, type: "one_time", currency: "USD", unit_amount: 2000, nickname: "Studio", metadata: { press_craftor_credits: "2000" }, product },
      { id: "price_small", active: true, type: "one_time", currency: "usd", unit_amount: 500, metadata: {}, product: { ...product, name: "Starter pack", metadata: { press_craftor_credits: "500" } } },
      { id: "price_plain", active: true, type: "one_time", currency: "usd", unit_amount: 900, metadata: {}, product },
      { id: "price_sub", active: true, type: "recurring", currency: "usd", unit_amount: 900, metadata: { press_craftor_credits: "900" }, product },
      { id: "price_off", active: false, type: "one_time", currency: "usd", unit_amount: 900, metadata: { press_craftor_credits: "900" }, product },
      { id: "price_dead_product", active: true, type: "one_time", currency: "usd", unit_amount: 900, metadata: { press_craftor_credits: "900" }, product: { ...product, active: false } },
      { id: "price_unexpanded", active: true, type: "one_time", currency: "usd", unit_amount: 900, metadata: { press_craftor_credits: "900" }, product: "prod_1" },
      { id: "price_free", active: true, type: "one_time", currency: "usd", unit_amount: 0, metadata: { press_craftor_credits: "900" }, product },
    ];
    assert.deepEqual(creditPacksFromPrices(prices), [
      { priceId: "price_small", name: "Starter pack", description: "AI production credits", credits: 500, unitAmount: 500, currency: "usd" },
      { priceId: "price_big", name: "Studio", description: "AI production credits", credits: 2000, unitAmount: 2000, currency: "usd" },
    ]);
  });
});

describe("checkoutSessionParams", () => {
  const pack = { priceId: "price_small", name: "Starter", description: null, credits: 500, unitAmount: 500, currency: "usd" };

  it("creates a new customer on the first purchase", () => {
    const params = checkoutSessionParams({ pack, workspaceId: "ws_1", userId: "u_1", email: "a@example.com", appUrl: "https://app.example.com/" });
    const form = Object.fromEntries(stripeForm(params));
    assert.equal(form.mode, "payment");
    assert.equal(form["line_items[0][price]"], "price_small");
    assert.equal(form["metadata[press_craftor_purchase]"], "credits");
    assert.equal(form["metadata[workspace_id]"], "ws_1");
    assert.equal(form["metadata[credits]"], "500");
    assert.equal(form["payment_intent_data[metadata][workspace_id]"], "ws_1");
    assert.equal(form.customer_creation, "always");
    assert.equal(form.customer_email, "a@example.com");
    assert.equal(form.customer, undefined);
    assert.equal(form.success_url, "https://app.example.com/spending?purchase=success&session_id={CHECKOUT_SESSION_ID}");
    assert.equal(form.cancel_url, "https://app.example.com/spending?purchase=cancelled");
  });

  it("reuses the workspace's customer", () => {
    const form = Object.fromEntries(stripeForm(checkoutSessionParams({ pack, workspaceId: "ws_1", customerId: "cus_1", email: "a@example.com", appUrl: "https://x.test" })));
    assert.equal(form.customer, "cus_1");
    assert.equal(form.customer_creation, undefined);
    assert.equal(form.customer_email, undefined);
  });
});

describe("checkoutPurchaseFrom", () => {
  const session = {
    id: "cs_1",
    metadata: { press_craftor_purchase: "credits", workspace_id: "ws_1", credits: "500", price_id: "price_small", user_id: "u_1" },
    payment_status: "paid",
    payment_intent: "pi_1",
    customer: { id: "cus_1" },
    amount_total: 500,
    currency: "USD",
    livemode: false,
  };

  it("reads a checkout this app created", () => {
    assert.deepEqual(checkoutPurchaseFrom(session), {
      sessionId: "cs_1", workspaceId: "ws_1", credits: 500, priceId: "price_small", userId: "u_1",
      paymentIntentId: "pi_1", customerId: "cus_1", amountTotal: 500, currency: "usd", paid: true, livemode: false,
    });
  });

  it("ignores other checkouts and bad metadata", () => {
    assert.equal(checkoutPurchaseFrom({ ...session, metadata: {} }), undefined);
    assert.equal(checkoutPurchaseFrom({ ...session, metadata: { ...session.metadata, credits: "lots" } }), undefined);
    assert.equal(checkoutPurchaseFrom({ ...session, metadata: { ...session.metadata, workspace_id: "" } }), undefined);
    assert.equal(checkoutPurchaseFrom(undefined), undefined);
  });

  it("marks an unpaid checkout", () => {
    assert.equal(checkoutPurchaseFrom({ ...session, payment_status: "unpaid" })?.paid, false);
  });
});

describe("chargeRefundFrom", () => {
  it("reads the PaymentIntent and the cumulative refund", () => {
    assert.deepEqual(chargeRefundFrom({ payment_intent: "pi_1", amount_refunded: 250 }), { paymentIntentId: "pi_1", amountRefunded: 250 });
    assert.deepEqual(chargeRefundFrom({ payment_intent: { id: "pi_2" }, amount_refunded: 0 }), { paymentIntentId: "pi_2", amountRefunded: 0 });
    assert.equal(chargeRefundFrom({ payment_intent: null, amount_refunded: 250 }), undefined);
    assert.equal(chargeRefundFrom({ payment_intent: "pi_1", amount_refunded: -1 }), undefined);
  });
});

describe("formatMoney", () => {
  it("formats minor units", () => {
    assert.equal(formatMoney(500, "usd"), "$5.00");
    assert.equal(formatMoney(2050, "cad"), "CA$20.50");
  });
});
