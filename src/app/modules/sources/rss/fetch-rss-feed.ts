import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import {
  request as httpRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import Parser from "rss-parser";

import { normalizeRssItem } from "./normalize-rss-item";
import type { ParsedRssItem } from "./normalize-rss-item";
import type { RssFeedResult } from "./rss-feed.types";
import type { RssSourceConfig } from "./rss-source.types";

/** Total budget for DNS, connection, redirects, and download. */
export const RSS_FETCH_TIMEOUT_MS = 10_000;
export const RSS_FETCH_MAX_BYTES = 5 * 1024 * 1024;
export const RSS_FETCH_MAX_REDIRECTS = 5;

const RSS_REQUEST_HEADERS = {
  Accept:
    "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
  "Accept-Encoding": "identity",
  "User-Agent": "PressCraftor/0.1 RSS reader",
};

const parser = new Parser<Record<string, unknown>, ParsedRssItem>();

/** An RSS URL or resolved address that is not safe for server-side fetching. */
export class RssFetchSecurityError extends Error {}

/** A remote RSS server exceeded an operational limit or returned an invalid response. */
export class RssFetchError extends Error {}

export async function fetchRssFeed(
  source: RssSourceConfig,
): Promise<RssFeedResult> {
  const xml = await fetchRssXml(source.url);
  const feed = await parser.parseString(xml);

  const items = feed.items.flatMap((item) => {
    const normalizedItem = normalizeRssItem(item, source.contentMode);

    return normalizedItem ? [normalizedItem] : [];
  });

  return {
    sourceId: source.id,
    sourceName: source.name,
    fetchedAt: new Date(),
    items,
  };
}

/**
 * Downloads an RSS document without delegating redirects to a generic client.
 * Each hop is parsed and guarded before a connection is opened.
 */
async function fetchRssXml(value: string): Promise<string> {
  const deadline = Date.now() + RSS_FETCH_TIMEOUT_MS;
  let url = parseAllowedRssUrl(value);

  for (let redirectCount = 0; redirectCount <= RSS_FETCH_MAX_REDIRECTS; redirectCount += 1) {
    const response = await requestRssUrl(url, remainingTimeout(deadline));
    const statusCode = response.statusCode ?? 0;

    if (isRedirectStatus(statusCode)) {
      const location = response.headers.location;
      discardResponse(response);

      if (!location || Array.isArray(location)) {
        throw new RssFetchError("RSS redirect did not include a valid location");
      }

      if (redirectCount === RSS_FETCH_MAX_REDIRECTS) {
        throw new RssFetchError("RSS feed exceeded the redirect limit");
      }

      url = parseAllowedRssUrl(location, url);
      continue;
    }

    if (statusCode < 200 || statusCode >= 300) {
      discardResponse(response);
      throw new RssFetchError(`RSS feed returned HTTP ${statusCode}`);
    }

    return readRssResponse(response, remainingTimeout(deadline));
  }

  throw new RssFetchError("RSS feed exceeded the redirect limit");
}

/**
 * Validates URL syntax before every request. DNS is deliberately validated again
 * through the request's lookup callback, immediately before connecting, to avoid
 * trusting a preflight resolution when a hostname changes addresses.
 */
export function parseAllowedRssUrl(value: string, base?: URL): URL {
  let url: URL;

  try {
    url = new URL(value, base);
  } catch {
    throw new RssFetchSecurityError("RSS URL must be a valid absolute HTTP(S) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RssFetchSecurityError("RSS URL must use HTTP or HTTPS");
  }

  if (url.username || url.password) {
    throw new RssFetchSecurityError("RSS URL must not include credentials");
  }

  if (!hasAllowedPort(url)) {
    throw new RssFetchSecurityError("RSS URL uses a disallowed port");
  }

  const hostname = normalizeHostname(url.hostname);

  if (!hostname || isLocalHostname(hostname)) {
    throw new RssFetchSecurityError("RSS URL must target a public host");
  }

  if (isIP(hostname) && isBlockedRssAddress(hostname)) {
    throw new RssFetchSecurityError("RSS URL must not target a private address");
  }

  return url;
}

function requestRssUrl(url: URL, timeoutMs: number): Promise<IncomingMessage> {
  const requestOptions: RequestOptions = {
    protocol: url.protocol,
    hostname: normalizeHostname(url.hostname),
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: RSS_REQUEST_HEADERS,
    lookup: lookupPublicAddress,
  };

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const onResponse = (response: IncomingMessage) => {
      finish(() => resolve(response));
    };
    const request = url.protocol === "https:"
      ? httpsRequest(requestOptions, onResponse)
      : httpRequest(requestOptions, onResponse);

    request.once("error", (error) => finish(() => reject(error)));
    const timeout = setTimeout(() => {
      const error = new RssFetchError("RSS request timed out");
      request.destroy(error);
      finish(() => reject(error));
    }, timeoutMs);
    request.end();
  });
}

