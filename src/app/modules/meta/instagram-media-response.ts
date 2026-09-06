/**
 * Parsing for the "GET /{ig-user-id}/media" list response (IG-02). Split out
 * of meta-graph-client.ts (which needs "server-only" for real HTTP with the
 * access token) so this pure, tolerant parsing stays directly unit-testable —
 * the same split used by meta-token-response.ts and meta-oauth-state.ts.
 *
 * Tolerant on purpose: article content and model/API responses are untrusted
 * data. Entries missing an `id` or a usable `timestamp` are dropped rather
 * than failing the whole page.
 */

export type InstagramMediaChildNode = {
  externalId: string;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
};

export type InstagramMediaNode = {
  externalId: string;
  mediaType: string;
  mediaProductType: string | null;
  permalink: string | null;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  /** ISO string; a Date is derived by the repository. */
  publishedAt: string;
  children: InstagramMediaChildNode[];
  /** The raw Graph node, persisted as a snapshot. */
  raw: Record<string, unknown>;
};

export type InstagramMediaListPage = {
  media: InstagramMediaNode[];
  /** paging.cursors.after — present only when paging.next exists. */
  nextCursor?: string;
};

export function parseInstagramMediaListResponse(
  payload: unknown,
): InstagramMediaListPage {
  const body = asRecord(payload);
  const data = Array.isArray(body?.data) ? body!.data : [];

  const media = data.flatMap((entry) => {
    const node = asRecord(entry);
    const externalId = asNonEmptyString(node?.id);
    const publishedAt = asTimestamp(node?.timestamp);
    if (!node || !externalId || !publishedAt) return [];

    return [
      {
        externalId,
        mediaType: asNonEmptyString(node.media_type) ?? "UNKNOWN",
        mediaProductType: asNonEmptyString(node.media_product_type) ?? null,
        permalink: asNonEmptyString(node.permalink) ?? null,
        caption: typeof node.caption === "string" ? node.caption : null,
        mediaUrl: asNonEmptyString(node.media_url) ?? null,
        thumbnailUrl: asNonEmptyString(node.thumbnail_url) ?? null,
        publishedAt,
        children: parseChildren(node.children),
        raw: node,
      } satisfies InstagramMediaNode,
    ];
  });

  const nextCursor = extractNextCursor(body?.paging);
  return nextCursor ? { media, nextCursor } : { media };
}

function parseChildren(value: unknown): InstagramMediaChildNode[] {
  const record = asRecord(value);
  const list = Array.isArray(record?.data) ? record!.data : [];
  return list.flatMap((entry) => {
    const child = asRecord(entry);
    const externalId = asNonEmptyString(child?.id);
    if (!child || !externalId) return [];
    return [
      {
        externalId,
        mediaType: asNonEmptyString(child.media_type) ?? "UNKNOWN",
        mediaUrl: asNonEmptyString(child.media_url) ?? null,
        thumbnailUrl: asNonEmptyString(child.thumbnail_url) ?? null,
      } satisfies InstagramMediaChildNode,
    ];
  });
}

function extractNextCursor(paging: unknown): string | undefined {
  const record = asRecord(paging);
  if (!record || typeof record.next !== "string" || !record.next) return undefined;
  const cursors = asRecord(record.cursors);
  return asNonEmptyString(cursors?.after);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
