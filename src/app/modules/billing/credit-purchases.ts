import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { billingCustomers, billingPurchases } from "@/db/schema";

import {
  chargeRefundFrom,
  checkoutPurchaseFrom,
  checkoutSessionParams,
  creditPacksFromPrices,
  type CheckoutPurchase,
  type CheckoutSessionLike,
  type CreditPack,
  type StripePriceLike,
} from "./billing.core";
import { recordAuditEvent } from "../observability/audit";
import { stripeLivemode, stripeRequest } from "./stripe";

export class CreditPackNotFoundError extends Error {
  constructor() {
    super("That credit pack is no longer for sale. Reload the page to see the current packs.");
  }
}

const PACK_CACHE_MS = 5 * 60_000;
let packCache: { at: number; livemode: boolean; packs: CreditPack[] } | undefined;

/** The packs for sale, read from Stripe and cached for five minutes. */
export async function listCreditPacks(options: { fresh?: boolean } = {}): Promise<CreditPack[]> {
  const livemode = stripeLivemode();
  if (!options.fresh && packCache && packCache.livemode === livemode && Date.now() - packCache.at < PACK_CACHE_MS) {
    return packCache.packs;
  }
  const prices = await stripeRequest<{ data: StripePriceLike[] }>("GET", "/prices", {
    active: true,
    type: "one_time",
    limit: 100,
    expand: ["data.product"],
  });
  const packs = creditPacksFromPrices(prices.data ?? []);
  packCache = { at: Date.now(), livemode, packs };
  return packs;
}

/**
 * Starts a Stripe Checkout for one pack and records it as an open purchase.
 * Only a pack currently listed in Stripe can be bought; the browser never
 * decides how many credits a price grants.
 */
