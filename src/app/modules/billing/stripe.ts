import "server-only";

import { isLiveStripeKey, stripeForm, type StripeParam } from "./stripe.core";

const STRIPE_API = "https://api.stripe.com/v1";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Payments are not configured (STRIPE_SECRET_KEY).");
  }
}

export class StripeRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeNotConfiguredError();
  return key;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Whether the configured key charges real cards. */
export function stripeLivemode(): boolean {
  return isLiveStripeKey(secretKey());
}

/**
 * One Stripe API call. Never logs the key or the request body. POSTs may pass
 * an idempotency key so a retried request cannot create a second object.
 */
export async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, StripeParam> = {},
  options: { idempotencyKey?: string } = {},
): Promise<T> {
  const form = stripeForm(params);
  const url = method === "GET" && [...form.keys()].length ? `${STRIPE_API}${path}?${form}` : `${STRIPE_API}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: method === "POST" ? form : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    throw new StripeRequestError(body?.error?.message ?? `Stripe request failed (HTTP ${response.status})`, response.status, body?.error?.code);
  }
  return body as T;
}
