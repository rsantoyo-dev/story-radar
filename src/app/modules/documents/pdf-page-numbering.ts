import type { ExtractedPdfPage } from "./knowledge-document.types";

/**
 * Adds printed folio numbers only when at least three page headers establish
 * the same offset from the physical PDF index. This avoids treating isolated
 * years, measurements, or section numbers as page labels.
 */
export function annotatePrintedPageNumbers(
  pages: readonly ExtractedPdfPage[],
): ExtractedPdfPage[] {
  const candidates = pages.map((page) => ({
    page,
    printedPageNumber: printedPageCandidate(page.text),
  }));
  const offsetCounts = new Map<number, number>();
  candidates.forEach(({ page, printedPageNumber }) => {
    if (printedPageNumber === undefined) return;
    const offset = page.pageNumber - printedPageNumber;
    offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
  });
  const dominant = [...offsetCounts.entries()].sort(
    ([leftOffset, leftCount], [rightOffset, rightCount]) =>
      rightCount - leftCount || Math.abs(leftOffset) - Math.abs(rightOffset),
  )[0];
  if (!dominant || dominant[1] < 3) return pages.map((page) => ({ ...page }));

  const [dominantOffset] = dominant;
  return candidates.map(({ page, printedPageNumber }) =>
    printedPageNumber !== undefined &&
    page.pageNumber - printedPageNumber === dominantOffset
      ? { ...page, printedPageNumber }
      : { ...page },
  );
}

function printedPageCandidate(value: string): number | undefined {
  const header = value.slice(0, 140).replace(/\s+/gu, " ").trim();
  const leading = header.match(/^(\d{1,4})(?=\s*\p{L})/u)?.[1];
  const afterRunningHeader = header.match(
    /^\p{L}[\p{L}\s]{0,50}\s(\d{1,4})(?=\D|$)/u,
  )?.[1];
  const parsed = Number.parseInt(leading ?? afterRunningHeader ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
