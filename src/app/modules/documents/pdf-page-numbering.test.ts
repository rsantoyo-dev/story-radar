import assert from "node:assert/strict";
import test from "node:test";

import { annotatePrintedPageNumbers } from "./pdf-page-numbering";

test("detects a consistent printed-page offset from running headers", () => {
  const pages = annotatePrintedPageNumbers([
    { pageNumber: 23, text: "The stages of pregnancy introduction" },
    { pageNumber: 24, text: "22 Pregnancy Before pregnancy" },
    { pageNumber: 25, text: "Pregnancy 23The stages of pregnancy Ovulation" },
    { pageNumber: 26, text: "24 Pregnancy Female reproductive system" },
    { pageNumber: 31, text: "Pregnancy 29 The stages of pregnancy Length" },
  ]);

  assert.equal(pages[0]?.printedPageNumber, undefined);
  assert.equal(pages[1]?.printedPageNumber, 22);
  assert.equal(pages[2]?.printedPageNumber, 23);
  assert.equal(pages[3]?.printedPageNumber, 24);
  assert.equal(pages[4]?.printedPageNumber, 29);
});

test("does not treat isolated numbers as printed page labels", () => {
  const pages = annotatePrintedPageNumbers([
    { pageNumber: 1, text: "2026 Pregnancy guide" },
    { pageNumber: 2, text: "A sample of 10,000 parents" },
    { pageNumber: 3, text: "Pregnancy lasts 40 weeks" },
  ]);

  assert.ok(pages.every((page) => page.printedPageNumber === undefined));
});
