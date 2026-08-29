export type KnowledgeChapterSection = {
  id: string;
  ordinal: number;
  heading: string;
  pageStart: number;
  pageEnd: number;
  printedPageStart?: number;
  printedPageEnd?: number;
  characterCount: number;
  candidateStoryId?: string;
};

export type KnowledgeChapter<
  Section extends KnowledgeChapterSection = KnowledgeChapterSection,
> = {
  /** Stable identifier for this extracted version: the first technical chunk. */
  id: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
  printedPageStart?: number;
  printedPageEnd?: number;
  characterCount: number;
  partCount: number;
  sectionIds: string[];
  sections: Section[];
  candidateStoryId?: string;
  hasPartialCandidate: boolean;
};

const PART_SUFFIX = /\s*·\s*Part\s+\d+\s*$/iu;

/**
 * PDF extraction chunks are optimized for model context and citations. This
 * groups contiguous numbered parts back into the chapter a human should see
 * and promote into Stories.
 */
export function groupKnowledgeSectionsIntoChapters<
  Section extends KnowledgeChapterSection,
>(sections: readonly Section[]): KnowledgeChapter<Section>[] {
  const ordered = [...sections].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  const grouped: Array<{ heading: string; sections: Section[] }> = [];

  for (const section of ordered) {
    const heading = knowledgeChapterHeading(section.heading);
    const previous = grouped.at(-1);
    if (previous && previous.heading === heading) {
      previous.sections.push(section);
    } else {
      grouped.push({ heading, sections: [section] });
    }
  }

  return grouped.map(({ heading, sections: chapterSections }) => {
    const candidateIds = new Set(
      chapterSections.flatMap((section) =>
        section.candidateStoryId ? [section.candidateStoryId] : [],
      ),
    );
    const completeCandidate =
      candidateIds.size === 1 &&
      chapterSections.every((section) => Boolean(section.candidateStoryId));
    const printedStarts = chapterSections.flatMap((section) =>
      section.printedPageStart === undefined ? [] : [section.printedPageStart],
    );
    const printedEnds = chapterSections.flatMap((section) =>
      section.printedPageEnd === undefined ? [] : [section.printedPageEnd],
    );

    return {
      id: chapterSections[0]!.id,
      heading,
      pageStart: Math.min(...chapterSections.map((section) => section.pageStart)),
      pageEnd: Math.max(...chapterSections.map((section) => section.pageEnd)),
      ...(printedStarts.length > 0 && printedEnds.length > 0
        ? {
            printedPageStart: Math.min(...printedStarts),
            printedPageEnd: Math.max(...printedEnds),
          }
        : {}),
      characterCount: chapterSections.reduce(
        (total, section) => total + section.characterCount,
        0,
      ),
      partCount: chapterSections.length,
      sectionIds: chapterSections.map((section) => section.id),
      sections: chapterSections,
      ...(completeCandidate
        ? { candidateStoryId: chapterSections[0]!.candidateStoryId }
        : {}),
      hasPartialCandidate: candidateIds.size > 0 && !completeCandidate,
    };
  });
}

export function knowledgeChapterHeading(heading: string): string {
  return heading
    .replace(/\u00a0/g, " ")
    .replace(PART_SUFFIX, "")
    .replace(/\s+/gu, " ")
    .trim();
}