/**
 * This lookup runs at connection time rather than merely as an advisory
 * preflight. It closes the DNS-rebinding gap that a fetch-after-lookup approach
 * would leave open.
 */
const lookupPublicAddress: LookupFunction = (hostname, options, callback) => {
  const family = options.family === 4 || options.family === 6
    ? options.family
    : undefined;

  resolvePublicAddress(hostname, family)
    .then((resolved) => {
      // Node 20 may ask a custom lookup for all addresses when its
      // autoSelectFamily connection strategy is enabled. In that mode the
      // callback must receive LookupAddress[], not a bare string; returning a
      // string makes Node try to read `address` from it and fail every feed as
      // "Invalid IP address: undefined".
      if (options.all) {
        callback(null, [resolved]);
        return;
      }

      callback(null, resolved.address, resolved.family);
    })
    .catch((error: unknown) => {
      callback(error as NodeJS.ErrnoException, "", undefined);
    });
};

async function resolvePublicAddress(
  hostname: string,
  family?: number,
): Promise<{ address: string; family: number }> {
  const normalizedHostname = normalizeHostname(hostname);

  if (!normalizedHostname || isLocalHostname(normalizedHostname)) {
    throw new RssFetchSecurityError("RSS URL must target a public host");
  }

  if (isIP(normalizedHostname)) {
    if (isBlockedRssAddress(normalizedHostname)) {
      throw new RssFetchSecurityError("RSS URL must not target a private address");
    }

    return {
      address: normalizedHostname,
      family: isIP(normalizedHostname),
    };
  }

  const addresses = await dnsLookup(normalizedHostname, {
    all: true,
    verbatim: true,
    ...(family === 4 || family === 6 ? { family } : {}),
  });

  if (addresses.length === 0) {
    throw new RssFetchSecurityError("RSS host did not resolve to a public address");
  }

  if (addresses.some(({ address }) => isBlockedRssAddress(address))) {
    throw new RssFetchSecurityError("RSS host resolved to a private address");
  }

  const address = addresses[0];

  if (!address) {
    throw new RssFetchSecurityError("RSS host did not resolve to a public address");
  }

  return address;
}

function readRssResponse(
  response: IncomingMessage,
  timeoutMs: number,
): Promise<string> {
  const declaredLength = contentLength(response.headers["content-length"]);

  if (declaredLength !== undefined && declaredLength > RSS_FETCH_MAX_BYTES) {
    discardResponse(response);
    throw new RssFetchError("RSS response exceeds the maximum allowed size");
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      const error = new RssFetchError("RSS response timed out");
      response.destroy(error);
      finish(() => reject(error));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      callback();
    };

    response.on("data", (chunk: Buffer | Uint8Array | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buffer.length;

      if (receivedBytes > RSS_FETCH_MAX_BYTES) {
        const error = new RssFetchError("RSS response exceeds the maximum allowed size");
        response.destroy(error);
        finish(() => reject(error));
        return;
      }

      chunks.push(buffer);
    });
    response.once("aborted", () => {
      finish(() => reject(new RssFetchError("RSS response was aborted")));
    });
    response.once("error", (error) => finish(() => reject(error)));
    response.once("end", () => {
      finish(() => resolve(decodeRssXml(Buffer.concat(chunks), response.headers["content-type"])));
    });
  });
}

