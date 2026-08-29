import "server-only";

import type {
  ExtractedPdfDocument,
  ExtractedPdfPage,
  PdfOutlineEntry,
} from "./knowledge-document.types";
import { KnowledgeDocumentExtractionError } from "./knowledge-document.types";
import { segmentPdfPages } from "./pdf-section-segmenter";
import { annotatePrintedPageNumbers } from "./pdf-page-numbering";

const PDF_PAGE_EXTRACTION_CONCURRENCY = 6;

export async function extractPdfDocument(
  bytes: Uint8Array,
  fallbackTitle: string,
  onProgress?: (pagesProcessed: number, pagesTotal: number) => Promise<void>,
): Promise<ExtractedPdfDocument> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  try {
    const pdf = await loadingTask.promise;
    const [metadata, outline] = await Promise.all([
      pdf.getMetadata().catch(() => undefined),
      extractOutline(pdf).catch(() => []),
    ]);
    const pages = new Array<ExtractedPdfPage>(pdf.numPages);
    let nextPageNumber = 1;
    let pagesProcessed = 0;
    let lastReported = 0;

    const worker = async () => {
      while (nextPageNumber <= pdf.numPages) {
        const pageNumber = nextPageNumber;
        nextPageNumber += 1;
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          const text = normalizePageText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
          pages[pageNumber - 1] = { pageNumber, text };
        } finally {
          page.cleanup();
        }

        pagesProcessed += 1;
        const reportable = pagesProcessed === pdf.numPages
          ? pagesProcessed
          : Math.floor(pagesProcessed / 20) * 20;
        if (onProgress && reportable > lastReported) {
          lastReported = reportable;
          await onProgress(reportable, pdf.numPages).catch((error) => {
            console.warn("Unable to persist PDF extraction progress", {
              pagesProcessed: reportable,
              pagesTotal: pdf.numPages,
              error,
            });
          });
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(PDF_PAGE_EXTRACTION_CONCURRENCY, pdf.numPages) },
        () => worker(),
      ),
    );

    const sections = segmentPdfPages(
      annotatePrintedPageNumbers(pages),
      outline,
    );
    if (sections.length === 0) {
      throw new KnowledgeDocumentExtractionError(
        "The PDF has no extractable text; OCR is required",
      );
    }

    const info = metadata?.info as Record<string, unknown> | undefined;
    return {
      title: metadataText(info?.Title) ?? fallbackTitle,
      ...(metadataText(info?.Author) ? { author: metadataText(info?.Author) } : {}),
      ...(metadataText(info?.Subject) ? { subject: metadataText(info?.Subject) } : {}),
      pageCount: pdf.numPages,
      sections,
    };
  } catch (error) {
    if (error instanceof KnowledgeDocumentExtractionError) throw error;
    throw new KnowledgeDocumentExtractionError(
      error instanceof Error
        ? `The PDF could not be extracted: ${error.message}`
        : "The PDF could not be extracted",
    );
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

async function extractOutline(pdf: {
  getOutline(): Promise<unknown[] | null>;
  getDestination(destination: string): Promise<unknown[] | null>;
  getPageIndex(reference: unknown): Promise<number>;
}): Promise<PdfOutlineEntry[]> {
  const root = await pdf.getOutline();
  if (!root) return [];
  const entries: PdfOutlineEntry[] = [];

  async function visit(
    items: unknown[],
    level: number,
    ancestors: readonly string[],
  ): Promise<void> {
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as { title?: unknown; dest?: unknown; items?: unknown };
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const destination = typeof item.dest === "string"
        ? await pdf.getDestination(item.dest)
        : Array.isArray(item.dest) ? item.dest : null;

      if (title && destination?.[0]) {
        const pageNumber = await pdf.getPageIndex(destination[0]).then((index) => index + 1).catch(() => 0);
        if (pageNumber > 0) {
          entries.push({
            title,
            pageNumber,
            level,
            path: [...ancestors, title],
          });
        }
      }

      if (Array.isArray(item.items)) {
        await visit(
          item.items,
          level + 1,
          title ? [...ancestors, title] : ancestors,
        );
      }
    }
  }

  await visit(root, 0, []);
  return entries;
}

function normalizePageText(value: string): string {
  return value
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

function metadataText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
