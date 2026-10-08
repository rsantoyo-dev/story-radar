import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestIsOperator } from "@/app/api/radar/radar-api-auth";
import { db } from "@/db/client";
import { dbChangeLog } from "@/db/schema";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Row-level change history of the critical tables, newest first. Platform
 * operators only: it spans workspaces. Filters: `table`, `rowKey`,
 * `transactionId`, `before` (ISO time), `limit` (≤ 200).
 */
export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  if (!requestIsOperator(request)) {
    return NextResponse.json({ error: "Only the platform operator can read the change history." }, { status: 403, headers: NO_STORE });
  }
  const params = new URL(request.url).searchParams;
  const filters: SQL[] = [];
  const table = params.get("table")?.trim();
  if (table && /^[a-z_]{1,63}$/u.test(table)) filters.push(eq(dbChangeLog.tableName, table));
  const rowKey = params.get("rowKey")?.trim();
  if (rowKey && rowKey.length <= 300) filters.push(eq(dbChangeLog.rowKey, rowKey));
  const transactionId = Number(params.get("transactionId"));
  if (Number.isSafeInteger(transactionId) && transactionId > 0) filters.push(eq(dbChangeLog.transactionId, transactionId));
  const before = params.get("before") ? new Date(params.get("before")!) : undefined;
  if (before && !Number.isNaN(before.getTime())) filters.push(lt(dbChangeLog.occurredAt, before));
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);

  try {
    const changes = await db.select().from(dbChangeLog).where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(dbChangeLog.occurredAt)).limit(limit);
    return NextResponse.json({ changes, nextBefore: changes.length === limit ? changes.at(-1)?.occurredAt.toISOString() : null }, { headers: NO_STORE });
  } catch (error) {
    console.error("Change history could not be read", error);
    return NextResponse.json({ error: "The change history is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
