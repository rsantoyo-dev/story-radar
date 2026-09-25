import "server-only";

import { createHash } from "node:crypto";

import { fetchPublicPdf } from "@/app/modules/documents/fetch-public-pdf";
import { extractArticleContent } from "@/app/modules/stories/extract-article-content";
import { fetchArticleHtml } from "@/app/modules/stories/fetch-article-html";
import { fetchRssFeed } from "./rss/fetch-rss-feed";
import { sourceContribution, type SourceContribution } from "./source-contribution";

// Multipart requests to the deployed route must stay below the function body limit.
const MAX_UPLOAD_BYTES = 4_000_000;

export type DetectedSource = {
  contribution: SourceContribution;
  fingerprint: string;
  preview: string;
};

export class SourceDetectionError extends Error {}

export async function detectUrlSource(value: string): Promise<DetectedSource> {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new SourceDetectionError("Enter a valid public HTTP(S) URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new SourceDetectionError("Enter a public HTTP(S) URL without credentials");
  }
  url.hash = "";
  const address = url.href;
  const path = url.pathname.toLowerCase();
  const order = path.endsWith(".pdf") ? ["document", "rss", "article"]
    : /(?:\.xml$|\.rss$|\.atom$|\/feed\/?$)/.test(path) ? ["rss", "article", "document"]
    : ["article", "rss", "document"];
  const errors: string[] = [];

  for (const type of order) {
    try {
      if (type === "rss") {
        const feed = await fetchRssFeed({
          id: address, name: url.hostname, url: address, language: "unknown", region: "global",
          tags: [], contentMode: "auto", pollEveryMinutes: 60, enabled: true,
        });
        const fingerprint = hash(JSON.stringify(feed.items));
        return {
          contribution: sourceContribution({
            sourceType: "rss", sourceUrl: address, acquiredAt: feed.fetchedAt,
            title: url.hostname, mimeType: "application/rss+xml", contentHash: fingerprint,
            metadata: { itemCount: feed.items.length },
          }),
          fingerprint,
          preview: `${feed.items.length} readable feed items`,
        };
      }
      if (type === "article") {
        const fetched = await fetchArticleHtml(address);
        const article = extractArticleContent(fetched.html, fetched.resolvedUrl);
        const fingerprint = hash(article.text);
        return {
          contribution: sourceContribution({
            sourceType: "article", sourceUrl: fetched.resolvedUrl, acquiredAt: new Date(),
            title: article.title ?? url.hostname, text: article.text,
            mimeType: "text/html", contentHash: fingerprint,
            metadata: { wordCount: article.wordCount, contentStatus: article.status },
          }),
          fingerprint,
          preview: article.excerpt ?? article.text.slice(0, 400),
        };
      }
      const fetched = await fetchPublicPdf(address);
      const fingerprint = hash(fetched.bytes);
      return {
        contribution: sourceContribution({
          sourceType: "document", sourceUrl: fetched.resolvedUrl, acquiredAt: new Date(),
          title: fileNameFromUrl(fetched.resolvedUrl), mimeType: "application/pdf",
          contentHash: fingerprint, metadata: { size: fetched.bytes.byteLength },
        }),
        fingerprint,
        preview: `PDF · ${Math.round(fetched.bytes.byteLength / 1024)} KB`,
      };
    } catch (error) {
      errors.push(`${type}: ${error instanceof Error ? error.message : "unreadable"}`);
    }
  }
  throw new SourceDetectionError(`Could not identify a readable feed, article, or PDF. ${errors.join("; ")}`);
}

export async function detectUploadedPdf(file: File): Promise<DetectedSource & { bytes: Uint8Array }> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new SourceDetectionError("PDF uploads must be between 1 byte and 4 MB. Larger PDFs can be added by URL.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new SourceDetectionError("The uploaded file is not a PDF");
  }
  const fingerprint = hash(bytes);
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120) || "document.pdf";
  const sourceUrl = `https://uploads.press-craftor.invalid/${fingerprint}/document.pdf`;
  return {
    bytes,
    contribution: sourceContribution({
      sourceType: "document", sourceUrl, acquiredAt: new Date(),
      title: safeName.replace(/\.pdf$/i, ""), mimeType: "application/pdf",
      contentHash: fingerprint, originalFilename: file.name,
      metadata: { size: bytes.byteLength, uploaded: true },
    }),
    fingerprint,
    preview: `PDF upload · ${Math.round(bytes.byteLength / 1024)} KB`,
  };
}

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileNameFromUrl(value: string): string {
  const path = new URL(value).pathname;
  return decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "PDF document");
}
