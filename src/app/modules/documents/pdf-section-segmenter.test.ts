import assert from "node:assert/strict";
import test from "node:test";

import { segmentPdfPages } from "./pdf-section-segmenter";

test("preserves heading boundaries and source page ranges", () => {
  const sections = segmentPdfPages(
    [
      { pageNumber: 1, text: "Cover material" },
      { pageNumber: 2, text: "Pregnancy introduction" },
      { pageNumber: 3, text: "Pregnancy guidance" },
      { pageNumber: 4, text: "Postpartum introduction" },
    ],
    [
      { title: "Pregnancy", pageNumber: 2, level: 0 },
      { title: "Postpartum", pageNumber: 4, level: 0 },
    ],
  );

  assert.deepEqual(
    sections.map(({ heading, pageStart, pageEnd }) => ({ heading, pageStart, pageEnd })),
    [
      { heading: "Document overview", pageStart: 1, pageEnd: 1 },
      { heading: "Pregnancy", pageStart: 2, pageEnd: 3 },
      { heading: "Postpartum", pageStart: 4, pageEnd: 4 },
    ],
  );
});

test("splits a long heading into numbered chunks without crossing pages", () => {
  const longPage = Array.from({ length: 700 }, (_, index) => `word${index}`).join(" ");
  const sections = segmentPdfPages(
    [
      { pageNumber: 1, text: longPage },
      { pageNumber: 2, text: longPage },
    ],
    [{ title: "Development", pageNumber: 1, level: 0 }],
  );

  assert.equal(sections.length, 2);
  assert.equal(sections[0]?.heading, "Development · Part 1");
  assert.equal(sections[1]?.heading, "Development · Part 2");
  assert.equal(sections[0]?.pageStart, 1);
  assert.equal(sections[1]?.pageStart, 2);
  assert.match(sections[0]?.textHash ?? "", /^[a-f0-9]{64}$/);
});

test("keeps outline ancestry and the deepest heading on a shared PDF page", () => {
  const sections = segmentPdfPages(
    [
      {
        pageNumber: 24,
        printedPageNumber: 22,
        text: "22 Pregnancy Before pregnancy",
      },
      {
        pageNumber: 25,
        printedPageNumber: 23,
        text: "Pregnancy 23 Ovulation",
      },
    ],
    [
      {
        title: "The stages of pregnancy",
        pageNumber: 24,
        level: 0,
        path: ["The stages of pregnancy"],
      },
      {
        title: "Before pregnancy",
        pageNumber: 24,
        level: 1,
        path: ["The stages of pregnancy", "Before pregnancy"],
      },
    ],
  );

  assert.equal(
    sections[0]?.heading,
    "The stages of pregnancy › Before pregnancy",
  );
  assert.equal(sections[0]?.pageStart, 24);
  assert.equal(sections[0]?.printedPageStart, 22);
  assert.equal(sections[0]?.printedPageEnd, 23);
});
