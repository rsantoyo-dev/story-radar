import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe REST helpers without server dependencies, so they can be tested
 * directly. The app talks to Stripe with fetch; there is no SDK.
 */

export type StripeParam = string | number | boolean | null | undefined | StripeParam[] | { [key: string]: StripeParam };

/** Stripe's form encoding: nested objects as a[b]=…, arrays as a[0]=…; empty values are left out. */
export function stripeForm(params: Record<string, StripeParam>): URLSearchParams {
  const form = new URLSearchParams();
  const add = (key: string, value: StripeParam) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => add(`${key}[${index}]`, item));
    } else if (typeof value === "object") {
      for (const [child, item] of Object.entries(value)) add(`${key}[${child}]`, item);
    } else {
      form.append(key, String(value));
    }
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return form;
}

export function isLiveStripeKey(key: string): boolean {
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Checks a `Stripe-Signature` header: HMAC-SHA256 of `${timestamp}.${payload}`
 * with the endpoint secret, compared in constant time, within the tolerance.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false;
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((piece) => piece?.trim());
    if (key === "t" && value && /^\d+$/u.test(value)) timestamp = Number(value);
    if (key === "v1" && value && /^[0-9a-f]{64}$/iu.test(value)) signatures.push(value.toLowerCase());
  }
  if (timestamp === undefined || !signatures.length) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex"));
  return signatures.some((signature) => {
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

/** A signature header for `payload`, as Stripe would send it (tests and local tooling). */
export function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex")}`;
}