function discardResponse(response: IncomingMessage): void {
  // A discarded response can still emit a socket error. Consume it so a
  // rejected redirect or status code cannot surface as an unhandled event.
  response.once("error", () => undefined);
  response.destroy();
}

function contentLength(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return undefined;
  }

  const length = Number(value);

  return Number.isSafeInteger(length) ? length : undefined;
}

function decodeRssXml(
  buffer: Buffer,
  contentType: string | string[] | undefined,
): string {
  const charset = typeof contentType === "string"
    ? contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]
    : undefined;

  try {
    return new TextDecoder(normalizeCharset(charset)).decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
}

function normalizeCharset(charset: string | undefined): string {
  switch (charset?.trim().toLowerCase()) {
    case "utf8":
      return "utf-8";
    case "latin1":
      return "iso-8859-1";
    default:
      return charset || "utf-8";
  }
}

function remainingTimeout(deadline: number): number {
  const remaining = deadline - Date.now();

  if (remaining <= 0) {
    throw new RssFetchError("RSS request timed out");
  }

  return remaining;
}

function isRedirectStatus(statusCode: number): boolean {
  return statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308;
}

function hasAllowedPort(url: URL): boolean {
  if (!url.port) return true;

  return (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443");
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localdomain") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan");
}

/** True for loopback, link-local, RFC1918, carrier-grade NAT, and reserved IPs. */
export function isBlockedRssAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return isBlockedIpv4(address);
  }

  if (family === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return true;
  }

  const [first = -1, second = -1, third = -1] = octets;

  return first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113);
}

function isBlockedIpv6(address: string): boolean {
  const groups = expandIpv6(address);

  if (!groups) return true;

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) &&
    groups[7] === 1;
  const isUniqueLocal = (groups[0]! & 0xfe00) === 0xfc00;
  const isLinkLocal = (groups[0]! & 0xffc0) === 0xfe80;
  const isSiteLocal = (groups[0]! & 0xffc0) === 0xfec0;
  const isMulticast = (groups[0]! & 0xff00) === 0xff00;

  if (
    isUnspecified ||
    isLoopback ||
    isUniqueLocal ||
    isLinkLocal ||
    isSiteLocal ||
    isMulticast
  ) {
    return true;
  }

  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) &&
    (groups[5] === 0 || groups[5] === 0xffff);

  if (isIpv4Mapped) {
    return isBlockedIpv4(groupsToIpv4(groups));
  }

  return false;
}

function expandIpv6(address: string): number[] | undefined {
  const normalized = address.toLowerCase().split("%")[0];

  if (!normalized || normalized.split("::").length > 2) {
    return undefined;
  }

  const [left = "", right = ""] = normalized.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const convertedParts = convertIpv4Tail([...leftParts, ...rightParts]);

  if (!convertedParts) return undefined;

  const hasCompression = normalized.includes("::");
  const missingGroups = 8 - convertedParts.length;

  if (missingGroups < 0 || (!hasCompression && missingGroups !== 0)) {
    return undefined;
  }

  const groups = [
    ...leftParts,
    ...Array(Math.max(0, missingGroups)).fill("0"),
    ...rightParts,
  ];
  const finalParts = convertIpv4Tail(groups);

  if (!finalParts || finalParts.length !== 8) return undefined;

  const values = finalParts.map((part) => Number.parseInt(part, 16));

  return values.every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 0xffff,
  ) ? values : undefined;
}

function convertIpv4Tail(parts: string[]): string[] | undefined {
  const last = parts.at(-1);

  if (!last?.includes(".")) {
    return parts;
  }

  if (isIP(last) !== 4) return undefined;

  const octets = last.split(".").map(Number);
  const high = (octets[0]! << 8) | octets[1]!;
  const low = (octets[2]! << 8) | octets[3]!;

  return [...parts.slice(0, -1), high.toString(16), low.toString(16)];
}

function groupsToIpv4(groups: number[]): string {
  return [
    groups[6]! >> 8,
    groups[6]! & 0xff,
    groups[7]! >> 8,
    groups[7]! & 0xff,
  ].join(".");
}
