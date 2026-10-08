import "server-only";

import { after } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { apiRequestLog } from "@/db/schema";

import {
  clientIp,
  loggableBody,
  loggablePath,
  loggableQuery,
  retentionDays,
  shouldCaptureRequestBody,
  shouldCaptureResponseBody,
} from "./api-request-log.core";
import { sanitize } from "./log.core";
import { createLogger, enterRequestLogContext, type LogContext } from "./logger";

const log = createLogger("api");

type Handler<Req extends Request, A extends unknown[], R extends Response> = (request: Req, ...args: A) => R | Promise<R>;

/**
 * Records every call of a route handler in `api_request_log` (FEAT-OBS-001):
 * who called which route, the status, how long it took and redacted bodies.
 * The row is written after the response is sent, so it adds no latency, and
 * a failure to write it never affects the request.
 *
 *   export const GET = withApiLog(route_GET);
 */
export function withApiLog<Req extends Request, A extends unknown[], R extends Response>(
  handler: Handler<Req, A, R>,
): (request: Req, ...args: A) => Promise<R> {
  return async (request: Req, ...args: A): Promise<R> => {
    const started = performance.now();
    const context = enterRequestLogContext(request);
    let url: URL | undefined;
    try { url = new URL(request.url); } catch { url = undefined; }
    const pathname = url?.pathname ?? "";
    const requestBody = shouldCaptureRequestBody(request.method, request.headers, pathname)
      ? request.clone().text().catch(() => null)
      : Promise.resolve(null);

    let response: R | undefined;
    let failure: unknown;
    try {
      response = await handler(request, ...args);
      return response;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - started);
      const status = response?.status ?? 500;
      const contentType = response?.headers.get("content-type") ?? null;
      const responseBody = response && shouldCaptureResponseBody(request.method, status, contentType, pathname)
        ? response.clone().text().catch(() => null)
        : Promise.resolve(null);
      const length = Number(response?.headers.get("content-length"));
      const write = async () => {
        try {
          await db.insert(apiRequestLog).values({
            requestId: context.requestId,
            workspaceId: text(context.workspaceId),
            topicId: text(context.topicId),
            actorType: text(context.actor),
            actorId: text(context.userId),
            method: request.method,
            path: loggablePath(pathname),
            query: url ? loggableQuery(url.search) : null,
            status,
            durationMs,
            requestBody: loggableBody(await requestBody, request.headers.get("content-type")),
            responseBody: loggableBody(await responseBody, contentType),
            responseBytes: Number.isFinite(length) ? length : null,
            error: failure ? JSON.stringify(sanitize(failure)).slice(0, 4_000) : null,
            ip: clientIp(request.headers),
            userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          });
        } catch (error) {
          log.error("API request could not be logged", { path: pathname, status, error });
        }
      };
      if (status >= 500) log.error("API request failed", { status, durationMs });
      try {
        after(write);
      } catch {
        // Outside a request scope (tests, scripts): nothing to log.
      }
    }
  };
}

function text(value: LogContext[string]): string | null {
  return typeof value === "string" && value ? value.slice(0, 200) : null;
}

/** Deletes request logs older than the retention window, in bounded batches. */
export async function purgeExpiredRequestLogs(maxRows = 20_000): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays(process.env.API_REQUEST_LOG_RETENTION_DAYS) * 86_400_000);
  const result = await db.execute(sql`DELETE FROM api_request_log WHERE id IN (
    SELECT id FROM api_request_log WHERE occurred_at < ${cutoff} LIMIT ${maxRows})`);
  return Number(result.rowCount ?? 0);
}