export async function startCreditCheckout(input: {
  workspaceId: string;
  priceId: string;
  appUrl: string;
  userId?: string;
  email?: string;
}): Promise<string> {
  const pack = (await listCreditPacks({ fresh: true })).find((candidate) => candidate.priceId === input.priceId);
  if (!pack) throw new CreditPackNotFoundError();
  const livemode = stripeLivemode();
  const [customer] = await db.select({ id: billingCustomers.stripeCustomerId }).from(billingCustomers)
    .where(and(eq(billingCustomers.workspaceId, input.workspaceId), eq(billingCustomers.livemode, livemode))).limit(1);

  const session = await stripeRequest<{ id: string; url: string | null; amount_total: number | null; currency: string | null }>(
    "POST",
    "/checkout/sessions",
    checkoutSessionParams({ pack, workspaceId: input.workspaceId, userId: input.userId, email: input.email, customerId: customer?.id, appUrl: input.appUrl }),
    { idempotencyKey: `checkout:${randomUUID()}` },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout page.");

  await db.insert(billingPurchases).values({
    workspaceId: input.workspaceId,
    livemode,
    stripeCheckoutSessionId: session.id,
    stripePriceId: pack.priceId,
    credits: pack.credits,
    amountTotal: session.amount_total ?? pack.unitAmount,
    currency: (session.currency ?? pack.currency).toLowerCase(),
    createdByUserId: input.userId ?? null,
  }).onConflictDoNothing();
  await recordAuditEvent({
    action: "billing.checkout.started", entityType: "billing_checkout", entityId: session.id, workspaceId: input.workspaceId,
    details: { priceId: pack.priceId, credits: pack.credits, amount: session.amount_total ?? pack.unitAmount, currency: session.currency ?? pack.currency, livemode },
  });
  return session.url;
}

/** What a webhook event changed, for the response body and logs. */
export type StripeEventResult = { handled: boolean; detail: string };

type StripeEvent = { id?: string; type?: string; data?: { object?: unknown } };

/**
 * Applies one verified Stripe event. Every path is idempotent: Stripe retries
 * and may deliver events more than once or out of order.
 */
export async function applyStripeEvent(event: StripeEvent): Promise<StripeEventResult> {
  const object = event.data?.object as (CheckoutSessionLike & { amount_refunded?: unknown }) | undefined;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const purchase = checkoutPurchaseFrom(object);
      if (!purchase) return { handled: false, detail: "not a credit purchase" };
      await recordCheckout(purchase);
      if (!purchase.paid) return { handled: true, detail: "checkout completed, payment pending" };
      const result = await db.execute(sql`SELECT post_credit_purchase(${purchase.sessionId}, ${purchase.paymentIntentId}, ${purchase.amountTotal}, ${purchase.currency}) AS credits`);
      const granted = Number(result.rows[0]?.credits ?? 0);
      if (granted > 0) {
        await recordAuditEvent({
          action: "billing.purchase.paid", actorType: "stripe", entityType: "billing_checkout", entityId: purchase.sessionId,
          workspaceId: purchase.workspaceId,
          details: { eventId: event.id, credits: granted, amount: purchase.amountTotal, currency: purchase.currency, paymentIntentId: purchase.paymentIntentId, livemode: purchase.livemode },
        });
      }
      return { handled: true, detail: `granted ${granted} credits` };
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const purchase = checkoutPurchaseFrom(object);
      if (!purchase) return { handled: false, detail: "not a credit purchase" };
      const expired = await db.update(billingPurchases).set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(billingPurchases.stripeCheckoutSessionId, purchase.sessionId), eq(billingPurchases.status, "open")))
        .returning({ id: billingPurchases.id });
      if (expired.length) {
        await recordAuditEvent({
          action: "billing.checkout.expired", actorType: "stripe", entityType: "billing_checkout", entityId: purchase.sessionId,
          workspaceId: purchase.workspaceId, outcome: "failure", details: { eventId: event.id, eventType: event.type },
        });
      }
      return { handled: true, detail: "checkout closed without payment" };
    }
    case "charge.refunded": {
      const refund = chargeRefundFrom(object);
      if (!refund) return { handled: false, detail: "refund without a payment intent" };
      const result = await db.execute(sql`SELECT apply_credit_purchase_refund(${refund.paymentIntentId}, ${refund.amountRefunded}) AS micros`);
      const micros = Number(result.rows[0]?.micros ?? 0);
      if (micros < 0) return { handled: false, detail: "refund for another kind of payment" };
      if (micros === 0) return { handled: true, detail: "refund already applied" };
      const [refunded] = await db.select({ workspaceId: billingPurchases.workspaceId, sessionId: billingPurchases.stripeCheckoutSessionId })
        .from(billingPurchases).where(eq(billingPurchases.stripePaymentIntentId, refund.paymentIntentId)).limit(1);
      await recordAuditEvent({
        action: "billing.purchase.refunded", actorType: "stripe", entityType: "billing_checkout", entityId: refunded?.sessionId ?? refund.paymentIntentId,
        workspaceId: refunded?.workspaceId ?? null,
        details: { eventId: event.id, paymentIntentId: refund.paymentIntentId, amountRefunded: refund.amountRefunded, creditsTakenBack: micros / 10_000 },
      });
      return { handled: true, detail: `took back ${micros / 10_000} credits` };
    }
    default:
      return { handled: false, detail: `ignored ${event.type ?? "unknown"} event` };
  }
}

/** Saves the purchase (if the checkout route never got to) and the workspace's Stripe customer. */
async function recordCheckout(purchase: CheckoutPurchase): Promise<void> {
  await db.insert(billingPurchases).values({
    workspaceId: purchase.workspaceId,
    livemode: purchase.livemode,
    stripeCheckoutSessionId: purchase.sessionId,
    stripePriceId: purchase.priceId,
    credits: purchase.credits,
    amountTotal: purchase.amountTotal,
    currency: purchase.currency,
    createdByUserId: null,
  }).onConflictDoNothing();
  if (purchase.customerId) {
    await db.insert(billingCustomers).values({
      workspaceId: purchase.workspaceId,
      livemode: purchase.livemode,
      stripeCustomerId: purchase.customerId,
    }).onConflictDoNothing();
  }
}

export type PurchaseSummary = {
  id: string;
  credits: number;
  amountTotal: number;
  amountRefunded: number;
  currency: string;
  status: string;
  livemode: boolean;
  createdAt: string;
  paidAt: string | null;
};

/** A workspace's latest paid (or refunded) purchases, newest first. Abandoned checkouts are left out. */
export async function listWorkspacePurchases(workspaceId: string, limit = 10): Promise<PurchaseSummary[]> {
  const rows = await db.select().from(billingPurchases)
    .where(and(eq(billingPurchases.workspaceId, workspaceId), inArray(billingPurchases.status, ["paid", "partially_refunded", "refunded"])))
    .orderBy(desc(billingPurchases.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    credits: row.credits,
    amountTotal: row.amountTotal,
    amountRefunded: row.amountRefunded,
    currency: row.currency,
    status: row.status,
    livemode: row.livemode,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  }));
}
