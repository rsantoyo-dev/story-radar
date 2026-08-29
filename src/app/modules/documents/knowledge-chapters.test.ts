import assert from "node:assert/strict";
import test from "node:test";

import { groupKnowledgeSectionsIntoChapters } from "./knowledge-chapters";

test("groups contiguous numbered parts into one editorial chapter", () => {
  const chapters = groupKnowledgeSectionsIntoChapters([
    section("a", 0, "Prenatal care · Part 1", 125, 127, 2_000),
    section("b", 1, "Prenatal care · Part 2", 128, 130, 2_100),
    section("c", 2, "Prenatal care · Part 3", 131, 133, 1_900),
    section("d", 3, "Other types of care", 134, 137, 2_500),
  ]);

  assert.deepEqual(
    chapters.map(({ id, heading, pageStart, pageEnd, partCount, sectionIds }) => ({
      id,
      heading,
      pageStart,
      pageEnd,
      partCount,
      sectionIds,
    })),
    [
      {
        id: "a",
        heading: "Prenatal care",
        pageStart: 125,
        pageEnd: 133,
        partCount: 3,
        sectionIds: ["a", "b", "c"],
      },
      {
        id: "d",
        heading: "Other types of care",
        pageStart: 134,
        pageEnd: 137,
        partCount: 1,
        sectionIds: ["d"],
      },
    ],
  );
});

test("does not merge repeated headings that are separated in the document", () => {
  const chapters = groupKnowledgeSectionsIntoChapters([
    section("a", 0, "Resources", 10, 10, 100),
    section("b", 1, "Pregnancy", 11, 20, 500),
    section("c", 2, "Resources", 21, 21, 100),
  ]);

  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters.map((chapter) => chapter.id), ["a", "b", "c"]);
});

test("reports complete and partial candidate coverage", () => {
  const complete = groupKnowledgeSectionsIntoChapters([
    { ...section("a", 0, "Development · Part 1", 1, 2, 100), candidateStoryId: "story" },
    { ...section("b", 1, "Development · Part 2", 3, 4, 100), candidateStoryId: "story" },
  ])[0]!;
  const partial = groupKnowledgeSectionsIntoChapters([
    { ...section("c", 0, "Sleep · Part 1", 5, 6, 100), candidateStoryId: "old-story" },
    section("d", 1, "Sleep · Part 2", 7, 8, 100),
  ])[0]!;

  assert.equal(complete.candidateStoryId, "story");
  assert.equal(complete.hasPartialCandidate, false);
  assert.equal(partial.candidateStoryId, undefined);
  assert.equal(partial.hasPartialCandidate, true);
});

function section(
  id: string,
  ordinal: number,
  heading: string,
  pageStart: number,
  pageEnd: number,
  characterCount: number,
) {
  return { id, ordinal, heading, pageStart, pageEnd, characterCount };
}
