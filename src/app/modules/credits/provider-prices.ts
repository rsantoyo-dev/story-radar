/**
 * Versioned list prices for non-token provider units (USD per unit). Text
 * tokens are priced in `creative-text-cost.ts`. Each usage charge snapshots
 * the price it used, so a later change never rewrites history. These are
 * public list prices without free tiers or credits, which is what a paying
 * workspace would cost us; re-verify them by the `checked` date.
 *
 * `PROVIDER_PRICES_JSON` overrides a key, e.g.
 * `{"google/places_text_search":{"usdPerUnit":0.035,"unit":"request"}}`.
 */
export type UnitPrice = { usdPerUnit: number; unit: string; version: string };

export type ProviderUnit =
  | "openai/web_search_call"
  | "openai/text-embedding-3-small"
  | "openai/text-embedding-3-large"
  | "google/places_text_search"
  | "google/places_photo"
  | "google/static_map";

const LIST_PRICES: Record<ProviderUnit, UnitPrice> = {
  // OpenAI Responses web search tool: US$10 per 1,000 calls (search content tokens are billed as model input).
  "openai/web_search_call": { usdPerUnit: 0.01, unit: "call", version: "2026-10-06" },
  "openai/text-embedding-3-small": { usdPerUnit: 0.02 / 1_000_000, unit: "token", version: "2026-10-06" },
  "openai/text-embedding-3-large": { usdPerUnit: 0.13 / 1_000_000, unit: "token", version: "2026-10-06" },
  // Places API (New) Text Search with location, address components, types and photos is the Pro SKU: US$32 per 1,000.
  "google/places_text_search": { usdPerUnit: 0.032, unit: "request", version: "2026-10-06" },
  // Place Photos: US$7 per 1,000.
  "google/places_photo": { usdPerUnit: 0.007, unit: "request", version: "2026-10-06" },
  // Maps Static API: US$2 per 1,000.
  "google/static_map": { usdPerUnit: 0.002, unit: "request", version: "2026-10-06" },
};

export function unitPrice(key: ProviderUnit, overrides = process.env.PROVIDER_PRICES_JSON): UnitPrice | undefined {
  if (overrides) {
    try {
      const configured = (JSON.parse(overrides) as Record<string, Partial<UnitPrice>>)[key];
      if (configured && typeof configured.usdPerUnit === "number" && Number.isFinite(configured.usdPerUnit) && configured.usdPerUnit >= 0) {
        return { usdPerUnit: configured.usdPerUnit, unit: configured.unit ?? LIST_PRICES[key]?.unit ?? "unit", version: "configured" };
      }
    } catch { /* a malformed override falls back to the list price */ }
  }
  return LIST_PRICES[key];
}

/** Provider cost of `units` at `price`, in USD micros (rounded up, never negative). */
export function unitCostMicros(price: UnitPrice, units: number): number {
  return Math.ceil(Math.max(0, units) * price.usdPerUnit * 1_000_000);
}
