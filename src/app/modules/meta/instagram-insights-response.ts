/**
 * Structural check for the account-level insights response used by IG-01's
 * "Verify access". "Verify" proves *access* (permission + Advanced Access),
 * not that data exists — a permission problem comes back as an `error` object
 * with a 4xx and is thrown earlier. So a `200 OK` with `{ "data": [] }` is a
 * pass: Meta returns an empty set when the metric has no values yet or is
 * temporarily unavailable. Only a body that is not a recognizable insights
 * envelope is rejected. Pure and unit-tested; meta-graph-client.ts calls it
 * right after the fetch.
 */

import { MetaGraphApiError } from "./meta-token-response";

/**
 * Throws MetaGraphApiError (status 200) when `payload` is not an insights
 * envelope — i.e. not `{ data: [] }` nor `{ data: [ { name: string, … } ] }`.
 * An empty `data` array is accepted.
 */
export function assertInstagramInsightsShape(payload: unknown): void {
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  const data = body && Array.isArray(body.data) ? body.data : undefined;

  const malformed =
    data === undefined ||
    (data.length > 0 &&
      (data[0] === null ||
        typeof data[0] !== "object" ||
        typeof (data[0] as Record<string, unknown>).name !== "string"));

  if (malformed) {
    throw new MetaGraphApiError(
      "Instagram returned 200 but the insights response was not in the expected shape",
      200,
      payload,
    );
  }
}
