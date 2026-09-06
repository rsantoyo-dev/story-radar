/**
 * Structural check for the account-level insights response used by IG-01's
 * "Verify access". A `200 OK` with an empty or malformed body must NOT count
 * as verified — only a well-formed insights payload does. Pure and
 * unit-tested; meta-graph-client.ts calls it right after the fetch.
 */

import { MetaGraphApiError } from "./meta-token-response";

/**
 * Throws MetaGraphApiError (status 200) when `payload` is not a recognizable
 * insights response: `{ data: [ { name: string, ... }, ... ] }`.
 */
export function assertInstagramInsightsShape(payload: unknown): void {
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  const data = body && Array.isArray(body.data) ? body.data : undefined;
  const firstIsMetric =
    data !== undefined &&
    data.length > 0 &&
    data[0] !== null &&
    typeof data[0] === "object" &&
    typeof (data[0] as Record<string, unknown>).name === "string";

  if (!firstIsMetric) {
    throw new MetaGraphApiError(
      "Instagram returned 200 but the insights response was not in the expected shape",
      200,
      payload,
    );
  }
}
