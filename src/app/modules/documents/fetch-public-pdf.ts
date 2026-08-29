import "server-only";

import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import {
  KnowledgeDocumentFetchError,
  KnowledgeDocumentValidationError,
} from "./knowledge-document.types";

const PDF_FETCH_TIMEOUT_MS = 30_000;
const MAX_PDF_BYTES = 40_000_000;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "PressCraftor/0.1 (+editorial research; public document ingestion)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];
const blockedAddresses = createBlockedAddressList();

export type FetchedPublicPdf = {
  bytes: Uint8Array;
  resolvedUrl: string;
  lastModified?: string;
};

export function normalizeKnowledgeDocumentUrl(value: string): string {
  const url = parsePdfUrl(value);
  url.hash = "";
  return url.href;
}

export async function fetchPublicPdf(sourceUrl: string): Promise<FetchedPublicPdf> {
  let currentUrl = parsePdfUrl(sourceUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicUrl(currentUrl);

    let response: Response;

    try {
      response = await fetch(currentUrl, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS),
        headers: {
          Accept: "application/pdf,application/octet-stream;q=0.8",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (error) {
      throw new KnowledgeDocumentFetchError(
        isTimeoutError(error)
          ? "The PDF request timed out"
          : "The PDF could not be downloaded",
      );
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (!location) {
        throw new KnowledgeDocumentFetchError(
          "The PDF returned a redirect without a destination",
        );
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new KnowledgeDocumentFetchError(
          "The PDF exceeded the redirect limit",
        );
      }

      currentUrl = parsePdfUrl(new URL(location, currentUrl).href);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new KnowledgeDocumentFetchError(
        `The PDF returned HTTP ${response.status}`,
      );
    }

    validatePdfResponse(response);
    const bytes = await readResponseBytes(response);

    if (!hasPdfSignature(bytes)) {
      throw new KnowledgeDocumentFetchError(
        "The downloaded file is not a readable PDF",
      );
    }

    return {
      bytes,
      resolvedUrl: currentUrl.href,
      ...(response.headers.get("last-modified")
        ? { lastModified: response.headers.get("last-modified") ?? undefined }
        : {}),
    };
  }

  throw new KnowledgeDocumentFetchError("The PDF exceeded the redirect limit");
}

function parsePdfUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new KnowledgeDocumentValidationError("The PDF URL is invalid");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new KnowledgeDocumentValidationError(
      "Only HTTP and HTTPS PDF URLs are supported",
    );
  }

  if (url.username || url.password) {
    throw new KnowledgeDocumentValidationError(
      "PDF URLs cannot contain credentials",
    );
  }

  if (url.port) {
    throw new KnowledgeDocumentValidationError(
      "PDF URLs must use a standard web port",
    );
  }

  if (url.href.length > 2_048) {
    throw new KnowledgeDocumentValidationError("The PDF URL is too long");
  }

  return url;
}

async function validatePublicUrl(url: URL): Promise<void> {
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/\.$/, "");

  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new KnowledgeDocumentValidationError(
      "Local and private PDF hosts are not allowed",
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
    throw new KnowledgeDocumentFetchError("The PDF host could not be resolved");
  }

  if (addresses.length === 0) {
    throw new KnowledgeDocumentFetchError("The PDF host returned no addresses");
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
    throw new KnowledgeDocumentValidationError(
      "Local and private network addresses are not allowed",
    );
  }
}

function validatePdfResponse(response: Response): void {
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (
    contentType &&
    !contentType.startsWith("application/pdf") &&
    !contentType.startsWith("application/octet-stream")
  ) {
    void response.body?.cancel();
    throw new KnowledgeDocumentFetchError("The URL did not return a PDF");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_BYTES) {
    void response.body?.cancel();
    throw new KnowledgeDocumentValidationError(
      "The PDF is larger than the 40 MB ingestion limit",
    );
  }
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    throw new KnowledgeDocumentFetchError("The PDF response was empty");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_PDF_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new KnowledgeDocumentValidationError(
        "The PDF is larger than the 40 MB ingestion limit",
      );
    }
    chunks.push(value);
  }

  if (totalBytes === 0) {
    throw new KnowledgeDocumentFetchError("The PDF response was empty");
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
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
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
    ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
    ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  const ipv6Subnets: Array<[string, number]> = [
    ["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64],
    ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
  ];
  ipv4Subnets.forEach(([address, prefix]) => list.addSubnet(address, prefix, "ipv4"));
  ipv6Subnets.forEach(([address, prefix]) => list.addSubnet(address, prefix, "ipv6"));
  return list;
}
