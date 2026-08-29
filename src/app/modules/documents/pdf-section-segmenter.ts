import { createHash } from "node:crypto";

import type {
  ExtractedKnowledgeSection,
  ExtractedPdfPage,
  PdfOutlineEntry,
} from "./knowledge-document.types";

const TARGET_CHUNK_WORDS = 650;

export function segmentPdfPages(
  pages: readonly ExtractedPdfPage[],
  outline: readonly PdfOutlineEntry[],
): ExtractedKnowledgeSection[] {
  const orderedHeadings = [...outline]
    .filter((entry) => entry.title.trim() && entry.pageNumber > 0)
    .sort(
      (left, right) =>
        left.pageNumber - right.pageNumber || left.level - right.level,
    );
  // Page-level extraction cannot split two headings that begin on the same
  // PDF page. Prefer the deepest entry because it is the most specific
  // description of the content that follows. For sibling headings at the same
  // depth, preserve the first outline entry so a later subheading does not
  // incorrectly label the entire page.
  const headings = orderedHeadings.filter((entry, index, entries) => {
    const samePage = entries.filter(
      (candidate) => candidate.pageNumber === entry.pageNumber,
    );
    const deepestLevel = Math.max(...samePage.map((candidate) => candidate.level));
    return (
      entry.level === deepestLevel &&
      samePage.find((candidate) => candidate.level === deepestLevel) === entry &&
      (index === 0 || entry.pageNumber !== entries[index - 1]?.pageNumber ||
        entry.level > (entries[index - 1]?.level ?? -1))
    );
  });
  const drafts: Array<Omit<ExtractedKnowledgeSection, "ordinal" | "textHash" | "characterCount">> = [];
  let activeHeading = headings[0]?.pageNumber === 1
    ? outlineHeading(headings[0])
    : "Document overview";
  let headingIndex = headings[0]?.pageNumber === 1 ? 1 : 0;
  let buffered: ExtractedPdfPage[] = [];
  let bufferedWords = 0;

  const flush = () => {
    const text = buffered.map((page) => page.text).filter(Boolean).join("\n\n").trim();
    if (text) {
      const printedPages = buffered.flatMap((page) =>
        page.printedPageNumber === undefined ? [] : [page.printedPageNumber],
      );
      drafts.push({
        heading: activeHeading,
        pageStart: buffered[0]?.pageNumber ?? 1,
        pageEnd: buffered.at(-1)?.pageNumber ?? 1,
        ...(printedPages.length > 0
          ? {
              printedPageStart: printedPages[0]!,
              printedPageEnd: printedPages.at(-1)!,
            }
          : {}),
        text,
      });
    }
    buffered = [];
    bufferedWords = 0;
  };

  for (const page of pages) {
    const nextHeading = headings[headingIndex];
    if (nextHeading && nextHeading.pageNumber <= page.pageNumber) {
      flush();
      activeHeading = outlineHeading(nextHeading);
      headingIndex += 1;
    }

    if (!page.text.trim()) continue;
    buffered.push(page);
    bufferedWords += wordCount(page.text);
    if (bufferedWords >= TARGET_CHUNK_WORDS) flush();
  }
  flush();

  const headingTotals = new Map<string, number>();
  for (const draft of drafts) {
    headingTotals.set(draft.heading, (headingTotals.get(draft.heading) ?? 0) + 1);
  }
  const headingParts = new Map<string, number>();

  return drafts.map((draft, ordinal) => {
    const part = (headingParts.get(draft.heading) ?? 0) + 1;
    headingParts.set(draft.heading, part);
    const heading = (headingTotals.get(draft.heading) ?? 0) > 1
      ? `${draft.heading} · Part ${part}`
      : draft.heading;
    return {
      ...draft,
      ordinal,
      heading,
      textHash: createHash("sha256").update(draft.text).digest("hex"),
      characterCount: draft.text.length,
    };
  });
}

function outlineHeading(entry: PdfOutlineEntry): string {
  const path = (entry.path ?? [entry.title])
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  return [...new Set(path)].join(" › ") || entry.title.trim();
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}
