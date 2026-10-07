import type { StripeParam } from "./stripe.core";

/**
 * Credit packs and Stripe Checkout, without server dependencies.
 *
 * Packs are configured in Stripe, not in code: an active one-time Price whose
 * Price or Product metadata has `press_craftor_credits` = the credits it
 * grants. Changing a price or adding a pack needs no deploy.
 */

export const CREDIT_METADATA_KEY = "press_craftor_credits";
/** Marks the checkouts this app created, so other uses of the Stripe account are ignored. */
export const PURCHASE_METADATA_KEY = "press_craftor_purchase";
export const PURCHASE_KIND = "credits";
export const MICROS_PER_CREDIT = 10_000;
export const MAX_PACK_CREDITS = 200_000;

export type CreditPack = {
  priceId: string;
  name: string;
  description: string | null;
  credits: number;
  /** Minor units (cents). */
  unitAmount: number;
  currency: string;
};

type StripeMetadata = Record<string, string> | null | undefined;
type StripeProductLike = { id?: string; active?: boolean; name?: string; description?: string | null; metadata?: StripeMetadata };
export type StripePriceLike = {
  id?: string;
  active?: boolean;
  type?: string;
  currency?: string;
  unit_amount?: number | null;
  nickname?: string | null;
  metadata?: StripeMetadata;
  product?: string | StripeProductLike | null;
};

export function parsePackCredits(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+$/u.test(value.trim())) return undefined;
  const credits = Number(value.trim());
  return credits > 0 && credits <= MAX_PACK_CREDITS ? credits : undefined;
}

/** The sellable packs among Stripe prices (listed with `expand[]=data.product`), cheapest first. */
export function creditPacksFromPrices(prices: readonly StripePriceLike[]): CreditPack[] {
  const packs: CreditPack[] = [];
  for (const price of prices) {
    const product = typeof price.product === "object" && price.product ? price.product : undefined;
    if (!price.id || price.active === false || price.type !== "one_time" || !product || product.active === false) continue;
    if (!Number.isSafeInteger(price.unit_amount) || (price.unit_amount ?? -1) <= 0 || !price.currency) continue;
    const credits = parsePackCredits(price.metadata?.[CREDIT_METADATA_KEY]) ?? parsePackCredits(product.metadata?.[CREDIT_METADATA_KEY]);
    if (!credits) continue;
    packs.push({
      priceId: price.id,
      name: price.nickname?.trim() || product.name?.trim() || `${credits.toLocaleString("en-US")} credits`,
      description: product.description?.trim() || null,
      credits,
      unitAmount: price.unit_amount!,
      currency: price.currency.toLowerCase(),
    });
  }
  return packs.sort((left, right) => left.credits - right.credits || left.unitAmount - right.unitAmount);
}

export function creditsToMicros(credits: number): number {
  return credits * MICROS_PER_CREDIT;
}

/** The Checkout Session for one pack. Credits and workspace travel in signed metadata. */
export function checkoutSessionParams(input: {
  pack: CreditPack;
  workspaceId: string;
  userId?: string;
  email?: string;
  customerId?: string;
  appUrl: string;
}): Record<string, StripeParam> {
  const appUrl = input.appUrl.replace(/\/+$/u, "");
  const metadata = {
    [PURCHASE_METADATA_KEY]: PURCHASE_KIND,
    workspace_id: input.workspaceId,
    credits: String(input.pack.credits),
    price_id: input.pack.priceId,
    ...(input.userId ? { user_id: input.userId } : {}),
  };
  return {
    mode: "payment",
    line_items: [{ price: input.pack.priceId, quantity: 1 }],
    client_reference_id: input.workspaceId,
    metadata,
    payment_intent_data: { metadata },
    invoice_creation: { enabled: true },
    ...(input.customerId
      ? { customer: input.customerId }
      : { customer_creation: "always", customer_email: input.email }),
    success_url: `${appUrl}/spending?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/spending?purchase=cancelled`,
  };
}

/** What the webhook needs from a Checkout Session this app created; undefined for anything else. */
export type CheckoutPurchase = {
  sessionId: string;
  workspaceId: string;
  credits: number;
  priceId: string;
  userId: string | null;
  paymentIntentId: string | null;
  customerId: string | null;
  amountTotal: number;
  currency: string;
  paid: boolean;
  livemode: boolean;
};

export type CheckoutSessionLike = {
  id?: unknown;
  metadata?: StripeMetadata;
  payment_status?: unknown;
  payment_intent?: unknown;
  customer?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  livemode?: unknown;
};

const idOf = (value: unknown): string | null =>
  typeof value === "string" ? value : value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : null;

export function checkoutPurchaseFrom(session: CheckoutSessionLike | null | undefined): CheckoutPurchase | undefined {
  const metadata = session?.metadata;
  if (!session || typeof session.id !== "string" || metadata?.[PURCHASE_METADATA_KEY] !== PURCHASE_KIND) return undefined;
  const credits = parsePackCredits(metadata.credits);
  if (!credits || !metadata.workspace_id || !metadata.price_id) return undefined;
  return {
    sessionId: session.id,
    workspaceId: metadata.workspace_id,
    credits,
    priceId: metadata.price_id,
    userId: metadata.user_id || null,
    paymentIntentId: idOf(session.payment_intent),
    customerId: idOf(session.customer),
    amountTotal: Number.isSafeInteger(session.amount_total) ? Number(session.amount_total) : 0,
    currency: typeof session.currency === "string" ? session.currency.toLowerCase() : "usd",
    paid: session.payment_status === "paid",
    livemode: session.livemode === true,
  };
}

/** A refunded charge: its PaymentIntent and the cumulative refunded amount. */
export function chargeRefundFrom(charge: { payment_intent?: unknown; amount_refunded?: unknown } | null | undefined):
  { paymentIntentId: string; amountRefunded: number } | undefined {
  const paymentIntentId = idOf(charge?.payment_intent);
  const amountRefunded = charge?.amount_refunded;
  if (!paymentIntentId || !Number.isSafeInteger(amountRefunded) || Number(amountRefunded) < 0) return undefined;
  return { paymentIntentId, amountRefunded: Number(amountRefunded) };
}

export function formatMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(minorUnits / 100);
}
