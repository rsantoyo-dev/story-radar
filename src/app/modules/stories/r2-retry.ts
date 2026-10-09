/**
 * A failure worth retrying: no HTTP answer at all (a dropped or corrupted
 * connection, such as a TLS "bad record mac" alert, which the AWS SDK's own
 * retry does not classify as transient), or a timeout, throttling or server
 * error. A 4xx answer is the request's own fault and is never retried.
 */
export function isTransientR2Failure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  if ((error as { name?: unknown }).name === "AbortError") return false;
  const status = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode;
  if (typeof status !== "number") return true;
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Runs an idempotent R2 request (a PUT of the same bytes under the same key)
 * again after a transient failure, waiting a little longer each time. Stops at
 * once when the caller aborts.
 */
export async function withTransientR2Retry<T>(
  request: () => Promise<T>,
  { attempts = 3, delaysMs = [300, 900], signal, wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) }: {
    attempts?: number;
    delaysMs?: readonly number[];
    signal?: AbortSignal;
    wait?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= attempts || signal?.aborted || !isTransientR2Failure(error)) throw error;
      await wait(delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0);
    }
  }
}
