export const DEMO_CREDIT_GRANT_MICROS = 10_000_000;
export const MICROS_PER_CREDIT = 10_000;
export const DEFAULT_DEMO_MARKUP_BASIS_POINTS = 2_500;

export function demoMarkupBasisPoints(raw = process.env.DEMO_CREDIT_MARKUP_BPS): number {
  const value = raw === undefined ? DEFAULT_DEMO_MARKUP_BASIS_POINTS : Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 50_000) {
    throw new Error("DEMO_CREDIT_MARKUP_BPS must be an integer from 0 to 50000");
  }
  return value;
}

export function demoChargeMicros(providerCostMicros: number, markupBasisPoints: number): number {
  if (!Number.isSafeInteger(providerCostMicros) || providerCostMicros < 0 ||
      !Number.isInteger(markupBasisPoints) || markupBasisPoints < 0 || markupBasisPoints > 50_000) {
    throw new Error("Invalid demo credit cost or markup");
  }
  const charge = Math.ceil(providerCostMicros * (10_000 + markupBasisPoints) / 10_000);
  if (!Number.isSafeInteger(charge)) throw new Error("Demo credit charge is too large");
  return charge;
}

export function microsToCredits(micros: number): number {
  return micros / MICROS_PER_CREDIT;
}
