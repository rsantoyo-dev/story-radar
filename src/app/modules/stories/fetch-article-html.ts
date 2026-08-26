import "server-only";

import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const ARTICLE_FETCH_TIMEOUT_MS = 12_000;
const MAX_ARTICLE_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "PressCraftor/0.1 (+local editorial research; article enrichment)";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];
const blockedAddresses = createBlockedAddressList();

export type FetchedArticleHtml = {
  html: string;
  resolvedUrl: string;
};

export class ArticleAccessBlockedError extends Error {}
export class PublisherArticleAccessBlockedError extends ArticleAccessBlockedError {}
export class ArticleFetchError extends Error {}

export async function fetchArticleHtml(
  sourceUrl: string,
): Promise<FetchedArticleHtml> {
  let currentUrl = parseArticleUrl(sourceUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicArticleUrl(currentUrl);

    let response: Response;

    try {
      response = await fetch(currentUrl, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (error) {
      if (error instanceof ArticleAccessBlockedError) {
        throw error;
      }

      throw new ArticleFetchError(
        isTimeoutError(error)
          ? "The article request timed out"
          : "The article page could not be downloaded",
      );
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (!location) {
        throw new ArticleFetchError(
          "The article returned a redirect without a destination",
        );
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new ArticleAccessBlockedError(
          "The article exceeded the redirect limit",
        );
      }

      currentUrl = parseArticleUrl(new URL(location, currentUrl).href);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);

      if ([401, 403, 407, 429, 451].includes(response.status)) {
        throw new PublisherArticleAccessBlockedError(
          `The publisher blocked article access (HTTP ${response.status})`,
        );
      }

      throw new ArticleFetchError(
        `The article returned HTTP ${response.status}`,
      );
    }

    validateHtmlResponse(response);

    return {
      html: await readResponseText(response),
      resolvedUrl: currentUrl.href,
    };
  }

  throw new ArticleAccessBlockedError("The article exceeded the redirect limit");
}

function parseArticleUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ArticleAccessBlockedError("The story URL is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ArticleAccessBlockedError(
      "Only HTTP and HTTPS article URLs are supported",
    );
  }

  if (url.username || url.password) {
    throw new ArticleAccessBlockedError(
      "Article URLs cannot contain credentials",
    );
  }

  if (url.port) {
    throw new ArticleAccessBlockedError(
      "Article URLs must use a standard web port",
    );
  }

  if (url.href.length > 2_048) {
    throw new ArticleAccessBlockedError("The story URL is too long");
  }

  return url;
}

async function validatePublicArticleUrl(url: URL): Promise<void> {
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/\.$/, "");

  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new ArticleAccessBlockedError(
      "Local and private article hosts are not allowed",
    );
  }

  const addressType = isIP(hostname);

  if (addressType > 0) {
    assertPublicAddress(hostname, addressType);
    return;
  }

  let addresses: LookupAddress[];

  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ArticleFetchError("The article host could not be resolved");
  }

  if (addresses.length === 0) {
    throw new ArticleFetchError("The article host returned no addresses");
  }

  addresses.forEach(({ address, family }) =>
    assertPublicAddress(address, family),
  );
}

function assertPublicAddress(address: string, family: number): void {
  const type = family === 6 ? "ipv6" : "ipv4";

  if (
    (family === 6 && address.toLocaleLowerCase("en-US").startsWith("::ffff:")) ||
    blockedAddresses.check(address, type)
  ) {
    throw new ArticleAccessBlockedError(
      "Local and private network addresses are not allowed",
    );
  }
}

function validateHtmlResponse(response: Response): void {
  const contentType = response.headers.get("content-type")?.toLowerCase();

  if (
    !contentType ||
    (!contentType.startsWith("text/html") &&
      !contentType.startsWith("application/xhtml+xml"))
  ) {
    void response.body?.cancel();
    throw new ArticleFetchError("The story URL did not return an HTML page");
  }

  const declaredLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > MAX_ARTICLE_BYTES) {
    void response.body?.cancel();
    throw new ArticleAccessBlockedError(
      "The article page is larger than the download limit",
    );
  }
}

async function readResponseText(response: Response): Promise<string> {
  if (!response.body) {
    throw new ArticleFetchError("The article response was empty");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_ARTICLE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ArticleAccessBlockedError(
        "The article page is larger than the download limit",
      );
    }

    chunks.push(value);
  }

  if (totalBytes === 0) {
    throw new ArticleFetchError("The article response was empty");
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return decodeResponseBody(body, response.headers.get("content-type"));
}

function decodeResponseBody(body: Uint8Array, contentType: string | null): string {
  const charset = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];

  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function createBlockedAddressList(): BlockList {
  const list = new BlockList();
  const ipv4Subnets: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  const ipv6Subnets: Array<[string, number]> = [
    ["::", 128],
    ["::1", 128],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];

  ipv4Subnets.forEach(([address, prefix]) =>
    list.addSubnet(address, prefix, "ipv4"),
  );
  ipv6Subnets.forEach(([address, prefix]) =>
    list.addSubnet(address, prefix, "ipv6"),
  );

  return list;
}
